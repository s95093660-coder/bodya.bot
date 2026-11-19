import { create } from "zustand";
import { humanError } from "../core/errors";
import type { LogEntry, Project, StepId } from "../core/types";
import { nowIso } from "../core/util";
import { deleteProject, getLogs, listProjects, saveProject, setSetting } from "../db/repo";
import { regenerateScene, runPipeline, type RunOptions } from "../pipeline/runner";

export type Page = "projects" | "new" | "project" | "templates" | "settings";

interface State {
  page: Page;
  uiLang: "ru" | "en";
  theme: "dark" | "light";
  projects: Project[];
  currentId: string | null;
  logs: Record<string, LogEntry[]>;
  running: Record<string, AbortController>;
  toast: string | null;
  go(page: Page, projectId?: string): void;
  setUiLang(l: "ru" | "en"): void;
  setTheme(t: "dark" | "light"): void;
  load(): Promise<void>;
  upsert(p: Project, persist?: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  run(id: string, opts?: Omit<RunOptions, "signal">): Promise<void>;
  stop(id: string): void;
  regen(id: string, sceneId: string, what: "image" | "voice"): Promise<void>;
  busyScenes: Record<string, boolean>;
  notify(msg: string | null): void;
}

export const useStore = create<State>((set, get) => ({
  page: "projects",
  uiLang: "ru",
  theme: "dark",
  projects: [],
  currentId: null,
  logs: {},
  running: {},
  toast: null,
  busyScenes: {},

  go(page, projectId) {
    set({ page, currentId: projectId ?? get().currentId });
    if (projectId && !get().logs[projectId])
      getLogs(projectId).then((l) => set((s) => ({ logs: { ...s.logs, [projectId]: l } })));
  },
  setUiLang(l) {
    set({ uiLang: l });
    setSetting("uiLang", l).catch(() => {});
  },
  setTheme(t) {
    set({ theme: t });
    document.documentElement.classList.toggle("dark", t === "dark");
    setSetting("theme", t).catch(() => {});
  },
  async load() {
    set({ projects: await listProjects() });
  },
  async upsert(p, persist = true) {
    const copy = structuredClone(p);
    set((s) => {
      const i = s.projects.findIndex((x) => x.id === p.id);
      const list = [...s.projects];
      if (i >= 0) list[i] = copy;
      else list.unshift(copy);
      return { projects: list };
    });
    if (persist) {
      p.updatedAt = nowIso();
      await saveProject(p);
    }
  },
  async remove(id) {
    get().running[id]?.abort();
    await deleteProject(id);
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id), currentId: s.currentId === id ? null : s.currentId }));
  },
  async run(id, opts = {}) {
    if (get().running[id]) return;
    const original = get().projects.find((p) => p.id === id);
    if (!original) return;
    const project = structuredClone(original);
    const ac = new AbortController();
    set((s) => ({ running: { ...s.running, [id]: ac } }));
    let lastPush = 0;
    try {
      await runPipeline(project, { ...opts, signal: ac.signal }, {
        onUpdate: (p) => {
          const now = performance.now();
          if (now - lastPush > 120) {
            lastPush = now;
            get().upsert(p, false);
          }
        },
        onLog: (e) => set((s) => ({ logs: { ...s.logs, [id]: [...(s.logs[id] ?? []), e].slice(-1000) } })),
      });
    } catch (e) {
      if (!ac.signal.aborted) get().notify(humanError(e));
    } finally {
      await get().upsert(project, false);
      set((s) => {
        const r = { ...s.running };
        delete r[id];
        return { running: r };
      });
    }
  },
  async regen(id, sceneId, what) {
    const original = get().projects.find((p) => p.id === id);
    if (!original || get().running[id]) return;
    const project = structuredClone(original);
    set((s) => ({ busyScenes: { ...s.busyScenes, [sceneId]: true } }));
    try {
      await regenerateScene(project, sceneId, what, {
        onLog: (e) => set((s) => ({ logs: { ...s.logs, [id]: [...(s.logs[id] ?? []), e].slice(-1000) } })),
      });
      await get().upsert(project, false);
    } catch (e) {
      get().notify(humanError(e));
    } finally {
      set((s) => ({ busyScenes: { ...s.busyScenes, [sceneId]: false } }));
    }
  },
  stop(id) {
    get().running[id]?.abort();
  },
  notify(msg) {
    set({ toast: msg });
    if (msg) setTimeout(() => get().toast === msg && set({ toast: null }), 8000);
  },
}));

export const currentProject = (s: State) => s.projects.find((p) => p.id === s.currentId) ?? null;
export const isStepRunning = (p: Project, id: StepId) => p.steps[id].status === "running";
