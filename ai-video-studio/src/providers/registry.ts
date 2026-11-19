// Single place where adapters are registered. To add a provider: implement the
// interface from ./types and append it to the matching list.

import { fluxBfl, mockImages, openaiImages, sdLocal } from "./image";
import { whisper } from "./stt/whisper";
import { elevenLabs, mockTts, openaiTts } from "./tts";
import type { ImageProvider, SttProvider, TtsProvider, VideoProvider } from "./types";

export const IMAGE_PROVIDERS: ImageProvider[] = [openaiImages, fluxBfl, sdLocal, mockImages];
export const TTS_PROVIDERS: TtsProvider[] = [elevenLabs, openaiTts, mockTts];
export const STT_PROVIDERS: SttProvider[] = [whisper];
/** Stage 2: Kling, Runway, Veo, Luma adapters plug in here. */
export const VIDEO_PROVIDERS: VideoProvider[] = [];

function pick<T extends { id: string }>(list: T[], id: string, kind: string): T {
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error(`Неизвестный ${kind}-провайдер: ${id}`);
  return p;
}

export const imageProvider = (id: string) => pick(IMAGE_PROVIDERS, id, "image");
export const ttsProvider = (id: string) => pick(TTS_PROVIDERS, id, "TTS");
export const videoProvider = (id: string) => pick(VIDEO_PROVIDERS, id, "video");
