// Unified error model: every provider maps its failures to ProviderError so the
// UI can show a clear message and the runner knows whether to retry.

export type ErrorKind =
  | "auth" // missing/invalid key — do not retry
  | "rate_limit" // retry with backoff
  | "network" // retry
  | "server" // 5xx — retry
  | "bad_request" // our input is wrong — do not retry
  | "refusal" // model/provider refused content
  | "budget" // budget limit hit
  | "cancelled"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    public readonly provider: string,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get retryable() {
    return this.kind === "rate_limit" || this.kind === "network" || this.kind === "server";
  }
}

export function fromHttpStatus(provider: string, status: number, body: string, retryAfter?: string | null) {
  const snippet = body.slice(0, 400);
  if (status === 401 || status === 403)
    return new ProviderError("auth", provider, `${provider}: ключ недействителен или нет доступа (HTTP ${status}). ${snippet}`);
  if (status === 429)
    return new ProviderError(
      "rate_limit",
      provider,
      `${provider}: превышен лимит запросов (429)`,
      retryAfter ? Number(retryAfter) * 1000 : undefined,
    );
  if (status >= 500) return new ProviderError("server", provider, `${provider}: ошибка сервера ${status}. ${snippet}`);
  return new ProviderError("bad_request", provider, `${provider}: ошибка запроса ${status}. ${snippet}`);
}

export function humanError(e: unknown): string {
  if (e instanceof ProviderError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; baseMs?: number; onRetry?: (e: unknown, attempt: number, delayMs: number) => void; signal?: AbortSignal } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 1500;
  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw new ProviderError("cancelled", "runner", "Отменено пользователем");
    try {
      return await fn(attempt);
    } catch (e) {
      const retryable =
        e instanceof ProviderError ? e.retryable : e instanceof TypeError /* fetch network error */;
      if (!retryable || attempt >= retries) throw e;
      const hinted = e instanceof ProviderError ? e.retryAfterMs : undefined;
      const delay = hinted ?? Math.min(base * 2 ** attempt + Math.random() * 500, 60_000);
      opts.onRetry?.(e, attempt + 1, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
