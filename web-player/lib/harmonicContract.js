import { resolveHarmonicIntent } from "./harmonicIntent.js";
import { SUPPORTED_BORROWED_MODES } from "./scaleBorrowed.js";

export const HARMONIC_ANALYSIS_SCHEMA_VERSION = "harmonic-analysis/v1";

const CHORD_TYPES = new Set([5, 7, 9, 11, 13]);
const ARRAY_FIELDS = ["adds", "omits", "alterations", "suspensions", "substitutions"];
export const HOOKTHEORY_CHORD_PUBLIC_FIELDS = Object.freeze([
  "root", "type", "inversion", "applied", "borrowed",
  ...ARRAY_FIELDS,
  "beat", "duration", "isRest", "alternate", "pedal", "recordingEndBeat",
]);

export function sanitizePublicHooktheoryChord(rawChord) {
  if (!rawChord || typeof rawChord !== "object" || Array.isArray(rawChord)) return rawChord;
  const sanitized = {};
  for (const field of HOOKTHEORY_CHORD_PUBLIC_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(rawChord, field)) continue;
    const value = rawChord[field];
    sanitized[field] = Array.isArray(value) ? [...value] : value;
  }
  return sanitized;
}

export class HarmonicValidationError extends Error {
  constructor(issues) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "HarmonicValidationError";
    this.code = "INVALID_HOOKTHEORY_CHORD";
    this.issues = issues;
  }
}

/**
 * @typedef {{path:string, code:string, message:string, severity:"error"|"warning"}} HarmonicIssue
 * @typedef {{
 *   schemaVersion:string,
 *   chord:Object|null,
 *   key:{tonic:string, scale:string},
 *   isRest:boolean,
 *   issues:HarmonicIssue[],
 *   soundIntent:Object|null,
 *   labelIntent:Object|null,
 *   labelChord:Object|null
 * }} HarmonicAnalysis
 */

function finiteNumber(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

export function normalizeKey(key = {}) {
  return {
    tonic: String(key?.tonic || "C")
      .replace(/♭/g, "b")
      .replace(/♯/g, "#")
      .replace(/♮/g, ""),
    scale: String(key?.scale || "major"),
  };
}

export function validateHooktheoryChord(chord, key = null) {
  const issues = [];
  const add = (path, code, message, severity = "error") => {
    issues.push({ path, code, message, severity });
  };

  if (!chord || typeof chord !== "object" || Array.isArray(chord)) {
    add("chord", "not_object", "expected an object");
    return issues;
  }

  const isRest = chord.isRest === true;
  const letterAnchored = Number(chord.root) === 0 && Boolean(chord._letterRootName);
  if (!isRest && !letterAnchored && (!Number.isInteger(chord.root) || chord.root < 1 || chord.root > 7)) {
    add("root", "out_of_range", "expected an integer from 1 through 7");
  }
  if (!CHORD_TYPES.has(chord.type)) {
    add("type", "unsupported_type", "expected one of 5, 7, 9, 11, or 13");
  }
  if (!Number.isInteger(chord.inversion) || chord.inversion < 0 || chord.inversion > 3) {
    add("inversion", "out_of_range", "expected an integer from 0 through 3");
  }
  if (!Number.isInteger(chord.applied) || chord.applied < 0 || chord.applied > 7) {
    add("applied", "out_of_range", "expected an integer from 0 through 7");
  }
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(chord[field])) add(field, "not_array", "expected an array");
  }
  for (const suspension of chord.suspensions || []) {
    if (suspension !== 2 && suspension !== 4) {
      add("suspensions", "unsupported_suspension", `unsupported suspension ${suspension}`);
    }
  }
  if (Array.isArray(chord.borrowed)) {
    if (chord.borrowed.length !== 7 || chord.borrowed.some((value) => !Number.isFinite(Number(value)))) {
      add("borrowed", "invalid_custom_scale", "custom borrowed scales require seven finite offsets");
    }
  } else if (chord.borrowed != null && typeof chord.borrowed !== "string") {
    add("borrowed", "invalid_borrowed", "expected a mode name, seven-offset array, or null");
  } else if (typeof chord.borrowed === "string"
    && chord.borrowed !== ""
    && !SUPPORTED_BORROWED_MODES.has(chord.borrowed)) {
    add("borrowed", "unsupported_borrowed", `unsupported borrowed mode ${chord.borrowed}`);
  }
  if (chord.beat != null && !Number.isFinite(Number(chord.beat))) {
    add("beat", "not_finite", "expected a finite beat");
  }
  if (chord.duration != null && (!Number.isFinite(Number(chord.duration)) || Number(chord.duration) < 0)) {
    add("duration", "invalid_duration", "expected a non-negative finite duration");
  }

  if (key) {
    if (!/^[A-G](?:bb|##|b|#|x)?$/.test(String(key.tonic || ""))) {
      add("key.tonic", "invalid_tonic", "expected a spelled pitch from A through G");
    }
    if (!key.scale) add("key.scale", "missing_scale", "expected a scale name");
  }
  return issues;
}

