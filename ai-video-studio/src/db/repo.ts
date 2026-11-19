// SQLite persistence. Schema is created from here (CREATE IF NOT EXISTS) so the
// desktop app (tauri-plugin-sql) and the CLI (node:sqlite) share one definition.

import { platform, type Db } from "../core/platform";
import type { LogEntry, Project } from "../core/types";
import type { FormatPreset } from "../templates/formats";
import type { PromptId } from "../templates/prompts";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS projects (
     id TEXT PRIMARY KEY, title TEXT, format_id TEXT, aspect TEXT, status TEXT,
     data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS logs (
     id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, ts TEXT, level TEXT, step TEXT, message TEXT)`,
  `CREATE INDEX IF NOT EXISTS logs_project ON logs(project_id, id)`,
  `CREATE TABLE IF NOT EXISTS queue (
     id TEXT PRIMARY KEY, project_id TEXT, status TEXT, position INTEGER, error TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, text TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

let ready: Promise<Db> | null = null;

export function db(): Promise<Db> {
  if (!ready)
    ready = (async () => {
      const d = await platform().db();
      for (const sql of SCHEMA) await d.execute(sql);
      return d;
    })();
  return ready;
}

export function projectStatus(p: Project): string {
  if (p.steps.render.status === "done") return "done";
  if (Object.values(p.steps).some((s) => s.status === "error")) return "error";
  if (Object.values(p.steps).some((s) => s.status === "running")) return "running";
  return "draft";
}

export async function saveProject(p: Project) {
  const d = await db();
  await d.execute(
    `INSERT INTO projects (id, title, format_id, aspect, status, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, format_id=excluded.format_id, aspect=excluded.aspect,
       status=excluded.status, data=excluded.data, updated_at=excluded.updated_at`,
    [p.id, p.title, p.formatId, p.aspect, projectStatus(p), JSON.stringify(p), p.createdAt, p.updatedAt],
  );
}

export async function getProject(id: string): Promise<Project | null> {
  const rows = await (await db()).select<{ data: string }>(`SELECT data FROM projects WHERE id = ?`, [id]);
  return rows[0] ? (JSON.parse(rows[0].data) as Project) : null;
}

export async function listProjects(): Promise<Project[]> {
  const rows = await (await db()).select<{ data: string }>(`SELECT data FROM projects ORDER BY updated_at DESC`);
  return rows.map((r) => JSON.parse(r.data) as Project);
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.execute(`DELETE FROM projects WHERE id = ?`, [id]);
  await d.execute(`DELETE FROM logs WHERE project_id = ?`, [id]);
}

export async function appendLog(projectId: string, e: LogEntry) {
  await (await db()).execute(`INSERT INTO logs (project_id, ts, level, step, message) VALUES (?, ?, ?, ?, ?)`, [
    projectId,
    e.ts,
    e.level,
    e.step ?? null,
    e.message,
  ]);
}

export async function getLogs(projectId: string, limit = 500): Promise<LogEntry[]> {
  const rows = await (await db()).select<LogEntry>(
    `SELECT ts, level, step, message FROM logs WHERE project_id = ? ORDER BY id DESC LIMIT ?`,
    [projectId, limit],
  );
  return rows.reverse();
}

export async function getPromptOverrides(): Promise<Partial<Record<PromptId, string>>> {
  const rows = await (await db()).select<{ id: PromptId; text: string }>(`SELECT id, text FROM prompts`);
  return Object.fromEntries(rows.map((r) => [r.id, r.text]));
}

export async function setPromptOverride(id: PromptId, text: string | null) {
  const d = await db();
  if (text === null) await d.execute(`DELETE FROM prompts WHERE id = ?`, [id]);
  else await d.execute(`INSERT INTO prompts (id, text) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET text=excluded.text`, [id, text]);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await (await db()).select<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [key]);
  return rows[0] ? (JSON.parse(rows[0].value) as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await (await db()).execute(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, JSON.stringify(value)],
  );
}

export async function listCustomFormats(): Promise<FormatPreset[]> {
  const rows = await (await db()).select<{ data: string }>(`SELECT data FROM templates`);
  return rows.map((r) => JSON.parse(r.data) as FormatPreset);
}

export async function saveCustomFormat(f: FormatPreset) {
  await (await db()).execute(
    `INSERT INTO templates (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    [f.id, JSON.stringify({ ...f, builtIn: false })],
  );
}
