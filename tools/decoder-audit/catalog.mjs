import { createRequire } from "node:module";
import path from "node:path";
import zlib from "node:zlib";

import {
  normalizeKey,
  validateHooktheoryChord,
} from "../../web-player/lib/harmonicContract.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const { activeKeyAtBeat, runChord } = require("../../_Decode_oracle/engineRun.js");
const { stableStringify } = require("../../lib/midi-corpus/stable-json.js");

const MAX_DECODED_SONG_BYTES = 64 * 1024 * 1024;
const CHORD_SIGNATURE_FIELDS = [
  "root",
  "type",
  "inversion",
  "applied",
  "borrowed",
  "adds",
  "omits",
  "alterations",
  "suspensions",
  "substitutions",
  "halfDim",
  "dimTriad",
  "flattenHalfDimB5",
  "appliedDenomMaj",
];
const OPTIONAL_ARRAY_FIELDS = [
  "adds",
  "omits",
  "alterations",
  "suspensions",
  "substitutions",
];

function increment(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount;
}

export function harmonicSignature(chord) {
  return stableStringify(Object.fromEntries(
    CHORD_SIGNATURE_FIELDS
      .filter((field) => chord[field] !== undefined)
      .map((field) => [field, chord[field]]),
  ));
}

function contextSignature(chord, key) {
  return stableStringify({ key, chord: JSON.parse(harmonicSignature(chord)) });
}

export function sectionsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return Object.values(payload).filter((value) => value && typeof value === "object");
}

function activeKeys(section) {
  return section?.metadata?.keys || section?.keys || [];
}

function classificationKeys(chord, key) {
  const modifierFamilies = [];
  for (const field of ["adds", "omits", "alterations", "suspensions", "substitutions"]) {
    if (Array.isArray(chord[field]) && chord[field].length) modifierFamilies.push(field);
  }
  return {
    type: String(chord.type ?? "missing"),
    inversion: String(chord.inversion ?? "missing"),
    scale: String(key.scale || "major"),
    applied: Number(chord.applied) > 0 ? "applied" : "ordinary",
    borrowed: Array.isArray(chord.borrowed)
      ? "custom"
      : chord.borrowed
        ? String(chord.borrowed)
        : "none",
    modifierFamilies: modifierFamilies.length ? modifierFamilies : ["none"],
  };
}

function anomalyExample(slug, section, chord, key, issues) {
  return {
    slug,
    section: section.sectionName || section.name || section.songId || null,
    beat: chord?.beat ?? null,
    key,
    chord,
    issues,
  };
}

export function normalizeLegacyArrays(rawChord, normalizationCodes = {}) {
  if (!rawChord || typeof rawChord !== "object" || Array.isArray(rawChord)) return rawChord;
  const chord = { ...rawChord };
  for (const field of OPTIONAL_ARRAY_FIELDS) {
    if (chord[field] == null) {
      chord[field] = [];
      increment(normalizationCodes, `${field}_defaulted`);
    }
  }
  return chord;
}

/**
 * Stream every Android catalog song while retaining only unique decoder contexts.
 * Invalid source rows are permanently separated from normal decoder coverage.
 */
