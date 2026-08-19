import { sdToToneJSNoteName } from "../../../web-player/lib/music.js";

import { tonicToPc } from "./key.js";
import { keyAtTick, noteNameToMidi, round } from "./theory.js";

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

function melodyTrackScore(track) {
  if (track.isPercussion || !track.notes.length) return -Infinity;
  const features = track.features;
  const evidence = track.roles.melody + 0.2 * features.monophony - 0.12 * features.simultaneousRatio;
  return evidence * Math.log2(track.notes.length + 2);
}

function accidentalString(shift) {
  return shift < 0 ? "b".repeat(-shift) : "#".repeat(shift);
}

export function midiToScaleDegree(midi, key) {
  const tonicPc = tonicToPc(key.tonic) ?? 0;
  const intervals = SCALE_INTERVALS[key.scale] || SCALE_INTERVALS.major;
  const target = ((midi % 12) - tonicPc + 12) % 12;
  const shifts = [0, -1, 1, -2, 2];
  for (const shift of shifts) {
    for (let degree = 0; degree < intervals.length; degree += 1) {
      if (((intervals[degree] + shift) % 12 + 12) % 12 === target) {
        return `${accidentalString(shift)}${degree + 1}`;
      }
    }
  }
  return "1";
}

function relativeOctaveForMidi(midi, sd, key) {
  for (let relative = -6; relative <= 6; relative += 1) {
    try {
      if (noteNameToMidi(sdToToneJSNoteName(sd, relative, key, 4)) === midi) return relative;
    } catch {
      // Fall through to the arithmetic approximation below.
    }
  }
  const tonicPc = tonicToPc(key.tonic) ?? 0;
  const tonicMidiNearBase = 60 + tonicPc;
  return Math.floor((midi - tonicMidiNearBase) / 12);
}

function skyline(notes, startTick, endTick) {
  const starts = new Map();
  for (const note of notes) {
    if (note.startTick < startTick || note.startTick >= endTick) continue;
    const existing = starts.get(note.startTick);
    if (!existing || note.midi > existing.midi || (note.midi === existing.midi && note.velocity > existing.velocity)) {
      starts.set(note.startTick, note);
    }
  }
  const selected = [...starts.values()].sort((a, b) => a.startTick - b.startTick || b.midi - a.midi);
  return selected.map((note, index) => {
    const nextStart = selected[index + 1]?.startTick ?? endTick;
    return {
      ...note,
      endTick: Math.max(note.startTick + 1, Math.min(note.endTick, nextStart, endTick)),
    };
  });
}

export function extractMelody(tracks, {
  startTick,
  endTick,
  ppq,
  keySignatures,
  fallbackKey,
  topK = 5,
} = {}) {
  const rankedTracks = tracks
    .map((track) => ({ track, score: melodyTrackScore(track) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.track.index - b.track.index);
  const selectedTrack = rankedTracks[0]?.track || null;
  const candidateTotal = rankedTracks.reduce((sum, entry) => sum + Math.max(0, entry.score), 0) || 1;
  const candidates = rankedTracks.slice(0, topK).map((entry) => ({
    trackIndex: entry.track.index,
    score: round(entry.score),
    probability: round(Math.max(0, entry.score) / candidateTotal),
  }));
  if (!selectedTrack || rankedTracks[0].score <= 0) {
    return {
      notes: [],
      trackIndex: null,
      confidence: 0,
      method: selectedTrack ? "no-defensible-melody" : "none",
      candidates,
    };
  }

  const selectedNotes = skyline(selectedTrack.notes, startTick, endTick);
  const notes = selectedNotes.map((note) => {
    const key = keyAtTick(note.startTick, keySignatures, fallbackKey);
    const sd = midiToScaleDegree(note.midi, key);
    return {
      sd,
      octave: relativeOctaveForMidi(note.midi, sd, key),
      beat: round(1 + (note.startTick - startTick) / ppq),
      duration: round((note.endTick - note.startTick) / ppq),
      isRest: false,
      recordingEndBeat: null,
    };
  });

  return {
    notes,
    trackIndex: selectedTrack.index,
    confidence: Math.max(0, rankedTracks[0].score) / candidateTotal,
    method: selectedTrack.features.monophony >= 0.9 ? "track-plus-onset-skyline" : "polyphonic-onset-skyline",
    candidates,
  };
}
