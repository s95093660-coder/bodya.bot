// Headless runner: same pipeline as the desktop app, useful for testing,
// servers and overnight batches.
//
//   npm run cli -- --format what-if --topic "Что если Луна исчезнет" --duration 30
//   npm run cli -- --mock            # fully offline smoke test (no keys)
//
// Keys come from env: ANTHROPIC_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY, BFL_API_KEY

import * as path from "node:path";
import { parseArgs } from "node:util";
import { setPlatform } from "../src/core/platform";
import type { Aspect, Lang } from "../src/core/types";
import { saveProject } from "../src/db/repo";
import { createNodePlatform } from "../src/platform/node";
import { mockLlm } from "../src/providers/llm/mock";
import { estimateProject } from "../src/pipeline/cost";
import { createProject } from "../src/pipeline/project";
import { runPipeline } from "../src/pipeline/runner";

const { values: a } = parseArgs({
  options: {
    format: { type: "string", default: "what-if" },
    topic: { type: "string" },
    niche: { type: "string" },
    aspect: { type: "string", default: "9:16" },
    duration: { type: "string", default: "60" },
    lang: { type: "string", default: "ru" },
    image: { type: "string" },
    tts: { type: "string" },
    voice: { type: "string", default: "" },
    model: { type: "string", default: "claude-opus-5-5" },
    budget: { type: "string" },
    data: { type: "string", default: ".studio-data" },
    mock: { type: "boolean", default: false },
  },
});

async function main() {
  setPlatform(createNodePlatform(path.resolve(a.data!)));
  const project = createProject({
    formatId: a.format!,
    topic: a.topic,
    niche: a.niche,
    aspect: a.aspect as Aspect,
    durationSec: Number(a.duration),
    language: a.lang as Lang,
    settings: {
      autoMode: true,
      llmModel: a.model!,
      imageProvider: a.image ?? (a.mock ? "mock" : "openai"),
      ttsProvider: a.tts ?? (a.mock ? "mock" : "elevenlabs"),
      voiceId: a.voice!,
      budgetUsd: a.budget ? Number(a.budget) : undefined,
    },
  });
  const est = estimateProject(project);
  console.log(`Проект ${project.id}; оценка стоимости: $${est.total.toFixed(3)}`);
  await saveProject(project);
  let last = "";
  await runPipeline(project, {}, {
    llmOverride: a.mock ? mockLlm : undefined,
    onLog: (e) => console.log(`[${e.level}] ${e.step ?? ""} ${e.message}`),
    onUpdate: (p) => {
      const s = Object.entries(p.steps).find(([, v]) => v.status === "running");
      const line = s ? `${s[0]} ${Math.round(s[1].progress * 100)}% ${s[1].message ?? ""}` : "";
      if (line && line !== last) console.log("  …", (last = line));
    },
  });
  const spent = project.costs.reduce((x, c) => x + c.usd, 0);
  console.log(`\n✅ Готово: ${path.join(path.resolve(a.data!), "projects", project.id, project.outputPath!)}\n   Потрачено: $${spent.toFixed(3)}`);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
