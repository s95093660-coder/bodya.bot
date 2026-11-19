import { emptySteps, type Aspect, type Lang, type Project, type ProjectSettings } from "../core/types";
import { nowIso, uid } from "../core/util";
import { getFormat } from "../templates/formats";

export const DEFAULT_SETTINGS: ProjectSettings = {
  llmModel: "claude-opus-5-5",
  llmEffort: "medium",
  imageProvider: "openai",
  imageModel: "gpt-image-1",
  ttsProvider: "elevenlabs",
  voiceId: "",
  ttsSpeed: 1.05,
  subtitleStyle: "tiktok_karaoke",
  autoMode: true,
};

export function createProject(input: {
  formatId: string;
  aspect?: Aspect;
  durationSec?: number;
  language?: Lang;
  niche?: string;
  topic?: string;
  settings?: Partial<ProjectSettings>;
}): Project {
  const f = getFormat(input.formatId);
  const t = nowIso();
  return {
    id: uid("p_"),
    title: input.topic || f.name.ru,
    createdAt: t,
    updatedAt: t,
    formatId: f.id,
    aspect: input.aspect ?? f.defaultAspect,
    durationSec: input.durationSec ?? f.defaultDuration,
    language: input.language ?? "ru",
    niche: input.niche ?? f.defaultNiche,
    topic: input.topic,
    settings: { ...DEFAULT_SETTINGS, subtitleStyle: f.subtitleStyle, ...input.settings },
    steps: emptySteps(),
    costs: [],
  };
}
