// Format presets. Each preset tunes prompts, visual style, defaults and layout.
// Custom user formats are stored in SQLite (table `templates`) with the same shape.

import type { Aspect, SubtitleStyleId } from "../core/types";

export interface FormatPreset {
  id: string;
  name: { ru: string; en: string };
  description: { ru: string; en: string };
  /** Extra guidance injected into every Claude prompt. */
  hints: string;
  /** Appended to every image prompt for a consistent look. */
  visualStyle: string;
  defaultAspect: Aspect;
  defaultDuration: number;
  subtitleStyle: SubtitleStyleId;
  layout: "full" | "split"; // split = content on top, background gameplay at the bottom (stage 2)
  defaultNiche: string;
  builtIn: boolean;
  mvpReady: boolean;
}

export const FORMATS: FormatPreset[] = [
  {
    id: "what-if",
    name: { ru: "Что если…", en: "What if…" },
    description: { ru: "Научные гипотезы и мысленные эксперименты", en: "Science hypotheticals" },
    hints:
      "Ролик отвечает на вопрос «Что если…?» с опорой на реальную науку. Нарастание масштаба последствий: от секунд к годам. Цифры и сравнения, понятные школьнику.",
    visualStyle: "epic cinematic sci-fi concept art, dramatic lighting, ultra detailed, 8k, volumetric light",
    defaultAspect: "9:16",
    defaultDuration: 60,
    subtitleStyle: "tiktok_karaoke",
    layout: "full",
    defaultNiche: "наука и космос",
    builtIn: true,
    mvpReady: true,
  },
  {
    id: "horror-pov",
    name: { ru: "Страшилки / выживание (POV)", en: "Horror / survival POV" },
    description: { ru: "История от второго лица: «Ты просыпаешься…»", en: "Second-person survival story" },
    hints: "Повествование от второго лица («ты»), настоящее время, нарастающее напряжение, клиффхэнгеры, неожиданный финал.",
    visualStyle: "dark atmospheric horror, first-person perspective, film grain, low key lighting, cinematic",
    defaultAspect: "9:16",
    defaultDuration: 60,
    subtitleStyle: "tiktok_karaoke",
    layout: "full",
    defaultNiche: "хоррор и выживание",
    builtIn: true,
    mvpReady: true,
  },
  {
    id: "3d-explainer",
    name: { ru: "3D-объяснялки", en: "3D explainers" },
    description: { ru: "Как это устроено внутри", en: "How things work inside" },
    hints: "Объясняй устройство по шагам, каждая сцена — один механизм. Аналогии из быта.",
    visualStyle: "clean 3D render, isometric cutaway, soft studio lighting, octane render, pastel background",
    defaultAspect: "9:16",
    defaultDuration: 60,
    subtitleStyle: "keyword_highlight",
    layout: "full",
    defaultNiche: "технологии и тело человека",
    builtIn: true,
    mvpReady: true,
  },
  {
    id: "top-facts",
    name: { ru: "Факты / Топ-10", en: "Facts / Top 10" },
    description: { ru: "Обратный отсчёт фактов", en: "Countdown of facts" },
    hints: "Обратный отсчёт; лучший факт последним; каждый пункт — одна сцена с номером в onScreenText.",
    visualStyle: "vibrant photorealistic, high contrast, editorial photography",
    defaultAspect: "9:16",
    defaultDuration: 60,
    subtitleStyle: "keyword_highlight",
    layout: "full",
    defaultNiche: "удивительные факты",
    builtIn: true,
    mvpReady: true,
  },
  {
    id: "reddit-story",
    name: { ru: "Истории с Reddit", en: "Reddit stories" },
    description: { ru: "Озвучка истории на фоне геймплея", en: "Story narration over gameplay" },
    hints: "Пересказ истории от первого лица в стиле Reddit (AITA/TIFU), без реальных имён. Твист в конце.",
    visualStyle: "",
    defaultAspect: "9:16",
    defaultDuration: 90,
    subtitleStyle: "tiktok_karaoke",
    layout: "split",
    defaultNiche: "жизненные истории",
    builtIn: true,
    mvpReady: false,
  },
  {
    id: "split-screen",
    name: { ru: "Сплит-скрин", en: "Split screen" },
    description: { ru: "Сверху контент, снизу фоновое видео", en: "Content top, background video bottom" },
    hints: "Короткие визуальные сцены для верхней половины экрана.",
    visualStyle: "bold colorful illustration, centered subject",
    defaultAspect: "9:16",
    defaultDuration: 60,
    subtitleStyle: "tiktok_karaoke",
    layout: "split",
    defaultNiche: "интересное",
    builtIn: true,
    mvpReady: false,
  },
  {
    id: "motivation",
    name: { ru: "Мотивация / дисциплина", en: "Motivation / discipline" },
    description: { ru: "Короткие мотивационные речи", en: "Motivational speeches" },
    hints: "Сильные короткие фразы, паузы, обращение к зрителю. Без клише «просто поверь в себя».",
    visualStyle: "moody cinematic, silhouette, golden hour, high contrast, film look",
    defaultAspect: "9:16",
    defaultDuration: 30,
    subtitleStyle: "keyword_highlight",
    layout: "full",
    defaultNiche: "саморазвитие",
    builtIn: true,
    mvpReady: true,
  },
  {
    id: "news",
    name: { ru: "Новости / тренды", en: "News / trends" },
    description: { ru: "Обзор трендов и новостей", en: "Trend and news recap" },
    hints: "Нейтральный тон, факты без домыслов, «что случилось — почему важно — что дальше».",
    visualStyle: "modern editorial illustration, clean, infographic feel",
    defaultAspect: "9:16",
    defaultDuration: 60,
    subtitleStyle: "classic",
    layout: "full",
    defaultNiche: "технологии",
    builtIn: true,
    mvpReady: true,
  },
];

export function getFormat(id: string, custom: FormatPreset[] = []): FormatPreset {
  return [...FORMATS, ...custom].find((f) => f.id === id) ?? FORMATS[0];
}
