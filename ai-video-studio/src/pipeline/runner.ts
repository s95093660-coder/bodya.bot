// Pipeline orchestrator: runs steps in order, persists after every step and
// sub-item, resumes from the first unfinished step, enforces budget, reports
// progress/logs through callbacks the UI subscribes to.

import { humanError, ProviderError } from "../core/errors";
import { platform } from "../core/platform";
import { STEP_IDS, type LogEntry, type Project, type StepId } from "../core/types";
import { nowIso } from "../core/util";
import { appendLog, getPromptOverrides, listCustomFormats, saveProject } from "../db/repo";
import { createClaude, type LlmClient } from "../providers/llm/claude";
import { mockLlm } from "../providers/llm/mock";
import { getFormat } from "../templates/formats";
import { DEFAULT_PROMPTS } from "../templates/prompts";
import { makeProviderContext, newCost, projectDir, totalCost, type RunContext } from "./context";
import { estimateProject } from "./cost";
import { ideasStep, scriptStep, storyboardStep } from "./steps/claudeSteps";
import { generateSceneImage, generateSceneVoice, renderStep, subtitlesStep, visualsStep, voiceStep } from "./steps/mediaSteps";
import type { Step } from "./steps/types";

export const STEPS: Record<StepId, Step> = {
  ideas: ideasStep,
  script: scriptStep,
  storyboard: storyboardStep,
  visuals: visualsStep,
  voice: voiceStep,
  subtitles: subtitlesStep,
  render: renderStep,
};

/** Which downstream steps become stale when a step is re-run. */
const INVALIDATES: Partial<Record<StepId, StepId[]>> = {
  ideas: [],
  script: ["storyboard", "visuals", "voice", "subtitles", "render"],
  storyboard: ["visuals", "voice", "subtitles", "render"],
  visuals: ["render"],
  voice: ["subtitles", "render"],
  subtitles: ["render"],
};

export interface RunHooks {
  onUpdate?(p: Project): void;
  onLog?(e: LogEntry): void;
  llmOverride?: LlmClient; // tests / --mock
}

export interface RunOptions {
  from?: StepId;
  to?: StepId;
  only?: StepId;
  signal?: AbortSignal;
}

export async function buildContext(project: Project, step: StepId, signal: AbortSignal, hooks: RunHooks): Promise<RunContext> {
  const plat = platform();
  const dir = await projectDir(project.id);
  const prompts = { ...DEFAULT_PROMPTS, ...(await getPromptOverrides()) };
  const format = getFormat(project.formatId, await listCustomFormats());
  const ctx: RunContext = {
    project,
    projectDir: dir,
    format,
    prompts,
    signal,
    step,
    llm: async () => {
      if (hooks.llmOverride) return hooks.llmOverride;
      if (project.settings.llmModel === "mock") return mockLlm; // demo mode, no API calls
      const key = await plat.getSecret("anthropic");
      if (!key) throw new ProviderError("auth", "Claude", "Не задан API-ключ Anthropic. Настройки → Ключи API.");
      return createClaude(key, plat.fetch);
    },
    log(level, message) {
      const e: LogEntry = { ts: nowIso(), level, step: ctx.step, message };
      hooks.onLog?.(e);
      appendLog(project.id, e).catch(() => {});
    },
    progress(fraction, message) {
      const st = project.steps[ctx.step];
      st.progress = Math.max(0, Math.min(1, fraction));
      if (message) st.message = message;
      hooks.onUpdate?.(project);
    },
    async save() {
      project.updatedAt = nowIso();
      await saveProject(project);
      hooks.onUpdate?.(project);
    },
    addCost(c) {
      project.costs.push(newCost(ctx.step, c));
      const budget = project.settings.budgetUsd;
      if (budget && totalCost(project) > budget)
        throw new ProviderError("budget", "budget", `Превышен бюджет проекта: $${totalCost(project).toFixed(2)} > $${budget}`);
    },
    providers: makeProviderContext(signal, (m) => ctx.log("debug", m)),
    abs: (rel) => plat.join(dir, ...rel.split("/")),
  };
  return ctx;
}

