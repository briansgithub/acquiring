/**
 * Custom borrowed-scale arrays and mode borrowing resolution.
 */
import {
  MAJOR_SCALE_CHORD_QUALITIES,
  MINOR_SCALE_CHORD_QUALITIES,
  DORIAN_SCALE_CHORD_QUALITIES,
  PHRYGIAN_SCALE_CHORD_QUALITIES,
  LYDIAN_SCALE_CHORD_QUALITIES,
  MIXOLYDIAN_SCALE_CHORD_QUALITIES,
  LOCRIAN_SCALE_CHORD_QUALITIES,
  HARMONIC_MINOR_SCALE_CHORD_QUALITIES,
  PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES,
} from "./scales.js";

function getChordQualityFromCustomScale(borrowedArray, degree) {
  const intervals = getCustomScaleIntervals(borrowedArray);
  const rootIdx = (degree - 1) % 7;
  const thirdIdx = (degree + 1) % 7;
  const fifthIdx = (degree + 3) % 7;

  const rootInterval = intervals[rootIdx];
  let thirdInterval = intervals[thirdIdx];
  let fifthInterval = intervals[fifthIdx];

  if (thirdInterval < rootInterval) thirdInterval += 12;
  if (fifthInterval < rootInterval) fifthInterval += 12;

  const thirdSemitones = thirdInterval - rootInterval;
  const fifthSemitones = fifthInterval - rootInterval;

  const isMajorThird = thirdSemitones === 4;
  const isMinorThird = thirdSemitones === 3;
  const isPerfectFifth = fifthSemitones === 7;
  const isDiminishedFifth = fifthSemitones === 6;

  if (isMajorThird && isPerfectFifth) return "major";
  if (isMinorThird && isPerfectFifth) return "minor";
  if (isMinorThird && isDiminishedFifth) return "diminished";
  if (isMajorThird && fifthSemitones === 8) return "augmented";
  return isMajorThird ? "major" : "minor";
}

function generateChordQualitiesFromCustomScale(intervals) {
  const qualities = [];
  for (let degree = 1; degree <= 7; degree++) {
    qualities.push(getChordQualityFromCustomScale(intervals, degree));
  }
  return qualities;
}

function getCustomScaleIntervals(borrowedArray) {
  if (!borrowedArray || borrowedArray.length === 0) {
    return [0, 2, 4, 5, 7, 9, 11];
  }

  const intervals = [];
  for (let i = 0; i < 7; i++) {
    let interval;
    if (i < borrowedArray.length) {
      interval = borrowedArray[i];
    } else {
      const lastInterval = intervals[intervals.length - 1] ?? 0;
      interval = (lastInterval + 2) % 12;
    }
    if (interval < 0) interval = 12 + interval;
    interval = interval % 12;
    intervals.push(interval);
  }
  return intervals;
}

export function getCustomBorrowedIntervals(borrowedArray) {
  return getCustomScaleIntervals(borrowedArray);
}

export function resolveBorrowedScale(key, borrowed) {
  let { tonic, scale } = key;
  let customScaleIntervals = null;
  let scaleChordQualities = null;

  if (borrowed === null || borrowed === "") {
    scale = key.scale;
  } else if (typeof borrowed === "string") {
    const modeMap = {
      major: "major",
      minor: "minor",
      dorian: "dorian",
      phrygian: "phrygian",
      lydian: "lydian",
      mixolydian: "mixolydian",
      locrian: "locrian",
      harmonicMinor: "harmonicMinor",
      phrygianDominant: "phrygianDominant",
    };
    if (!(borrowed in modeMap)) {
      throw new Error(`Unsupported borrowed type: ${borrowed}`);
    }
    scale = modeMap[borrowed];
  } else if (Array.isArray(borrowed)) {
    customScaleIntervals = getCustomScaleIntervals(borrowed);
    scaleChordQualities = generateChordQualitiesFromCustomScale(borrowed);
    scale = "custom";
  } else {
    throw new Error(`Unsupported borrowed type: ${borrowed}`);
  }

  return { key: { tonic, scale }, customScaleIntervals, scaleChordQualities };
}

export function getScaleChordQualities(scale, scaleChordQualities) {
  if (scaleChordQualities) return scaleChordQualities;

  const table = {
    major: MAJOR_SCALE_CHORD_QUALITIES,
    minor: MINOR_SCALE_CHORD_QUALITIES,
    dorian: DORIAN_SCALE_CHORD_QUALITIES,
    phrygian: PHRYGIAN_SCALE_CHORD_QUALITIES,
    lydian: LYDIAN_SCALE_CHORD_QUALITIES,
    mixolydian: MIXOLYDIAN_SCALE_CHORD_QUALITIES,
    locrian: LOCRIAN_SCALE_CHORD_QUALITIES,
    harmonicMinor: HARMONIC_MINOR_SCALE_CHORD_QUALITIES,
    phrygianDominant: PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES,
  };
  if (!table[scale]) throw new Error(`Unsupported scale type: ${scale}`);
  return table[scale];
}
