// Claude is the "brain": ideas, script, storyboard, metadata, analysis.
// All calls return schema-validated JSON via structured outputs.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ProviderError } from "../../core/errors";

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  prompt: string;
  schema: S;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LlmResult<T> {
  data: T;
  usd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmClient {
  structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<LlmResult<z.infer<S>>>;
}

/** USD per 1M tokens [input, output]. */
export const CLAUDE_PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

export const CLAUDE_MODELS = Object.keys(CLAUDE_PRICES);

export function claudeCost(model: string, input: number, output: number) {
  if (model === "mock") return 0;
  const [i, o] = CLAUDE_PRICES[model] ?? CLAUDE_PRICES["claude-opus-5-5"];
  return (input * i + output * o) / 1_000_000;
}

export function createClaude(apiKey: string, fetchImpl: typeof fetch): LlmClient {
  const client = new Anthropic({
    apiKey,
    fetch: fetchImpl,
    // The key comes from the OS keychain at call time and requests go through the
    // Tauri HTTP plugin (Rust side), so this flag only silences the browser check.
    dangerouslyAllowBrowser: true,
    maxRetries: 3,
  });

  return {
    async structured(req) {
      try {
        const msg = await client.beta.messages.parse(
          {
            model: req.model,
            max_tokens: req.maxTokens ?? 16000,
            system: req.system,
            messages: [{ role: "user", content: req.prompt }],
            output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
            // On a safety refusal the API transparently retries on a fallback model.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal: req.signal },
        );
        if (msg.stop_reason === "refusal")
          throw new ProviderError("refusal", "Claude", "Claude отказался выполнять запрос — измените тему или формулировку.");
        if (msg.stop_reason === "max_tokens")
          throw new ProviderError("bad_request", "Claude", "Ответ Claude обрезан по max_tokens — уменьшите длительность или разбейте сценарий.");
        if (msg.parsed_output == null) throw new ProviderError("server", "Claude", "Claude вернул ответ, не соответствующий схеме");
        const inp = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
        return {
          data: msg.parsed_output,
          inputTokens: inp,
          outputTokens: msg.usage.output_tokens,
          usd: claudeCost(req.model, inp, msg.usage.output_tokens),
        };
      } catch (e) {
        throw mapAnthropicError(e);
      }
    },
  };
}

function mapAnthropicError(e: unknown): unknown {
  if (e instanceof ProviderError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new ProviderError("auth", "Claude", "Claude: неверный API-ключ Anthropic или нет доступа к модели.");
  if (e instanceof Anthropic.RateLimitError) return new ProviderError("rate_limit", "Claude", "Claude: превышен лимит запросов, повторите позже.");
  if (e instanceof Anthropic.BadRequestError) return new ProviderError("bad_request", "Claude", `Claude: ${e.message}`);
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError("cancelled", "Claude", "Отменено");
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError("network", "Claude", "Claude: нет соединения с api.anthropic.com");
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return new ProviderError("server", "Claude", `Claude: ошибка сервера ${e.status}`);
  return e;
}
