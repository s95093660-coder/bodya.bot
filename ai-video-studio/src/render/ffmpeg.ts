// Pure FFmpeg argument builders (no I/O) — easy to unit test.
// All paths are relative to the project directory; the runner sets cwd there,
// which avoids Windows drive-letter escaping problems inside filtergraphs.

import type { CameraMove } from "../core/types";

export interface RenderScene {
  image: string; // relative path
  audio: string; // relative path
  duration: number; // seconds this scene occupies on the timeline
  camera: CameraMove;
}

export interface RenderSpec {
  scenes: RenderScene[];
  width: number;
  height: number;
  fps: number;
  subtitles?: string; // relative .ass path
  music?: { path: string; volume: number; duck: boolean };
  output: string;
  crf?: number;
  preset?: string;
}

const ZOOM = 0.15;

/** zoompan expressions for Ken Burns moves. `F` = frame count - 1. */
export function kenBurns(camera: CameraMove, frames: number): { z: string; x: string; y: string } {
  const F = Math.max(1, frames - 1);
  const p = `(on/${F})`;
  const cx = "iw/2-(iw/zoom/2)";
  const cy = "ih/2-(ih/zoom/2)";
  switch (camera) {
    case "zoom_in":
      return { z: `1+${ZOOM}*${p}`, x: cx, y: cy };
    case "zoom_out":
      return { z: `${1 + ZOOM}-${ZOOM}*${p}`, x: cx, y: cy };
    case "pan_right":
      return { z: `${1 + ZOOM}`, x: `(iw-iw/zoom)*${p}`, y: cy };
    case "pan_left":
      return { z: `${1 + ZOOM}`, x: `(iw-iw/zoom)*(1-${p})`, y: cy };
    case "pan_down":
      return { z: `${1 + ZOOM}`, x: cx, y: `(ih-ih/zoom)*${p}` };
    case "pan_up":
      return { z: `${1 + ZOOM}`, x: cx, y: `(ih-ih/zoom)*(1-${p})` };
    default:
      return { z: "1.02", x: cx, y: cy };
  }
}

/**
 * Returns FFmpeg args plus the filtergraph text. The graph is written to
 * `filterFile` (relative to cwd) and passed via -filter_complex_script, so long
 * videos never hit the Windows command-line length limit.
 */
export function buildRenderArgs(spec: RenderSpec, filterFile = "render.filtergraph"): { args: string[]; filter: string } {
  const { scenes, width: W, height: H, fps } = spec;
  const args: string[] = ["-y", "-hide_banner"];
  const filters: string[] = [];

  scenes.forEach((s) => args.push("-i", s.image));
  scenes.forEach((s) => args.push("-i", s.audio));
  const n = scenes.length;
  let musicIdx = -1;
  if (spec.music) {
    musicIdx = 2 * n;
    args.push("-stream_loop", "-1", "-i", spec.music.path);
  }

  // Video: upscale ×2 before zoompan to avoid jitter, then Ken Burns per scene.
  scenes.forEach((s, i) => {
    const frames = Math.max(1, Math.round(s.duration * fps));
    const kb = kenBurns(s.camera, frames);
    filters.push(
      `[${i}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},setsar=1,` +
        `zoompan=z='${kb.z}':x='${kb.x}':y='${kb.y}':d=${frames}:s=${W}x${H}:fps=${fps},format=yuv420p[v${i}]`,
    );
    // Audio: pad/trim each scene's narration to exactly the scene duration.
    filters.push(`[${n + i}:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur=${s.duration.toFixed(3)},atrim=0:${s.duration.toFixed(3)}[a${i}]`);
  });
  filters.push(`${scenes.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[vcat]`);
  filters.push(`${scenes.map((_, i) => `[a${i}]`).join("")}concat=n=${n}:v=0:a=1[voice]`);

  let vOut = "vcat";
  if (spec.subtitles) {
    filters.push(`[vcat]ass=${spec.subtitles}[vsub]`);
    vOut = "vsub";
  }

  let aOut = "voice";
  if (spec.music) {
    const vol = spec.music.volume.toFixed(2);
    if (spec.music.duck) {
      // Ducking: music is compressed whenever the voice is present.
      filters.push(`[voice]asplit=2[vo1][vo2]`);
      filters.push(`[${musicIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${vol}[mus]`);
      filters.push(`[mus][vo1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`);
      filters.push(`[vo2][duck]amix=inputs=2:duration=first:normalize=0[mix]`);
    } else {
      filters.push(`[${musicIdx}:a]volume=${vol}[mus]`);
      filters.push(`[voice][mus]amix=inputs=2:duration=first:normalize=0[mix]`);
    }
    aOut = "mix";
  }

  args.push(
    "-filter_complex_script", filterFile,
    "-map", `[${vOut}]`, "-map", `[${aOut}]`,
    "-c:v", "libx264", "-preset", spec.preset ?? "medium", "-crf", String(spec.crf ?? 20),
    "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    spec.output,
  );
  return { args, filter: filters.join(";\n") };
}
