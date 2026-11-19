// Downloads static FFmpeg + FFprobe builds and places them where Tauri's
// `externalBin` expects them: src-tauri/binaries/<name>-<target-triple>[.exe]
//
//   node scripts/fetch-ffmpeg.mjs                       # host target
//   node scripts/fetch-ffmpeg.mjs universal-apple-darwin # macOS universal (needs lipo)
//
// Builds come from https://github.com/eugeneware/ffmpeg-static (GPL, includes libx264 + libass).

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const RELEASE = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "binaries");

const ASSET = {
  "x86_64-pc-windows-msvc": "win32-x64",
  "aarch64-pc-windows-msvc": "win32-x64",
  "x86_64-apple-darwin": "darwin-x64",
  "aarch64-apple-darwin": "darwin-arm64",
  "x86_64-unknown-linux-gnu": "linux-x64",
  "aarch64-unknown-linux-gnu": "linux-arm64",
};

function hostTriple() {
  const out = execFileSync("rustc", ["-vV"]).toString();
  return /host: (\S+)/.exec(out)[1];
}

async function download(name, triple) {
  const ext = triple.includes("windows") ? ".exe" : "";
  const dest = join(OUT, `${name}-${triple}${ext}`);
  if (existsSync(dest)) return console.log(`✓ ${dest} (уже есть)`), dest;
  const url = `${RELEASE}/${name}-${ASSET[triple]}.gz`;
  console.log(`↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  writeFileSync(dest, gunzipSync(Buffer.from(await res.arrayBuffer())));
  chmodSync(dest, 0o755);
  console.log(`✓ ${dest}`);
  return dest;
}

const target = process.argv[2] || hostTriple();
mkdirSync(OUT, { recursive: true });

for (const name of ["ffmpeg", "ffprobe"]) {
  if (target === "universal-apple-darwin") {
    const a = await download(name, "aarch64-apple-darwin");
    const b = await download(name, "x86_64-apple-darwin");
    const u = join(OUT, `${name}-universal-apple-darwin`);
    execFileSync("lipo", ["-create", a, b, "-output", u]);
    chmodSync(u, 0o755);
    console.log(`✓ ${u}`);
  } else {
    if (!ASSET[target]) throw new Error(`Неизвестная платформа ${target}`);
    await download(name, target);
  }
}
