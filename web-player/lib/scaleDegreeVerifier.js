/**
 * Independent scale-degree label verifier for chordInterpreter output.
 *
 * Checks that each chord-tone pill label (e.g. "6", "#1", "b7") matches the
 * pitch class of the paired note in the song key — without reusing calculateScaleDegrees.
 */

import { getNoteLabel, chordInterpreter } from "./music.js";
import { noteNameToPc, shiftNoteBySemitones } from "./chordNoteUtils.js";

/** @typedef {{ ok: boolean, failures: VerifyFailure[], warnings: VerifyWarning[] }} VerifyResult */
/** @typedef {{ index: number, note: string, label: string, reason: string, expectedPc?: number, actualPc?: number }} VerifyFailure */
/** @typedef {{ index: number, note: string, label: string, reason: string }} VerifyWarning */

const DEGREE_LABEL_RE = /^([#b]+)?(\d+)$/;

/**
 * Parse a scale-degree pill string into accidental offset and degree number (1–7).
 * @param {string} label
 * @returns {{ modifier: string, degree: number, semitoneOffset: number }}
 */
export function parseDegreeLabel(label) {
  const s = String(label ?? "").trim();
  const m = s.match(DEGREE_LABEL_RE);
  if (!m) {
    return { modifier: "", degree: 1, semitoneOffset: 0 };
  }
  const modifier = m[1] || "";
  let semitoneOffset = 0;
  for (const ch of modifier) {
    if (ch === "#") semitoneOffset += 1;
    else if (ch === "b") semitoneOffset -= 1;
  }
  return { modifier, degree: parseInt(m[2], 10), semitoneOffset };
}

/**
 * Pitch class (0–11) implied by a degree label in a given key.
 * @param {string} label
 * @param {{ tonic: string, scale: string }} key
 * @returns {number|null}
 */
export function pitchClassForDegreeLabel(label, key) {
  const { degree, semitoneOffset } = parseDegreeLabel(label);
  if (degree < 1 || degree > 7) return null;
  const diatonic = getNoteLabel(degree, key);
  if (!diatonic) return null;
  const spelled = shiftNoteBySemitones(`${diatonic}4`, semitoneOffset);
  return noteNameToPc(spelled);
}

/**
 * Verify chordInterpreter-style output: parallel notes[] and chordDegrees[] in a key.
 * @param {{ key: object, notes: string[], chordDegrees: string[] }} input
 * @returns {VerifyResult}
 */
export function verifyScaleDegrees({ key, notes, chordDegrees }) {
  const failures = [];
  const warnings = [];

  if (!key?.tonic || !key?.scale) {
    failures.push({
      index: -1,
      note: "",
      label: "",
      reason: "missing or invalid key (need tonic + scale)",
    });
    return { ok: false, failures, warnings };
  }

  const noteList = Array.isArray(notes) ? notes : [];
  const degreeList = Array.isArray(chordDegrees) ? chordDegrees : [];

  if (noteList.length !== degreeList.length) {
    failures.push({
      index: -1,
      note: noteList.join(", "),
      label: degreeList.join(", "),
      reason: `notes length (${noteList.length}) !== chordDegrees length (${degreeList.length})`,
    });
  }

  const len = Math.min(noteList.length, degreeList.length);
  const labelByPc = new Map();

  for (let i = 0; i < len; i++) {
    const note = noteList[i];
    const label = degreeList[i];
    const actualPc = noteNameToPc(note);
    const expectedPc = pitchClassForDegreeLabel(label, key);

    if (actualPc == null) {
      failures.push({ index: i, note, label, reason: "unparseable note name" });
      continue;
    }
    if (expectedPc == null) {
      failures.push({ index: i, note, label, reason: "unparseable degree label" });
      continue;
    }
    if (actualPc !== expectedPc) {
      failures.push({
        index: i,
        note,
        label,
        reason: `pitch class mismatch (note PC ${actualPc}, label implies PC ${expectedPc})`,
        expectedPc,
        actualPc,
      });
    }

    const prev = labelByPc.get(label);
    if (prev != null && prev !== actualPc) {
      warnings.push({
        index: i,
        note,
        label,
        reason: `duplicate label "${label}" used for different pitch classes (${prev} vs ${actualPc})`,
      });
    } else {
      labelByPc.set(label, actualPc);
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}

/**
 * Run chordInterpreter then verify scale-degree pills for the result.
 * @param {object} chord Hooktheory chord JSON
 * @param {{ tonic: string, scale: string }} key
 * @param {object} [opts] chordInterpreter options
 * @returns {{ interpreter: object, verification: VerifyResult }}
 */
export function verifyInterpretedChord(chord, key, opts = {}) {
  const interpreter = chordInterpreter(chord, key, opts);
  const verification = verifyScaleDegrees({
    key,
    notes: interpreter.notes,
    chordDegrees: interpreter.chordDegrees,
  });
  return { interpreter, verification };
}

/**
 * Format a verification result for console or reports.
 * @param {VerifyResult} result
 * @param {{ caseId?: string }} [meta]
 */
export function formatVerifyReport(result, meta = {}) {
  const lines = [];
  const prefix = meta.caseId ? `[${meta.caseId}] ` : "";
  if (result.ok) {
    lines.push(`${prefix}OK`);
  } else {
    lines.push(`${prefix}FAIL (${result.failures.length} error(s))`);
    for (const f of result.failures) {
      const at = f.index >= 0 ? `tone[${f.index}]` : "chord";
      lines.push(`  ${at} ${f.note} / "${f.label}": ${f.reason}`);
    }
  }
  for (const w of result.warnings) {
    lines.push(`  WARN tone[${w.index}] ${w.note} / "${w.label}": ${w.reason}`);
  }
  return lines.join("\n");
}
