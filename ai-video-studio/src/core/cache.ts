// Content-addressed asset cache: identical (provider, model, prompt, params)
// requests are never paid for twice. Files live in <dataDir>/cache/<hash>.<ext>.

import { platform } from "./platform";
import { sha256, stableJson } from "./util";

export async function cacheKey(parts: Record<string, unknown>): Promise<string> {
  return sha256(stableJson(parts));
}

async function cacheDir() {
  const p = platform();
  const dir = p.join(await p.dataDir(), "cache");
  await p.mkdir(dir);
  return dir;
}

export async function cacheGet(key: string, ext: string): Promise<string | null> {
  const p = platform();
  const file = p.join(await cacheDir(), `${key}.${ext}`);
  return (await p.exists(file)) ? file : null;
}

export async function cachePut(key: string, ext: string, data: Uint8Array): Promise<string> {
  const p = platform();
  const file = p.join(await cacheDir(), `${key}.${ext}`);
  await p.writeFile(file, data);
  return file;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const file = await cacheGet(key, "json");
  if (!file) return null;
  try {
    return JSON.parse(await platform().readText(file)) as T;
  } catch {
    return null;
  }
}

export async function cachePutJson(key: string, value: unknown) {
  return cachePut(key, "json", new TextEncoder().encode(JSON.stringify(value)));
}
