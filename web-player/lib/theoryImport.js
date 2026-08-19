import {
  normalizeHooktheoryChord,
  normalizeKey,
  resolveHarmonicAnalysis,
  sanitizePublicHooktheoryChord,
} from "./harmonicContract.js";
import { sdToToneJSNoteName } from "./music.js";

export const PLAYABLE_SONG_SCHEMA_VERSION = "diatonic-ring.playable-song.v1";

const MAX_ISSUES = 50;
const MAX_ISSUE_PATH_LENGTH = 512;
const MAX_ISSUE_CODE_LENGTH = 80;
const MAX_ISSUE_MESSAGE_LENGTH = 512;
const MAX_SECTIONS = 10_000;
const MAX_UNWRAP_DEPTH = 12;
const MODIFIER_FIELDS = ["adds", "omits", "alterations", "suspensions", "substitutions"];
const KEY_SCALES = new Set([
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
  "harmonicMinor",
  "phrygianDominant",
]);
const DOCUMENT_METADATA_KEYS = new Set([
  "artist",
  "author",
  "metadata",
  "name",
  "schemaVersion",
  "song",
  "songInfo",
  "source",
  "title",
  "version",
]);

function boundedText(value, maximum) {
  const text = String(value);
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function issue(path, code, message) {
  return {
    path: boundedText(path, MAX_ISSUE_PATH_LENGTH),
    code: boundedText(code, MAX_ISSUE_CODE_LENGTH),
    message: boundedText(message, MAX_ISSUE_MESSAGE_LENGTH),
  };
}

class BoundedIssueList extends Array {
  static get [Symbol.species]() {
    return Array;
  }

  constructor() {
    super();
    this.totalCount = 0;
    this.truncated = false;
  }

  push(...entries) {
    this.totalCount += entries.length;
    const available = Math.max(0, MAX_ISSUES - this.length);
    if (available) super.push(...entries.slice(0, available));
    if (entries.length > available) this.truncated = true;
    return this.length;
  }
}

function errorMessage(issues) {
  const first = issues[0];
  return first ? `${first.path}: ${first.message}` : "Theory data is invalid";
}

export class TheoryImportError extends Error {
  constructor(issues, message = null) {
    const allIssues = Array.isArray(issues) && issues.length
      ? issues
      : [issue("$", "invalid_document", "expected Hooktheory-compatible theory data")];
    const bounded = allIssues.slice(0, MAX_ISSUES);
    super(message || errorMessage(bounded));
    this.name = "TheoryImportError";
    this.code = "INVALID_THEORY_DOCUMENT";
    this.statusCode = 422;
    this.issues = bounded;
    const issueCount = Number.isInteger(allIssues.totalCount) ? allIssues.totalCount : allIssues.length;
    this.details = {
      issues: bounded,
      issueCount,
      truncated: Boolean(allIssues.truncated) || issueCount > bounded.length,
    };
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function propertyPath(base, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

function isSectionLike(value) {
  return isRecord(value) && (hasOwn(value, "chords") || hasOwn(value, "notes"));
}

function normalizeAccidentals(value) {
  return String(value)
    .trim()
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/♮/g, "");
}

function displayString(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return result || null;
}

function fileStem(fileName) {
  const base = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .at(-1) || "";
  return base.replace(/\.[^.]+$/, "") || null;
}

function firstDisplay(...values) {
  for (const value of values) {
    const result = displayString(value);
    if (result) return result;
  }
  return null;
}

function mergeContext(parent, wrapper, mapKey = null) {
  if (!isRecord(wrapper)) return { ...parent, mapKey: mapKey ?? parent.mapKey };
  return {
    ...parent,
    title: firstDisplay(wrapper.title, wrapper.song, wrapper.songInfo, parent.title),
    artist: firstDisplay(wrapper.artist, wrapper.author, parent.artist),
    sectionName: firstDisplay(
      wrapper.sectionName,
      wrapper.section,
      wrapper.name,
      mapKey,
      parent.sectionName,
    ),
    songId: wrapper.songId ?? wrapper.ID ?? parent.songId,
    numericId: wrapper.numericId ?? wrapper.ID ?? parent.numericId,
    songInfo: firstDisplay(wrapper.songInfo, wrapper.song, wrapper.title, parent.songInfo),
    sectionIndex: hasOwn(wrapper, "sectionIndex") ? wrapper.sectionIndex : parent.sectionIndex,
    mapKey: mapKey ?? parent.mapKey,
  };
}

function wrapperField(value) {
  for (const field of ["hooktheory", "json", "bestPath", "jsonData"]) {
    if (hasOwn(value, field)) return field;
  }
  return null;
}

function plausibleSectionEntry(value) {
  return isSectionLike(value)
    || (isRecord(value) && Boolean(wrapperField(value)))
    || (isRecord(value) && (Array.isArray(value.sections) || isRecord(value.sections)));
}

function parseEmbedded(value, path, issues) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    issues.push(issue(path, "invalid_json", `could not parse embedded JSON: ${error.message}`));
    return null;
  }
}

function collectSections(value, path, context, candidates, issues, depth = 0) {
  if (depth > MAX_UNWRAP_DEPTH) {
    issues.push(issue(path, "wrapper_depth_exceeded", `wrapper nesting exceeds ${MAX_UNWRAP_DEPTH}`));
    return;
  }
  if (candidates.length >= MAX_SECTIONS) {
    issues.push(issue(path, "too_many_sections", `documents may contain at most ${MAX_SECTIONS} sections`));
    return;
  }

  if (isSectionLike(value)) {
    candidates.push({ section: value, path, context: mergeContext(context, value) });
    return;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      issues.push(issue(path, "empty_sections", "expected at least one section"));
      return;
    }
    value.forEach((entry, index) => {
      collectSections(entry, `${path}[${index}]`, context, candidates, issues, depth + 1);
    });
    return;
  }

  if (!isRecord(value)) {
    issues.push(issue(path, "invalid_section", "expected a section object"));
    return;
  }

  const nextContext = mergeContext(context, value);
  const field = wrapperField(value);
  if (field) {
    const embedded = parseEmbedded(value[field], `${path}.${field}`, issues);
    if (embedded !== null) {
      collectSections(embedded, `${path}.${field}`, nextContext, candidates, issues, depth + 1);
    }
    return;
  }

  if (hasOwn(value, "sections")) {
    const sections = value.sections;
    if (Array.isArray(sections)) {
      if (!sections.length) issues.push(issue(`${path}.sections`, "empty_sections", "expected at least one section"));
      sections.forEach((entry, index) => {
        collectSections(entry, `${path}.sections[${index}]`, nextContext, candidates, issues, depth + 1);
      });
      return;
    }
    if (isRecord(sections)) {
      const entries = Object.entries(sections);
      if (!entries.length) issues.push(issue(`${path}.sections`, "empty_sections", "expected at least one section"));
      entries.forEach(([key, entry]) => {
        collectSections(
          entry,
          `${path}.sections[${JSON.stringify(key)}]`,
          mergeContext(nextContext, entry, key),
          candidates,
          issues,
          depth + 1,
        );
      });
      return;
    }
    issues.push(issue(`${path}.sections`, "invalid_sections", "expected an array or object map"));
    return;
  }

  const mapEntries = Object.entries(value).filter(([key]) => !DOCUMENT_METADATA_KEYS.has(key));
  if (mapEntries.some(([, entry]) => plausibleSectionEntry(entry))) {
    mapEntries.forEach(([key, entry]) => {
      collectSections(
        entry,
        `${path}[${JSON.stringify(key)}]`,
        mergeContext(nextContext, entry, key),
        candidates,
        issues,
        depth + 1,
      );
    });
    return;
  }

  issues.push(issue(path, "unrecognized_document", "no Hooktheory-compatible sections were found"));
}

