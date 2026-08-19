export const PPQ = 192;

const NOTE_BASE_PC = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

const SHARP_NAMES = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]);

const FLAT_NAMES = Object.freeze([
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
]);

const NEUTRAL_NAMES = Object.freeze([
  "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
]);

export const MIDI_KEY_SIGNATURE_KEYS = Object.freeze([
  "Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C",
  "G", "D", "A", "E", "B", "F#", "C#",
]);

const MODE_FIFTH_OFFSETS = Object.freeze({
  major: 0,
  ionian: 0,
  dorian: -2,
  phrygian: -4,
  lydian: 1,
  mixolydian: -1,
  minor: -3,
  aeolian: -3,
  locrian: -5,
  harmonicMinor: -3,
  phrygianDominant: -4,
});

const MODE_PARENT_MAJOR_INTERVALS = Object.freeze({
  major: 0,
  ionian: 0,
  dorian: 2,
  phrygian: 4,
  lydian: 5,
  mixolydian: 7,
  minor: 9,
  aeolian: 9,
  locrian: 11,
  harmonicMinor: 9,
  phrygianDominant: 4,
});

const BASE_MAJOR_FIFTHS = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: -1,
  G: 1,
  A: 3,
  B: 5,
});

export function normalizeTonic(tonic = "C") {
  return String(tonic)
    .trim()
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/♮/g, "");
}

function accidentalOffset(accidentals) {
  let offset = 0;
  for (const accidental of accidentals) {
    if (accidental === "#") offset += 1;
    else if (accidental === "x") offset += 2;
    else if (accidental === "b") offset -= 1;
  }
  return offset;
}

