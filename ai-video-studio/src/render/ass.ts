// Generates .ass subtitles (libass) with TikTok-style word-by-word karaoke,
// keyword highlighting or classic captions. Burned in by FFmpeg.

import type { SubtitleStyleId, Word } from "../core/types";

export interface AssOptions {
  width: number;
  height: number;
  style: SubtitleStyleId;
  keywords?: string[];
  font?: string;
  primary?: string; // ASS colour &HBBGGRR
  highlight?: string;
}

// ASS colours are &HAABBGGRR
const WHITE = "&H00FFFFFF";
const YELLOW = "&H0000E5FF";
const GREEN = "&H0066FF66";

export function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

const esc = (s: string) => s.replace(/[{}\\]/g, "");
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Split words into on-screen chunks. */
export function chunkWords(words: Word[], maxWords: number, maxChars: number): Word[][] {
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  let chars = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    const gap = prev ? w.start - prev.end : 0;
    if (cur.length && (cur.length >= maxWords || chars + w.text.length > maxChars || gap > 0.45)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(w);
    chars += w.text.length + 1;
    if (/[.!?…]$/.test(w.text)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function buildAss(words: Word[], o: AssOptions): string {
  const font = o.font ?? "Arial Black";
  const karaoke = o.style === "tiktok_karaoke";
  const classic = o.style === "classic";
  const size = Math.round(o.width * (karaoke ? 0.085 : classic ? 0.05 : 0.07));
  const outline = Math.max(3, Math.round(size * 0.09));
  const marginV = classic ? Math.round(o.height * 0.08) : Math.round(o.height * (o.height > o.width ? 0.3 : 0.18));
  const primary = o.primary ?? WHITE;
  const hl = o.highlight ?? YELLOW;
  const kw = new Set((o.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${o.width}
PlayResY: ${o.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${font},${size},${primary},${hl},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},${Math.round(outline / 2)},2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  const chunks = karaoke ? chunkWords(words, 3, 22) : chunkWords(words, classic ? 8 : 5, classic ? 42 : 30);
  const fmt = (t: string) => (classic ? esc(t) : esc(t).toUpperCase());

  chunks.forEach((chunk, ci) => {
    const chunkEnd = Math.max(chunk[chunk.length - 1].end, (chunks[ci + 1]?.[0].start ?? Infinity) - 0.02);
    const end = Math.min(chunkEnd, chunk[chunk.length - 1].end + 0.6);
    if (karaoke) {
      chunk.forEach((w, wi) => {
        const s = w.start;
        const e = wi < chunk.length - 1 ? chunk[wi + 1].start : end;
        const text = chunk
          .map((x, xi) => (xi === wi ? `{\\c${hl}\\fscx112\\fscy112}${fmt(x.text)}{\\r}` : fmt(x.text)))
          .join(" ");
        const pop = wi === 0 ? "{\\fad(60,0)}" : "";
        lines.push(`Dialogue: 0,${assTime(s)},${assTime(Math.max(e, s + 0.05))},Main,,0,0,0,,${pop}${text}`);
      });
    } else {
      const text = chunk
        .map((x) => (!classic && kw.has(norm(x.text)) ? `{\\c${GREEN}}${fmt(x.text)}{\\r}` : fmt(x.text)))
        .join(" ");
      lines.push(`Dialogue: 0,${assTime(chunk[0].start)},${assTime(end)},Main,,0,0,0,,${text}`);
    }
  });
  return header + lines.join("\n") + "\n";
}

/** SRT export for CapCut / Premiere. */
export function buildSrt(words: Word[]): string {
  const t = (x: number) => assTime(x).replace(/^(\d):/, "0$1:").replace(".", ",") + "0";
  return chunkWords(words, 7, 40)
    .map((c, i) => `${i + 1}\n${t(c[0].start)} --> ${t(c[c.length - 1].end)}\n${c.map((w) => w.text).join(" ")}\n`)
    .join("\n");
}
