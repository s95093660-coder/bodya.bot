// Platform abstraction. The pipeline never touches Tauri or Node APIs directly,
// so the same code runs inside the desktop app and in the headless CLI / tests.

export interface Db {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface FFmpegRunOptions {
  cwd?: string;
  /** Total expected output duration in seconds — used to compute progress. */
  durationSec?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface Platform {
  readonly kind: "tauri" | "node";
  /** Secrets live in the OS keychain (Credential Manager / Keychain / Secret Service). */
  getSecret(name: string): Promise<string | null>;
  setSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;

  /** fetch without browser CORS restrictions (Rust-side in Tauri). */
  fetch: typeof fetch;

  dataDir(): Promise<string>;
  join(...parts: string[]): string;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  writeText(path: string, text: string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  copyFile(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;

  runFFmpeg(args: string[], opts?: FFmpegRunOptions): Promise<void>;
  probeDuration(path: string): Promise<number>;

  db(): Promise<Db>;
}

let current: Platform | null = null;

export function setPlatform(p: Platform) {
  current = p;
}

export function platform(): Platform {
  if (!current) throw new Error("Platform is not initialised");
  return current;
}
