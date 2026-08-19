import { createHash } from "node:crypto";
import { basename } from "node:path";

import { buildHarmonicFrames, CATALOG_PRIORS_INFO, inferChordPath } from "./chords.js";
import { MidiAnalysisError } from "./errors.js";
import { inferKeyCandidates, inferLocalKeyTimeline, serializeKeyCandidate } from "./key.js";
import { extractMelody } from "./melody.js";
import {
  activeTimelineSlice,
  buildMarkerSections,
  extractedMetadata,
  fallbackKeySignature,
  normalizeMetadata,
  normalizeTracks,
  selectSection,
} from "./normalize.js";
import { serializeTrack } from "./roles.js";
import { MAX_MIDI_BYTES, MAX_MIDI_EVENTS, parseSmf } from "./smf.js";
import { round } from "./theory.js";

export { MidiAnalysisError } from "./errors.js";
export { MAX_MIDI_BYTES, MAX_MIDI_EVENTS } from "./smf.js";

export const MIDI_ANALYSIS_SCHEMA_VERSION = "hooktheory.midi-analysis.v1";
export const MIDI_ANALYZER_VERSION = "1.0.0";
export const MAX_MIDI_TOP_K = 20;
export const MAX_PUBLIC_NOTE_ROLES = 100_000;

function numericOption(value, fallback, { name, min, max }) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new MidiAnalysisError(`${name} must be between ${min} and ${max}`, {
      code: "INVALID_ANALYSIS_OPTIONS",
      statusCode: 400,
      details: { option: name, value },
    });
  }
  return parsed;
}

function integerOption(value, fallback, bounds) {
  const parsed = numericOption(value, fallback, bounds);
  if (!Number.isSafeInteger(parsed)) {
    throw new MidiAnalysisError(`${bounds.name} must be an integer`, {
      code: "INVALID_ANALYSIS_OPTIONS",
      statusCode: 400,
      details: { option: bounds.name, value },
    });
  }
  return parsed;
}

function inputName(input, options) {
  if (options.sourceName) return basename(String(options.sourceName).replace(/\\/g, "/"));
  if (options.filename) return basename(String(options.filename).replace(/\\/g, "/"));
  if (typeof input === "string") return basename(input);
  if (input instanceof URL) return basename(input.pathname);
  return null;
}

