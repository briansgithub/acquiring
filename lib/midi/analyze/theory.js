import { tonicToPc } from "./key.js";

const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function noteNameToPc(noteName) {
  const match = String(noteName || "").trim().match(/^([A-Ga-g])([#bx]*)(?:-?\d+)?$/);
  if (!match) return null;
  let pc = NATURAL_PC[match[1].toUpperCase()];
  for (const accidental of match[2]) {
    if (accidental === "#") pc += 1;
    else if (accidental === "b") pc -= 1;
    else if (accidental === "x") pc += 2;
  }
  return ((pc % 12) + 12) % 12;
}

export function noteNameToMidi(noteName) {
  const match = String(noteName || "").trim().match(/^([A-Ga-g])([#bx]*)(-?\d+)$/);
  if (!match) return null;
  const pc = noteNameToPc(`${match[1]}${match[2]}`);
  const octave = Number(match[3]);
  return Number.isFinite(octave) && pc !== null ? (octave + 1) * 12 + pc : null;
}

export function keyIdentity(key) {
  return `${key.tonic}:${key.scale}`;
}

export function keyAtTick(tick, keySignatures, fallbackKey) {
  let active = null;
  for (const signature of keySignatures) {
    if (signature.tick <= tick && (!active || signature.tick >= active.tick)) active = signature;
  }
  if (!active) return fallbackKey;
  return {
    tonic: active.tonic,
    scale: active.scale,
    tonicPc: tonicToPc(active.tonic),
  };
}

export function meterAtTick(tick, meters) {
  let active = null;
  for (const meter of meters) {
    if (meter.tick <= tick && (!active || meter.tick >= active.tick)) active = meter;
  }
  return active || { tick: 0, numerator: 4, denominator: 4, defaulted: true };
}

export function chordObject(overrides = {}) {
  return {
    root: 1,
    beat: 1,
    duration: 1,
    type: 5,
    inversion: 0,
    applied: 0,
    adds: [],
    omits: [],
    alterations: [],
    suspensions: [],
    substitutions: [],
    pedal: null,
    alternate: "",
    borrowed: null,
    isRest: false,
    recordingEndBeat: null,
    ...overrides,
  };
}

export function cloneChordObject(chord, timing = {}) {
  return chordObject({
    ...chord,
    adds: [...(chord.adds || [])],
    omits: [...(chord.omits || [])],
    alterations: [...(chord.alterations || [])],
    suspensions: [...(chord.suspensions || [])],
    substitutions: [...(chord.substitutions || [])],
    borrowed: Array.isArray(chord.borrowed) ? [...chord.borrowed] : chord.borrowed,
    ...timing,
  });
}
