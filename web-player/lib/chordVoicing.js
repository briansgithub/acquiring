/**
 * chordVoicing.js — Hooktheory-style voicing layout and pitch-ascending note order.
 */
import { shiftNoteBySemitones } from "./chordNoteUtils.js";

const TONE_PC_SPELL = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function noteToMidi(noteName) {
  const m = String(noteName).match(/^([A-G])([#bx]*|b*)(\d+)$/);
  if (!m) return 0;
  const basePc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  if (basePc == null) return 0;
  let total = (parseInt(m[3], 10) + 1) * 12 + basePc;
  for (const ch of m[2]) {
    if (ch === "#") total += 1;
    else if (ch === "x") total += 2;
    else if (ch === "b") total -= 1;
  }
  return total;
}

/** Map MIDI back to a Tone.js-friendly name (no double-sharps etc). */
export function midiToToneNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  return `${TONE_PC_SPELL[pc]}${octave}`;
}

export function normalizeToneNotes(notes) {
  return notes.map((n) => midiToToneNote(noteToMidi(n)));
}

export function sortVoicingByPitch(toneJSNames, degreeIndices) {
  const paired = toneJSNames.map((n, i) => ({ n, d: degreeIndices[i] ?? 0 }));
  paired.sort((a, b) => noteToMidi(a.n) - noteToMidi(b.n));
  return [paired.map((p) => p.n), paired.map((p) => p.d)];
}

/** Lift dim7 3rd/5th when still in the root's octave (Hooktheory spread voicing). */
function spreadDim7Voicing(toneJSNames, degreeIndices) {
  if (toneJSNames.length < 4) return [toneJSNames, degreeIndices];
  const names = [...toneJSNames];
  const degrees = [...degreeIndices];
  const rootOct = (names[0].match(/(\d+)$/) || [])[1];
  if (!rootOct) return sortVoicingByPitch(names, degrees);
  for (const idx of [1, 2]) {
    const oct = (names[idx].match(/(\d+)$/) || [])[1];
    if (oct === rootOct) names[idx] = shiftNoteBySemitones(names[idx], 12);
  }
  return sortVoicingByPitch(names, degrees);
}

/**
 * @param {object} opts
 * @param {boolean} [opts.fullyDiminished] applied vii°7
 * @param {boolean} [opts.triadDiminished] natural/harmonic dim 7th
 * @param {number} [opts.inversion]
 * @param {number} [opts.chordType]
 */
export function finalizeVoicing(toneJSNames, degreeIndices, opts = {}) {
  const { fullyDiminished, triadDiminished, inversion = 0, chordType = 5 } = opts;
  if (inversion !== 0) return [toneJSNames, degreeIndices];
  if (chordType >= 7 && (fullyDiminished || triadDiminished) && toneJSNames.length >= 4) {
    return spreadDim7Voicing(toneJSNames, degreeIndices);
  }
  if (inversion === 0 && toneJSNames.length > 1) {
    return sortVoicingByPitch(toneJSNames, degreeIndices);
  }
  return [toneJSNames, degreeIndices];
}
