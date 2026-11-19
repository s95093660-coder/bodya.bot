// Cost calculator: estimates the price of a video BEFORE generation.

import { ASPECT_SIZES, type Project, type StepId } from "../core/types";
import { claudeCost } from "../providers/llm/claude";
import { IMAGE_PROVIDERS, TTS_PROVIDERS } from "../providers/registry";

export interface CostEstimate {
  perStep: Record<StepId, number>;
  total: number;
  remaining: number; // only steps not yet done
}

export function estimateProject(p: Project): CostEstimate {
  const words = Math.round(p.durationSec * 2.5);
  const scenes = p.scenes?.length ?? Math.max(3, Math.round(p.durationSec / 3.5));
  const chars = p.script?.fullText.length ?? words * 6.5;
  const m = p.settings.llmModel;
  const img = IMAGE_PROVIDERS.find((x) => x.id === p.settings.imageProvider);
  const tts = TTS_PROVIDERS.find((x) => x.id === p.settings.ttsProvider);
  const { w, h } = ASPECT_SIZES[p.aspect];
  // Rough token model (incl. thinking at the selected effort).
  const thinkMul = { low: 1, medium: 1.6, high: 2.5, xhigh: 3.5, max: 5 }[p.settings.llmEffort];
  const perStep: Record<StepId, number> = {
    ideas: claudeCost(m, 900, 1500 * thinkMul),
    script: claudeCost(m, 900, (words * 2 + 400) * thinkMul),
    storyboard: claudeCost(m, 900 + words * 2, (scenes * 120 + 300) * thinkMul),
    visuals: (img?.estimateUsd({ model: p.settings.imageModel, width: w, height: h }) ?? 0) * scenes,
    voice: tts?.estimateUsd(chars) ?? 0,
    subtitles: tts?.id === "elevenlabs" || tts?.id === "mock" ? 0 : (p.durationSec / 60) * 0.006,
    render: 0,
  };
  const total = Object.values(perStep).reduce((a, b) => a + b, 0);
  const remaining = (Object.keys(perStep) as StepId[])
    .filter((s) => p.steps[s].status !== "done" && p.steps[s].status !== "skipped")
    .reduce((a, s) => a + perStep[s], 0);
  return { perStep, total, remaining };
}
