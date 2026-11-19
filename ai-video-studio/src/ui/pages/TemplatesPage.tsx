import { useEffect, useState } from "react";
import type { Aspect, SubtitleStyleId } from "../../core/types";
import { uid } from "../../core/util";
import { useT } from "../../i18n";
import { listCustomFormats, saveCustomFormat } from "../../db/repo";
import { FORMATS, type FormatPreset } from "../../templates/formats";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "../components/ui";
import { useStore } from "../store";

const blank = (): FormatPreset => ({
  id: uid("custom_"),
  name: { ru: "Мой формат", en: "My format" },
  description: { ru: "", en: "" },
  hints: "",
  visualStyle: "",
  defaultAspect: "9:16",
  defaultDuration: 60,
  subtitleStyle: "tiktok_karaoke",
  layout: "full",
  defaultNiche: "",
  builtIn: false,
  mvpReady: true,
});

export function TemplatesPage() {
  const t = useT();
  const uiLang = useStore((s) => s.uiLang);
  const [custom, setCustom] = useState<FormatPreset[]>([]);
  const [edit, setEdit] = useState<FormatPreset | null>(null);
  const reload = () => listCustomFormats().then(setCustom);
  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("templates")}</h1>
        <Button onClick={() => setEdit(blank())}>＋ Свой формат</Button>
      </div>
      {edit && (
        <Card className="grid gap-3 md:grid-cols-2">
          <Field label="Название">
            <Input value={edit.name.ru} onChange={(e) => setEdit({ ...edit, name: { ru: e.target.value, en: e.target.value } })} />
          </Field>
          <Field label="Ниша по умолчанию">
            <Input value={edit.defaultNiche} onChange={(e) => setEdit({ ...edit, defaultNiche: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Подсказки для Claude (стиль повествования, структура)">
              <Textarea value={edit.hints} onChange={(e) => setEdit({ ...edit, hints: e.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Визуальный стиль (добавляется к каждому промпту картинки)">
              <Input value={edit.visualStyle} onChange={(e) => setEdit({ ...edit, visualStyle: e.target.value })} />
            </Field>
          </div>
          <Field label="Соотношение">
            <Select value={edit.defaultAspect} onChange={(e) => setEdit({ ...edit, defaultAspect: e.target.value as Aspect })}>
              {["9:16", "16:9", "1:1", "4:5"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="Субтитры">
            <Select value={edit.subtitleStyle} onChange={(e) => setEdit({ ...edit, subtitleStyle: e.target.value as SubtitleStyleId })}>
              <option value="tiktok_karaoke">TikTok-караоке</option>
              <option value="keyword_highlight">Ключевые слова</option>
              <option value="classic">Классические</option>
            </Select>
          </Field>
          <div className="flex gap-2 md:col-span-2">
            <Button onClick={() => saveCustomFormat(edit).then(() => (setEdit(null), reload()))}>{t("save")}</Button>
            <Button variant="outline" onClick={() => setEdit(null)}>
              {t("cancel")}
            </Button>
          </div>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {[...FORMATS, ...custom].map((f) => (
          <Card key={f.id}>
            <div className="flex items-center justify-between">
              <div className="font-medium">{f.name[uiLang]}</div>
              <div className="flex gap-1">
                {!f.builtIn && <Badge tone="violet">custom</Badge>}
                {!f.mvpReady && <Badge tone="amber">{t("comingSoon")}</Badge>}
                <Badge>{f.defaultAspect}</Badge>
              </div>
            </div>
            <div className="mt-1 text-xs text-zinc-500">{f.hints}</div>
            {f.visualStyle && <div className="mt-1 text-xs italic text-zinc-400">🎨 {f.visualStyle}</div>}
            {!f.builtIn && (
              <Button variant="ghost" className="mt-2 text-xs" onClick={() => setEdit(f)}>
                ✎
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