function finiteNumber(value, path, issues, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    const kind = integer ? "integer" : "finite number";
    issues.push(issue(path, "invalid_number", `expected a ${kind} from ${min} through ${max}`));
    return null;
  }
  return number;
}

function normalizedBeat(value, path, issues, warnings, fallback = null) {
  if ((value === undefined || value === null || value === "") && fallback !== null) return fallback;
  const beat = finiteNumber(value, path, issues, { min: 0 });
  if (beat === null) return null;
  if (beat === 0) {
    warnings.push({
      path,
      code: "BEAT_ZERO_NORMALIZED",
      message: "Beat 0 was normalized to the one-based player beat 1.",
    });
    return 1;
  }
  return beat;
}

function normalizeScale(value) {
  const text = String(value || "major").trim();
  const compact = text.replace(/[\s_-]+/g, "").toLowerCase();
  const aliases = {
    major: "major",
    minor: "minor",
    dorian: "dorian",
    phrygian: "phrygian",
    lydian: "lydian",
    mixolydian: "mixolydian",
    locrian: "locrian",
    harmonicminor: "harmonicMinor",
    phrygiandominant: "phrygianDominant",
  };
  return aliases[compact] || text;
}

function normalizeKeyEvents(raw, path, issues, warnings) {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
    warnings.push({ path, code: "DEFAULT_KEY", message: "No key was supplied; C major was used." });
    return [{ tonic: "C", scale: "major", beat: 1 }];
  }
  if (!Array.isArray(raw)) {
    issues.push(issue(path, "invalid_keys", "expected an array"));
    return [];
  }
  return raw.map((entry, index) => {
    const eventPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issue(eventPath, "invalid_key", "expected an object"));
      return null;
    }
    const normalized = normalizeKey({
      tonic: normalizeAccidentals(entry.tonic ?? entry.key ?? "C"),
      scale: normalizeScale(entry.scale ?? entry.mode ?? "major"),
    });
    if (!/^[A-G](?:bb|##|b|#|x)?$/.test(normalized.tonic)) {
      issues.push(issue(`${eventPath}.tonic`, "invalid_tonic", "expected a spelled pitch from A through G"));
    }
    if (!KEY_SCALES.has(normalized.scale)) {
      issues.push(issue(`${eventPath}.scale`, "unsupported_scale", `unsupported scale ${normalized.scale}`));
    }
    const beat = normalizedBeat(entry.beat, `${eventPath}.beat`, issues, warnings, 1);
    return beat === null ? null : { tonic: normalized.tonic, scale: normalized.scale, beat };
  }).filter(Boolean).sort((a, b) => a.beat - b.beat);
}

