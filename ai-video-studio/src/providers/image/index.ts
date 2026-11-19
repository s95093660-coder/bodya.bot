import { ProviderError } from "../../core/errors";
import { base64ToBytes, sleep } from "../../core/util";
import { httpBytes, httpJson, jsonInit } from "../http";
import type { ImageProvider } from "../types";

// ---------- OpenAI Images (gpt-image-1) ----------
export const openaiImages: ImageProvider = {
  id: "openai",
  label: "OpenAI Images",
  secret: "openai",
  models: ["gpt-image-1", "gpt-image-1-mini"],
  estimateUsd: ({ model }) => (model === "gpt-image-1-mini" ? 0.015 : 0.063),
  async generate(req, ctx) {
    const key = await ctx.key("openai");
    const size = req.width > req.height ? "1536x1024" : req.width < req.height ? "1024x1536" : "1024x1024";
    const out = await httpJson<{ data: { b64_json?: string; url?: string }[] }>(
      ctx,
      "OpenAI Images",
      "https://api.openai.com/v1/images/generations",
      jsonInit({ model: req.model || "gpt-image-1", prompt: req.prompt, size, n: 1, quality: "medium" }, { authorization: `Bearer ${key}` }),
    );
    const d = out.data?.[0];
    if (d?.b64_json) return { data: base64ToBytes(d.b64_json), ext: "png" };
    if (d?.url) return { data: await httpBytes(ctx, "OpenAI Images", d.url), ext: "png" };
    throw new ProviderError("unknown", "OpenAI Images", "Пустой ответ от OpenAI Images");
  },
};

// ---------- Flux via Black Forest Labs API ----------
export const fluxBfl: ImageProvider = {
  id: "flux",
  label: "Flux (BFL)",
  secret: "bfl",
  models: ["flux-pro-1.1", "flux-dev"],
  estimateUsd: ({ model }) => (model === "flux-dev" ? 0.025 : 0.04),
  async generate(req, ctx) {
    const key = await ctx.key("bfl");
    const model = req.model || "flux-pro-1.1";
    // BFL wants multiples of 32, max 1440.
    const fit = (v: number) => Math.min(1440, Math.round(v / 32) * 32);
    const scale = 1440 / Math.max(req.width, req.height);
    const task = await httpJson<{ id: string; polling_url?: string }>(
      ctx,
      "Flux",
      `https://api.bfl.ai/v1/${model}`,
      jsonInit(
        { prompt: req.prompt, width: fit(req.width * scale), height: fit(req.height * scale), seed: req.seed, output_format: "png" },
        { "x-key": key },
      ),
    );
    const poll = task.polling_url || `https://api.bfl.ai/v1/get_result?id=${task.id}`;
    for (let i = 0; i < 180; i++) {
      await sleep(1500);
      const r = await httpJson<{ status: string; result?: { sample: string } }>(ctx, "Flux", poll, { headers: { "x-key": key } });
      if (r.status === "Ready" && r.result) return { data: await httpBytes(ctx, "Flux", r.result.sample), ext: "png" };
      if (/error|failed|moderated/i.test(r.status)) throw new ProviderError(r.status.includes("oderat") ? "refusal" : "server", "Flux", `Flux: ${r.status}`);
    }
    throw new ProviderError("server", "Flux", "Flux: таймаут генерации");
  },
};

// ---------- Local Stable Diffusion (AUTOMATIC1111 / Forge API) ----------
export const sdLocal: ImageProvider = {
  id: "sd-local",
  label: "Stable Diffusion (локально)",
  models: ["default"],
  estimateUsd: () => 0,
  async generate(req, ctx) {
    const base = "http://127.0.0.1:7860";
    const scale = 1024 / Math.max(req.width, req.height);
    const r8 = (v: number) => Math.round((v * scale) / 8) * 8;
    const out = await httpJson<{ images: string[] }>(
      ctx,
      "Stable Diffusion",
      `${base}/sdapi/v1/txt2img`,
      jsonInit(
        {
          prompt: req.prompt,
          negative_prompt: req.negativePrompt ?? "text, watermark, lowres, blurry",
          width: r8(req.width),
          height: r8(req.height),
          steps: 28,
          seed: req.seed ?? -1,
        },
        {},
      ),
    );
    if (!out.images?.[0]) throw new ProviderError("unknown", "Stable Diffusion", "SD: пустой ответ");
    return { data: base64ToBytes(out.images[0]), ext: "png" };
  },
};

// ---------- Mock (offline, free): gradient frame rendered by FFmpeg ----------
const PALETTE = ["0x1e3a8a", "0x7c3aed", "0xdb2777", "0x059669", "0xea580c", "0x0891b2", "0x4d7c0f"];
export const mockImages: ImageProvider = {
  id: "mock",
  label: "Тестовый (без API)",
  models: ["gradient"],
  estimateUsd: () => 0,
  async generate(req, ctx) {
    let h = 0;
    for (const c of req.prompt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const c0 = PALETTE[h % PALETTE.length];
    const c1 = PALETTE[(h >>> 3) % PALETTE.length];
    const file = await ctx.tmpFile("png");
    const w = Math.round(req.width / 2) * 2;
    const hgt = Math.round(req.height / 2) * 2;
    await ctx.ffmpeg([
      "-y", "-f", "lavfi", "-i", `gradients=s=${w}x${hgt}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${w}:y1=${hgt}:seed=${h % 1000}`,
      "-frames:v", "1", file,
    ]);
    return { data: await ctx.readFile(file), ext: "png" };
  },
};
