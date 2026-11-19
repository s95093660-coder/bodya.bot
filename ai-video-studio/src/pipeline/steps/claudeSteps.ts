// Steps 1–3: ideas, script, storyboard — all driven by Claude.

import { withRetry } from "../../core/errors";
import type { Idea, Scene } from "../../core/types";
import { uid } from "../../core/util";
import { fillPrompt } from "../../templates/prompts";
import type { RunContext } from "../context";
import { IdeasSchema, ScriptSchema, StoryboardSchema } from "../schemas";
import type { Step } from "./types";

export function promptVars(ctx: RunContext) {
  const p = ctx.project;
  return {
    lang: p.language === "ru" ? "русский" : "English",
    duration: p.durationSec,
    aspect: p.aspect,
    format: ctx.format.name.ru,
    formatHints: ctx.format.hints,
    niche: p.niche,
    topic: p.topic ?? "",
    words: Math.round(p.durationSec * 2.5),
    scenes: Math.max(3, Math.round(p.durationSec / 3.5)),
  };
}

async function ask<T>(ctx: RunContext, kind: "ideas" | "script" | "storyboard", schema: unknown, prompt: string, maxTokens?: number): Promise<T> {
  const llm = await ctx.llm();
  const s = ctx.project.settings;
  const r = await withRetry(
    () =>
      llm.structured({
        system: fillPrompt(ctx.prompts[kind], promptVars(ctx)),
        prompt,
        schema: schema as typeof IdeasSchema,
        model: s.llmModel,
        effort: s.llmEffort,
        maxTokens,
        signal: ctx.signal,
      }),
    { signal: ctx.signal, onRetry: (e, n, d) => ctx.log("warn", `Claude: повтор ${n} через ${Math.round(d / 1000)}с — ${(e as Error).message}`) },
  );
  ctx.addCost({ provider: "claude", usd: r.usd, detail: `${s.llmModel}: ${r.inputTokens} in / ${r.outputTokens} out` });
  ctx.log("info", `Claude ${kind}: ${r.inputTokens}→${r.outputTokens} токенов, $${r.usd.toFixed(4)}`);
  return r.data as T;
}

export const ideasStep: Step = {
  id: "ideas",
  blockedReason: (p) => (p.niche || p.topic ? null : "Укажите нишу или тему"),
  async run(ctx) {
    const p = ctx.project;
    ctx.progress(0.1, "Claude придумывает идеи…");
    const out = await ask<{ ideas: Idea[] }>(
      ctx,
      "ideas",
      IdeasSchema,
      `Ниша/тренд: ${p.niche}${p.topic ? `\nПодсказка от автора: ${p.topic}` : ""}\nВыдай 10 идей.`,
    );
    p.ideas = [...out.ideas].sort((a, b) => b.viralityScore - a.viralityScore);
    if (p.settings.autoMode || !p.selectedIdea) p.selectedIdea = p.ideas[0];
    ctx.log("info", `Выбрана идея: «${p.selectedIdea?.title}» (${p.selectedIdea?.viralityScore}/10)`);
  },
};

export const scriptStep: Step = {
  id: "script",
  blockedReason: (p) => (p.selectedIdea || p.topic ? null : "Сначала выберите идею или задайте тему"),
  async run(ctx) {
    const p = ctx.project;
    const idea = p.selectedIdea ?? { title: p.topic!, hook: "", angle: "", viralityScore: 0, why: "" };
    ctx.progress(0.1, "Claude пишет сценарий…");
    p.script = await ask(
      ctx,
      "script",
      ScriptSchema,
      `Идея: ${idea.title}\nХук-черновик: ${idea.hook}\nУгол: ${idea.angle}\nНапиши сценарий.`,
    );
    p.title = p.script!.title || p.title;
    // A new script invalidates everything downstream.
    p.scenes = undefined;
  },
};

export const storyboardStep: Step = {
  id: "storyboard",
  blockedReason: (p) => (p.script ? null : "Нет сценария"),
  async run(ctx) {
    const p = ctx.project;
    ctx.progress(0.1, "Claude делает раскадровку…");
    const out = await ask<{ scenes: Omit<Scene, "id" | "index">[] }>(
      ctx,
      "storyboard",
      StoryboardSchema,
      `Сценарий (текст озвучки):\n"""${p.script!.fullText}"""\nСделай раскадровку.`,
      32000,
    );
    p.scenes = out.scenes.map((s, i) => ({ ...s, id: uid("sc_"), index: i }));
    const covered = p.scenes.map((s) => s.narration).join(" ").replace(/\s+/g, " ").length;
    const full = p.script!.fullText.replace(/\s+/g, " ").length;
    if (Math.abs(covered - full) / full > 0.1)
      ctx.log("warn", `Текст сцен (${covered} симв.) заметно отличается от сценария (${full} симв.) — проверьте раскадровку.`);
    ctx.log("info", `Сцен: ${p.scenes.length}`);
  },
};
