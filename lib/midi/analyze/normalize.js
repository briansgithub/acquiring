import { MidiAnalysisError } from "./errors.js";
import { PC_NAMES, tonicToPc } from "./key.js";
import { classifyTrackRoles } from "./roles.js";
import { round } from "./theory.js";

const KEY_SIGNATURE_TONICS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const RELATIVE_MINOR_TONICS = new Map([
  ["Cb", "Ab"], ["Gb", "Eb"], ["Db", "Bb"], ["Ab", "F"], ["Eb", "C"],
  ["Bb", "G"], ["F", "D"], ["C", "A"], ["G", "E"], ["D", "B"],
  ["A", "F#"], ["E", "C#"], ["B", "G#"], ["F#", "D#"], ["C#", "A#"],
]);

function numeric(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function controlEvents(track, controller) {
  const changes = track?.controlChanges;
  if (!changes) return [];
  let events = changes[controller] || changes[String(controller)];
  if (!events && typeof changes.get === "function") events = changes.get(controller);
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => ({
      tick: Math.max(0, Math.round(numeric(event.ticks, 0))),
      value: Math.max(0, Math.min(1, numeric(event.value, 0) > 1 ? numeric(event.value, 0) / 127 : numeric(event.value, 0))),
    }))
    .sort((a, b) => a.tick - b.tick);
}

function pedalOnAt(events, tick) {
  let value = 0;
  for (const event of events) {
    if (event.tick > tick) break;
    value = event.value;
  }
  return value >= 0.5;
}

function nextPedalRelease(events, tick) {
  return events.find((event) => event.tick >= tick && event.value < 0.5)?.tick ?? null;
}

function nextSamePitchStarts(notes) {
  const nextByIndex = Array(notes.length).fill(null);
  const nextStart = new Map();
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const note = notes[index];
    nextByIndex[index] = nextStart.get(note.midi) ?? null;
    nextStart.set(note.midi, note.startTick);
  }
  return nextByIndex;
}

function normalizeTrack(track, index, ppq) {
  const sustainEvents = controlEvents(track, 64);
  const baseNotes = (track.notes || [])
    .map((note, sourceNoteIndex) => {
      const startTick = Math.max(0, Math.round(numeric(note.ticks, 0)));
      const durationTicks = Math.max(1, Math.round(numeric(note.durationTicks, 1)));
      const midi = Math.max(0, Math.min(127, Math.round(numeric(note.midi, 60))));
      return {
        midi,
        pc: midi % 12,
        startTick,
        rawEndTick: startTick + durationTicks,
        endTick: startTick + durationTicks,
        velocity: Math.max(0, Math.min(1, numeric(note.velocity, 0.8))),
        sourceNoteIndex,
      };
    })
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi || a.rawEndTick - b.rawEndTick);

  const nextStarts = nextSamePitchStarts(baseNotes);
  let sustainExtendedNotes = 0;
  let trackEndTick = numeric(track.endOfTrackTicks, 0);
  for (const note of baseNotes) trackEndTick = Math.max(trackEndTick, note.rawEndTick);
  for (const event of sustainEvents) trackEndTick = Math.max(trackEndTick, event.tick);
  for (let index2 = 0; index2 < baseNotes.length; index2 += 1) {
    const note = baseNotes[index2];
    if (!pedalOnAt(sustainEvents, note.rawEndTick)) continue;
    const release = nextPedalRelease(sustainEvents, note.rawEndTick) ?? trackEndTick;
    const retrigger = nextStarts[index2];
    const sustainedEnd = Math.min(release, retrigger ?? Infinity);
    if (sustainedEnd > note.endTick) {
      note.endTick = sustainedEnd;
      sustainExtendedNotes += 1;
    }
  }

  const instrument = track.instrument || {};
  const channel = Number.isInteger(track.channel) ? track.channel : null;
  const program = Number.isInteger(instrument.number) ? instrument.number : null;
  const family = instrument.family || "unknown";
  const instrumentName = instrument.name || "unknown";
  const isPercussion = Boolean(instrument.percussion)
    || channel === 9
    || /drum|percussion/i.test(`${family} ${instrumentName} ${track.name || ""}`);

  return {
    index,
    name: track.name || "",
    channel,
    program,
    instrumentName,
    instrumentFamily: family,
    isPercussion,
    sustainEvents,
    sustainExtendedNotes,
    notes: baseNotes.map((note) => ({ ...note, startBeat: note.startTick / ppq, endBeat: note.endTick / ppq })),
  };
}

