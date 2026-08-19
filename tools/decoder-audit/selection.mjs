import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import zlib from "node:zlib";

import { normalizeKey, validateHooktheoryChord } from "../../web-player/lib/harmonicContract.js";
import {
  harmonicSignature,
  normalizeLegacyArrays,
  sectionsFromPayload,
} from "./catalog.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const { activeKeyAtBeat } = require("../../_Decode_oracle/engineRun.js");

function payload(row) {
  return JSON.parse(zlib.gunzipSync(Buffer.from(row.dataBlob), {
    maxOutputLength: 64 * 1024 * 1024,
  }).toString("utf8"));
}

function signatureId(signature) {
  return crypto.createHash("sha256").update(signature).digest("hex").slice(0, 20);
}

function borrowedName(value) {
  if (Array.isArray(value)) return "custom";
  return value || "none";
}

function familyFeatures(chord, key) {
  const features = new Set([
    `scale:${key.scale}`,
    `type:${chord.type}`,
    `inversion:${chord.inversion}`,
    `borrowed:${borrowedName(chord.borrowed)}`,
    Number(chord.applied) > 0 ? `applied:${chord.applied}` : "applied:none",
  ]);
  if (Number(chord.applied) > 0 && chord.borrowed) features.add("combination:applied+borrowed");
  for (const field of ["adds", "omits", "alterations", "suspensions", "substitutions"]) {
    const values = Array.isArray(chord[field]) ? chord[field] : [];
    features.add(`${field}:${values.length ? "present" : "none"}`);
    for (const value of values) features.add(`${field}-token:${value}`);
  }
  return features;
}

function scanCatalog(catalogPath, visitor) {
  const db = new DatabaseSync(catalogPath, { readOnly: true });
  try {
    for (const row of db.prepare("SELECT slug, dataBlob FROM songs ORDER BY slug COLLATE BINARY").iterate()) {
      visitor(row, payload(row));
    }
  } finally {
    db.close();
  }
}

function validSongEvidence(row, songPayload, callback) {
  let hasRest = false;
  for (const section of sectionsFromPayload(songPayload)) {
    const keys = section?.metadata?.keys || section?.keys || [];
    for (const rawChord of Array.isArray(section.chords) ? section.chords : []) {
      if (rawChord?.isRest) {
        hasRest = true;
        continue;
      }
      const chord = normalizeLegacyArrays(rawChord);
      const key = normalizeKey(activeKeyAtBeat(keys, Number(chord?.beat ?? 1)));
      const issues = validateHooktheoryChord(chord, key).filter((issue) => issue.severity === "error");
      if (issues.length) continue;
      callback(chord, key, row.slug);
    }
  }
  return hasRest;
}

/** Deterministic greedy set-cover queue for independent oracle scraping. */
export function selectCoverageSongs({ catalog, maxSongs = 250, rareThreshold = 5 } = {}) {
  if (!catalog) throw new Error("catalog is required");
  const catalogPath = path.resolve(catalog);
  const signatureFrequency = new Map();
  const familyUniverse = new Set(["event:rest"]);
  scanCatalog(catalogPath, (row, songPayload) => {
    const hasRest = validSongEvidence(row, songPayload, (chord, key) => {
      const signature = harmonicSignature(chord);
      signatureFrequency.set(signature, (signatureFrequency.get(signature) || 0) + 1);
      for (const feature of familyFeatures(chord, key)) familyUniverse.add(feature);
    });
    if (hasRest) familyUniverse.add("event:rest");
  });

  const rareSignatures = new Set(
    [...signatureFrequency.entries()]
      .filter(([, frequency]) => frequency <= rareThreshold)
      .map(([signature]) => signature),
  );
  const songs = [];
  scanCatalog(catalogPath, (row, songPayload) => {
    const families = new Set();
    const rare = new Set();
    const hasRest = validSongEvidence(row, songPayload, (chord, key) => {
      const signature = harmonicSignature(chord);
      if (rareSignatures.has(signature)) rare.add(signature);
      for (const feature of familyFeatures(chord, key)) families.add(feature);
    });
    if (hasRest) families.add("event:rest");
    songs.push({ slug: row.slug, families, rare });
  });

  const uncoveredFamilies = new Set(familyUniverse);
  const uncoveredRare = new Set(rareSignatures);
  const selected = [];
  let familyCoverageCompleteAt = null;
  const remaining = new Map(songs.map((song) => [song.slug, song]));
  const limit = Math.max(1, Math.floor(Number(maxSongs)));
  while (selected.length < limit && remaining.size) {
    let winner = null;
    let winnerFamilyGain = -1;
    let winnerRareGain = -1;
    for (const song of remaining.values()) {
      let familyGain = 0;
      let rareGain = 0;
      for (const feature of song.families) if (uncoveredFamilies.has(feature)) familyGain += 1;
      for (const signature of song.rare) if (uncoveredRare.has(signature)) rareGain += 1;
      if (familyGain > winnerFamilyGain
        || (familyGain === winnerFamilyGain && rareGain > winnerRareGain)
        || (familyGain === winnerFamilyGain && rareGain === winnerRareGain
          && (!winner || song.slug < winner.slug))) {
        winner = song;
        winnerFamilyGain = familyGain;
        winnerRareGain = rareGain;
      }
    }
    if (!winner || (winnerFamilyGain <= 0 && winnerRareGain <= 0)) break;
    remaining.delete(winner.slug);
    const newlyCoveredFamilies = [...winner.families].filter((value) => uncoveredFamilies.delete(value)).sort();
    const newlyCoveredRare = [...winner.rare].filter((value) => uncoveredRare.delete(value));
    selected.push({
      rank: selected.length + 1,
      slug: winner.slug,
      newFamilyCount: newlyCoveredFamilies.length,
      newRareSignatureCount: newlyCoveredRare.length,
      newlyCoveredFamilies,
    });
    if (uncoveredFamilies.size === 0 && familyCoverageCompleteAt === null) {
      familyCoverageCompleteAt = selected.length;
    }
  }

  return {
    schemaVersion: "decoder-oracle-selection/v1",
    source: catalogPath,
    policy: {
      algorithm: "deterministic-greedy-family-then-rare-v1",
      maxSongs: limit,
      rareThreshold,
    },
    universe: {
      familyCount: familyUniverse.size,
      rareSignatureCount: rareSignatures.size,
      exactSignatureCount: signatureFrequency.size,
    },
    coverage: {
      familyCount: familyUniverse.size - uncoveredFamilies.size,
      rareSignatureCount: rareSignatures.size - uncoveredRare.size,
      familyRate: familyUniverse.size ? (familyUniverse.size - uncoveredFamilies.size) / familyUniverse.size : 1,
      familyCoverageCompleteAt,
      rareSignatureRate: rareSignatures.size ? (rareSignatures.size - uncoveredRare.size) / rareSignatures.size : 1,
      uncoveredFamilies: [...uncoveredFamilies].sort(),
      uncoveredRareSignatureIds: [...uncoveredRare].map(signatureId).sort(),
    },
    selected,
  };
}
