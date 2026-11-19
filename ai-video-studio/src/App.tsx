import { useEffect } from "react";
import { getSetting } from "./db/repo";
import { useT } from "./i18n";
import { Button } from "./ui/components/ui";
import { NewProjectPage } from "./ui/pages/NewProject";
import { ProjectPage } from "./ui/pages/ProjectPage";
import { ProjectsPage } from "./ui/pages/ProjectsPage";
import { SettingsPage } from "./ui/pages/SettingsPage";
import { TemplatesPage } from "./ui/pages/TemplatesPage";
import { useStore, type Page } from "./ui/store";

export function App() {
  const t = useT();
  const { page, go, load, toast, notify, currentId, running, setTheme, setUiLang } = useStore();

  useEffect(() => {
    load().catch((e) => notify(`База данных: ${e}`));
    getSetting<"ru" | "en">("uiLang", "ru").then(setUiLang).catch(() => {});
    getSetting<"dark" | "light">("theme", "dark").then(setTheme).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "n") (e.preventDefault(), go("new"));
      else if (e.key === ",") (e.preventDefault(), go("settings"));
      else if (e.key === "Enter" && page === "project" && currentId && !running[currentId]) (e.preventDefault(), useStore.getState().run(currentId));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, currentId, running, go]);

  const nav: [Page, string, string][] = [
    ["projects", "🎞", t("projects")],
    ["new", "＋", t("newVideo")],
    ["templates", "🧩", t("templates")],
    ["settings", "⚙", t("settings")],
  ];

  return (
    <div className="flex h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-4 px-2 text-lg font-bold">
          <span className="text-violet-500">▶</span> {t("appName")}
        </div>
        {nav.map(([id, icon, label]) => (
          <Button key={id} variant={page === id ? "primary" : "ghost"} className="justify-start" onClick={() => go(id)}>
            <span className="w-5">{icon}</span> {label}
          </Button>
        ))}
        {Object.keys(running).length > 0 && (
          <div className="mt-auto rounded-lg bg-violet-500/10 p-2 text-xs text-violet-500">⏳ {Object.keys(running).length} в работе</div>
        )}
      </nav>
      <div className="relative flex-1 overflow-y-auto">
        {page === "projects" && <ProjectsPage />}
        {page === "new" && <NewProjectPage />}
        {page === "project" && <ProjectPage />}
        {page === "templates" && <TemplatesPage />}
        {page === "settings" && <SettingsPage />}
        {toast && (
          <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-xl" onClick={() => notify(null)}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
