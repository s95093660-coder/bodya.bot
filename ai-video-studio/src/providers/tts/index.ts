import { ProviderError } from "../../core/errors";
import type { Word } from "../../core/types";
import { base64ToBytes, countWords } from "../../core/util";
import { httpBytes, httpJson, jsonInit } from "../http";
import type { TtsProvider, Voice } from "../types";

/** Group ElevenLabs character alignment into word timings. */
export function charsToWords(chars: string[], starts: number[], ends: number[]): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { text: ch, start: starts[i], end: ends[i] };
    else {
      cur.text += ch;
      cur.end = ends[i];
    }
  }
  if (cur) words.push(cur);
  return words;
}

// ---------- ElevenLabs ----------
export const elevenLabs: TtsProvider = {
  id: "elevenlabs",
  label: "ElevenLabs",
  secret: "elevenlabs",
  defaultVoice: "JBFqnCBsd6RMkjVDRZzb", // "George" — public premade voice
  estimateUsd: (chars) => (chars / 1000) * 0.18,
  async listVoices(ctx) {
    const key = await ctx.key("elevenlabs");
    const r = await httpJson<{ voices: { voice_id: string; name: string; preview_url?: string; labels?: Record<string, string> }[] }>(
      ctx,
      "ElevenLabs",
      "https://api.elevenlabs.io/v1/voices",
      { headers: { "xi-api-key": key } },
    );
    return r.voices.map<Voice>((v) => ({ id: v.voice_id, name: v.name, language: v.labels?.language, preview: v.preview_url }));
  },
  async synthesize(req, ctx) {
    const key = await ctx.key("elevenlabs");
    const r = await httpJson<{
      audio_base64: string;
      alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
    }>(
      ctx,
      "ElevenLabs",
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      jsonInit(
        {
          text: req.text,
          model_id: req.model || "eleven_multilingual_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, speed: Math.min(1.2, Math.max(0.7, req.speed)) },
        },
        { "xi-api-key": key },
      ),
    );
    const a = r.alignment;
    return {
      data: base64ToBytes(r.audio_base64),
      ext: "mp3",
      words: a ? charsToWords(a.characters, a.character_start_times_seconds, a.character_end_times_seconds) : undefined,
    };
  },
};

// ---------- OpenAI TTS ----------
const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];
export const openaiTts: TtsProvider = {
  id: "openai",
  label: "OpenAI TTS",
  secret: "openai",
  defaultVoice: "onyx",
  estimateUsd: (chars) => (chars / 1_000_000) * 15,
  async listVoices() {
    return OPENAI_VOICES.map((v) => ({ id: v, name: v }));
  },
  async synthesize(req, ctx) {
    const key = await ctx.key("openai");
    const data = await httpBytes(
      ctx,
      "OpenAI TTS",
      "https://api.openai.com/v1/audio/speech",
      jsonInit(
        {
          model: req.model || "gpt-4o-mini-tts",
          voice: req.voiceId || "onyx",
          input: req.text,
          speed: req.speed,
          response_format: "mp3",
          instructions: req.emotion ? `Speak with a ${req.emotion} tone. Engaging short-form video narrator.` : undefined,
        },
        { authorization: `Bearer ${key}` },
      ),
    );
    return { data, ext: "mp3" };
  },
};

// ---------- Mock: silent track of a plausible length ----------
export const mockTts: TtsProvider = {
  id: "mock",
  label: "Тестовый (тишина)",
  defaultVoice: "silent",
  estimateUsd: () => 0,
  async listVoices() {
    return [{ id: "silent", name: "Silent" }];
  },
  async synthesize(req, ctx) {
    const words = req.text.split(/\s+/).filter(Boolean);
    const wps = 2.6 * req.speed;
    const dur = Math.max(1, countWords(req.text) / wps);
    const file = await ctx.tmpFile("wav");
    await ctx.ffmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", dur.toFixed(2), file]);
    const step = dur / Math.max(1, words.length);
    return {
      data: await ctx.readFile(file),
      ext: "wav",
      words: words.map((w, i) => ({ text: w, start: i * step, end: (i + 1) * step })),
    };
  },
};

export function assertVoice(voiceId: string) {
  if (!voiceId) throw new ProviderError("bad_request", "TTS", "Не выбран голос");
}
