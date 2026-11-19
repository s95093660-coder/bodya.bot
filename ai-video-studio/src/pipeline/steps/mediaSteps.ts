// Steps 4–7: visuals, voice, subtitles, render.

import { cacheGet, cacheGetJson, cacheKey, cachePut, cachePutJson } from "../../core/cache";
import { ProviderError, withRetry } from "../../core/errors";
import { platform } from "../../core/platform";
import { ASPECT_SIZES, type Scene, type Word } from "../../core/types";
import { imageProvider, STT_PROVIDERS, ttsProvider } from "../../providers/registry";
import { buildAss, buildSrt } from "../../render/ass";
import { buildRenderArgs } from "../../render/ffmpeg";
import type { RunContext } from "../context";
import { buildTimeline, estimateWords } from "../timeline";
import type { Step } from "./types";

async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

const retryOpts = (ctx: RunContext, what: string) => ({
  signal: ctx.signal,
  onRetry: (e: unknown, n: number, d: number) => ctx.log("warn", `${what}: повтор ${n} через ${Math.round(d / 1000)}с — ${(e as Error).message}`),
});

export function imagePromptFor(ctx: RunContext, s: Scene) {
  const extra = [ctx.format.visualStyle, ctx.project.settings.styleSuffix, "no text, no letters, no watermark"].filter(Boolean).join(", ");
  return `${s.imagePrompt}, ${extra}`;
}

/** Regenerate visuals for a single scene (used by "regenerate frame" in the editor). */
export async function generateSceneImage(ctx: RunContext, s: Scene, force = false) {
  const p = platform();
  const st = ctx.project.settings;
  const prov = imageProvider(st.imageProvider);
  const { w, h } = ASPECT_SIZES[ctx.project.aspect];
  const req = { prompt: imagePromptFor(ctx, s), width: w, height: h, aspect: ctx.project.aspect, seed: st.seed, model: st.imageModel };
  const key = await cacheKey({ kind: "image", provider: prov.id, ...req, nonce: force ? Date.now() : 0 });
  let cached = await cacheGet(key, "png");
  if (!cached) {
    const asset = await withRetry(() => prov.generate(req, ctx.providers), retryOpts(ctx, prov.label));
    cached = await cachePut(key, "png", asset.data);
    ctx.addCost({ provider: prov.id, usd: prov.estimateUsd(req), detail: `кадр ${s.index + 1}` });
  } else ctx.log("debug", `Сцена ${s.index + 1}: картинка из кэша`);
  const rel = `images/scene_${String(s.index + 1).padStart(3, "0")}.png`;
  await p.copyFile(cached, ctx.abs(rel));
  s.imagePath = rel;
}

export const visualsStep: Step = {
  id: "visuals",
  blockedReason: (p) => (p.scenes?.length ? null : "Нет раскадровки"),
  async run(ctx) {
    const scenes = ctx.project.scenes!;
    const p = platform();
    let done = 0;
    await pool(scenes, 3, async (s) => {
      if (s.imagePath && (await p.exists(ctx.abs(s.imagePath)))) {
        done++;
        return; // resume: already generated
      }
      await generateSceneImage(ctx, s);
      done++;
      ctx.progress(done / scenes.length, `Кадры: ${done}/${scenes.length}`);
      await ctx.save();
    });
  },
};

export async function generateSceneVoice(ctx: RunContext, s: Scene) {
  const p = platform();
  const st = ctx.project.settings;
  const prov = ttsProvider(st.ttsProvider);
  const req = { text: s.narration, voiceId: st.voiceId || prov.defaultVoice, speed: st.ttsSpeed, emotion: s.emotion, language: ctx.project.language };
  const key = await cacheKey({ kind: "tts", provider: prov.id, ...req });
  let file = (await cacheGet(key, "mp3")) ?? (await cacheGet(key, "wav"));
  let words = await cacheGetJson<Word[]>(key + "-words");
  if (!file) {
    const r = await withRetry(() => prov.synthesize(req, ctx.providers), retryOpts(ctx, prov.label));
    file = await cachePut(key, r.ext, r.data);
    words = r.words ?? null;
    if (words) await cachePutJson(key + "-words", words);
    ctx.addCost({ provider: prov.id, usd: prov.estimateUsd(s.narration.length), detail: `озвучка сцены ${s.index + 1}` });
  }
  const ext = file.endsWith(".wav") ? "wav" : "mp3";
  const rel = `audio/scene_${String(s.index + 1).padStart(3, "0")}.${ext}`;
  await p.copyFile(file, ctx.abs(rel));
  s.audioPath = rel;
  s.audioDuration = await p.probeDuration(ctx.abs(rel));
  s.words = words ?? undefined;
}