function maxTick(midi, tracks, metadata, markers) {
  let result = Number.isFinite(midi.durationTicks) ? Math.max(0, Math.round(midi.durationTicks)) : 0;
  for (const track of tracks) for (const note of track.notes) result = Math.max(result, note.endTick);
  for (const event of metadata.tempos) result = Math.max(result, event.tick);
  for (const event of metadata.meters) result = Math.max(result, event.tick);
  for (const event of metadata.keySignatures) result = Math.max(result, event.tick);
  for (const marker of markers) result = Math.max(result, marker.tick);
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sectionKeyTimeline(metadataKeys, inferredBest, startTick, endTick) {
  const timeline = activeTimelineSlice(metadataKeys, startTick, endTick);
  if (!timeline.length || timeline[0].tick > startTick) {
    timeline.unshift(...fallbackKeySignature(inferredBest, startTick));
  }
  return timeline;
}

function markerSource(sections, ppq) {
  return sections.map((section) => ({
    index: section.index,
    name: section.name,
    type: section.type,
    trackIndex: section.trackIndex,
    startTick: section.startTick,
    endTick: section.endTick,
    startBeat: round(section.startTick / ppq),
    endBeat: round(section.endTick / ppq),
  }));
}

function metadataSidecar(metadata, ppq) {
  return {
    tempos: metadata.tempos.map((event) => ({
      tick: event.tick,
      beat: round(event.tick / ppq),
      bpm: round(event.bpm),
      defaulted: event.defaulted,
    })),
    meters: metadata.meters.map((event) => ({
      tick: event.tick,
      beat: round(event.tick / ppq),
      numerator: event.numerator,
      denominator: event.denominator,
      defaulted: event.defaulted,
    })),
    keySignatures: metadata.keySignatures.map((event) => ({
      tick: event.tick,
      beat: round(event.tick / ppq),
      tonic: event.tonic,
      scale: event.scale,
      defaulted: false,
      source: event.source,
      authority: event.authority,
      exact: event.exact,
    })),
  };
}

function analysisWarnings({ envelope, tracks, pitchedNotes, metadata, keyInference, localKeyInference, melody }) {
  const warnings = [];
  if (envelope.format === 0) {
    warnings.push({
      code: "TYPE0_ROLE_LIMITATION",
      message: "SMF type 0 merges parts into one physical track, so track-role confidence is limited.",
    });
  }
  if (!pitchedNotes.length) {
    warnings.push({ code: "NO_PITCHED_NOTES", message: "No non-drum note events were available for harmony inference." });
  }
  if (metadata.defaultsUsed.tempo) {
    warnings.push({ code: "DEFAULT_TEMPO", message: "No tempo event was present; 120 BPM was used." });
  }
  if (metadata.defaultsUsed.meter) {
    warnings.push({ code: "DEFAULT_METER", message: "No time-signature event was present; 4/4 was used." });
  }
  if (keyInference.usedDefault) {
    warnings.push({ code: "DEFAULT_KEY", message: "No pitched evidence or key signature was present; C major was used." });
  } else if (!metadata.keySignatures.length) {
    warnings.push({ code: "INFERRED_KEY", message: "No MIDI key signature was present; the key was inferred from note durations." });
    if (localKeyInference.selected.length > 1) {
      warnings.push({
        code: "INFERRED_KEY_TIMELINE",
        message: "Local key changes were inferred from smoothed harmonic windows and are not embedded metadata.",
      });
    }
  }
  if (tracks.length === 0) {
    warnings.push({ code: "NO_TRACKS", message: "The MIDI contained no parsed tracks." });
  }
  if (pitchedNotes.length && melody?.method === "no-defensible-melody") {
    warnings.push({
      code: "NO_DEFENSIBLE_MELODY",
      message: "No pitched track had enough melody-role evidence; melody output was left empty.",
    });
  }
  return warnings;
}

function sourceWarnings(envelope) {
  return (envelope.hooktheory?.invalidEvents || []).map((event) => ({
    code: "INVALID_EMBEDDED_HOOKTHEORY_METADATA",
    message: "A reserved Hooktheory metadata event was malformed and ignored.",
    trackIndex: event.trackIndex,
    tick: event.tick,
    kind: event.kind || null,
  }));
}

function noteRoleDocument(tracks, startTick, endTick, limit) {
  const items = [];
  let total = 0;
  for (const track of tracks) {
    for (const note of track.notes) {
      if (note.endTick <= startTick || note.startTick >= endTick) continue;
      total += 1;
      if (items.length >= limit) continue;
      items.push({
        trackIndex: track.index,
        noteIndex: note.sourceNoteIndex,
        midi: note.midi,
        startTick: note.startTick,
        endTick: note.endTick,
        roles: Object.fromEntries(Object.entries(note.roles || {}).map(([role, value]) => [role, round(value)])),
      });
    }
  }
  return { total, returned: items.length, truncated: items.length < total, items };
}

function globalConfidence({ keyConfidence, chordSegments, melody }) {
  const components = [{ value: Number(keyConfidence || 0), weight: 0.35 }];
  if (chordSegments.length) {
    components.push({
      value: chordSegments.reduce((sum, segment) => sum + Number(segment.confidence || 0), 0) / chordSegments.length,
      weight: 0.5,
    });
  }
  if (melody.notes.length) components.push({ value: Number(melody.confidence || 0), weight: 0.15 });
  const weight = components.reduce((sum, component) => sum + component.weight, 0) || 1;
  return round(components.reduce((sum, component) => sum + component.value * component.weight, 0) / weight);
}

/**
 * Analyze an SMF type 0/1 buffer into Hooktheory-compatible chord and melody data.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer|string|URL} input MIDI bytes, or a path for CLI use.
 * @param {object} options deterministic analyzer options.
 * @returns {Promise<object>} JSON-serializable hooktheory.midi-analysis.v1 response.
 * @throws {MidiAnalysisError} with stable `code` and `statusCode` fields.
 */
export async function analyzeMidi(input, options = {}) {
  const topK = integerOption(options.topK, 5, {
    name: "topK",
    min: 1,
    max: MAX_MIDI_TOP_K,
  });
  const maxBytes = integerOption(options.maxBytes, MAX_MIDI_BYTES, {
    name: "maxBytes",
    min: 1,
    max: MAX_MIDI_BYTES,
  });
  const maxEvents = integerOption(options.maxEvents, MAX_MIDI_EVENTS, {
    name: "maxEvents",
    min: 1,
    max: MAX_MIDI_EVENTS,
  });
  const gridBeats = numericOption(options.gridBeats ?? options.segmentBeats, 1, {
    name: "gridBeats",
    min: 0.125,
    max: 16,
  });
  const emissionWidth = integerOption(options.emissionWidth, 24, {
    name: "emissionWidth",
    min: 5,
    max: 128,
  });
  const maxFrames = integerOption(options.maxFrames, 50_000, {
    name: "maxFrames",
    min: 1,
    max: 250_000,
  });
  const keyHopBeats = numericOption(options.keyHopBeats, 2, {
    name: "keyHopBeats",
    min: 0.5,
    max: 16,
  });
  const minAdaptiveBeats = numericOption(options.minAdaptiveBeats, Math.min(0.25, gridBeats), {
    name: "minAdaptiveBeats",
    min: 0.0625,
    max: 16,
  });
  const adaptiveBoundaries = options.adaptiveBoundaries !== false;
  const maxPublicNoteRoles = integerOption(options.maxPublicNoteRoles, MAX_PUBLIC_NOTE_ROLES, {
    name: "maxPublicNoteRoles",
    min: 1,
    max: MAX_PUBLIC_NOTE_ROLES,
  });

  const { bytes, envelope, midi } = await parseSmf(input, { maxBytes, maxEvents });
  const ppq = Number(midi.header?.ppq) || envelope.ppq;
  if (!Number.isFinite(ppq) || ppq <= 0) {
    throw new MidiAnalysisError("Parsed MIDI did not expose a valid PPQ value", {
      code: "INVALID_MIDI_PPQ",
      statusCode: 400,
    });
  }

  const metadata = normalizeMetadata(midi, envelope.hooktheory);
  const tracks = normalizeTracks(midi, ppq, envelope.trackNames);
  const durationTicks = maxTick(midi, tracks, metadata, envelope.markers);
  const availableSections = buildMarkerSections(envelope.markers, durationTicks, ppq);
  const embeddedSource = envelope.hooktheory?.provenance?.source || {};
  const selected = selectSection(availableSections, durationTicks, {
    ...options,
    defaultSectionName: embeddedSource.sectionName || undefined,
  });
  const expectedFrames = Math.ceil((selected.endTick - selected.startTick) / Math.max(1, Math.round(gridBeats * ppq)));
  if (expectedFrames > maxFrames) {
    throw new MidiAnalysisError("MIDI section exceeds the configured analysis frame limit", {
      code: "MIDI_ANALYSIS_TOO_LARGE",
      statusCode: 422,
      details: { expectedFrames, maxFrames, gridBeats },
    });
  }

  const allNotes = tracks.flatMap((track) => track.notes);
  const pitchedNotes = allNotes.filter((note) => !note.isPercussion);
  const keyInference = inferKeyCandidates(pitchedNotes, {
    startTick: selected.startTick,
    endTick: selected.endTick,
    keySignatures: metadata.keySignatures,
  });
  metadata.defaultsUsed.key = keyInference.usedDefault;
  const fallbackKey = {
    tonic: keyInference.best.tonic,
    scale: keyInference.best.scale,
    tonicPc: keyInference.best.tonicPc,
  };
  const localKeyInference = inferLocalKeyTimeline(pitchedNotes, {
    startTick: selected.startTick,
    endTick: selected.endTick,
    ppq,
    explicitKeys: metadata.keySignatures,
    fallbackKey,
    topK,
    hopBeats: keyHopBeats,
  });
  const keySignatures = sectionKeyTimeline(
    localKeyInference.selected,
    fallbackKey,
    selected.startTick,
    selected.endTick,
  );

  const harmonicFrames = buildHarmonicFrames(pitchedNotes, {
    startTick: selected.startTick,
    endTick: selected.endTick,
    ppq,
    gridBeats,
    meters: metadata.meters,
    adaptive: adaptiveBoundaries,
    minAdaptiveBeats,
    maxFrames,
  });
  const frames = harmonicFrames.frames;
  if (frames.length > maxFrames) {
    throw new MidiAnalysisError("MIDI section exceeds the configured analysis frame limit", {
      code: "MIDI_ANALYSIS_TOO_LARGE",
      statusCode: 422,
      details: { expectedFrames: frames.length, maxFrames, gridBeats, minAdaptiveBeats },
    });
  }
  const chordInference = inferChordPath(frames, {
    ppq,
    startTick: selected.startTick,
    keySignatures,
    fallbackKey,
    emissionWidth,
    topK,
    catalogOptions: {
      includeBorrowed: options.includeBorrowed !== false,
      includeApplied: options.includeApplied !== false,
      includeCatalog: options.includeCatalog !== false,
      catalogPriors: options.catalogPriors,
      maxCatalogObjects: options.maxCatalogObjects,
    },
  });
  const melody = extractMelody(tracks, {
    startTick: selected.startTick,
    endTick: selected.endTick,
    ppq,
    keySignatures,
    fallbackKey,
    topK,
  });

  const hooktheoryMetadata = extractedMetadata({
    metadata,
    keySignatures,
    startTick: selected.startTick,
    endTick: selected.endTick,
    ppq,
    availableSections,
  });
  const hooktheory = {
    sectionName: selected.name,
    songId: options.songId ?? embeddedSource.songId ?? embeddedSource.id ?? null,
    songInfo: options.songInfo ?? embeddedSource.songInfo ?? inputName(input, options) ?? selected.name,
    chords: chordInference.chords,
    notes: melody.notes,
    metadata: hooktheoryMetadata,
  };

  const chordAlternatives = chordInference.chordSegments.map((segment) => ({
    ...segment,
    selected: hooktheory.chords[segment.chordIndex],
  }));
  const keyAlternatives = keyInference.candidates.length
    ? keyInference.candidates.slice(0, topK).map(serializeKeyCandidate)
    : [serializeKeyCandidate(keyInference.best)];
  const warnings = analysisWarnings({
    envelope,
    tracks,
    pitchedNotes,
    metadata,
    keyInference,
    localKeyInference,
    melody,
  });
  const serializeKeyTimeline = (timeline) => timeline.map((event) => ({
    tick: event.tick,
    beat: round(1 + (event.tick - selected.startTick) / ppq),
    tonic: event.tonic,
    scale: event.scale,
    source: event.source || localKeyInference.source,
    authority: event.authority || localKeyInference.authority,
    inferred: Boolean(event.inferred),
    exact: Boolean(event.exact),
    confidence: round(event.confidence ?? 0),
  }));
  const selectedSectionKey = keySignatures[0] || fallbackKey;
  const selectedKeyConfidence = localKeyInference.authority === "authoritative"
    ? 1
    : localKeyInference.authority === "weak"
      ? selectedSectionKey.confidence ?? 0.72
      : localKeyInference.paths[0]?.probability ?? keyInference.best.probability;
  const noteRoles = noteRoleDocument(tracks, selected.startTick, selected.endTick, maxPublicNoteRoles);
  if (noteRoles.truncated) {
    warnings.push({
      code: "NOTE_ROLE_OUTPUT_TRUNCATED",
      message: `Note-role output was limited to ${maxPublicNoteRoles} events.`,
      total: noteRoles.total,
      returned: noteRoles.returned,
    });
  }

  const filename = inputName(input, options);
  return {
    schemaVersion: MIDI_ANALYSIS_SCHEMA_VERSION,
    version: 1,
    analyzer: {
      name: "diatonic-ring-midi-analyzer",
      version: MIDI_ANALYZER_VERSION,
      mode: "deterministic",
      modelVersion: null,
      catalogPriors: CATALOG_PRIORS_INFO,
    },
    source: {
      name: filename,
      filename,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      format: envelope.format,
      trackCount: envelope.declaredTrackCount,
      eventCount: envelope.eventCount,
      ppq,
      durationTicks,
      durationBeats: round(durationTicks / ppq),
      markers: markerSource(availableSections, ppq),
      metadata: metadataSidecar(metadata, ppq),
      warnings: sourceWarnings(envelope),
    },
    sections: [{
      name: selected.name,
      range: {
        startTick: selected.startTick,
        endTick: selected.endTick,
        startBeat: round(selected.startTick / ppq),
        endBeat: round(selected.endTick / ppq),
      },
      hooktheory,
      analysis: {
        analyzerVersion: MIDI_ANALYZER_VERSION,
        modelVersion: null,
        globalConfidence: globalConfidence({
          keyConfidence: selectedKeyConfidence,
          chordSegments: chordInference.chordSegments,
          melody,
        }),
        confidenceCalibration: {
          status: "uncalibrated",
          method: "deterministic-score-softmax",
          benchmark: null,
        },
        quantization: {
          originalTicksPreserved: true,
          melodyTimingQuantized: false,
          harmonicGridBeats: gridBeats,
          adaptiveBoundaries,
        },
        inferredMetadata: {
          key: localKeyInference.authority !== "authoritative",
          tempo: Boolean(metadata.defaultsUsed.tempo),
          meter: Boolean(metadata.defaultsUsed.meter),
        },
        key: {
          selected: { tonic: selectedSectionKey.tonic, scale: selectedSectionKey.scale },
          confidence: round(selectedKeyConfidence),
          chroma: keyInference.chroma.map((value) => round(value)),
          source: keyInference.usedDefault ? "default" : localKeyInference.source,
          authority: localKeyInference.authority,
          timeline: serializeKeyTimeline(keySignatures),
          pathAlternatives: localKeyInference.paths.slice(0, topK).map((path) => ({
            rank: path.rank,
            score: round(path.score),
            probability: round(path.probability),
            timeline: serializeKeyTimeline(path.timeline),
          })),
          modeCatalog: localKeyInference.modeCatalog,
        },
        keyAlternatives,
        chordAlternatives,
        sequenceAlternatives: chordInference.pathAlternatives,
        frames: chordInference.frames,
        segmentation: {
          method: adaptiveBoundaries ? "adaptive-evidence-grid-beam" : "fixed-beat-grid-beam",
          gridBeats,
          minAdaptiveBeats,
          adaptiveBoundaries,
          boundaryCount: harmonicFrames.boundaries.length,
          adaptiveBoundaryCount: harmonicFrames.boundaries.filter((boundary) => !boundary.mandatory).length,
          frameCount: frames.length,
          emissionWidth,
          beamWidth: chordInference.beamWidth,
          topK,
          keyHopBeats,
          maxBytes,
          maxEvents,
          maxPublicNoteRoles,
        },
        melody: {
          trackIndex: melody.trackIndex,
          noteCount: melody.notes.length,
          confidence: round(melody.confidence),
          method: melody.method,
          trackAlternatives: melody.candidates,
        },
        noteRoles,
        tracks: tracks.map(serializeTrack),
        defaultsUsed: { ...metadata.defaultsUsed },
        warnings,
      },
    }],
  };
}

export default analyzeMidi;
