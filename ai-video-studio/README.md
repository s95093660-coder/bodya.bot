# 🎬 AI Video Studio

Десктоп-приложение для Windows и macOS, которое автоматически делает ИИ-видео для YouTube и TikTok.
Мозг — **Claude** (Anthropic): идеи, сценарий, раскадровка. Визуал, озвучка, субтитры и монтаж — через подключаемых провайдеров и встроенный FFmpeg.

**Стек:** Tauri 2 (Rust) · React · TypeScript · Tailwind · SQLite · FFmpeg · системный keychain.

> Статус: **этап 1 (MVP) готов.** Полный пайплайн «идея → MP4» работает. План этапов 2–3 — в [`docs/ROADMAP.md`](docs/ROADMAP.md), архитектура — в [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Что умеет MVP

1. **Идеи:** Claude предлагает 10 идей по нише с оценкой вирусности (или задайте тему сами).
2. **Сценарий:** хук на 1–3 сек, ретеншн-петли, CTA, под выбранную длительность.
3. **Раскадровка:** сцены с текстом озвучки, промптом кадра, длительностью, движением камеры и эмоцией.
4. **Картинки:** OpenAI `gpt-image-1`, Flux (Black Forest Labs), Stable Diffusion локально (AUTOMATIC1111/Forge API).
5. **Озвучка:** ElevenLabs (с таймингом слов) или OpenAI TTS; выбор голоса и скорости.
6. **Субтитры:** тайминг по словам (ElevenLabs → Whisper → оценка), стили «TikTok-караоке», «ключевые слова», «классические»; SRT для CapCut/Premiere.
7. **Рендер:** Ken Burns (зум/панорама) на каждом кадре, прожиг субтитров, H.264 MP4.

Также: 8 форматов-пресетов + свои форматы, 9:16 / 16:9 / 1:1 / 4:5, длительность 15 с–10 мин, авто- и ручной режим, редактор сцен с перегенерацией одного кадра/озвучки без пересборки всего, калькулятор стоимости **до** генерации и лимит бюджета, кэш (повторно не платим), ретраи и продолжение с места падения, логи и прогресс каждого шага, редактируемые системные промпты, тёмная/светлая тема, RU/EN, горячие клавиши, автообновления, **демо-режим без ключей**.

## Установка (пользователю)

Скачайте установщик со страницы Releases:

- **Windows 10/11:** `AI Video Studio_x.y.z_x64_en-US.msi` или `…-setup.exe`. WebView2 поставится автоматически.
- **macOS 11+ (Intel и Apple Silicon):** `AI Video Studio_x.y.z_universal.dmg` → перетащите в «Программы». Если сборка не подписана: правый клик → «Открыть».

FFmpeg уже встроен в установщик.

## Ключи API

Откройте **Настройки → Ключи API**. Ключи сохраняются в **Windows Credential Manager / macOS Keychain** и никогда не пишутся в файлы проекта или базу.

| Ключ | Для чего | Где взять |
|---|---|---|
| Anthropic | идеи, сценарий, раскадровка (обязателен) | https://console.anthropic.com/settings/keys |
| OpenAI | картинки gpt-image-1, OpenAI TTS, Whisper-тайминг | https://platform.openai.com/api-keys |
| ElevenLabs | озвучка с точным таймингом слов | https://elevenlabs.io/app/settings/api-keys |
| Black Forest Labs | картинки Flux | https://api.bfl.ai/ |

Минимальный набор для «Что если…»: **Anthropic + OpenAI** (картинки, TTS и Whisper) или **Anthropic + OpenAI + ElevenLabs** (лучший голос).
Без ключей: в **Настройки → Модель Claude** выберите `mock`, а картинки/озвучку — «Тестовый». Получится видео-заглушка — удобно проверить, что всё работает.

## Быстрый старт

1. **Новое видео** (Ctrl/⌘+N) → формат «Что если…», 9:16, 60 сек.
2. Ниша: «наука и космос». Тема (необязательно): «Что если Луна исчезнет?».
3. Справа видна оценка стоимости (примерно $0.5–1 за 60-секундный ролик с OpenAI-картинками и ElevenLabs).
4. **Сделать видео целиком.** Готовый MP4 — во вкладке «Рендер» → «Открыть папку».

Ручной режим (снимите галочку «Автоматический режим»): после каждого шага можно выбрать идею, поправить сценарий, промпты кадров, камеру, перегенерировать отдельные кадры и голос, потом продолжить (Ctrl/⌘+Enter).

## Разработка

Требования: Node 22+, Rust stable, и для Tauri:
- **Windows:** Microsoft C++ Build Tools, WebView2 (есть в Win 11).
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux (для разработки):** `libwebkit2gtk-4.1-dev libsoup-3.0-dev libsecret-1-dev librsvg2-dev`.

```bash
cd ai-video-studio
npm install
npm run fetch-ffmpeg     # кладёт ffmpeg/ffprobe в src-tauri/binaries (для сборки установщика)
npm run app:dev          # запуск приложения в режиме разработки
npm test                 # unit + e2e-тест пайплайна (нужен ffmpeg в PATH)
npm run cli -- --mock --duration 30   # пайплайн без GUI и без ключей
```

В режиме разработки используется FFmpeg из `PATH` (или из `AIVS_FFMPEG`/`AIVS_FFPROBE`), если рядом с бинарником нет встроенного.

Headless-режим с реальными ключами (ключи из переменных окружения):

```bash
ANTHROPIC_API_KEY=… OPENAI_API_KEY=… ELEVENLABS_API_KEY=… \
npm run cli -- --format what-if --topic "Что если Луна исчезнет" --duration 60 --image openai --tts elevenlabs --budget 2
```

### Сборка установщиков

```bash
# Windows (.msi + .exe)
node scripts/fetch-ffmpeg.mjs x86_64-pc-windows-msvc
npx tauri build --config src-tauri/tauri.release.conf.json

# macOS universal (.dmg, Intel + Apple Silicon)
rustup target add aarch64-apple-darwin x86_64-apple-darwin
node scripts/fetch-ffmpeg.mjs universal-apple-darwin
npx tauri build --config src-tauri/tauri.release.conf.json --target universal-apple-darwin
```

Для автообновлений сгенерируйте ключ подписи `npx tauri signer generate -w ~/.tauri/aivs.key`, впишите публичный ключ в `src-tauri/tauri.conf.json → plugins.updater.pubkey`, а приватный задайте в `TAURI_SIGNING_PRIVATE_KEY`.

**CI:** `.github/workflows/ai-video-studio.yml` — проверка типов и тесты на каждый push; на тег `studio-v*` собирает `.msi/.exe` и universal `.dmg` и создаёт черновик релиза с `latest.json` для автообновлений. Нужные секреты: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; опционально `APPLE_*` для подписи и нотаризации.

### Как добавить провайдера

1. Реализуйте интерфейс из `src/providers/types.ts` (например, `ImageProvider` — `generate()` и `estimateUsd()`).
2. Добавьте объект в список в `src/providers/registry.ts`.
3. Если нужен ключ — добавьте запись в `src/core/secrets.ts`.

Всё. UI, кэш, ретраи, калькулятор и бюджет подхватят его автоматически.

## Структура

```
ai-video-studio/
├─ src/
│  ├─ core/        типы, Platform, ошибки и ретраи, кэш, секреты
│  ├─ providers/   llm/ image/ tts/ stt/ video/ — адаптеры + registry
│  ├─ pipeline/    runner, steps/, cost, timeline, schemas (zod)
│  ├─ templates/   форматы-пресеты, системные промпты
│  ├─ render/      ASS/SRT-субтитры, FFmpeg-граф
│  ├─ publish/     автопостинг (этап 3)
│  ├─ db/          SQLite-схема и репозиторий
│  ├─ platform/    tauri.ts (приложение), node.ts (CLI/тесты)
│  ├─ ui/          React-страницы и компоненты
│  └─ i18n/        RU / EN
├─ src-tauri/      Rust: keychain, FFmpeg-раннер, плагины, конфиг
├─ cli/            headless-раннер
├─ tests/          vitest
└─ docs/           ARCHITECTURE.md, ROADMAP.md
```

## Лицензии

Встроенные сборки FFmpeg (ffmpeg-static) распространяются под GPL — учитывайте это при распространении. Сгенерированный контент подчиняется условиям используемых провайдеров ИИ.