export async function runCatalogAudit({
  catalog,
  anomalyExampleLimit = 1000,
  errorExampleLimit = 100,
  progress = null,
} = {}) {
  if (!catalog) throw new Error("catalog is required");
  const catalogPath = path.resolve(catalog);
  const db = new DatabaseSync(catalogPath, { readOnly: true });
  const contexts = new Map();
  const signatures = new Map();
  const report = {
    schemaVersion: "decoder-catalog-audit/v1",
    source: catalogPath,
    lane: "raw",
    counts: {
      songs: 0,
      sections: 0,
      chords: 0,
      soundingChords: 0,
      rests: 0,
      validRows: 0,
      anomalyRows: 0,
      uniqueSignatures: 0,
      uniqueDecoderContexts: 0,
      decodedRows: 0,
      decoderErrors: 0,
      uniqueDecoderErrors: 0,
    },
    coverage: {
      type: {},
      inversion: {},
      scale: {},
      applied: {},
      borrowed: {},
      modifierFamily: {},
      signatureFrequency: { singleton: 0, rare_2_to_5: 0, common_over_5: 0 },
    },
    anomalyCodes: {},
    anomalyFields: {},
    normalizationCodes: {},
    anomalyExamples: [],
    decoderErrorCodes: {},
    decoderErrorExamples: [],
  };

  try {
    const columns = new Set(db.prepare("PRAGMA table_info(songs)").all().map((row) => row.name));
    for (const required of ["slug", "dataBlob"]) {
      if (!columns.has(required)) throw new Error(`songs table is missing ${required}`);
    }

    const rows = db.prepare("SELECT slug, dataBlob FROM songs ORDER BY slug COLLATE BINARY").iterate();
    for (const row of rows) {
      report.counts.songs += 1;
      if (progress && report.counts.songs % 5000 === 0) progress({ ...report.counts });
      let payload;
      try {
        const decoded = zlib.gunzipSync(Buffer.from(row.dataBlob), {
          maxOutputLength: MAX_DECODED_SONG_BYTES,
        });
        payload = JSON.parse(decoded.toString("utf8"));
      } catch (error) {
        report.counts.anomalyRows += 1;
        increment(report.anomalyCodes, "song_payload_decode_error");
        if (report.anomalyExamples.length < anomalyExampleLimit) {
          report.anomalyExamples.push({ slug: row.slug, issues: [{
            code: "song_payload_decode_error",
            message: error.message,
          }] });
        }
        continue;
      }

      for (const section of sectionsFromPayload(payload)) {
        report.counts.sections += 1;
        const keys = activeKeys(section);
        for (const rawChord of Array.isArray(section.chords) ? section.chords : []) {
          report.counts.chords += 1;
          if (rawChord?.isRest === true) {
            report.counts.rests += 1;
            continue;
          }
          report.counts.soundingChords += 1;
          const chord = normalizeLegacyArrays(rawChord, report.normalizationCodes);
          const key = normalizeKey(activeKeyAtBeat(keys, Number(chord?.beat ?? 1)));
          const issues = validateHooktheoryChord(chord, key)
            .filter((issue) => issue.severity === "error");
          if (issues.length) {
            report.counts.anomalyRows += 1;
            for (const issue of issues) {
              increment(report.anomalyCodes, issue.code);
              increment(report.anomalyFields, `${issue.path}:${issue.code}`);
            }
            if (report.anomalyExamples.length < anomalyExampleLimit) {
              report.anomalyExamples.push(anomalyExample(row.slug, section, chord, key, issues));
            }
            continue;
          }

          report.counts.validRows += 1;
          const signature = harmonicSignature(chord);
          signatures.set(signature, (signatures.get(signature) || 0) + 1);
          const classifications = classificationKeys(chord, key);
          increment(report.coverage.type, classifications.type);
          increment(report.coverage.inversion, classifications.inversion);
          increment(report.coverage.scale, classifications.scale);
          increment(report.coverage.applied, classifications.applied);
          increment(report.coverage.borrowed, classifications.borrowed);
          for (const family of classifications.modifierFamilies) {
            increment(report.coverage.modifierFamily, family);
          }

          const context = contextSignature(chord, key);
          const existing = contexts.get(context);
          if (existing) {
            existing.occurrences += 1;
          } else {
            contexts.set(context, {
              chord,
              key,
              slug: row.slug,
              section: section.sectionName || section.name || section.songId || null,
              occurrences: 1,
            });
          }
        }
      }
    }
  } finally {
    db.close();
  }

  report.counts.uniqueSignatures = signatures.size;
  report.counts.uniqueDecoderContexts = contexts.size;
  for (const frequency of signatures.values()) {
    if (frequency === 1) report.coverage.signatureFrequency.singleton += 1;
    else if (frequency <= 5) report.coverage.signatureFrequency.rare_2_to_5 += 1;
    else report.coverage.signatureFrequency.common_over_5 += 1;
  }

  for (const entry of contexts.values()) {
    const result = await runChord(entry.chord, entry.key, { lane: "raw" });
    if (!result.error) {
      report.counts.decodedRows += entry.occurrences;
      continue;
    }
    report.counts.decoderErrors += entry.occurrences;
    report.counts.uniqueDecoderErrors += 1;
    increment(report.decoderErrorCodes, result.error, entry.occurrences);
    if (report.decoderErrorExamples.length < errorExampleLimit) {
      report.decoderErrorExamples.push({
        slug: entry.slug,
        section: entry.section,
        occurrences: entry.occurrences,
        key: entry.key,
        chord: entry.chord,
        error: result.error,
      });
    }
  }

  return report;
}