function normalizeTempoEvents(raw, path, issues, warnings) {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
    warnings.push({ path, code: "DEFAULT_TEMPO", message: "No tempo was supplied; 120 BPM was used." });
    return [{ bpm: 120, beat: 1 }];
  }
  if (!Array.isArray(raw)) {
    issues.push(issue(path, "invalid_tempos", "expected an array"));
    return [];
  }
  return raw.map((entry, index) => {
    const eventPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issue(eventPath, "invalid_tempo", "expected an object"));
      return null;
    }
    const bpm = finiteNumber(entry.bpm, `${eventPath}.bpm`, issues, { min: Number.MIN_VALUE, max: 1000 });
    const beat = normalizedBeat(entry.beat, `${eventPath}.beat`, issues, warnings, 1);
    return bpm === null || beat === null ? null : { bpm, beat };
  }).filter(Boolean).sort((a, b) => a.beat - b.beat);
}

function meterParts(entry) {
  if (typeof entry === "string") {
    const match = entry.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    return match ? { numerator: Number(match[1]), denominator: Number(match[2]), beat: 1 } : null;
  }
  if (Array.isArray(entry) && entry.length >= 2) {
    return { numerator: entry[0], denominator: entry[1], beat: entry[2] ?? 1 };
  }
  if (!isRecord(entry)) return null;
  if (typeof entry.signature === "string") {
    const parsed = meterParts(entry.signature);
    return parsed ? { ...parsed, beat: entry.beat ?? parsed.beat } : null;
  }
  const signature = Array.isArray(entry.timeSignature)
    ? entry.timeSignature
    : Array.isArray(entry.signature) ? entry.signature : [];
  const numerator = entry.numBeats ?? entry.numerator ?? signature[0];
  const explicitBeatUnit = entry.beatUnit;
  const denominator = entry.denominator ?? signature[1]
    ?? (explicitBeatUnit !== undefined && Number(explicitBeatUnit) !== 0 ? 4 / Number(explicitBeatUnit) : undefined);
  return { numerator, denominator, beatUnit: explicitBeatUnit, beat: entry.beat ?? 1 };
}

