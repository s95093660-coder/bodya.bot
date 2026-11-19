import { STEP_IDS } from "../../core/types";
import { useT } from "../../i18n";
import { projectStatus } from "../../db/repo";
import { getFormat } from "../../templates/formats";
import { Badge, Button, Card, Progress } from "../components/ui";
import { useStore } from "../store";

export function ProjectsPage() {
  const t = useT();
  const { projects, go, remove, uiLang } = useStore();
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("projects")}</h1>
        <Button onClick={() => go("new")}>＋ {t("newVideo")}</Button>
      </div>
      {projects.length === 0 && <Card className="py-16 text-center text-zinc-500">{t("noProjects")}</Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const done = STEP_IDS.filter((s) => ["done", "skipped"].includes(p.steps[s].status)).length;
          const status = projectStatus(p);
          return (
            <Card key={p.id} className="flex cursor-pointer flex-col gap-2 hover:border-violet-500">
              <div onClick={() => go("project", p.id)} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{p.title}</div>
                  <Badge tone={status === "done" ? "green" : status === "error" ? "red" : status === "running" ? "violet" : "zinc"}>{status}</Badge>
                </div>
                <div className="text-xs text-zinc-500">
                  {getFormat(p.formatId).name[uiLang]} · {p.aspect} · {p.durationSec}s · {new Date(p.updatedAt).toLocaleString()}
                </div>
                <Progress value={done / STEP_IDS.length} status={status === "done" ? "done" : undefined} />
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" className="text-xs text-red-500" onClick={() => confirm("Удалить проект?") && remove(p.id)}>
                  {t("delete")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