export function normalizeHooktheoryChord(rawChord, { strict = false } = {}) {
  if (!rawChord || typeof rawChord !== "object" || Array.isArray(rawChord)) {
    const issues = validateHooktheoryChord(rawChord);
    if (strict) throw new HarmonicValidationError(issues);
    return { chord: null, issues };
  }

  const chord = {
    ...rawChord,
    root: finiteNumber(rawChord.root, rawChord.isRest ? 0 : 1),
    type: finiteNumber(rawChord.type, 5),
    inversion: finiteNumber(rawChord.inversion, 0),
    applied: finiteNumber(rawChord.applied, 0),
    isRest: rawChord.isRest === true,
  };
  for (const field of ARRAY_FIELDS) chord[field] = normalizeArray(rawChord[field]);
  if (Array.isArray(rawChord.borrowed)) chord.borrowed = [...rawChord.borrowed];
  if (rawChord.beat != null) chord.beat = finiteNumber(rawChord.beat, rawChord.beat);
  if (rawChord.duration != null) chord.duration = finiteNumber(rawChord.duration, rawChord.duration);

  const issues = validateHooktheoryChord(chord);
  if (strict && issues.some((issue) => issue.severity === "error")) {
    throw new HarmonicValidationError(issues);
  }
  return { chord, issues };
}

/**
 * The canonical boundary between raw Hooktheory JSON and all pitch/label consumers.
 * `soundIntent` follows the sounding borrowed target. `labelIntent` intentionally
 * retains Hooktheory's parent-key label convention for applied+borrowed objects.
 */
export function resolveHarmonicAnalysis(rawChord, rawKey, opts = {}) {
  const key = normalizeKey(rawKey);
  const { chord, issues: chordIssues } = normalizeHooktheoryChord(rawChord, opts);
  const keyIssues = chord
    ? validateHooktheoryChord(chord, key).filter((issue) => issue.path.startsWith("key."))
    : [];
  const issues = [...chordIssues, ...keyIssues];
  if (opts.strict && issues.some((issue) => issue.severity === "error")) {
    throw new HarmonicValidationError(issues);
  }

  if (!chord || chord.isRest) {
    return {
      schemaVersion: HARMONIC_ANALYSIS_SCHEMA_VERSION,
      chord,
      key,
      isRest: Boolean(chord?.isRest),
      issues,
      soundIntent: null,
      labelIntent: null,
      labelChord: chord,
    };
  }

  const soundIntent = resolveHarmonicIntent(chord, key, opts);
  const labelChord = chord.applied && chord.borrowed
    ? { ...chord, borrowed: null }
    : chord;
  const labelIntent = labelChord === chord
    ? soundIntent
    : resolveHarmonicIntent(labelChord, key, opts);

  return {
    schemaVersion: HARMONIC_ANALYSIS_SCHEMA_VERSION,
    chord,
    key,
    isRest: false,
    issues,
    soundIntent,
    labelIntent,
    labelChord,
  };
}
