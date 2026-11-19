// Node implementation of Platform — used by the headless CLI and tests.
// Secrets come from environment variables (<ID>_API_KEY), not the keychain.
// NOTE: never import this file from UI code.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Db, FFmpegRunOptions, Platform } from "../core/platform";

const envName = (id: string) => `${id.toUpperCase()}_API_KEY`;

export function parseFfmpegProgress(line: string): number | null {
  const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
  return m ? Number(m[1]) / 1_000_000 : null;
}

export function createNodePlatform(dataDir: string, bins = { ffmpeg: process.env.FFMPEG_PATH || "ffmpeg", ffprobe: process.env.FFPROBE_PATH || "ffprobe" }): Platform {
  const memSecrets = new Map<string, string>();
  let dbInstance: Db | null = null;

  const run = (bin: string, args: string[], opts: FFmpegRunOptions = {}) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const onAbort = () => child.kill("SIGKILL");
      opts.signal?.addEventListener("abort", onAbort);
      child.stdout.on("data", (d: Buffer) => {
        const s = d.toString();
        out += s;
        if (opts.onProgress && opts.durationSec)
          for (const l of s.split("\n")) {
            const t = parseFfmpegProgress(l);
            if (t !== null) opts.onProgress(Math.min(1, t / opts.durationSec));
          }
      });
      child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-8000)));
      child.on("error", reject);
      child.on("close", (code) => {
        opts.signal?.removeEventListener("abort", onAbort);
        if (code === 0) resolve(out);
        else reject(new Error(`${path.basename(bin)} завершился с кодом ${code}:\n${err.slice(-2000)}`));
      });
    });

  return {
    kind: "node",
    async getSecret(name) {
      return memSecrets.get(name) ?? process.env[envName(name)] ?? null;
    },
    async setSecret(name, value) {
      memSecrets.set(name, value);
    },
    async deleteSecret(name) {
      memSecrets.delete(name);
    },
    fetch: globalThis.fetch.bind(globalThis),
    async dataDir() {
      await fs.mkdir(dataDir, { recursive: true });
      return dataDir;
    },
    join: (...p) => path.join(...p),
    mkdir: async (p) => void (await fs.mkdir(p, { recursive: true })),
    exists: async (p) => existsSync(p),
    writeFile: (p, d) => fs.writeFile(p, d),
    writeText: (p, t) => fs.writeFile(p, t, "utf8"),
    readFile: async (p) => new Uint8Array(await fs.readFile(p)),
    readText: (p) => fs.readFile(p, "utf8"),
    copyFile: (a, b) => fs.copyFile(a, b),
    remove: (p) => fs.rm(p, { recursive: true, force: true }),
    async runFFmpeg(args, opts = {}) {
      const progressArgs = opts.onProgress ? ["-progress", "pipe:1", "-nostats"] : [];
      await run(bins.ffmpeg, [...progressArgs, ...args], opts);
    },
    async probeDuration(p) {
      const out = await run(bins.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p]);
      return Number(out.trim());
    },
    async db() {
      if (dbInstance) return dbInstance;
      const { DatabaseSync } = await import("node:sqlite");
      await fs.mkdir(dataDir, { recursive: true });
      const sqlite = new DatabaseSync(path.join(dataDir, "studio.db"));
      type P = null | number | bigint | string;
      dbInstance = {
        async execute(sql, params = []) {
          sqlite.prepare(sql).run(...(params as P[]));
        },
        async select<T>(sql: string, params: unknown[] = []) {
          return sqlite.prepare(sql).all(...(params as P[])) as T[];
        },
      };
      return dbInstance;
    },
  };
}
