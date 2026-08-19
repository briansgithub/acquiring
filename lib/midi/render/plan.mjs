import {
  chordInterpreter,
  sdToToneJSNoteName,
} from "../../../web-player/lib/music.js";
import {
  HARMONIC_ANALYSIS_SCHEMA_VERSION,
  sanitizePublicHooktheoryChord,
} from "../../../web-player/lib/harmonicContract.js";

import {
  beatToTicks,
  durationToTicks,
  meterDenominator,
  normalizeTonic,
  noteNameToMidi,
  PPQ,
} from "./pitch.mjs";

const DEFAULT_KEY = Object.freeze({ tonic: "C", scale: "major", beat: 1, ticks: 0 });

function compareTimedEntries(a, b) {
  return a.ticks - b.ticks || a.sourceIndex - b.sourceIndex;
}

function cloneJsonValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sourceIdentity(section) {
  return {
    id: section.id ?? section.songId ?? section.stringSongId ?? section.numericId ?? null,
    songId: section.songId ?? section.stringSongId ?? null,
    numericId: section.numericId ?? section.metadata?.numericId ?? null,
    songInfo: section.songInfo ?? section.title ?? section.metadata?.title ?? null,
    sectionName: section.sectionName ?? section.name ?? section.metadata?.sectionName ?? null,
    sectionIndex: section.sectionIndex ?? section.index ?? section.metadata?.sectionIndex ?? null,
    url: section.url ?? section.metadata?.url ?? null,
  };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function extractSplitMetadata(section) {
  const provenance = section?.provenance || {};
  const metadata = section?.metadata || {};
  const dataset = section?.dataset || metadata.dataset || provenance.dataset || {};
  const split = firstDefined(
    section?.split,
    section?.datasetSplit,
    metadata.split,
    metadata.datasetSplit,
    provenance.split,
    dataset.split,
  );
  const fold = firstDefined(section?.fold, metadata.fold, provenance.fold, dataset.fold);
  const group = firstDefined(
    section?.splitGroup,
    section?.groupId,
    metadata.splitGroup,
    provenance.splitGroup,
    dataset.group,
    dataset.groupId,
  );
  return {
    split: split ?? null,
    fold: fold ?? null,
    group: group ?? null,
  };
}

function normalizeKeys(metadata) {
  const input = Array.isArray(metadata?.keys) && metadata.keys.length
    ? metadata.keys
    : [DEFAULT_KEY];
  const keys = input.map((entry, sourceIndex) => ({
    ...cloneJsonValue(entry),
    tonic: normalizeTonic(entry?.tonic || DEFAULT_KEY.tonic),
    scale: entry?.scale || DEFAULT_KEY.scale,
    beat: Number(entry?.beat ?? 1),
    ticks: beatToTicks(entry?.beat ?? 1),
    sourceIndex,
  })).sort(compareTimedEntries);
  const coalesced = coalesceAtSameTick(keys);
  if (coalesced[0].ticks > 0) {
    coalesced.unshift({
      ...cloneJsonValue(coalesced[0]),
      sourceBeat: coalesced[0].beat,
      beat: 1,
      ticks: 0,
      sourceIndex: -1,
      inferred: true,
    });
  }
  return coalesced;
}

function normalizeTempos(metadata) {
  const input = Array.isArray(metadata?.tempos) && metadata.tempos.length
    ? metadata.tempos
    : [{ beat: 1, bpm: 120, swingFactor: 0, swingBeat: 0.5 }];
  const tempos = input.map((entry, sourceIndex) => {
    const bpm = Number(entry?.bpm);
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new RangeError(`metadata.tempos[${sourceIndex}].bpm must be > 0`);
    }
    return {
      ...cloneJsonValue(entry),
      beat: Number(entry?.beat ?? 1),
      ticks: beatToTicks(entry?.beat ?? 1),
      bpm,
      sourceIndex,
    };
  }).sort(compareTimedEntries);
  const coalesced = coalesceAtSameTick(tempos);
  if (coalesced[0].ticks > 0) {
    coalesced.unshift({
      beat: 1,
      ticks: 0,
      bpm: 120,
      swingFactor: 0,
      swingBeat: 0.5,
      sourceIndex: -1,
      inferred: true,
    });
  }
  return coalesced;
}

function normalizeMeters(metadata) {
  const input = Array.isArray(metadata?.meters) && metadata.meters.length
    ? metadata.meters
    : [{ beat: 1, numBeats: 4, beatUnit: 1 }];
  const meters = input.map((entry, sourceIndex) => {
    const numerator = Number(entry?.numBeats ?? entry?.numerator ?? 4);
    if (!Number.isInteger(numerator) || numerator <= 0 || numerator > 255) {
      throw new RangeError(`metadata.meters[${sourceIndex}].numBeats must be an integer in 1..255`);
    }
    return {
      ...cloneJsonValue(entry),
      beat: Number(entry?.beat ?? 1),
      ticks: beatToTicks(entry?.beat ?? 1),
      numerator,
      denominator: meterDenominator(entry),
      sourceIndex,
    };
  }).sort(compareTimedEntries);
  const coalesced = coalesceAtSameTick(meters);
  if (coalesced[0].ticks > 0) {
    coalesced.unshift({
      beat: 1,
      ticks: 0,
      numBeats: 4,
      beatUnit: 1,
      numerator: 4,
      denominator: 4,
      sourceIndex: -1,
      inferred: true,
    });
  }
  return coalesced;
}

