import { ProviderError } from "../core/errors";
import { platform } from "../core/platform";
import type { CostEntry, LogEntry, Project, StepId } from "../core/types";
import { nowIso, uid } from "../core/util";
import type { LlmClient } from "../providers/llm/claude";
import type { ProviderContext } from "../providers/types";
import type { FormatPreset } from "../templates/formats";
import type { PromptId } from "../templates/prompts";

export interface RunContext {
  project: Project;
  projectDir: string;
  format: FormatPreset;
  prompts: Record<PromptId, string>;
  llm: () => Promise<LlmClient>;
  signal: AbortSignal;
  step: StepId;
  log(level: LogEntry["level"], message: string): void;
  progress(fraction: number, message?: string): void;
  save(): Promise<void>;
  addCost(c: Omit<CostEntry, "at" | "step">): void;
  providers: ProviderContext;
  /** Absolute path from a project-relative one. */
  abs(rel: string): string;
}

export async function projectDir(projectId: string) {
  const p = platform();
  const dir = p.join(await p.dataDir(), "projects", projectId);
  for (const sub of ["", "images", "audio", "subs", "out", "clips"]) await p.mkdir(sub ? p.join(dir, sub) : dir);
  return dir;
}

export function makeProviderContext(signal: AbortSignal, log: (m: string) => void): ProviderContext {
  const p = platform();
  return {
    async key(secretId) {
      const v = await p.getSecret(secretId);
      if (!v) throw new ProviderError("auth", secretId, `Не задан API-ключ «${secretId}». Добавьте его в Настройки → Ключи API.`);
      return v;
    },
    fetch: p.fetch,
    signal,
    log,
    ffmpeg: (args) => p.runFFmpeg(args, { signal }),
    async tmpFile(ext) {
      const dir = p.join(await p.dataDir(), "tmp");
      await p.mkdir(dir);
      return p.join(dir, `${uid()}.${ext}`);
    },
    readFile: (path) => p.readFile(path),
  };
}

export function newCost(step: StepId, c: Omit<CostEntry, "at" | "step">): CostEntry {
  return { ...c, step, at: nowIso() };
}

export function totalCost(p: Project) {
  return p.costs.reduce((s, c) => s + c.usd, 0);
}