function normalizeMeterEvents(raw, path, issues, warnings) {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
    warnings.push({ path, code: "DEFAULT_METER", message: "No meter was supplied; 4/4 was used." });
    return [{ numBeats: 4, beatUnit: 1, beat: 1 }];
  }
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.map((entry, index) => {
    const eventPath = `${path}[${index}]`;
    const parts = meterParts(entry);
    if (!parts) {
      issues.push(issue(eventPath, "invalid_meter", "expected a meter object, pair, or signature such as 4/4"));
      return null;
    }
    const numerator = finiteNumber(parts.numerator, `${eventPath}.numBeats`, issues, {
      min: 1,
      max: 255,
      integer: true,
    });
    const denominator = finiteNumber(parts.denominator, `${eventPath}.denominator`, issues, {
      min: 1,
      max: 1024,
      integer: true,
    });
    const beat = normalizedBeat(parts.beat, `${eventPath}.beat`, issues, warnings, 1);
    if (numerator === null || denominator === null || beat === null) return null;
    if ((denominator & (denominator - 1)) !== 0) {
      issues.push(issue(`${eventPath}.denominator`, "invalid_meter_denominator", "expected a power of two"));
      return null;
    }
    const beatUnit = parts.beatUnit === undefined
      ? 4 / denominator
      : finiteNumber(parts.beatUnit, `${eventPath}.beatUnit`, issues, { min: Number.MIN_VALUE });
    return beatUnit === null ? null : { numBeats: numerator, beatUnit, beat };
  }).filter(Boolean).sort((a, b) => a.beat - b.beat);
}

