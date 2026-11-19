// End-to-end: full pipeline with mock providers and real FFmpeg (if installed).
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { setPlatform } from "../src/core/platform";
import { createNodePlatform } from "../src/platform/node";
import { mockLlm } from "../src/providers/llm/mock";
import { createProject } from "../src/pipeline/project";
import { regenerateScene, runPipeline } from "../src/pipeline/runner";
import { getProject } from "../src/db/repo";

let hasFfmpeg = true;
try {
  execFileSync("ffmpeg", ["-version"]);
} catch {
  hasFfmpeg = false;
}

describe.skipIf(!hasFfmpeg)("pipeline e2e (mock)", () => {
  it("renders an MP4, persists, resumes and regenerates one scene", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aivs-"));
    const plat = createNodePlatform(dir);
    setPlatform(plat);
    const p = createProject({ formatId: "what-if", topic: "Что если Луна исчезнет", durationSec: 15, aspect: "16:9", settings: { imageProvider: "mock", ttsProvider: "mock", subtitleStyle: "keyword_highlight" } });
    await runPipeline(p, {}, { llmOverride: mockLlm });
    expect(p.steps.ideas.status).toBe("skipped");
    expect(p.steps.render.status).toBe("done");
    const out = join(dir, "projects", p.id, p.outputPath!);
    const dur = await plat.probeDuration(out);
    expect(dur).toBeGreaterThan(5);
    expect((await getProject(p.id))?.steps.render.status).toBe("done");

    await regenerateScene(p, p.scenes![0].id, "image", { llmOverride: mockLlm });
    expect(p.steps.render.status).toBe("idle");
    await runPipeline(p, {}, { llmOverride: mockLlm }); // resumes at render only
    expect(p.steps.render.status).toBe("done");
  }, 120_000);
});