export function firstPendingStep(p: Project): StepId | null {
  return STEP_IDS.find((s) => p.steps[s].status !== "done" && p.steps[s].status !== "skipped") ?? null;
}

export async function runPipeline(project: Project, opts: RunOptions = {}, hooks: RunHooks = {}): Promise<Project> {
  const signal = opts.signal ?? new AbortController().signal;
  const ids = opts.only
    ? [opts.only]
    : STEP_IDS.slice(STEP_IDS.indexOf(opts.from ?? firstPendingStep(project) ?? "render"), STEP_IDS.indexOf(opts.to ?? "render") + 1);

  // Budget check before spending anything.
  const est = estimateProject(project);
  const budget = project.settings.budgetUsd;
  if (budget && totalCost(project) + est.remaining > budget * 1.05) {
    throw new ProviderError("budget", "budget", `Оценка $${(totalCost(project) + est.remaining).toFixed(2)} превышает бюджет $${budget}. Увеличьте лимит или смените провайдеров.`);
  }

  for (const id of ids) {
    // A user-provided topic lets auto mode skip idea generation.
    if (id === "ideas" && project.topic && !project.ideas && opts.only !== "ideas") {
      project.steps.ideas = { status: "skipped", progress: 1, message: "Тема задана вручную" };
      continue;
    }
    const step = STEPS[id];
    const ctx = await buildContext(project, id, signal, hooks);
    const blocked = step.blockedReason(project);
    const st = project.steps[id];
    if (blocked) {
      st.status = "error";
      st.error = blocked;
      await ctx.save();
      throw new ProviderError("bad_request", id, blocked);
    }
    Object.assign(st, { status: "running", progress: 0, error: undefined, message: undefined, startedAt: nowIso(), finishedAt: undefined });
    for (const d of INVALIDATES[id] ?? []) {
      if (!ids.includes(d) && project.steps[d].status === "done") project.steps[d] = { status: "idle", progress: 0, message: "Требует пересборки" };
    }
    await ctx.save();
    ctx.log("info", `▶ ${id}`);
    try {
      await step.run(ctx);
      Object.assign(st, { status: "done", progress: 1, finishedAt: nowIso(), message: st.message?.endsWith("…") ? undefined : st.message });
      ctx.log("info", `✔ ${id}`);
      await ctx.save();
    } catch (e) {
      const cancelled = signal.aborted || (e instanceof ProviderError && e.kind === "cancelled");
      Object.assign(st, { status: cancelled ? "idle" : "error", error: cancelled ? undefined : humanError(e), message: cancelled ? "Остановлено" : st.message });
      ctx.log(cancelled ? "warn" : "error", cancelled ? `■ ${id} остановлен` : `✖ ${id}: ${humanError(e)}`);
      await ctx.save();
      throw e;
    }
    // Manual mode: stop after each step so the user can review and edit.
    if (!project.settings.autoMode && !opts.only && !opts.to) break;
  }
  return project;
}

/**
 * Regenerate one scene's image or voice without rebuilding the whole video.
 * Marks dependent steps (subtitles/render) as stale.
 */
export async function regenerateScene(
  project: Project,
  sceneId: string,
  what: "image" | "voice",
  hooks: RunHooks = {},
  signal: AbortSignal = new AbortController().signal,
) {
  const scene = project.scenes?.find((s) => s.id === sceneId);
  if (!scene) throw new Error("Сцена не найдена");
  const ctx = await buildContext(project, what === "image" ? "visuals" : "voice", signal, hooks);
  ctx.log("info", `Перегенерация сцены ${scene.index + 1}: ${what}`);
  if (what === "image") await generateSceneImage(ctx, scene, true);
  else {
    scene.words = undefined;
    await generateSceneVoice(ctx, scene);
    project.steps.subtitles = { status: "idle", progress: 0, message: "Требует пересборки" };
  }
  project.steps.render = { status: "idle", progress: 0, message: "Требует пересборки" };
  await ctx.save();
}
