import { fromHttpStatus, ProviderError } from "../core/errors";
import type { ProviderContext } from "./types";

async function doFetch(ctx: ProviderContext, provider: string, url: string, init: RequestInit) {
  let res: Response;
  try {
    res = await ctx.fetch(url, { ...init, signal: ctx.signal });
  } catch (e) {
    if (ctx.signal?.aborted) throw new ProviderError("cancelled", provider, "Отменено");
    throw new ProviderError("network", provider, `${provider}: сетевая ошибка — ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw fromHttpStatus(provider, res.status, body, res.headers.get("retry-after"));
  }
  return res;
}

export async function httpJson<T>(ctx: ProviderContext, provider: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await doFetch(ctx, provider, url, init);
  return (await res.json()) as T;
}

export async function httpBytes(ctx: ProviderContext, provider: string, url: string, init: RequestInit = {}): Promise<Uint8Array> {
  const res = await doFetch(ctx, provider, url, init);
  return new Uint8Array(await res.arrayBuffer());
}

export function jsonInit(body: unknown, headers: Record<string, string>): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) };
}
