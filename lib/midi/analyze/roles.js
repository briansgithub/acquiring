const ROLE_NAMES = ["melody", "bass", "chord", "accompaniment", "drums"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function softmax(logits) {
  const max = Math.max(...Object.values(logits));
  const weights = Object.fromEntries(Object.entries(logits).map(([key, value]) => [key, Math.exp(value - max)]));
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(ROLE_NAMES.map((role) => [role, weights[role] / total]));
}

function includesAny(value, needles) {
  const normalized = String(value || "").toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function trackFeatures(track, ppq) {
  const notes = track.notes;
  const pitches = notes.map((note) => note.midi);
  const starts = new Map();
  let overlapCount = 0;
  let priorEnd = -Infinity;
  let firstStart = Infinity;
  let lastEnd = -Infinity;
  let minimumPitch = Infinity;
  let maximumPitch = -Infinity;
  for (const note of notes.slice().sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)) {
    starts.set(note.startTick, (starts.get(note.startTick) || 0) + 1);
    if (note.startTick < priorEnd - 1) overlapCount += 1;
    priorEnd = Math.max(priorEnd, note.rawEndTick);
    firstStart = Math.min(firstStart, note.startTick);
    lastEnd = Math.max(lastEnd, note.endTick);
    minimumPitch = Math.min(minimumPitch, note.midi);
    maximumPitch = Math.max(maximumPitch, note.midi);
  }
  const simultaneousNotes = Array.from(starts.values()).reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
  const totalBeats = notes.length === 0
    ? 0
    : Math.max(1 / ppq, (lastEnd - firstStart) / ppq);

  return {
    noteCount: notes.length,
    medianPitch: median(pitches),
    meanPitch: pitches.length ? pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length : null,
    pitchRange: pitches.length ? maximumPitch - minimumPitch : 0,
    monophony: notes.length < 2 ? 1 : 1 - overlapCount / (notes.length - 1),
    simultaneousRatio: notes.length ? simultaneousNotes / notes.length : 0,
    notesPerBeat: notes.length / Math.max(1, totalBeats),
  };
}

export function classifyTrackRoles(tracks, ppq) {
  for (const track of tracks) {
    const features = trackFeatures(track, ppq);
    const family = `${track.instrumentFamily || ""} ${track.instrumentName || ""} ${track.name || ""}`;
    const pitched = features.medianPitch ?? 60;
    const isBassProgram = includesAny(family, ["bass", "contrabass", "cello", "tuba"]);
    const isLeadProgram = includesAny(family, ["lead", "vocal", "voice", "choir", "flute", "sax", "reed", "violin", "trumpet"]);
    const isChordProgram = includesAny(family, ["piano", "keyboard", "organ", "guitar", "harp", "ensemble", "strings"]);

    const logits = track.isPercussion
      ? { melody: -7, bass: -7, chord: -7, accompaniment: -4, drums: 8 }
      : {
          melody: -0.25
            + (isLeadProgram ? 1.6 : 0)
            + clamp((pitched - 60) / 16, -1.2, 1.2)
            + 1.35 * features.monophony
            - 1.45 * features.simultaneousRatio,
          bass: -0.35
            + (isBassProgram ? 2.8 : 0)
            + clamp((55 - pitched) / 10, -1.4, 2)
            + 1.15 * features.monophony
            - 0.7 * features.simultaneousRatio,
          chord: -0.2
            + (isChordProgram ? 1.25 : 0)
            + 2.5 * features.simultaneousRatio
            + 0.9 * (1 - features.monophony),
          accompaniment: 0.4
            + (isChordProgram ? 0.55 : 0)
            + 0.55 * features.simultaneousRatio
            + 0.25 * clamp(features.notesPerBeat / 3, 0, 1),
          drums: -6,
        };

    track.features = features;
    track.roles = softmax(logits);
    track.harmonyWeight = track.isPercussion
      ? 0
      : track.roles.chord + 0.68 * track.roles.accompaniment + 0.88 * track.roles.bass + 0.18 * track.roles.melody;
  }
  return tracks;
}

export function serializeTrack(track) {
  const roundedRoles = Object.fromEntries(Object.entries(track.roles).map(([role, value]) => [role, Number(value.toFixed(6))]));
  return {
    index: track.index,
    parsedIndex: track.parsedIndex,
    name: track.name || `Track ${track.index + 1}`,
    channel: track.channel,
    program: track.program,
    instrumentName: track.instrumentName,
    instrumentFamily: track.instrumentFamily,
    isPercussion: track.isPercussion,
    noteCount: track.notes.length,
    sustainEventCount: track.sustainEvents.length,
    sustainExtendedNotes: track.sustainExtendedNotes,
    features: Object.fromEntries(Object.entries(track.features).map(([key, value]) => [key, value === null ? null : Number(value.toFixed(6))])),
    roles: roundedRoles,
  };
}
