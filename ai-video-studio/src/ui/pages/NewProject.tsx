import { useEffect, useState } from "react";
import { DURATION_PRESETS, type Aspect, type Lang, type SubtitleStyleId } from "../../core/types";
import { useT } from "../../i18n";
import { listCustomFormats } from "../../db/repo";
import { estimateProject } from "../../pipeline/cost";
import { createProject, DEFAULT_SETTINGS } from "../../pipeline/project";
import { IMAGE_PROVIDERS, TTS_PROVIDERS } from "../../providers/registry";
import { FORMATS, type FormatPreset } from "../../templates/formats";
import { Badge, Button, Card, Field, Input, Select } from "../components/ui";
import { useStore } from "../store";
import { getSetting } from "../../db/repo";

export const fmtDur = (s: number) => (s < 120 ? `${s} сек` : `${Math.round(s / 60)} мин`);

export function NewProjectPage() {
  const t = useT();
  const { upsert, go, run, uiLang } = useStore();
  const [custom, setCustom] = useState<FormatPreset[]>([]);
  const [formatId, setFormatId] = useState("what-if");
  const f = [...FORMATS, ...custom].find((x) => x.id === formatId)!;
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [duration, setDuration] = useState(60);
  const [language, setLanguage] = useState<Lang>("ru");
  const [niche, setNiche] = useState(f.defaultNiche);
  const [topic, setTopic] = useState("");
  const [auto, setAuto] = useState(true);
  const [s, setS] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    listCustomFormats().then(setCustom).catch(() => {});
    getSetting("defaults", DEFAULT_SETTINGS).then((d) => setS({ ...DEFAULT_SETTINGS, ...d }));
  }, []);
  useEffect(() => {
    setAspect(f.defaultAspect);
    setDuration(f.defaultDuration);
    setNiche(f.defaultNiche);
  }, [formatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = () =>
    createProject({
      formatId,
      aspect,
      durationSec: duration,
      language,
      niche,
      topic: topic.trim() || undefined,
      settings: { ...s, autoMode: auto, subtitleStyle: s.subtitleStyle ?? f.subtitleStyle },
    });
  const est = estimateProject(draft());

  const submit = async (start: boolean) => {
    const p = draft();
    await upsert(p);
    go("project", p.id);
    if (start) run(p.id);
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t("newVideo")}</h1>
        <Card>
          <div className="mb-2 text-sm text-zinc-500">{t("format")}</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[...FORMATS, ...custom].map((x) => (
              <button
                key={x.id}
                onClick={() => setFormatId(x.id)}
                className={`rounded-lg border p-3 text-left text-sm transition ${
                  x.id === formatId ? "border-violet-500 bg-violet-500/10" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"
                }`}
              >
                <div className="font-medium">{x.name[uiLang]}</div>
                <div className="mt-1 text-xs text-zinc-500">{x.description[uiLang]}</div>
                {!x.mvpReady && <Badge tone="amber">{t("comingSoon")}</Badge>}
              </button>
            ))}
          </div>
        </Card>
        <Card className="grid gap-3 md:grid-cols-3">
          <Field label={t("aspect")}>
            <Select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)}>
              <option value="9:16">9:16 — TikTok / Shorts / Reels</option>
              <option value="16:9">16:9 — YouTube</option>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
            </Select>
          </Field>
          <Field label={t("duration")}>
            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATION_PRESETS.map((d) => (
                <option key={d} value={d}>
                  {fmtDur(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("language")}>
            <Select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label={t("niche")}>
            <Input value={niche} onChange={(e) => setNiche(e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label={t("topic")}>
              <Input value={topic} placeholder="Что если Луна исчезнет?" onChange={(e) => setTopic(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card className="grid gap-3 md:grid-cols-3">
          <Field label={t("imageProvider")}>
            <Select value={s.imageProvider} onChange={(e) => setS({ ...s, imageProvider: e.target.value, imageModel: IMAGE_PROVIDERS.find((p) => p.id === e.target.value)?.models[0] })}>
              {IMAGE_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("ttsProvider")}>
            <Select value={s.ttsProvider} onChange={(e) => setS({ ...s, ttsProvider: e.target.value, voiceId: "" })}>
              {TTS_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("subtitleStyle")}>
            <Select value={s.subtitleStyle} onChange={(e) => setS({ ...s, subtitleStyle: e.target.value as SubtitleStyleId })}>
              <option value="tiktok_karaoke">TikTok-караоке</option>
              <option value="keyword_highlight">Ключевые слова</option>
              <option value="classic">Классические</option>
            </Select>
          </Field>
          <Field label={t("budget")}>
            <Input type="number" min={0} step={0.5} value={s.budgetUsd ?? ""} onChange={(e) => setS({ ...s, budgetUsd: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            {auto ? t("autoMode") : t("manualMode")}
          </label>
        </Card>
      </div>
      <div className="flex flex-col gap-4 lg:pt-12">
        <Card>
          <div className="text-sm text-zinc-500">{t("estimate")}</div>
          <div className="my-1 text-3xl font-semibold">${est.total.toFixed(2)}</div>
          <div className="space-y-0.5 text-xs text-zinc-500">
            {Object.entries(est.perStep).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <span>${v.toFixed(3)}</span>
              </div>
            ))}
          </div>
          {s.budgetUsd !== undefined && est.total > s.budgetUsd && <div className="mt-2 text-xs text-red-500">Оценка превышает бюджет</div>}
        </Card>
        <Button onClick={() => submit(true)} className="justify-center py-2.5 text-base" disabled={!f.mvpReady}>
          🎬 {auto ? t("runAll") : t("run")}
        </Button>
        <Button variant="outline" onClick={() => submit(false)} className="justify-center">
          {t("create")}
        </Button>
      </div>
    </div>
  );
}