function coalesceAtSameTick(entries) {
  const coalesced = [];
  for (const entry of entries) {
    if (coalesced.length && coalesced[coalesced.length - 1].ticks === entry.ticks) {
      coalesced[coalesced.length - 1] = entry;
    } else {
      coalesced.push(entry);
    }
  }
  return coalesced;
}

export function activeKeyAtBeat(keys, beat) {
  if (!Array.isArray(keys) || !keys.length) return { tonic: "C", scale: "major" };
  const ticks = beatToTicks(beat ?? 1);
  let selected = keys[0];
  for (const key of keys) {
    if (key.ticks <= ticks) selected = key;
    else break;
  }
  return { tonic: selected.tonic, scale: selected.scale };
}

function selectedMelodyNotes(section) {
  if (Array.isArray(section.notes)) {
    return { lane: "notes", notes: section.notes };
  }
  if (!section.notes || typeof section.notes !== "object") {
    return { lane: null, notes: [] };
  }

  const activeIndex = Number(section.metadata?.activeMelodyIndex);
  const candidates = [];
  if (Number.isInteger(activeIndex) && activeIndex >= 0) {
    candidates.push(`melody${activeIndex + 1}`, String(activeIndex), `melody${activeIndex}`);
  }
  candidates.push("melody1");
  for (const key of Object.keys(section.notes).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    candidates.push(key);
  }
  const lane = [...new Set(candidates)].find((key) => Array.isArray(section.notes[key]));
  return lane ? { lane, notes: section.notes[lane] } : { lane: null, notes: [] };
}

function unitVelocity(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  let numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError(`${label} velocity must be numeric`);
  if (numeric > 1 && numeric <= 127) numeric /= 127;
  if (numeric < 0 || numeric > 1) throw new RangeError(`${label} velocity must be in 0..1 or 0..127`);
  return Math.max(1 / 127, numeric);
}

function normalizeProgram(value, fallback, label) {
  const program = Number(value ?? fallback);
  if (!Number.isInteger(program) || program < 0 || program > 127) {
    throw new RangeError(`${label} must be a General MIDI program number in 0..127`);
  }
  return program;
}

function normalizeChannel(value, fallback, label) {
  const channel = Number(value ?? fallback);
  if (!Number.isInteger(channel) || channel < 0 || channel > 15 || channel === 9) {
    throw new RangeError(`${label} must be a non-percussion MIDI channel in 0..15`);
  }
  return channel;
}

function normalizeEventOrder(events) {
  return events.sort((a, b) => (
    a.ticks - b.ticks
    || a.sourceIndex - b.sourceIndex
    || (a.voiceIndex ?? 0) - (b.voiceIndex ?? 0)
    || a.midi - b.midi
  ));
}

function melodyTrack(section, keys, options) {
  const selected = selectedMelodyNotes(section);
  const notes = [];
  selected.notes.forEach((note, sourceIndex) => {
    if (note?.isRest || String(note?.sd || "").toLowerCase() === "rest") return;
    const beat = Number(note?.beat ?? 1);
    const activeKey = activeKeyAtBeat(keys, beat);
    let decodedName = null;
    let midi;
    try {
      if (note?.midi !== undefined && note?.midi !== null && Number.isInteger(Number(note.midi))) {
        midi = Number(note.midi);
      } else if (typeof note?.name === "string") {
        decodedName = note.name;
        midi = noteNameToMidi(note.name);
      } else {
        decodedName = sdToToneJSNoteName(
          note?.sd ?? 1,
          Number(note?.octave ?? 0),
          activeKey,
          Number(options.melodyBaseOctave ?? 4),
        );
        midi = noteNameToMidi(decodedName);
      }
    } catch (error) {
      throw new Error(`Unable to render melody note ${sourceIndex} at beat ${beat}: ${error.message}`, { cause: error });
    }
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
      throw new RangeError(`Melody note ${sourceIndex} has invalid MIDI pitch ${midi}`);
    }
    notes.push({
      midi,
      decodedName,
      ticks: beatToTicks(beat),
      durationTicks: durationToTicks(note?.duration ?? 1),
      velocity: unitVelocity(note?.velocity, options.melodyVelocity ?? 0.88, `melody note ${sourceIndex}`),
      noteOffVelocity: 0,
      groupId: `melody:${sourceIndex}`,
      sourceIndex,
      voiceIndex: 0,
      sourceBeat: beat,
      sourceDuration: Number(note?.duration ?? 1),
      sourceScaleDegree: note?.sd ?? null,
      activeKey,
    });
  });
  return {
    id: "melody",
    name: options.melodyTrackName || "Melody",
    channel: normalizeChannel(options.melodyChannel, 0, "melodyChannel"),
    program: normalizeProgram(options.melodyProgram, 0, "melodyProgram"),
    sourceLane: selected.lane,
    notes: normalizeEventOrder(notes),
  };
}

