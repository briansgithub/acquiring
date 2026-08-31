/**
 * Batch scale-degree verification over chord_db corpora.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { verifyInterpretedChord } from "./scaleDegreeVerifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** @typedef {{ id: string, song?: string, section?: string, beat?: number, key: object, chord: object, buckets?: string[] }} ChordDbEntry */

export const CORPUS_DIRS = {
  chord_db: path.join(REPO_ROOT, "_Decode_oracle", "chord_db"),
  corpus2: path.join(REPO_ROOT, "_Decode_oracle", "chord_db_corpus2"),
  corpus3: path.join(REPO_ROOT, "_Decode_oracle", "chord_db_corpus3"),
  corpus4: path.join(REPO_ROOT, "_Decode_oracle", "chord_db_corpus4"),
};

/** High-risk buckets for --tier quick (chromatic / applied / inversion — not extensions/sus) */
export const QUICK_TIER_BUCKETS = new Set([
  "applied=yes",
  "type=7",
  "inversion=1",
  "inversion=2",
  "inversion=3",
  "borrowed=minor",
  "borrowed=harmonicMinor",
  "borrowed=phrygianDominant",
  "borrowed=mixolydian",
]);

/**
 * @param {string} dbRoot
 * @param {{ tier?: 'quick'|'full', buckets?: string[], limit?: number }} [opts]
 * @returns {ChordDbEntry[]}
 */
export function loadChordDbEntries(dbRoot, opts = {}) {
  const modDir = path.join(dbRoot, "byModification");
  if (!fs.existsSync(modDir)) {
    throw new Error(`chord_db not found: ${modDir}`);
  }

  const tier = opts.tier || "full";
  const bucketFilter = opts.buckets?.length
    ? new Set(opts.buckets)
    : tier === "quick"
      ? QUICK_TIER_BUCKETS
      : null;

  const files = fs.readdirSync(modDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const byId = new Map();

  for (const file of files) {
    const bucket = file.replace(/\.json$/, "");
    if (bucketFilter && !bucketFilter.has(bucket)) continue;

    const raw = JSON.parse(fs.readFileSync(path.join(modDir, file), "utf8"));
    if (!Array.isArray(raw)) continue;

    for (const entry of raw) {
      if (!entry?.chord || !entry?.key) continue;
      if (entry.chord.isRest) continue;
      const id = entry.id || `${entry.song}/${entry.section}/${entry.beat}`;
      if (!byId.has(id)) {
        byId.set(id, { ...entry, id });
      }
    }
  }

  let entries = [...byId.values()];
  if (opts.limit > 0) entries = entries.slice(0, opts.limit);
  return entries;
}

/**
 * @param {ChordDbEntry} entry
 * @returns {{ id: string, ok: boolean, error?: string, failures: object[], warnings: object[], notes?: string[], chordDegrees?: string[], buckets?: string[] }}
 */
export function verifyChordDbEntry(entry) {
  try {
    const { interpreter, verification } = verifyInterpretedChord(entry.chord, entry.key);
    return {
      id: entry.id,
      ok: verification.ok,
      failures: verification.failures,
      warnings: verification.warnings,
      notes: interpreter.notes,
      chordDegrees: interpreter.chordDegrees,
      buckets: entry.buckets || [],
      song: entry.song,
      section: entry.section,
      beat: entry.beat,
    };
  } catch (err) {
    return {
      id: entry.id,
      ok: false,
      error: err.message,
      failures: [{ reason: err.message }],
      warnings: [],
      buckets: entry.buckets || [],
    };
  }
}

/**
 * @param {ChordDbEntry[]} entries
 * @param {{ onProgress?: (n: number, total: number) => void }} [opts]
 */
export function runBatch(entries, opts = {}) {
  const results = [];
  const total = entries.length;
  for (let i = 0; i < entries.length; i++) {
    results.push(verifyChordDbEntry(entries[i]));
    opts.onProgress?.(i + 1, total);
  }
  return results;
}

/**
 * @param {ReturnType<runBatch>} results
 */
export function summarizeBatch(results) {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const withWarnings = results.filter((r) => r.warnings?.length);

  const byBucket = new Map();
  for (const r of results) {
    for (const b of r.buckets || ["unknown"]) {
      if (!byBucket.has(b)) byBucket.set(b, { total: 0, ok: 0 });
      const row = byBucket.get(b);
      row.total++;
      if (r.ok) row.ok++;
    }
  }

  const bucketStats = [...byBucket.entries()]
    .map(([bucket, { total: t, ok }]) => ({
      bucket,
      total: t,
      ok,
      okPct: t ? Math.round((ok / t) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.okPct - b.okPct || b.total - a.total);

  return {
    total,
    passed,
    failed: failed.length,
    okPct: total ? Math.round((passed / total) * 1000) / 10 : 0,
    warnings: withWarnings.length,
    bucketStats,
    failures: failed.slice(0, 100).map((r) => ({
      id: r.id,
      song: r.song,
      section: r.section,
      beat: r.beat,
      notes: r.notes,
      chordDegrees: r.chordDegrees,
      error: r.error,
      failures: r.failures,
      warnings: r.warnings,
      buckets: r.buckets,
    })),
  };
}

/**
 * @param {object} summary
 * @param {{ corpus: string, tier: string, dbRoot: string }} meta
 */
export function formatBatchSummary(summary, meta) {
  const lines = [
    `Scale-degree corpus: ${meta.corpus} (${meta.tier})`,
    `  ${summary.passed}/${summary.total} OK (${summary.okPct}%)`,
    `  failures: ${summary.failed}, warnings: ${summary.warnings}`,
  ];
  if (summary.bucketStats.length) {
    lines.push("  weakest buckets:");
    for (const b of summary.bucketStats.slice(0, 8)) {
      if (b.okPct < 100) {
        lines.push(`    ${b.bucket}: ${b.ok}/${b.total} (${b.okPct}%)`);
      }
    }
  }
  if (summary.failures.length) {
    lines.push("  sample failures:");
    for (const f of summary.failures.slice(0, 5)) {
      lines.push(`    ${f.id}: ${f.failures?.[0]?.reason || f.error}`);
      if (f.notes && f.chordDegrees) {
        lines.push(`      notes: ${JSON.stringify(f.notes)}`);
        lines.push(`      degrees: ${JSON.stringify(f.chordDegrees)}`);
      }
    }
  }
  return lines.join("\n");
}

export function writeBatchReport(summary, reportPath, meta) {
  const payload = {
    generatedAt: new Date().toISOString(),
    ...meta,
    summary: {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      okPct: summary.okPct,
      warnings: summary.warnings,
    },
    bucketStats: summary.bucketStats,
    failures: summary.failures,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  return reportPath;
}
