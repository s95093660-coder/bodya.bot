import type { Scene, Word } from "../core/types";

export const SCENE_GAP = 0.2; // breath between scenes
export const TAIL = 0.6; // hold on the last frame

/** Scene durations follow the real narration length; words become absolute. */
export function buildTimeline(scenes: Scene[]) {
  const durations = scenes.map((s, i) => {
    const audio = s.audioDuration ?? s.durationSec;
    return +(audio + (i === scenes.length - 1 ? TAIL : SCENE_GAP)).toFixed(3);
  });
  const words: Word[] = [];
  let t = 0;
  scenes.forEach((s, i) => {
    for (const w of s.words ?? []) words.push({ text: w.text, start: +(t + w.start).toFixed(3), end: +(t + w.end).toFixed(3) });
    t += durations[i];
  });
  return { durations, words, total: t };
}

/** Fallback timing when no alignment is available: proportional to word length. */
export function estimateWords(text: string, duration: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((w) => w.length + 2);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const usable = duration * 0.97;
  let t = 0;
  return tokens.map((w, i) => {
    const d = (weights[i] / sum) * usable;
    const word = { text: w, start: +t.toFixed(3), end: +(t + d).toFixed(3) };
    t += d;
    return word;
  });
}