function harmonyTrack(section, keys, options) {
  const chords = Array.isArray(section.chords) ? section.chords : [];
  const notes = [];
  const decodedChords = [];
  chords.forEach((chord, sourceIndex) => {
    const publicChord = sanitizePublicHooktheoryChord(chord);
    if (publicChord?.isRest) return;
    const beat = Number(publicChord?.beat ?? 1);
    const activeKey = activeKeyAtBeat(keys, beat);
    let interpreted;
    try {
      interpreted = chordInterpreter(publicChord, activeKey, {
        forceRootPosition: Boolean(options.forceRootPosition),
      });
    } catch (error) {
      throw new Error(`Unable to decode chord ${sourceIndex} at beat ${beat}: ${error.message}`, { cause: error });
    }
    const decodedNames = Array.isArray(interpreted?.notes) ? interpreted.notes : [];
    const seenDecodedMidi = new Set();
    const renderedMidi = [];
    decodedNames.forEach((decodedName, voiceIndex) => {
      const decodedMidi = noteNameToMidi(decodedName);
      if (seenDecodedMidi.has(decodedMidi)) return;
      seenDecodedMidi.add(decodedMidi);
      let midi = decodedMidi;
      const priorVoice = renderedMidi.at(-1);
      while (priorVoice !== undefined && midi <= priorVoice && midi + 12 <= 127) midi += 12;
      if (priorVoice !== undefined && midi <= priorVoice) {
        throw new RangeError(`Chord ${sourceIndex} cannot be voiced in decoder order within MIDI range`);
      }
      renderedMidi.push(midi);
      notes.push({
        midi,
        decodedName,
        ticks: beatToTicks(beat),
        durationTicks: durationToTicks(publicChord?.duration ?? 1),
        velocity: unitVelocity(null, options.harmonyVelocity ?? 0.68, `chord ${sourceIndex}`),
        noteOffVelocity: 0,
        groupId: `harmony:${sourceIndex}`,
        sourceIndex,
        voiceIndex,
        sourceBeat: beat,
        sourceDuration: Number(publicChord?.duration ?? 1),
        sourceChordRoot: publicChord?.root ?? null,
        activeKey,
      });
    });
    decodedChords.push({
      sourceIndex,
      beat,
      duration: Number(publicChord?.duration ?? 1),
      activeKey,
      decodedNames,
      renderedMidi,
      chord: cloneJsonValue(publicChord),
    });
  });
  return {
    id: "harmony",
    name: options.harmonyTrackName || "Harmony",
    channel: normalizeChannel(options.harmonyChannel, 1, "harmonyChannel"),
    program: normalizeProgram(options.harmonyProgram, 0, "harmonyProgram"),
    notes: normalizeEventOrder(notes),
    decodedChords,
  };
}

function planName(section) {
  const song = section.songInfo ?? section.title ?? "Untitled";
  const sectionName = section.sectionName ?? section.name;
  return sectionName ? `${song} - ${sectionName}` : String(song);
}

export function createRenderPlan(section, options = {}) {
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    throw new TypeError("section must be an ExtractedSection-compatible JSON object");
  }
  if (section.chords !== undefined && !Array.isArray(section.chords)) {
    throw new TypeError("section.chords must be an array when present");
  }
  if (section.notes !== undefined
    && !Array.isArray(section.notes)
    && (section.notes === null || typeof section.notes !== "object")) {
    throw new TypeError("section.notes must be an array or melody-lane object when present");
  }

  const metadata = section.metadata || {};
  const keyEvents = normalizeKeys(metadata);
  const tracks = [
    melodyTrack(section, keyEvents, options),
    harmonyTrack(section, keyEvents, options),
  ];
  let durationTicks = beatToTicks(metadata.endBeat ?? 1);
  for (const track of tracks) {
    for (const note of track.notes) {
      durationTicks = Math.max(durationTicks, note.ticks + note.durationTicks);
    }
  }

  return {
    schemaVersion: "1.0.0",
    ppq: PPQ,
    name: planName(section),
    durationTicks,
    tracks,
    keyEvents,
    tempoEvents: normalizeTempos(metadata),
    meterEvents: normalizeMeters(metadata),
    provenance: {
      renderer: "diatonic-ring-theory-to-midi",
      decoder: "web-player/lib/music.js#chordInterpreter",
      decoderVersion: HARMONIC_ANALYSIS_SCHEMA_VERSION,
      artifactKind: "synthetic",
      source: sourceIdentity(section),
      sourceProvenance: cloneJsonValue(section.provenance ?? null),
      splitMetadata: extractSplitMetadata(section),
    },
    augmentation: null,
  };
}