export function noteNameToPitchClass(noteName) {
  const normalized = normalizeTonic(noteName);
  const match = normalized.match(/^([A-Ga-g])([#bx]*)$/);
  if (!match) {
    throw new TypeError(`Invalid pitch name: ${JSON.stringify(noteName)}`);
  }
  const pitchClass = NOTE_BASE_PC[match[1].toUpperCase()] + accidentalOffset(match[2]);
  return ((pitchClass % 12) + 12) % 12;
}

export function noteNameToMidi(noteName) {
  const normalized = normalizeTonic(noteName);
  const match = normalized.match(/^([A-Ga-g])([#bx]*)(-?\d+)$/);
  if (!match) {
    throw new TypeError(`Invalid note name with octave: ${JSON.stringify(noteName)}`);
  }
  const pitchClass = NOTE_BASE_PC[match[1].toUpperCase()] + accidentalOffset(match[2]);
  const midi = pitchClass + (12 * (Number(match[3]) + 1));
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError(`Note ${noteName} is outside MIDI's 0..127 pitch range`);
  }
  return midi;
}

export function transposeTonic(tonic, semitones) {
  if (!Number.isInteger(semitones)) {
    throw new TypeError("transpose semitones must be an integer");
  }
  const normalized = normalizeTonic(tonic);
  const pitchClass = (noteNameToPitchClass(normalized) + semitones + 1200) % 12;
  if (normalized.includes("b")) return FLAT_NAMES[pitchClass];
  if (normalized.includes("#") || normalized.includes("x")) return SHARP_NAMES[pitchClass];
  return NEUTRAL_NAMES[pitchClass];
}

function tonicMajorFifths(tonic) {
  const normalized = normalizeTonic(tonic);
  const match = normalized.match(/^([A-Ga-g])([#bx]*)$/);
  if (!match) return null;
  return BASE_MAJOR_FIFTHS[match[1].toUpperCase()] + (7 * accidentalOffset(match[2]));
}

function signaturePitchClass(fifths) {
  return noteNameToPitchClass(MIDI_KEY_SIGNATURE_KEYS[fifths + 7]);
}

function nearestSignatureFifths(parentMajorPc, preferredFifths, tonic) {
  const candidates = [];
  for (let fifths = -7; fifths <= 7; fifths += 1) {
    if (signaturePitchClass(fifths) === parentMajorPc) candidates.push(fifths);
  }
  if (!candidates.length) return 0;
  const preferFlats = normalizeTonic(tonic).includes("b");
  const preferSharps = /[#x]/.test(normalizeTonic(tonic));
  return candidates.sort((a, b) => {
    const aDistance = Number.isFinite(preferredFifths) ? Math.abs(a - preferredFifths) : Math.abs(a);
    const bDistance = Number.isFinite(preferredFifths) ? Math.abs(b - preferredFifths) : Math.abs(b);
    if (aDistance !== bDistance) return aDistance - bDistance;
    if (preferFlats && Math.sign(a) !== Math.sign(b)) return a < b ? -1 : 1;
    if (preferSharps && Math.sign(a) !== Math.sign(b)) return a > b ? -1 : 1;
    return Math.abs(a) - Math.abs(b);
  })[0];
}

/**
 * Convert an exact Hooktheory key/mode into the closest Standard MIDI key
 * signature. Standard MIDI stores only the accidental count plus major/minor;
 * the renderer separately embeds the exact tonic and mode as a marker event.
 */
export function midiKeySignatureFor(key) {
  const tonic = normalizeTonic(key?.tonic || "C");
  const sourceScale = key?.scale || "major";
  const modeOffset = MODE_FIFTH_OFFSETS[sourceScale];
  const parentInterval = MODE_PARENT_MAJOR_INTERVALS[sourceScale];
  if (modeOffset === undefined || parentInterval === undefined) {
    return null;
  }

  const preferredFifths = tonicMajorFifths(tonic) + modeOffset;
  const tonicPc = noteNameToPitchClass(tonic);
  const parentMajorPc = (tonicPc - parentInterval + 12) % 12;
  const fifths = preferredFifths >= -7 && preferredFifths <= 7
    && signaturePitchClass(preferredFifths) === parentMajorPc
    ? preferredFifths
    : nearestSignatureFifths(parentMajorPc, preferredFifths, tonic);

  const exactlyRepresentable = sourceScale === "major"
    || sourceScale === "ionian"
    || sourceScale === "minor"
    || sourceScale === "aeolian";

  const minorSignature = new Set(["minor", "aeolian", "harmonicMinor", "phrygianDominant"])
    .has(sourceScale);
  return {
    signatureKey: MIDI_KEY_SIGNATURE_KEYS[fifths + 7],
    scale: minorSignature ? "minor" : "major",
    fifths,
    exact: exactlyRepresentable,
  };
}

export function beatToTicks(beat) {
  const numericBeat = Number(beat);
  if (!Number.isFinite(numericBeat) || numericBeat < 0) {
    throw new RangeError(`beat must be a finite number >= 0; received ${beat}`);
  }
  const normalizedBeat = numericBeat === 0 ? 1 : numericBeat;
  return Math.round((normalizedBeat - 1) * PPQ);
}

export function durationToTicks(duration) {
  const numericDuration = Number(duration);
  if (!Number.isFinite(numericDuration) || numericDuration <= 0) {
    throw new RangeError(`duration must be a finite number > 0; received ${duration}`);
  }
  return Math.max(1, Math.round(numericDuration * PPQ));
}

export function meterDenominator(meter) {
  if (Number.isFinite(Number(meter?.denominator))) {
    const denominator = Number(meter.denominator);
    if (!Number.isInteger(denominator) || denominator < 1 || denominator > 128
      || (denominator & (denominator - 1)) !== 0) {
      throw new RangeError(`meter denominator ${denominator} must be a power of two in 1..128`);
    }
    return denominator;
  }
  const beatUnit = Number(meter?.beatUnit ?? 1);
  if (!Number.isFinite(beatUnit) || beatUnit <= 0) {
    throw new RangeError(`meter beatUnit must be a finite number > 0; received ${meter?.beatUnit}`);
  }
  const denominator = 4 / beatUnit;
  if (!Number.isInteger(denominator) || denominator < 1 || denominator > 128
    || (denominator & (denominator - 1)) !== 0) {
    throw new RangeError(`meter beatUnit ${beatUnit} cannot be represented as a MIDI denominator`);
  }
  return denominator;
}
