import type { Word } from "../../core/types";
import { httpJson } from "../http";
import type { SttProvider } from "../types";

// OpenAI Whisper with word-level timestamps.
export const whisper: SttProvider = {
  id: "whisper",
  secret: "openai",
  estimateUsd: (sec) => (sec / 60) * 0.006,
  async transcribeWords(audio, language, ctx) {
    const key = await ctx.key("openai");
    const form = new FormData();
    const mime = audio.ext === "wav" ? "audio/wav" : "audio/mpeg";
    form.append("file", new Blob([audio.data as BlobPart], { type: mime }), `audio.${audio.ext}`);
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("language", language);
    const r = await httpJson<{ words?: { word: string; start: number; end: number }[] }>(
      ctx,
      "Whisper",
      "https://api.openai.com/v1/audio/transcriptions",
      { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form },
    );
    return (r.words ?? []).map<Word>((w) => ({ text: w.word.trim(), start: w.start, end: w.end }));
  },
};