export function normalizeTracks(midi, ppq, rawTrackNames = []) {
  const usedSourceIndices = new Set();
  const tracks = (midi.tracks || []).map((track, parsedIndex) => {
    const normalizedName = String(track.name || "").trim().toLowerCase();
    const sourceMatch = rawTrackNames.find((entry) => (
      !usedSourceIndices.has(entry.trackIndex)
      && normalizedName
      && entry.name.trim().toLowerCase() === normalizedName
    ));
    const sourceIndex = sourceMatch?.trackIndex ?? parsedIndex;
    usedSourceIndices.add(sourceIndex);
    const normalized = normalizeTrack(track, sourceIndex, ppq);
    normalized.parsedIndex = parsedIndex;
    return normalized;
  });
  classifyTrackRoles(tracks, ppq);
  for (const track of tracks) {
    for (const note of track.notes) {
      note.trackIndex = track.index;
      note.isPercussion = track.isPercussion;
      note.harmonyWeight = track.harmonyWeight;
      note.roles = track.roles;
    }
  }
  return tracks;
}

function normalizeTonic(rawKey) {
  if (typeof rawKey === "number" && rawKey >= -7 && rawKey <= 7) return KEY_SIGNATURE_TONICS[rawKey + 7];
  const text = String(rawKey || "").replace(/♭/g, "b").replace(/♯/g, "#").trim();
  if (tonicToPc(text) !== null) return text;
  return null;
}

function normalizeScale(rawScale) {
  if (rawScale === 1 || String(rawScale).toLowerCase() === "minor") return "minor";
  return "major";
}

