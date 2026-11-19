import { describe, expect, it } from "vitest";
import { assTime, buildAss, buildSrt, chunkWords } from "../src/render/ass";
import { buildRenderArgs, kenBurns } from "../src/render/ffmpeg";
import { buildTimeline, estimateWords } from "../src/pipeline/timeline";
import { charsToWords } from "../src/providers/tts";
import { parseFfmpegProgress } from "../src/platform/node";
import { fillPrompt } from "../src/templates/prompts";
import { stableJson } from "../src/core/util";
import { ProviderError, withRetry } from "../src/core/errors";
import type { Scene } from "../src/core/types";

const words = "Что если Луна исчезнет прямо сейчас? Никто не заметит.".split(" ").map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.35 }));

describe("subtitles", () => {
  it("formats ASS time", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(61.234)).toBe("0:01:01.23");
  });
  it("chunks on sentence ends and size", () => {
    const c = chunkWords(words, 3, 30);
    expect(c[0].map((w) => w.text)).toEqual(["Что", "если", "Луна"]);
    expect(c.some((ch) => ch[ch.length - 1].text.endsWith("?"))).toBe(true);
  });
  it("karaoke emits one event per word with highlight", () => {
    const ass = buildAss(words, { width: 1080, height: 1920, style: "tiktok_karaoke" });
    expect(ass.match(/^Dialogue:/gm)?.length).toBe(words.length);
    expect(ass).toContain("\\c&H0000E5FF");
    expect(ass).toContain("PlayResY: 1920");
  });
  it("keyword style colours keywords", () => {
    const ass = buildAss(words, { width: 1080, height: 1920, style: "keyword_highlight", keywords: ["Луна"] });
    expect(ass).toMatch(/\\c&H0066FF66\}ЛУНА/);
  });
  it("builds SRT", () => {
    expect(buildSrt(words)).toMatch(/^1\n00:00:00,000 --> /);
  });
});

describe("ffmpeg builder", () => {
  it("ken burns expressions", () => {
    expect(kenBurns("zoom_in", 91).z).toBe("1+0.15*(on/90)");
    expect(kenBurns("pan_left", 1).x).toContain("(on/1)");
  });
  it("builds a full graph with subtitles and ducking", () => {
    const { args, filter } = buildRenderArgs({
      scenes: [
        { image: "images/1.png", audio: "audio/1.mp3", duration: 2, camera: "zoom_in" },
        { image: "images/2.png", audio: "audio/2.mp3", duration: 3, camera: "pan_right" },
      ],
      width: 1080,
      height: 1920,
      fps: 30,
      subtitles: "subs/subs.ass",
      music: { path: "music.mp3", volume: 0.3, duck: true },
      output: "out/v.mp4",
    });
    expect(args).toContain("-filter_complex_script");
    expect(args.at(-1)).toBe("out/v.mp4");
    expect(filter).toContain("concat=n=2:v=1:a=0[vcat]");
    expect(filter).toContain("ass=subs/subs.ass");
    expect(filter).toContain("sidechaincompress");
    expect(filter).toContain("d=60:s=1080x1920");
  });
});

describe("timeline", () => {
  it("offsets words by scene durations", () => {
    const scenes = [
      { audioDuration: 2, durationSec: 2, words: [{ text: "a", start: 0, end: 1 }] },
      { audioDuration: 1, durationSec: 1, words: [{ text: "b", start: 0.5, end: 0.9 }] },
    ] as Scene[];
    const tl = buildTimeline(scenes);
    expect(tl.durations).toEqual([2.2, 1.6]);
    expect(tl.words[1].start).toBeCloseTo(2.7);
  });
  it("estimates words inside duration", () => {
    const w = estimateWords("раз два три", 3);
    expect(w).toHaveLength(3);
    expect(w[2].end).toBeLessThanOrEqual(3);
  });
});

describe("misc", () => {
  it("groups ElevenLabs alignment into words", () => {
    const chars = [..."hi yo"];
    const w = charsToWords(chars, chars.map((_, i) => i * 0.1), chars.map((_, i) => i * 0.1 + 0.1));
    expect(w.map((x) => x.text)).toEqual(["hi", "yo"]);
    expect(w[1].start).toBeCloseTo(0.3);
  });
  it("parses ffmpeg progress", () => {
    expect(parseFfmpegProgress("out_time_us=2500000")).toBe(2.5);
    expect(parseFfmpegProgress("frame=1")).toBeNull();
  });
  it("fills prompts and stable json", () => {
    expect(fillPrompt("{{a}}-{{b}}", { a: 1 })).toBe("1-");
    expect(stableJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
  it("retries retryable errors only", async () => {
    let n = 0;
    const r = await withRetry(async () => {
      if (n++ < 2) throw new ProviderError("server", "x", "boom");
      return "ok";
    }, { baseMs: 1 });
    expect(r).toBe("ok");
    await expect(withRetry(async () => { throw new ProviderError("auth", "x", "no key"); }, { baseMs: 1 })).rejects.toThrow("no key");
  });
});
