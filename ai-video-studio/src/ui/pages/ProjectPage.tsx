import { convertFileSrc as fileSrc } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { platform } from "../../core/platform";
import { STEP_IDS, type Project, type Scene, type StepId } from "../../core/types";
import { STEP_LABEL, useT } from "../../i18n";
import { estimateProject } from "../../pipeline/cost";
import { firstPendingStep } from "../../pipeline/runner";
import { CAMERA_MOVES } from "../../pipeline/schemas";
import { TTS_PROVIDERS } from "../../providers/registry";
import type { Voice } from "../../providers/types";
import { makeProviderContext } from "../../pipeline/context";
import { getFormat } from "../../templates/formats";
import { Badge, Button, Card, Field, Input, Progress, Select, Textarea } from "../components/ui";
import { currentProject, useStore } from "../store";


function useProjectDir(id: string) {
  const [dir, setDir] = useState("");
  useEffect(() => {
    platform()
      .dataDir()
      .then((d) => setDir(platform().join(d, "projects", id)));
  }, [id]);
  return dir;
}

const statusTone = { idle: "zinc", running: "violet", done: "green", error: "red", skipped: "zinc" } as const;

export function ProjectPage() {
  const t = useT();
  const p = useStore(currentProject);
  const { run, stop, upsert, running, logs, regen, busyScenes, uiLang } = useStore();
  const dir = useProjectDir(p?.id ?? "");
  const [tab, setTab] = useState<StepId>("script");
  const logRef = useRef<HTMLDivElement>(null);
  const plogs = p ? logs[p.id] ?? [] : [];

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [plogs.length]);

  if (!p) return <div className="p-6">Проект не выбран</div>;
  const isRunning = !!running[p.id];
  const est = estimateProject(p);
  const spent = p.costs.reduce((a, c) => a + c.usd, 0);
  const abs = (rel?: string) => (rel && dir ? fileSrc(platform().join(dir, ...rel.split("/"))) + `?v=${p.updatedAt}` : "");
  const edit = (fn: (d: Project) => void) => {
    const d = structuredClone(p);
    fn(d);
    upsert(d);
  };
  const pending = firstPendingStep(p);

  return (
    <div className="grid h-full grid-cols-[260px_1fr_320px] overflow-hidden">
      {/* Steps */}
      <aside className="flex flex-col gap-2 overflow-y-auto border-r border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-1">
          <div className="truncate font-semibold" title={p.title}>
            {p.title}
          </div>
          <div className="text-xs text-zinc-500">
            {getFormat(p.formatId).name[uiLang]} · {p.aspect} · {p.durationSec}s
          </div>
        </div>
        {isRunning ? (
          <Button variant="danger" onClick={() => stop(p.id)}>
            ■ {t("stop")}
          </Button>
        ) : (
          <Button onClick={() => run(p.id)} disabled={!pending}>
            ▶ {!p.settings.autoMode ? t("runStep") : pending && pending !== "ideas" ? t("resume") : t("runAll")}
          </Button>
        )}
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <input type="checkbox" checked={p.settings.autoMode} disabled={isRunning} onChange={(e) => edit((d) => (d.settings.autoMode = e.target.checked))} />
          {t("autoMode")}
        </label>
        {STEP_IDS.map((id) => {
          const st = p.steps[id];
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-lg border p-2 text-left text-sm ${tab === id ? "border-violet-500" : "border-zinc-200 dark:border-zinc-800"}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span>{t(STEP_LABEL[id])}</span>
                <Badge tone={statusTone[st.status]}>{st.status}</Badge>
              </div>
              <Progress value={st.progress} status={st.status} />
              {(st.error || st.message) && <div className={`mt-1 text-xs ${st.error ? "text-red-500" : "text-zinc-500"}`}>{st.error ?? st.message}</div>}
            </button>
          );
        })}
      </aside>

      {/* Editor */}
      <main className="overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t(STEP_LABEL[tab])}</h2>
          <Button variant="outline" disabled={isRunning} onClick={() => run(p.id, { only: tab })}>
            ↻ {p.steps[tab].status === "done" ? t("rerun") : t("runStep")}
          </Button>
        </div>
        {tab === "ideas" && <IdeasView p={p} edit={edit} />}
        {tab === "script" && <ScriptView p={p} edit={edit} disabled={isRunning} />}
        {(tab === "storyboard" || tab === "visuals" || tab === "voice") && (
          <ScenesView p={p} edit={edit} disabled={isRunning} abs={abs} busy={busyScenes} onRegen={(sid, w) => regen(p.id, sid, w)} />
        )}
        {tab === "subtitles" && <SubtitlesView p={p} edit={edit} disabled={isRunning} />}
        {tab === "render" && (
          <div className="flex flex-col items-center gap-3">
            {p.outputPath ? (
              <>
                <video key={abs(p.outputPath)} src={abs(p.outputPath)} poster={abs(p.scenes?.[0]?.imagePath)} controls className={`max-h-[70vh] rounded-xl bg-black ${p.aspect === "16:9" ? "w-full" : ""}`} />
                <div className="flex gap-2">
                  <Button onClick={() => openPath(platform().join(dir, ...p.outputPath!.split("/")))}>▶ Открыть в плеере</Button>
                  <Button variant="outline" onClick={() => revealItemInDir(platform().join(dir, ...p.outputPath!.split("/")))}>
                    📂 {t("openFolder")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-zinc-500">Видео ещё не собрано.</div>
            )}
          </div>
        )}
      </main>

      {/* Costs + logs */}
      <aside className="flex flex-col gap-3 overflow-hidden border-l border-zinc-200 p-3 dark:border-zinc-800">
        <Card className="p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">{t("spent")}</span>
            <span className="font-semibold">${spent.toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">{t("estimate")}</span>
            <span>${est.remaining.toFixed(3)}</span>
          </div>
          <Field label={t("budget")}>
            <Input type="number" step={0.5} value={p.settings.budgetUsd ?? ""} onChange={(e) => edit((d) => (d.settings.budgetUsd = e.target.value ? Number(e.target.value) : undefined))} />
          </Field>
        </Card>
        <div className="text-sm font-medium">{t("logs")}</div>
        <div ref={logRef} className="flex-1 overflow-y-auto rounded-lg bg-zinc-100 p-2 font-mono text-[11px] leading-relaxed dark:bg-black/40 break-words">
          {plogs.map((l, i) => (
            <div key={i} className={l.level === "error" ? "text-red-500" : l.level === "warn" ? "text-amber-500" : l.level === "debug" ? "text-zinc-500" : ""}>
              {l.ts.slice(11, 19)} {l.step ? `[${l.step}] ` : ""}
              {l.message}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function IdeasView({ p, edit }: { p: Project; edit: (fn: (d: Project) => void) => void }) {
  const t = useT();
  if (!p.ideas?.length) return <div className="text-sm text-zinc-500">{p.topic ? `Тема задана вручную: «${p.topic}»` : "Нажмите «Выполнить шаг», чтобы Claude предложил 10 идей."}</div>;
  return (
    <div className="grid gap-2">
      {p.ideas.map((idea, i) => {
        const sel = p.selectedIdea?.title === idea.title;
        return (
          <Card key={i} className={sel ? "border-violet-500" : ""}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{idea.title}</div>
                <div className="mt-1 text-sm">🎣 {idea.hook}</div>
                <div className="mt-1 text-xs text-zinc-500">{idea.angle} — {idea.why}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={idea.viralityScore >= 8 ? "green" : idea.viralityScore >= 6 ? "amber" : "zinc"}>🔥 {idea.viralityScore}/10</Badge>
                <Button variant={sel ? "primary" : "outline"} onClick={() => edit((d) => (d.selectedIdea = idea))}>
                  {sel ? t("selected") : t("choose")}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ScriptView({ p, edit, disabled }: { p: Project; edit: (fn: (d: Project) => void) => void; disabled: boolean }) {
  if (!p.script) return <div className="text-sm text-zinc-500">Сценарий ещё не написан.</div>;
  const words = p.script.fullText.split(/\s+/).filter(Boolean).length;
  return (
    <div className="flex flex-col gap-3">
      <Field label="Название">
        <Input value={p.script.title} disabled={disabled} onChange={(e) => edit((d) => (d.script!.title = d.title = e.target.value))} />
      </Field>
      <Field label={`Текст озвучки · ${words} слов ≈ ${Math.round(words / 2.5)} сек`} hint="Правка сценария делает раскадровку и всё дальнейшее устаревшими — перезапустите «Раскадровку».">
        <Textarea className="min-h-80" value={p.script.fullText} disabled={disabled} onChange={(e) => edit((d) => (d.script!.fullText = e.target.value))} />
      </Field>
      <Field label="Ключевые слова (через запятую)">
        <Input value={p.script.keywords.join(", ")} disabled={disabled} onChange={(e) => edit((d) => (d.script!.keywords = e.target.value.split(",").map((x) => x.trim()).filter(Boolean)))} />
      </Field>
    </div>
  );
}

function ScenesView({
  p,
  edit,
  disabled,
  abs,
  busy,
  onRegen,
}: {
  p: Project;
  edit: (fn: (d: Project) => void) => void;
  disabled: boolean;
  abs: (rel?: string) => string;
  busy: Record<string, boolean>;
  onRegen: (sceneId: string, what: "image" | "voice") => void;
}) {
  const t = useT();
  if (!p.scenes?.length) return <div className="text-sm text-zinc-500">Раскадровки пока нет.</div>;
  const set = (i: number, patch: Partial<Scene>) => edit((d) => Object.assign(d.scenes![i], patch));
  const vertical = p.aspect === "9:16" || p.aspect === "4:5";
  return (
    <div className="flex flex-col gap-3">
      <VoicePicker p={p} edit={edit} disabled={disabled} />
      {p.scenes.map((s, i) => (
        <Card key={s.id} className="grid grid-cols-[auto_1fr] gap-3">
          <div className={`${vertical ? "w-28" : "w-48"} flex flex-col gap-1`}>
            <div className={`${vertical ? "aspect-[9/16]" : "aspect-video"} overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800`}>
              {s.imagePath && <img src={abs(s.imagePath)} className="h-full w-full object-cover" />}
            </div>
            <Button variant="outline" className="justify-center text-xs" disabled={disabled || busy[s.id]} onClick={() => onRegen(s.id, "image")}>
              {busy[s.id] ? "…" : "🖼"} {t("regenerate")}
            </Button>
            {s.audioPath && <audio src={abs(s.audioPath)} controls className="h-7 w-full" />}
            <Button variant="ghost" className="justify-center text-xs" disabled={disabled || busy[s.id]} onClick={() => onRegen(s.id, "voice")}>
              🎙 {t("regenerate")}
            </Button>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Badge>#{i + 1}</Badge> {s.audioDuration ? `${s.audioDuration.toFixed(1)}s` : `~${s.durationSec}s`} · {s.emotion}
            </div>
            <Field label={t("narration")}>
              <Textarea className="min-h-14" value={s.narration} disabled={disabled} onChange={(e) => set(i, { narration: e.target.value })} />
            </Field>
            <Field label={t("imagePrompt")}>
              <Textarea className="min-h-14 text-xs" value={s.imagePrompt} disabled={disabled} onChange={(e) => set(i, { imagePrompt: e.target.value })} />
            </Field>
            <Field label={t("camera")}>
              <Select value={s.camera} disabled={disabled} onChange={(e) => set(i, { camera: e.target.value as Scene["camera"] })}>
                {CAMERA_MOVES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      ))}
    </div>
  );
}

function VoicePicker({ p, edit, disabled }: { p: Project; edit: (fn: (d: Project) => void) => void; disabled: boolean }) {
  const t = useT();
  const [voices, setVoices] = useState<Voice[]>([]);
  const prov = TTS_PROVIDERS.find((x) => x.id === p.settings.ttsProvider);
  useEffect(() => {
    if (!prov) return;
    prov
      .listVoices(makeProviderContext(new AbortController().signal, () => {}))
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [prov?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="grid grid-cols-3 gap-3">
      <Field label={t("ttsProvider")}>
        <Select value={p.settings.ttsProvider} disabled={disabled} onChange={(e) => edit((d) => ((d.settings.ttsProvider = e.target.value), (d.settings.voiceId = "")))}>
          {TTS_PROVIDERS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("voice")}>
        <Select value={p.settings.voiceId} disabled={disabled} onChange={(e) => edit((d) => (d.settings.voiceId = e.target.value))}>
          <option value="">— по умолчанию —</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.language ? ` (${v.language})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`${t("speed")}: ${p.settings.ttsSpeed.toFixed(2)}`}>
        <input type="range" min={0.8} max={1.2} step={0.05} value={p.settings.ttsSpeed} disabled={disabled} onChange={(e) => edit((d) => (d.settings.ttsSpeed = Number(e.target.value)))} />
      </Field>
    </Card>
  );
}

function SubtitlesView({ p, edit, disabled }: { p: Project; edit: (fn: (d: Project) => void) => void; disabled: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <Field label={t("subtitleStyle")} hint="После смены стиля перезапустите шаг «Субтитры» и «Рендер».">
        <Select value={p.settings.subtitleStyle} disabled={disabled} onChange={(e) => edit((d) => (d.settings.subtitleStyle = e.target.value as Project["settings"]["subtitleStyle"]))}>
          <option value="tiktok_karaoke">TikTok-караоке (слово за словом)</option>
          <option value="keyword_highlight">Выделение ключевых слов</option>
          <option value="classic">Классические</option>
        </Select>
      </Field>
      <div className="text-sm text-zinc-500">
        Тайминг слов: ElevenLabs (выравнивание) → Whisper (OpenAI) → оценка по тексту. SRT для CapCut/Premiere сохраняется рядом: <code>subs/subs.srt</code>.
      </div>
    </div>
  );
}
