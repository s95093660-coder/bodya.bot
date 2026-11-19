# Архитектура AI Video Studio

## Принципы

1. **Пайплайн — чистый TypeScript, без привязки к рантайму.** Все обращения к ОС (файлы, FFmpeg, keychain, SQLite, HTTP) идут через интерфейс `Platform` (`src/core/platform.ts`). Есть две реализации:
   - `platform/tauri.ts` — десктоп-приложение (Rust-команды + плагины Tauri);
   - `platform/node.ts` — headless CLI и тесты (тот же пайплайн, ключи из env).
   Поэтому каждый шаг тестируется end-to-end без GUI (`tests/pipeline.test.ts`).
2. **Провайдеры — адаптеры с единым интерфейсом** (`src/providers/types.ts`): `ImageProvider`, `VideoProvider`, `TtsProvider`, `SttProvider`, `LlmClient`. Новый провайдер = один файл + строка в `providers/registry.ts`.
3. **Каждый шаг идемпотентен и возобновляем.** Состояние проекта (JSON) сохраняется в SQLite после каждого шага и каждой сцены; при перезапуске уже готовые сцены пропускаются.
4. **Контентный кэш.** Ключ = SHA-256 от (провайдер, модель, промпт, параметры). Одинаковые запросы не оплачиваются дважды.
5. **Секреты только в системном keychain** (crate `keyring`: Windows Credential Manager / macOS Keychain / Secret Service). В webview ключ попадает лишь на время запроса, а сами HTTP-запросы выполняет Rust (`tauri-plugin-http`), без CORS и без хранения на диске.

## Схема

```
┌──────────────────────── React UI (src/ui) ────────────────────────┐
│ Проекты · Мастер · Редактор шагов/сцен · Форматы · Настройки      │
└──────────────┬────────────────────────────────────────────────────┘
               │ zustand store (run / stop / regen)
┌──────────────▼──────────── pipeline/ ─────────────────────────────┐
│ runner.ts: порядок шагов, ресюм, бюджет, инвалидация, логи        │
│ steps: ideas → script → storyboard → visuals → voice → subtitles  │
│        → render   (+ metadata, thumbnail, publish — этапы 2–3)    │
│ cost.ts (калькулятор), timeline.ts, schemas.ts (zod)              │
└──────┬──────────────┬──────────────┬──────────────┬───────────────┘
       │              │              │              │
 providers/      templates/       render/          db/
 llm/claude      formats.ts       ass.ts (караоке) repo.ts (SQLite)
 image/*         prompts.ts       ffmpeg.ts (Ken Burns, concat,
 tts/* stt/*                       ducking, burn-in)
       │                              │
┌──────▼──────────── Platform ────────▼─────────────────────────────┐
│ Tauri: Rust-команды secret_* (keyring), ffmpeg_run / ffprobe       │
│ (sidecar, прогресс через события, отмена), plugin-sql/fs/http      │
│ Node: env-ключи, child_process, node:sqlite                        │
└────────────────────────────────────────────────────────────────────┘
```

## Модули

| Папка | Что внутри |
|---|---|
| `src/core` | типы домена, ошибки + ретраи (`withRetry`, `ProviderError`), кэш, утилиты, `Platform` |
| `src/providers` | `llm/claude.ts` (Anthropic SDK, structured outputs, server-side fallback), `image/` (OpenAI, Flux/BFL, SD локально, mock), `tts/` (ElevenLabs с таймингом слов, OpenAI TTS, mock), `stt/whisper.ts` |
| `src/pipeline` | раннер, шаги, калькулятор стоимости, таймлайн |
| `src/templates` | пресеты форматов и редактируемые системные промпты |
| `src/render` | генератор `.ass`/`.srt`, построитель FFmpeg-графа |
| `src/publish` | автопостинг YouTube/TikTok (этап 3) |
| `src/db` | схема и репозиторий SQLite |
| `src-tauri` | Rust: keychain, запуск FFmpeg, плагины, автообновления |
| `cli/` | headless-режим (`npm run cli`) |

## Модель данных (SQLite)

- `projects(id, title, format_id, aspect, status, data JSON, created_at, updated_at)` — весь `Project` в JSON;
- `logs(project_id, ts, level, step, message)`;
- `queue(id, project_id, status, position, …)` — пакетный режим (этап 2);
- `templates(id, data)` — пользовательские форматы;
- `prompts(id, text)` — переопределения системных промптов;
- `settings(key, value)`.

Ассеты проекта: `<AppData>/projects/<id>/{images,audio,subs,clips,out}`, кэш: `<AppData>/cache`.

## Рендер

Один вызов FFmpeg: каждая картинка → `scale ×2 → zoompan` (Ken Burns по полю `camera`) → `concat`; озвучка сцен добивается тишиной до длительности сцены (`apad/atrim`) → `concat`; субтитры `.ass` прожигаются фильтром `ass`; музыка (опционально) приглушается под голос `sidechaincompress`. Граф пишется в файл и передаётся через `-filter_complex_script` (нет лимита длины командной строки Windows), а FFmpeg запускается с `cwd` = папка проекта (нет проблем с экранированием `C:\` в фильтрах).

Длительность сцены = реальная длина озвучки + 0.2 с, поэтому видео, голос и субтитры всегда синхронны.

## Обработка ошибок

`ProviderError.kind`: `auth | rate_limit | network | server | bad_request | refusal | budget | cancelled`. Ретраятся только `rate_limit/network/server` (экспоненциальная задержка, `retry-after`). Сообщения — на русском и понятные пользователю. При падении шаг помечается `error`, всё уже сгенерированное сохраняется, «Продолжить» запускает с первого незавершённого шага.
