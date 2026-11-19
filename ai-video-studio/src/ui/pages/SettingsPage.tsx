import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { platform } from "../../core/platform";
import { SECRETS } from "../../core/secrets";
import { useT } from "../../i18n";
import { getPromptOverrides, getSetting, setPromptOverride, setSetting } from "../../db/repo";
import { DEFAULT_SETTINGS } from "../../pipeline/project";
import { CLAUDE_MODELS } from "../../providers/llm/claude";
import { IMAGE_PROVIDERS, TTS_PROVIDERS } from "../../providers/registry";
import { DEFAULT_PROMPTS, type PromptId } from "../../templates/prompts";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "../components/ui";
import { useStore } from "../store";

export function SettingsPage() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("settings")}</h1>
      <KeysSection />
      <DefaultsSection />
      <InterfaceSection />
      <PromptsSection />
    </div>
  );
}

function KeysSection() {
  const t = useT();
  const [has, setHas] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const refresh = async () => {
    const entries = await Promise.all(SECRETS.map(async (s) => [s.id, !!(await platform().getSecret(s.id).catch(() => null))] as const));
    setHas(Object.fromEntries(entries));
  };
  useEffect(() => {
    refresh();
  }, []);
  const notify = useStore((s) => s.notify);
  return (
    <Card>
      <h2 className="mb-1 font-semibold">{t("apiKeys")}</h2>
      <p className="mb-3 text-xs text-zinc-500">Ключи хранятся только в системном хранилище (Windows Credential Manager / macOS Keychain) и никогда не пишутся в файлы.</p>
      <div className="flex flex-col gap-3">
        {SECRETS.map((s) => (
          <div key={s.id} className="grid grid-cols-[220px_1fr_auto_auto] items-center gap-2">
            <div>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-zinc-500">{s.requiredFor}</div>
            </div>
            <Input type="password" placeholder={has[s.id] ? "••••••••  " + t("keySaved") : t("keyMissing")} value={draft[s.id] ?? ""} onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })} />
            <Button
              disabled={!draft[s.id]}
              onClick={async () => {
                try {
                  await platform().setSecret(s.id, draft[s.id]);
                  setDraft({ ...draft, [s.id]: "" });
                  refresh();
                } catch (e) {
                  notify(String(e));
                }
              }}
            >
              {t("save")}
            </Button>
            {has[s.id] ? (
              <Button variant="ghost" className="text-red-500" onClick={() => platform().deleteSecret(s.id).then(refresh)}>
                ✕
              </Button>
            ) : (
              <a className="text-xs text-violet-500 underline" href={s.url} target="_blank" rel="noreferrer" onClick={(e) => (e.preventDefault(), openUrl(s.url))}>
                {t("getKey")}
              </a>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DefaultsSection() {
  const t = useT();
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    getSetting("defaults", DEFAULT_SETTINGS).then((d) => setS({ ...DEFAULT_SETTINGS, ...d }));
  }, []);
  const update = (patch: Partial<typeof s>) => {
    const n = { ...s, ...patch };
    setS(n);
    setSetting("defaults", n).then(() => (setSaved(true), setTimeout(() => setSaved(false), 1200)));
  };
  return (
    <Card className="grid gap-3 md:grid-cols-3">
      <h2 className="font-semibold md:col-span-3">
        Провайдеры по умолчанию {saved && <Badge tone="green">✓</Badge>}
      </h2>
      <Field label={t("model")}>
        <Select value={s.llmModel} onChange={(e) => update({ llmModel: e.target.value })}>
          {CLAUDE_MODELS.map((m) => (
            <option key={m}>{m}</option>
          ))}
          <option value="mock">mock — демо без API</option>
        </Select>
      </Field>
      <Field label={t("effort")}>
        <Select value={s.llmEffort} onChange={(e) => update({ llmEffort: e.target.value as typeof s.llmEffort })}>
          {["low", "medium", "high", "xhigh", "max"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("imageProvider")}>
        <Select value={s.imageProvider} onChange={(e) => update({ imageProvider: e.target.value, imageModel: IMAGE_PROVIDERS.find((p) => p.id === e.target.value)?.models[0] })}>
          {IMAGE_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Модель картинок">
        <Select value={s.imageModel} onChange={(e) => update({ imageModel: e.target.value })}>
          {IMAGE_PROVIDERS.find((p) => p.id === s.imageProvider)?.models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("ttsProvider")}>
        <Select value={s.ttsProvider} onChange={(e) => update({ ttsProvider: e.target.value, voiceId: "" })}>
          {TTS_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Стиль-суффикс для всех кадров (серии)">
        <Input value={s.styleSuffix ?? ""} placeholder="same red-haired astronaut, Pixar style" onChange={(e) => update({ styleSuffix: e.target.value || undefined })} />
      </Field>
    </Card>
  );
}

function InterfaceSection() {
  const t = useT();
  const { uiLang, setUiLang, theme, setTheme } = useStore();
  const [ff, setFf] = useState("…");
  useEffect(() => {
    invoke<string>("ffmpeg_info")
      .then(setFf)
      .catch((e) => setFf(String(e)));
  }, []);
  return (
    <Card className="grid gap-3 md:grid-cols-3">
      <h2 className="font-semibold md:col-span-3">{t("interface")}</h2>
      <Field label="Язык / Language">
        <Select value={uiLang} onChange={(e) => setUiLang(e.target.value as "ru" | "en")}>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </Select>
      </Field>
      <Field label={t("theme")}>
        <Select value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")}>
          <option value="dark">{t("dark")}</option>
          <option value="light">{t("light")}</option>
        </Select>
      </Field>
      <Field label={t("checkUpdates")}>
        <Button variant="outline" onClick={() => checkForUpdates(useStore.getState().notify)}>
          ⟳ {t("checkUpdates")}
        </Button>
      </Field>
      <div className="text-xs text-zinc-500 md:col-span-3">
        {t("ffmpeg")}: {ff}
        <br />
        {t("hotkeys")}
      </div>
    </Card>
  );
}

export async function checkForUpdates(notify: (m: string) => void) {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const upd = await check();
    if (!upd) return notify("Установлена последняя версия");
    notify(`Загружаю обновление ${upd.version}…`);
    await upd.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    notify(`Обновление недоступно: ${e}`);
  }
}

function PromptsSection() {
  const t = useT();
  const [over, setOver] = useState<Partial<Record<PromptId, string>>>({});
  const [id, setId] = useState<PromptId>("script");
  useEffect(() => {
    getPromptOverrides().then(setOver);
  }, []);
  const value = over[id] ?? DEFAULT_PROMPTS[id];
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">{t("prompts")}</h2>
      <div className="flex gap-2">
        {(Object.keys(DEFAULT_PROMPTS) as PromptId[]).map((k) => (
          <Button key={k} variant={k === id ? "primary" : "outline"} onClick={() => setId(k)}>
            {k} {over[k] && "•"}
          </Button>
        ))}
      </div>
      <Textarea className="min-h-64 font-mono text-xs" value={value} onChange={(e) => setOver({ ...over, [id]: e.target.value })} />
      <div className="text-xs text-zinc-500">{"Плейсхолдеры: {{lang}} {{duration}} {{aspect}} {{format}} {{formatHints}} {{niche}} {{topic}} {{words}} {{scenes}}"}</div>
      <div className="flex gap-2">
        <Button onClick={() => setPromptOverride(id, value)}>{t("save")}</Button>
        <Button
          variant="outline"
          onClick={() => {
            setPromptOverride(id, null);
            const n = { ...over };
            delete n[id];
            setOver(n);
          }}
        >
          {t("resetDefault")}
        </Button>
      </div>
    </Card>
  );
}