function normalizeModifier(value, path, issues) {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return value;
  if (typeof value !== "string") {
    issues.push(issue(path, "invalid_modifier", "expected an integer or scale-degree modifier"));
    return null;
  }
  const normalized = normalizeAccidentals(value);
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (/^[#b]+\d+$/.test(normalized)) return normalized;
  issues.push(issue(path, "invalid_modifier", "expected a value such as 6, b5, or #9"));
  return null;
}

function activeKeyAtBeat(keys, beat) {
  let active = keys[0] || { tonic: "C", scale: "major", beat: 1 };
  for (const key of keys) {
    if (key.beat <= beat) active = key;
    else break;
  }
  return { tonic: active.tonic, scale: active.scale };
}

function normalizeChord(raw, path, keys, issues, warnings) {
  if (!isRecord(raw)) {
    issues.push(issue(path, "invalid_chord", "expected an object"));
    return null;
  }
  const chordIssueStart = issues.length;
  const publicRaw = sanitizePublicHooktheoryChord(raw);
  if (publicRaw.isRest !== true) {
    for (const field of ["root", "type", "inversion", "applied"]) {
      if (!hasOwn(publicRaw, field) || publicRaw[field] === null
        || publicRaw[field] === undefined || publicRaw[field] === "") {
        issues.push(issue(`${path}.${field}`, "missing_field", `non-rest chords require ${field}`));
      }
    }
  }
  for (const field of MODIFIER_FIELDS) {
    if (publicRaw[field] === undefined) continue;
    if (!Array.isArray(publicRaw[field])) {
      issues.push(issue(`${path}.${field}`, "invalid_modifiers", "expected an array"));
      continue;
    }
    publicRaw[field] = publicRaw[field]
      .map((value, index) => normalizeModifier(value, `${path}.${field}[${index}]`, issues))
      .filter((value) => value !== null);
  }
  if (typeof publicRaw.borrowed === "string") publicRaw.borrowed = publicRaw.borrowed.trim();
  if (Array.isArray(publicRaw.borrowed)) {
    publicRaw.borrowed = publicRaw.borrowed.map((value) => Number(value));
  }
  const beat = normalizedBeat(publicRaw.beat, `${path}.beat`, issues, warnings);
  const duration = finiteNumber(publicRaw.duration, `${path}.duration`, issues, { min: Number.MIN_VALUE });
  publicRaw.beat = beat;
  publicRaw.duration = duration;

  const normalized = normalizeHooktheoryChord(publicRaw);
  for (const harmonicIssue of normalized.issues) {
    issues.push(issue(`${path}.${harmonicIssue.path}`, harmonicIssue.code, harmonicIssue.message));
  }
  if (!normalized.chord || beat === null || duration === null || issues.length > chordIssueStart) return null;

  if (normalized.chord.recordingEndBeat != null) {
    const recordingEndBeat = finiteNumber(
      normalized.chord.recordingEndBeat,
      `${path}.recordingEndBeat`,
      issues,
      { min: 0 },
    );
    if (recordingEndBeat !== null) normalized.chord.recordingEndBeat = recordingEndBeat === 0 ? 1 : recordingEndBeat;
  }
  const activeKey = activeKeyAtBeat(keys, beat);
  try {
    resolveHarmonicAnalysis(normalized.chord, activeKey, { strict: true });
  } catch (error) {
    if (Array.isArray(error?.issues)) {
      for (const harmonicIssue of error.issues) {
        issues.push(issue(`${path}.${harmonicIssue.path}`, harmonicIssue.code, harmonicIssue.message));
      }
    } else {
      issues.push(issue(path, "unplayable_chord", error.message || "the chord could not be decoded"));
    }
    return null;
  }
  return normalized.chord;
}

function selectedMelodyLane(notes, metadata, path, issues, warnings) {
  if (notes === undefined || notes === null) return { notes: [], path };
  if (Array.isArray(notes)) return { notes, path };
  if (!isRecord(notes)) {
    issues.push(issue(path, "invalid_notes", "expected an array or melody-lane object"));
    return { notes: [], path };
  }
  const lanes = Object.keys(notes).filter((key) => Array.isArray(notes[key]));
  if (!lanes.length) {
    issues.push(issue(path, "invalid_notes", "melody-lane object contains no array lanes"));
    return { notes: [], path };
  }
  const activeIndex = Number(metadata?.activeMelodyIndex);
  const preferred = Number.isInteger(activeIndex) && activeIndex >= 0
    ? [`melody${activeIndex + 1}`, String(activeIndex), `melody${activeIndex}`]
    : [];
  preferred.push("melody1");
  const naturalLanes = [...lanes].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const selected = [...new Set([...preferred, ...naturalLanes])].find((key) => lanes.includes(key));
  const omitted = lanes.filter((key) => key !== selected);
  if (omitted.length) {
    warnings.push({
      path,
      code: "MELODY_LANES_OMITTED",
      message: `Melody lane ${selected} was selected; ${omitted.join(", ")} ${omitted.length === 1 ? "was" : "were"} not displayed.`,
      selectedLane: selected,
      omittedLanes: omitted,
    });
  }
  return { notes: notes[selected], path: propertyPath(path, selected) };
}

function normalizeNote(raw, path, keys, issues, warnings) {
  if (!isRecord(raw)) {
    issues.push(issue(path, "invalid_note", "expected an object"));
    return null;
  }
  const isRest = raw.isRest === true || String(raw.sd || "").trim().toLowerCase() === "rest";
  const beat = normalizedBeat(raw.beat, `${path}.beat`, issues, warnings);
  const duration = finiteNumber(raw.duration, `${path}.duration`, issues, { min: Number.MIN_VALUE });
  const octave = finiteNumber(raw.octave ?? 0, `${path}.octave`, issues, { integer: true });
  let sd = isRest ? "rest" : normalizeAccidentals(raw.sd ?? "");
  if (!isRest && !/^[#b]*[1-7]$/.test(sd)) {
    issues.push(issue(`${path}.sd`, "invalid_scale_degree", "expected scale degree 1 through 7 with optional leading accidentals"));
  }
  if (beat === null || duration === null || octave === null || (!isRest && !/^[#b]*[1-7]$/.test(sd))) {
    return null;
  }
  if (!isRest) {
    try {
      sdToToneJSNoteName(sd, octave, activeKeyAtBeat(keys, beat), 4);
    } catch (error) {
      issues.push(issue(`${path}.sd`, "unplayable_note", error.message || "the scale degree could not be decoded"));
      return null;
    }
  }
  return { sd, octave, beat, duration, isRest };
}

function sourceField(primary, fallback, field, sectionPath) {
  if (isRecord(primary) && hasOwn(primary, field)) {
    return { value: primary[field], path: `${sectionPath}.metadata.${field}` };
  }
  if (isRecord(fallback) && hasOwn(fallback, field)) {
    return { value: fallback[field], path: `${sectionPath}.${field}` };
  }
  return { value: undefined, path: `${sectionPath}.metadata.${field}` };
}

function explicitSectionIndex(candidate) {
  const raw = hasOwn(candidate.section, "sectionIndex")
    ? candidate.section.sectionIndex
    : candidate.context.sectionIndex;
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function orderCandidates(candidates) {
  const indexed = candidates.map((candidate, encounterIndex) => ({
    candidate,
    encounterIndex,
    explicitIndex: explicitSectionIndex(candidate),
  }));
  const hasExplicitIndices = indexed.some(({ explicitIndex }) => explicitIndex !== null);
  if (hasExplicitIndices) {
    indexed.sort((left, right) => {
      if (left.explicitIndex !== null && right.explicitIndex !== null) {
        return left.explicitIndex - right.explicitIndex || left.encounterIndex - right.encounterIndex;
      }
      if (left.explicitIndex !== null) return -1;
      if (right.explicitIndex !== null) return 1;
      return left.encounterIndex - right.encounterIndex;
    });
  }
  let nextFallbackIndex = hasExplicitIndices
    ? Math.max(...indexed.map(({ explicitIndex }) => explicitIndex ?? -1)) + 1
    : 0;
  return indexed.map((entry) => ({
    candidate: entry.candidate,
    sectionIndex: entry.explicitIndex ?? nextFallbackIndex++,
  }));
}

function normalizeSection(candidate, sectionIndex, displayIndex, issues, warnings) {
  const raw = candidate.section;
  const path = candidate.path;
  const metadata = raw.metadata === undefined || raw.metadata === null ? {} : raw.metadata;
  if (!isRecord(metadata)) {
    issues.push(issue(`${path}.metadata`, "invalid_metadata", "expected an object"));
  }
  const safeMetadata = isRecord(metadata) ? metadata : {};
  const keySource = sourceField(safeMetadata, raw, "keys", path);
  const tempoSource = sourceField(safeMetadata, raw, "tempos", path);
  const meterSource = sourceField(safeMetadata, raw, "meters", path);
  const keys = normalizeKeyEvents(keySource.value, keySource.path, issues, warnings);
  const tempos = normalizeTempoEvents(tempoSource.value, tempoSource.path, issues, warnings);
  const meters = normalizeMeterEvents(meterSource.value, meterSource.path, issues, warnings);

  const rawChords = raw.chords === undefined || raw.chords === null ? [] : raw.chords;
  if (!Array.isArray(rawChords)) issues.push(issue(`${path}.chords`, "invalid_chords", "expected an array"));
  const chords = Array.isArray(rawChords)
    ? rawChords.map((chord, index) => normalizeChord(chord, `${path}.chords[${index}]`, keys, issues, warnings)).filter(Boolean)
    : [];

  const lane = selectedMelodyLane(raw.notes, safeMetadata, `${path}.notes`, issues, warnings);
  const notes = lane.notes
    .map((note, index) => normalizeNote(note, `${lane.path}[${index}]`, keys, issues, warnings))
    .filter(Boolean);
  if (rawChords.length === 0 && lane.notes.length === 0) {
    issues.push(issue(path, "empty_section", "a section must contain at least one chord or melody note"));
  }

  const eventEnds = [...chords, ...notes].map((event) => event.beat + event.duration);
  const endBeatSource = sourceField(safeMetadata, raw, "endBeat", path);
  const suppliedEndBeat = endBeatSource.value;
  let normalizedEndBeat = null;
  if (suppliedEndBeat !== undefined && suppliedEndBeat !== null && suppliedEndBeat !== "") {
    normalizedEndBeat = finiteNumber(suppliedEndBeat, endBeatSource.path, issues, { min: 1 });
  }
  const derivedEndBeat = eventEnds.length ? Math.max(...eventEnds) : 1;
  const endBeat = Math.max(normalizedEndBeat ?? 1, derivedEndBeat);

  const sectionName = firstDisplay(raw.sectionName, raw.name, candidate.context.sectionName)
    || `Section ${displayIndex + 1}`;
  const inlineData = {
    sectionName,
    sectionIndex,
    songInfo: firstDisplay(raw.songInfo, candidate.context.songInfo, candidate.context.title),
    chords,
    notes,
    metadata: { keys, tempos, meters, endBeat },
  };
  const songId = raw.songId ?? candidate.context.songId;
  const numericId = raw.numericId ?? candidate.context.numericId;
  if (["string", "number"].includes(typeof songId) || songId === null) inlineData.songId = songId;
  if (["string", "number"].includes(typeof numericId) || numericId === null) inlineData.numericId = numericId;
  return { sectionName, sectionIndex, inlineData };
}

/**
 * Convert recognized Hooktheory-compatible documents to the web player's
 * deliberately small inline-section contract. The source value is never mutated.
 */
export function normalizeTheoryDocument(value, { fileName, sourceKind = "theory" } = {}) {
  const candidates = [];
  const issues = new BoundedIssueList();
  const warnings = [];
  const rootContext = mergeContext({}, isRecord(value) ? value : {});
  collectSections(value, "$", rootContext, candidates, issues);

  const sections = orderCandidates(candidates).map(({ candidate, sectionIndex }, displayIndex) => (
    normalizeSection(candidate, sectionIndex, displayIndex, issues, warnings)
  ));
  if (!sections.length && !issues.length) {
    issues.push(issue("$", "empty_document", "expected at least one section"));
  }
  if (issues.length) throw new TheoryImportError(issues);

  const firstContext = candidates[0]?.context || {};
  const firstSection = sections[0]?.inlineData || {};
  const sourceFilename = isRecord(value) ? displayString(value.source?.filename) : null;
  const contextTitle = sourceFilename && firstContext.title === sourceFilename
    ? fileStem(sourceFilename)
    : firstContext.title;
  const sectionSongInfo = sourceFilename && firstSection.songInfo === sourceFilename
    ? fileStem(sourceFilename)
    : firstSection.songInfo;
  const title = firstDisplay(
    rootContext.title,
    contextTitle,
    sectionSongInfo,
    fileStem(sourceFilename),
    fileStem(fileName),
  ) || "Untitled";
  const artist = firstDisplay(rootContext.artist, firstContext.artist)
    || (String(sourceKind).toLowerCase() === "midi" ? "Local MIDI" : "Local Theory");

  return {
    schemaVersion: PLAYABLE_SONG_SCHEMA_VERSION,
    title,
    artist,
    sections,
    warnings,
  };
}
