import { z } from "zod";

export const IdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string(),
        hook: z.string().describe("Первая фраза ролика, 1–3 секунды"),
        angle: z.string().describe("Чем идея отличается от похожих роликов"),
        viralityScore: z.number().describe("Оценка вирусности 1–10"),
        why: z.string().describe("Почему зайдёт: эмоция, любопытство, спорность"),
      }),
    )
    .describe("Ровно 10 идей"),
});

export const ScriptSchema = z.object({
  title: z.string(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  fullText: z.string().describe("Полный текст озвучки: hook + body + cta, без ремарок"),
  keywords: z.array(z.string()).describe("5–12 ключевых слов для выделения в субтитрах"),
});

export const CAMERA_MOVES = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down", "static"] as const;

export const StoryboardSchema = z.object({
  scenes: z.array(
    z.object({
      narration: z.string().describe("Точный фрагмент текста озвучки для этой сцены"),
      imagePrompt: z.string().describe("Детальный промпт для генерации кадра на английском"),
      durationSec: z.number(),
      camera: z.enum(CAMERA_MOVES),
      emotion: z.string(),
      onScreenText: z.string().describe("Короткий текст на экране или пустая строка"),
    }),
  ),
});

export const MetadataSchema = z.object({
  variants: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        hashtags: z.array(z.string()),
        tags: z.array(z.string()),
        thumbnailText: z.string(),
      }),
    )
    .describe("Ровно 3 варианта для A/B теста"),
});
