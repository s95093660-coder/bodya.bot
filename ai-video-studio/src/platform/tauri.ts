// Tauri implementation of Platform (desktop app).

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appDataDir, sep } from "@tauri-apps/api/path";
import * as fs from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import Database from "@tauri-apps/plugin-sql";
import type { Db, Platform } from "../core/platform";
import { uid } from "../core/util";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriPlatform(): Platform {
  let dataDirCache: string | null = null;
  let dbInstance: Promise<Db> | null = null;
  const S = sep();

  return {
    kind: "tauri",
    getSecret: (name) => invoke<string | null>("secret_get", { name }),
    setSecret: (name, value) => invoke("secret_set", { name, value }),
    deleteSecret: (name) => invoke("secret_delete", { name }),
    fetch: tauriFetch as typeof fetch,
    async dataDir() {
      if (!dataDirCache) {
        dataDirCache = (await appDataDir()).replace(/[\\/]+$/, "");
        await fs.mkdir(dataDirCache, { recursive: true });
      }
      return dataDirCache;
    },
    join: (...parts) => parts.map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, ""))).join(S),
    mkdir: (p) => fs.mkdir(p, { recursive: true }),
    exists: (p) => fs.exists(p),
    writeFile: (p, d) => fs.writeFile(p, d),
    writeText: (p, t) => fs.writeTextFile(p, t),
    readFile: (p) => fs.readFile(p),
    readText: (p) => fs.readTextFile(p),
    copyFile: (a, b) => fs.copyFile(a, b),
    remove: (p) => fs.remove(p, { recursive: true }),
    async runFFmpeg(args, opts = {}) {
      const jobId = uid("ff_");
      const unlisten = await listen<{ job_id: string; seconds: number }>("ffmpeg://progress", (e) => {
        if (e.payload.job_id === jobId && opts.durationSec && opts.onProgress)
          opts.onProgress(Math.min(1, e.payload.seconds / opts.durationSec));
      });
      const onAbort = () => void invoke("ffmpeg_cancel", { jobId });
      opts.signal?.addEventListener("abort", onAbort);
      try {
        await invoke("ffmpeg_run", { jobId, args, cwd: opts.cwd ?? null });
      } finally {
        unlisten();
        opts.signal?.removeEventListener("abort", onAbort);
      }
    },
    probeDuration: (path) => invoke<number>("ffprobe_duration", { path }),
    db() {
      if (!dbInstance)
        dbInstance = Database.load("sqlite:studio.db").then((d) => ({
          execute: async (sql: string, params: unknown[] = []) => void (await d.execute(sql, params)),
          select: <T,>(sql: string, params: unknown[] = []) => d.select<T[]>(sql, params),
        }));
      return dbInstance;
    },
  };
}