export const voiceStep: Step = {
  id: "voice",
  blockedReason: (p) => (p.scenes?.length ? null : "Нет раскадровки"),
  async run(ctx) {
    const scenes = ctx.project.scenes!;
    const p = platform();
    let done = 0;
    await pool(scenes, 3, async (s) => {
      if (!(s.audioPath && s.audioDuration && (await p.exists(ctx.abs(s.audioPath))))) await generateSceneVoice(ctx, s);
      done++;
      ctx.progress(done / scenes.length, `Озвучка: ${done}/${scenes.length}`);
      await ctx.save();
    });
  },
};

export const subtitlesStep: Step = {
  id: "subtitles",
  blockedReason: (p) => (p.scenes?.every((s) => s.audioPath) ? null : "Сначала сделайте озвучку"),
  async run(ctx) {
    const p = platform();
    const proj = ctx.project;
    const scenes = proj.scenes!;
    const stt = STT_PROVIDERS[0];
    const canStt = !!(stt.secret && (await p.getSecret(stt.secret)));
    let i = 0;
    for (const s of scenes) {
      i++;
      if (!s.words?.length) {
        if (canStt) {
          try {
            const data = await p.readFile(ctx.abs(s.audioPath!));
            s.words = await withRetry(
              () => stt.transcribeWords({ data, ext: s.audioPath!.split(".").pop()! }, proj.language, ctx.providers),
              retryOpts(ctx, "Whisper"),
            );
            ctx.addCost({ provider: stt.id, usd: stt.estimateUsd(s.audioDuration ?? 0), detail: `тайминг сцены ${s.index + 1}` });
          } catch (e) {
            if (e instanceof ProviderError && e.kind === "cancelled") throw e;
            ctx.log("warn", `Whisper не сработал для сцены ${s.index + 1}, тайминг оценён по тексту: ${(e as Error).message}`);
          }
        }
        if (!s.words?.length) s.words = estimateWords(s.narration, s.audioDuration ?? 2);
      }
      ctx.progress(i / scenes.length, `Тайминг слов: ${i}/${scenes.length}`);
    }
    const tl = buildTimeline(scenes);
    const { w, h } = ASPECT_SIZES[proj.aspect];
    const ass = buildAss(tl.words, { width: w, height: h, style: proj.settings.subtitleStyle, keywords: proj.script?.keywords });
    await p.writeText(ctx.abs("subs/subs.ass"), ass);
    await p.writeText(ctx.abs("subs/subs.srt"), buildSrt(tl.words));
    proj.subtitlesPath = "subs/subs.ass";
  },
};

export const renderStep: Step = {
  id: "render",
  blockedReason: (p) =>
    p.scenes?.every((s) => s.imagePath && s.audioPath) ? null : "Не хватает кадров или озвучки",
  async run(ctx) {
    const p = platform();
    const proj = ctx.project;
    const tl = buildTimeline(proj.scenes!);
    const { w, h } = ASPECT_SIZES[proj.aspect];
    const slug = (proj.title || "video").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
    const out = `out/${slug}_${proj.aspect.replace(":", "x")}.mp4`;
    const { args, filter } = buildRenderArgs({
      scenes: proj.scenes!.map((s, i) => ({ image: s.imagePath!, audio: s.audioPath!, duration: tl.durations[i], camera: s.camera })),
      width: w,
      height: h,
      fps: 30,
      subtitles: proj.subtitlesPath,
      output: out,
    });
    await p.writeText(ctx.abs("render.filtergraph"), filter);
    ctx.log("info", `FFmpeg: ${proj.scenes!.length} сцен, ${tl.total.toFixed(1)} сек, ${w}x${h}`);
    await p.runFFmpeg(args, {
      cwd: ctx.projectDir,
      durationSec: tl.total,
      signal: ctx.signal,
      onProgress: (f) => ctx.progress(f, `Рендер ${Math.round(f * 100)}%`),
    });
    proj.outputPath = out;
    ctx.log("info", `Готово: ${ctx.abs(out)}`);
  },
};