function dedupeTimeline(events, identity) {
  const seen = new Set();
  return events
    .sort((a, b) => a.tick - b.tick)
    .filter((event) => {
      const key = `${event.tick}|${identity(event)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeMetadata(midi, embeddedHooktheory = null) {
  const embeddedTempos = Array.isArray(embeddedHooktheory?.tempos) ? embeddedHooktheory.tempos : [];
  const embeddedMeters = Array.isArray(embeddedHooktheory?.meters) ? embeddedHooktheory.meters : [];
  const embeddedKeys = Array.isArray(embeddedHooktheory?.keys) ? embeddedHooktheory.keys : [];
  const rawTempos = embeddedTempos.length
    ? embeddedTempos.map((tempo) => ({ ...tempo, ticks: tempo.tick, exactHooktheory: true }))
    : Array.isArray(midi.header?.tempos) ? midi.header.tempos : [];
  const rawMeters = embeddedMeters.length
    ? embeddedMeters.map((meter) => ({ ...meter, ticks: meter.tick, exactHooktheory: true }))
    : Array.isArray(midi.header?.timeSignatures) ? midi.header.timeSignatures : [];
  const rawKeys = embeddedKeys.length
    ? embeddedKeys.map((key) => ({ ...key, ticks: key.tick, exactHooktheory: true }))
    : Array.isArray(midi.header?.keySignatures) ? midi.header.keySignatures : [];

  const tempos = dedupeTimeline(rawTempos.map((tempo) => ({
    tick: Math.max(0, Math.round(numeric(tempo.ticks, 0))),
    bpm: Math.max(1, numeric(tempo.bpm, 120)),
    swingFactor: numeric(tempo.swingFactor, 0),
    swingBeat: numeric(tempo.swingBeat, 0.5),
    defaulted: false,
  })), (tempo) => tempo.bpm);
  if (!tempos.length) tempos.push({ tick: 0, bpm: 120, defaulted: true });

  const meters = dedupeTimeline(rawMeters.map((meter) => {
    const signature = meter.timeSignature || meter.signature || [];
    return {
      tick: Math.max(0, Math.round(numeric(meter.ticks, 0))),
      numerator: Math.max(1, Math.round(numeric(signature[0] ?? meter.numerator, 4))),
      denominator: Math.max(1, Math.round(numeric(signature[1] ?? meter.denominator, 4))),
      beatUnit: numeric(meter.beatUnit, 4 / Math.max(1, Math.round(numeric(signature[1] ?? meter.denominator, 4)))),
      defaulted: false,
    };
  }), (meter) => `${meter.numerator}/${meter.denominator}`);
  if (!meters.length) meters.push({ tick: 0, numerator: 4, denominator: 4, defaulted: true });

  const keySignatures = dedupeTimeline(rawKeys.map((signature) => {
    const signatureTonic = normalizeTonic(signature.key ?? signature.tonic);
    const scale = normalizeScale(signature.scale);
    const tonic = signature.exactHooktheory
      ? signatureTonic
      : scale === "minor" ? RELATIVE_MINOR_TONICS.get(signatureTonic) ?? null : signatureTonic;
    return tonic ? {
      tick: Math.max(0, Math.round(numeric(signature.ticks, 0))),
      tonic,
      tonicPc: tonicToPc(tonic),
      scale: signature.exactHooktheory ? String(signature.scale || "major") : scale,
      defaulted: false,
      source: signature.exactHooktheory ? "embedded-hooktheory" : "midi-key-signature",
      authority: signature.exactHooktheory ? "authoritative" : "weak",
      exact: Boolean(signature.exactHooktheory),
    } : null;
  }).filter(Boolean), (signature) => `${signature.tonic}:${signature.scale}`);

  return {
    tempos,
    meters,
    keySignatures,
    defaultsUsed: {
      tempo: rawTempos.length === 0,
      meter: rawMeters.length === 0,
      key: false,
    },
  };
}

export function buildMarkerSections(markers, endTick, ppq) {
  const unique = [];
  const seen = new Set();
  for (const marker of markers) {
    const tick = Math.max(0, Math.min(endTick, Math.round(marker.tick)));
    const id = `${tick}|${marker.name.toLowerCase()}`;
    if (seen.has(id) || tick >= endTick) continue;
    seen.add(id);
    unique.push({ ...marker, tick });
  }
  unique.sort((a, b) => (
    a.tick - b.tick
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  ));
  return unique.map((marker, index) => {
    const next = unique.slice(index + 1).find((candidate) => candidate.tick > marker.tick);
    const markerEnd = next?.tick ?? endTick;
    return {
      index,
      name: marker.name,
      type: marker.type,
      trackIndex: marker.trackIndex,
      startTick: marker.tick,
      endTick: markerEnd,
      startBeat: round(marker.tick / ppq),
      endBeat: round(markerEnd / ppq),
    };
  });
}

export function selectSection(availableSections, endTick, options = {}) {
  const selector = options.marker ?? options.section ?? options.sectionName;
  if (selector === undefined || selector === null || selector === "" || String(selector).toLowerCase() === "full song") {
    return { name: options.defaultSectionName || "Full Song", startTick: 0, endTick, marker: null };
  }

  let selected = null;
  if (Number.isInteger(selector) || /^\d+$/.test(String(selector))) {
    selected = availableSections[Number(selector)] || null;
  } else {
    const wanted = String(selector).trim().toLowerCase();
    selected = availableSections.find((section) => section.name.toLowerCase() === wanted)
      || availableSections.find((section) => section.name.toLowerCase().includes(wanted));
  }
  if (!selected) {
    throw new MidiAnalysisError(`MIDI marker section not found: ${selector}`, {
      code: "MIDI_MARKER_NOT_FOUND",
      statusCode: 400,
      details: { availableMarkers: availableSections.map((section) => section.name) },
    });
  }
  return { name: selected.name, startTick: selected.startTick, endTick: selected.endTick, marker: selected };
}

export function activeTimelineSlice(events, startTick, endTick) {
  const before = events.filter((event) => event.tick <= startTick).sort((a, b) => b.tick - a.tick)[0];
  const within = events.filter((event) => event.tick > startTick && event.tick < endTick);
  const result = before ? [{ ...before, tick: startTick }, ...within] : within.slice();
  return result.sort((a, b) => a.tick - b.tick);
}

export function extractedMetadata({ metadata, keySignatures, startTick, endTick, ppq, availableSections }) {
  const toBeat = (tick) => round(1 + (tick - startTick) / ppq);
  return {
    version: 1,
    keys: keySignatures.map((key) => ({ beat: toBeat(key.tick), tonic: key.tonic, scale: key.scale })),
    tempos: activeTimelineSlice(metadata.tempos, startTick, endTick).map((tempo) => ({
      beat: toBeat(tempo.tick),
      bpm: round(tempo.bpm),
      swingFactor: round(tempo.swingFactor ?? 0),
      swingBeat: round(tempo.swingBeat ?? 0.5),
    })),
    meters: activeTimelineSlice(metadata.meters, startTick, endTick).map((meter) => ({
      beat: toBeat(meter.tick),
      numBeats: meter.numerator,
      beatUnit: round(meter.beatUnit ?? 4 / meter.denominator),
    })),
    sections: availableSections.map((section) => ({
      name: section.name,
      beat: round(1 + (section.startTick - startTick) / ppq),
    })).filter((section) => section.beat >= 1 && section.beat < 1 + (endTick - startTick) / ppq),
    endBeat: round(1 + (endTick - startTick) / ppq),
  };
}

export function fallbackKeySignature(bestKey, startTick) {
  const tonic = tonicToPc(bestKey.tonic) === null ? PC_NAMES[0] : bestKey.tonic;
  return [{
    tick: startTick,
    tonic,
    tonicPc: tonicToPc(tonic),
    scale: bestKey.scale,
    inferred: true,
    exact: false,
    source: "global-profile-fallback",
    authority: "inferred",
    confidence: 0.5,
  }];
}
