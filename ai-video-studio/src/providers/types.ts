// Provider adapter contracts. Adding a new provider = implement one interface
// and register it in providers/registry.ts. Nothing else in the app changes.

import type { Aspect, Lang, Word } from "../core/types";

export interface ProviderContext {
  /** Returns the key from the keychain or throws ProviderError("auth"). */
  key(secretId: string): Promise<string>;
  fetch: typeof fetch;
  signal?: AbortSignal;
  log(msg: string): void;
  /** For providers that need local tools (mock renderers etc.). */
  ffmpeg(args: string[]): Promise<void>;
  tmpFile(ext: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
}

export interface BinaryAsset {
  data: Uint8Array;
  ext: string; // png | jpg | mp3 | wav | mp4
}

// ---------- Images ----------
export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  aspect: Aspect;
  seed?: number;
  model?: string;
  /** Reference images for consistent characters (providers that support it). */
  references?: Uint8Array[];
}

export interface ImageProvider {
  id: string;
  label: string;
  secret?: string; // keychain id, if a key is needed
  models: string[];
  estimateUsd(req: Pick<ImageRequest, "model" | "width" | "height">): number;
  generate(req: ImageRequest, ctx: ProviderContext): Promise<BinaryAsset>;
}

// ---------- Video clips (stage 2: Kling, Runway, Veo, Luma) ----------
export interface VideoRequest {
  prompt: string;
  image?: Uint8Array; // image-to-video
  durationSec: number;
  aspect: Aspect;
  seed?: number;
  model?: string;
}

export interface VideoProvider {
  id: string;
  label: string;
  secret?: string;
  models: string[];
  estimateUsd(req: Pick<VideoRequest, "durationSec" | "model">): number;
  generate(req: VideoRequest, ctx: ProviderContext): Promise<BinaryAsset>;
}

// ---------- TTS ----------
export interface Voice {
  id: string;
  name: string;
  language?: string;
  preview?: string;
}

export interface TtsRequest {
  text: string;
  voiceId: string;
  speed: number; // 0.7..1.3
  emotion?: string;
  language: Lang;
  model?: string;
}

export interface TtsResult extends BinaryAsset {
  /** Word timings if the provider returns alignment (ElevenLabs). */
  words?: Word[];
}

export interface TtsProvider {
  id: string;
  label: string;
  secret?: string;
  defaultVoice: string;
  listVoices(ctx: ProviderContext): Promise<Voice[]>;
  estimateUsd(chars: number): number;
  synthesize(req: TtsRequest, ctx: ProviderContext): Promise<TtsResult>;
}

// ---------- STT (word timings) ----------
export interface SttProvider {
  id: string;
  secret?: string;
  estimateUsd(seconds: number): number;
  transcribeWords(audio: BinaryAsset, language: Lang, ctx: ProviderContext): Promise<Word[]>;
}
