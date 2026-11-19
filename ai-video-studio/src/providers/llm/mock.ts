// Offline stand-in for Claude: returns deterministic, schema-valid data so the
// whole pipeline can be tested without keys (CLI --mock, unit tests, demo mode).

import type { LlmClient } from "./claude";
import { IdeasSchema, MetadataSchema, ScriptSchema, StoryboardSchema } from "../../pipeline/schemas";

const SENTENCES = [
  "Что если Луна исчезнет прямо сейчас?",
  "Первые секунды никто ничего не заметит.",
  "Но уже этой ночью небо станет непривычно тёмным.",
  "Приливы ослабнут почти в три раза, и прибрежные экосистемы начнут рушиться.",
  "А дальше начнётся самое странное: ось Земли потеряет стабилизатор.",
  "За тысячи лет климат будет качаться от ледников к пустыням.",
  "Получается, Луна — это не просто фонарь, а щит нашей планеты.",
  "Подпишись, чтобы узнать, что будет, если исчезнет Солнце.",
];

export const mockLlm: LlmClient = {
  async structured(req) {
    let data: unknown;
    if (req.schema === (IdeasSchema as unknown)) {
      data = {
        ideas: Array.from({ length: 10 }, (_, i) => ({
          title: `Что если идея №${i + 1}`,
          hook: SENTENCES[0],
          angle: "Тестовый угол",
          viralityScore: 9 - (i % 5),
          why: "Тестовые данные (mock)",
        })),
      };
    } else if (req.schema === (ScriptSchema as unknown)) {
      data = {
        title: "Что если Луна исчезнет?",
        hook: SENTENCES[0],
        body: SENTENCES.slice(1, 7).join(" "),
        cta: SENTENCES[7],
        fullText: SENTENCES.join(" "),
        keywords: ["Луна", "приливы", "климат", "щит"],
      };
    } else if (req.schema === (StoryboardSchema as unknown)) {
      const cams = ["zoom_in", "pan_right", "zoom_out", "pan_left", "pan_up", "zoom_in", "pan_down", "static"] as const;
      data = {
        scenes: SENTENCES.map((s, i) => ({
          narration: s,
          imagePrompt: `cinematic scene ${i + 1}: the Moon disappearing from the night sky`,
          durationSec: 3,
          camera: cams[i % cams.length],
          emotion: "curious",
          onScreenText: "",
        })),
      };
    } else if (req.schema === (MetadataSchema as unknown)) {
      data = {
        variants: [1, 2, 3].map((n) => ({
          title: `Что если Луна исчезнет? (вариант ${n})`,
          description: "Тестовое описание",
          hashtags: ["#наука", "#космос"],
          tags: ["луна", "наука"],
          thumbnailText: "БЕЗ ЛУНЫ",
        })),
      };
    } else throw new Error("mockLlm: неизвестная схема");
    return { data: req.schema.parse(data), usd: 0, inputTokens: 0, outputTokens: 0 };
  },
};
