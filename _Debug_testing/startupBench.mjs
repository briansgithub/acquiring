/**
 * Benchmark player startup bottlenecks (server-side).
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOG = path.join(ROOT, "debug-b6e47b.log");

function log(hypothesisId, message, data) {
  const line = JSON.stringify({
    sessionId: "b6e47b",
    hypothesisId,
    location: "startupBench.mjs",
    message,
    data,
    timestamp: Date.now(),
    runId: "bench",
  });
  fs.appendFileSync(LOG, line + "\n");
}

// Hypothesis A: loadLibrary scans all cache dirs
const serverPath = path.join(ROOT, "web-player", "server.js");
const { createRequire } = await import("node:module");
const require = createRequire(serverPath);
const { getPlaybackCacheDir } = require(path.join(ROOT, "lib", "dataRoot.js"));

const CACHE_ROOT = getPlaybackCacheDir();
const t0 = performance.now();
const dirs = fs.readdirSync(CACHE_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
const t1 = performance.now();
log("A", "readdir cache root", { dirCount: dirs.length, ms: Math.round(t1 - t0) });

// Sample loadLibraryEntry cost (first 100 + full estimate)
const loadLibraryEntry = async (artistName) => {
  const artistPath = path.join(CACHE_ROOT, artistName);
  const files = await fs.promises.readdir(artistPath);
  let metadata = null;
  const metadataPath = path.join(artistPath, "_metadata.json");
  try {
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
    }
  } catch (_) {}
  const sectionJsonFiles = files.filter((f) => f.endsWith(".json") && f !== "_metadata.json");
  return { artist: artistName, sections: sectionJsonFiles.length, metadata: !!metadata };
};

const sampleN = Math.min(200, dirs.length);
const t2 = performance.now();
const sample = [];
for (let i = 0; i < sampleN; i++) {
  sample.push(await loadLibraryEntry(dirs[i].name));
}
const t3 = performance.now();
const perEntryMs = (t3 - t2) / sampleN;
log("A", "loadLibraryEntry sample", {
  sampleN,
  totalMs: Math.round(t3 - t2),
  perEntryMs: +perEntryMs.toFixed(2),
  estimatedFullMs: Math.round(perEntryMs * dirs.length),
});

// Hypothesis B: /api/library reads large JSON cache
const cacheFile = path.join(ROOT, "sacred_ring_data", "catalog", "library_cache.json");
const t4 = performance.now();
const cacheStat = fs.statSync(cacheFile);
const cacheRaw = fs.readFileSync(cacheFile, "utf8");
const t5 = performance.now();
const parsed = JSON.parse(cacheRaw);
const t6 = performance.now();
log("B", "library_cache.json read+parse", {
  bytes: cacheStat.size,
  readMs: Math.round(t5 - t4),
  parseMs: Math.round(t6 - t5),
  songCount: parsed.songs?.length ?? 0,
});

console.log("Benchmark complete — see debug-b6e47b.log");
