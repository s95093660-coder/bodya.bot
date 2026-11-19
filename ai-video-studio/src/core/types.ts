// Core domain model shared by pipeline, UI, CLI and storage.

export type Aspect = "9:16" | "16:9" | "1:1" | "4:5";
export type Lang = "ru" | "en";

export const STEP_IDS = [
  "ideas",
  "script",
  "storyboard",
  "visuals",
  "voice",
  "subtitles",
  "render",
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type StepStatus = "idle" | "running" | "done" | "error" | "skipped";

export interface StepState {
  status: StepStatus;
  progress: number; // 0..1
  message?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface Idea {
  title: string;
  hook: string;
  angle: string;
  viralityScore: number; // 1..10
  why: string;
}

export interface Script {
  title: string;
  hook: string;
  body: string;
  cta: string;
  fullText: string;
  keywords: string[];
}

export type CameraMove = "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "pan_up" | "pan_down" | "static";

export interface Word {
  text: string;
  start: number; // seconds, relative to scene start (or absolute in the merged track)
  end: number;
}

export interface Scene {
  id: string;
  index: number;
  narration: string;
  imagePrompt: string;
  durationSec: number; // planned duration from storyboard
  camera: CameraMove;
  emotion: string;
  onScreenText?: string;
  imagePath?: string; // relative to project dir
  audioPath?: string; // relative to project dir
  audioDuration?: number;
  words?: Word[]; // relative to scene start
  locked?: boolean; // user edited: do not regenerate automatically
}

export type SubtitleStyleId = "tiktok_karaoke" | "keyword_highlight" | "classic";

export interface ProjectSettings {
  llmModel: string;
  llmEffort: "low" | "medium" | "high" | "xhigh" | "max";
  imageProvider: string;
  imageModel?: string;
  ttsProvider: string;
  voiceId: string;
  ttsSpeed: number;
  subtitleStyle: SubtitleStyleId;
  autoMode: boolean; // run all steps without stopping
  budgetUsd?: number;
  seed?: number;
  styleSuffix?: string; // appended to every image prompt (series consistency)
}

export interface CostEntry {
  step: StepId;
  provider: string;
  usd: number;
  detail: string;
  at: string;
}

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  formatId: string;
  aspect: Aspect;
  durationSec: number;
  language: Lang;
  niche: string;
  topic?: string;
  settings: ProjectSettings;
  ideas?: Idea[];
  selectedIdea?: Idea;
  script?: Script;
  scenes?: Scene[];
  subtitlesPath?: string;
  narrationPath?: string;
  outputPath?: string;
  steps: Record<StepId, StepState>;
  costs: CostEntry[];
}

export interface LogEntry {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  step?: StepId;
  message: string;
}

export const ASPECT_SIZES: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

export const DURATION_PRESETS = [15, 30, 60, 90, 180, 480, 600] as const;

export function emptySteps(): Record<StepId, StepState> {
  return Object.fromEntries(STEP_IDS.map((s) => [s, { status: "idle", progress: 0 }])) as Record<
    StepId,
    StepState
  >;
}
