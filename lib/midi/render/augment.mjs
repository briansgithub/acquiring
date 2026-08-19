import { transposeTonic } from "./pitch.mjs";
import { resolveAugmentationFamily } from "./families.mjs";

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomChoice(random, values) {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function randomSignedInteger(random, limit) {
  if (!limit) return 0;
  return Math.floor(random() * ((2 * limit) + 1)) - limit;
}

function normalizeInteger(value, fallback, label, { min = -Infinity, max = Infinity } = {}) {
  const numeric = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new RangeError(`${label} must be an integer in ${min}..${max}`);
  }
  return numeric;
}

function normalizeNumber(value, fallback, label, { min = -Infinity, max = Infinity } = {}) {
  const numeric = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new RangeError(`${label} must be a finite number in ${min}..${max}`);
  }
  return numeric;
}

function normalizeChannel(value, fallback, label) {
  const channel = normalizeInteger(value, fallback, label, { min: 0, max: 15 });
  if (channel === 9) throw new RangeError(`${label} cannot use percussion channel 9`);
  return channel;
}

function normalizeEnum(value, fallback, label, allowed) {
  const normalized = value === undefined || value === null ? fallback : value;
  if (!allowed.includes(normalized)) {
    throw new RangeError(`${label} must be one of ${allowed.map(String).join(", ")}`);
  }
  return normalized;
}

function normalizeStringArray(value, fallback, label) {
  const array = value === undefined ? fallback : value;
  if (!Array.isArray(array) || array.some((entry) => typeof entry !== "string" || !entry)) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(array)];
}

function normalizeProgramChanges(value) {
  if (value === undefined || value === null || value === false) return null;
  if (value === "seeded") return "seeded";
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("instrumentPrograms must be 'seeded' or an object keyed by track ID");
  }
  return Object.fromEntries(Object.entries(value).map(([trackId, program]) => [
    trackId,
    normalizeInteger(program, 0, `instrumentPrograms.${trackId}`, { min: 0, max: 127 }),
  ]));
}

function normalizeOctaveShift(value) {
  if (value === "seeded") return value;
  return normalizeInteger(value, 0, "octaveShiftOctaves", { min: -8, max: 8 });
}

function normalizeAugmentation(config) {
  const timing = config.timing || {};
  const velocity = config.velocity || {};
  return {
    seed: String(config.seed ?? "0"),
    transposeSemitones: normalizeInteger(config.transposeSemitones, 0, "transposeSemitones", { min: -127, max: 127 }),
    octaveShiftOctaves: normalizeOctaveShift(config.octaveShiftOctaves ?? config.octaveShift),
    octaveDoubling: normalizeEnum(config.octaveDoubling, false, "octaveDoubling", [false, "up", "down", "both", "seeded"]),
    octaveTargets: normalizeStringArray(config.octaveTargets, ["melody", "harmony"], "octaveTargets"),
    voicingVariant: normalizeEnum(config.voicingVariant, false, "voicingVariant", [false, "rotate-up", "rotate-down", "spread", "close", "seeded"]),
    strumTicks: normalizeInteger(config.strumTicks ?? config.arpeggioTicks, 0, "strumTicks", { min: 0, max: 1_000_000 }),
    strumDirection: normalizeEnum(config.strumDirection, "up", "strumDirection", ["up", "down", "seeded"]),
    bassSplit: Boolean(config.bassSplit),
    bassMode: normalizeEnum(config.bassMode, "move", "bassMode", ["move", "duplicate"]),
    bassOctaveShift: normalizeInteger(config.bassOctaveShift, 0, "bassOctaveShift", { min: -8, max: 8 }),
    bassProgram: normalizeInteger(config.bassProgram, 32, "bassProgram", { min: 0, max: 127 }),
    bassChannel: normalizeChannel(config.bassChannel, 2, "bassChannel"),
    sustainPedal: Boolean(config.sustainPedal),
    sustainTargets: normalizeStringArray(config.sustainTargets, ["harmony", "bass"], "sustainTargets"),
    syncopationTicks: normalizeInteger(config.syncopationTicks, 0, "syncopationTicks", { min: 0, max: 1_000_000 }),
    syncopationProbability: normalizeNumber(config.syncopationProbability, 1, "syncopationProbability", { min: 0, max: 1 }),
    velocityScale: normalizeNumber(config.velocityScale ?? velocity.scale, 1, "velocityScale", { min: 0, max: 8 }),
    velocityJitter: normalizeNumber(config.velocityJitter ?? velocity.jitter, 0, "velocityJitter", { min: 0, max: 1 }),
    timingJitterTicks: normalizeInteger(config.timingJitterTicks ?? timing.startJitterTicks, 0, "timingJitterTicks", { min: 0, max: 1_000_000 }),
    durationJitterTicks: normalizeInteger(config.durationJitterTicks ?? timing.durationJitterTicks, 0, "durationJitterTicks", { min: 0, max: 1_000_000 }),
    layoutVariant: normalizeEnum(config.layoutVariant, false, "layoutVariant", [false, "dropout", "merge", "permutation", "seeded"]),
    dropTrackIds: normalizeStringArray(config.dropTrackIds, [], "dropTrackIds"),
    protectedTrackIds: normalizeStringArray(config.protectedTrackIds, [], "protectedTrackIds"),
    trackDropoutProbability: normalizeNumber(config.trackDropoutProbability, 0, "trackDropoutProbability", { min: 0, max: 1 }),
    permuteTracks: Boolean(config.permuteTracks),
    mergeTracks: Boolean(config.mergeTracks),
    mergedProgram: normalizeInteger(config.mergedProgram, 0, "mergedProgram", { min: 0, max: 127 }),
    instrumentPrograms: normalizeProgramChanges(config.instrumentPrograms ?? config.programChanges),
    outOfRange: normalizeEnum(config.outOfRange, "error", "outOfRange", ["error", "drop"]),
  };
}

const IMMUTABLE_KEYS = new Set([
  "split", "targetSplit", "datasetSplit", "fold", "group", "groupId", "splitGroup",
  "compositionGroupId", "mix", "mixWith", "source", "provenance", "dataset",
]);

function findImmutableOverride(value, path = "augmentation", seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (IMMUTABLE_KEYS.has(key)) return childPath;
    const nested = findImmutableOverride(child, childPath, seen);
    if (nested) return nested;
  }
  return null;
}

function assertSplitSafe(config) {
  const forbidden = findImmutableOverride(config);
  if (forbidden) {
    throw new Error(`${forbidden} cannot be overridden; dataset split metadata is immutable, including group identity`);
  }
}

function annotateNote(note, type, details = {}) {
  const previous = note.augmentation && typeof note.augmentation === "object" ? note.augmentation : {};
  note.augmentation = {
    ...previous,
    operations: [...(previous.operations || []), { type, ...details }],
  };
}

function sortNotes(notes) {
  notes.sort((a, b) => (
    a.ticks - b.ticks
    || a.sourceIndex - b.sourceIndex
    || (a.voiceIndex ?? 0) - (b.voiceIndex ?? 0)
    || a.midi - b.midi
  ));
}

function groupedNotes(track) {
  const groups = new Map();
  for (const note of track.notes) {
    const key = note.groupId ?? `${track.id}:${note.sourceIndex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  return [...groups.entries()].sort(([, left], [, right]) => (
    Math.min(...left.map((note) => note.ticks)) - Math.min(...right.map((note) => note.ticks))
  ));
}

function shiftedPitch(midi, semitones, outOfRange) {
  const shifted = midi + semitones;
  if (shifted >= 0 && shifted <= 127) return shifted;
  if (outOfRange === "drop") return null;
  throw new RangeError(`Shifting MIDI note ${midi} by ${semitones} exits MIDI's 0..127 range`);
}

function fitPitchClass(midi) {
  let fitted = midi;
  while (fitted < 0) fitted += 12;
  while (fitted > 127) fitted -= 12;
  return fitted;
}

function transposeNotes(tracks, semitones, outOfRange) {
  if (!semitones) return 0;
  let dropped = 0;
  for (const track of tracks) {
    const retained = [];
    for (const note of track.notes) {
      const midi = shiftedPitch(note.midi, semitones, outOfRange);
      if (midi === null) {
        dropped += 1;
        continue;
      }
      const previousMidi = note.midi;
      note.midi = midi;
      note.transposedFromMidi = previousMidi;
      annotateNote(note, "transpose", { semitones, fromMidi: previousMidi, toMidi: midi });
      retained.push(note);
    }
    track.notes = retained;
  }
  return dropped;
}

function seededOctaveShift(tracks, random) {
  const pitches = tracks.flatMap((track) => track.notes.map((note) => note.midi));
  const candidates = [-1, 1].filter((octaves) => pitches.every((midi) => midi + octaves * 12 >= 0 && midi + octaves * 12 <= 127));
  return candidates.length ? randomChoice(random, candidates) : 0;
}

function applyOctaveShift(tracks, octaves, outOfRange) {
  if (!octaves) return { octaves: 0, dropped: 0 };
  const semitones = octaves * 12;
  let dropped = 0;
  for (const track of tracks) {
    const retained = [];
    for (const note of track.notes) {
      const midi = shiftedPitch(note.midi, semitones, outOfRange);
      if (midi === null) {
        dropped += 1;
        continue;
      }
      const previousMidi = note.midi;
      note.midi = midi;
      annotateNote(note, "octave-shift", { octaves, fromMidi: previousMidi, toMidi: midi });
      retained.push(note);
    }
    track.notes = retained;
  }
  return { octaves, dropped };
}

function applyVoicingVariants(tracks, variant, random, operations) {
  if (!variant) return;
  const variants = ["rotate-up", "rotate-down", "spread", "close"];
  let groupCount = 0;
  for (const track of tracks.filter((candidate) => candidate.id === "harmony" || candidate.decodedChords?.length)) {
    for (const [groupId, notes] of groupedNotes(track)) {
      if (notes.length < 2) continue;
      const selected = variant === "seeded" ? randomChoice(random, variants) : variant;
      const ordered = [...notes].sort((a, b) => a.midi - b.midi || (a.voiceIndex ?? 0) - (b.voiceIndex ?? 0));
      const originalByNote = new Map(ordered.map((note) => [note, note.midi]));
      const before = ordered.map((note) => note.midi);
      if (selected === "rotate-up") ordered[0].midi = fitPitchClass(ordered[0].midi + 12);
      if (selected === "rotate-down") ordered.at(-1).midi = fitPitchClass(ordered.at(-1).midi - 12);
      if (selected === "spread") {
        ordered[0].midi = fitPitchClass(ordered[0].midi - 12);
        ordered.at(-1).midi = fitPitchClass(ordered.at(-1).midi + 12);
      }
      if (selected === "close") {
        const floor = ordered[0].midi;
        for (const note of ordered.slice(1)) {
          while (note.midi - floor > 12) note.midi -= 12;
          note.midi = fitPitchClass(note.midi);
        }
      }
      ordered.sort((a, b) => a.midi - b.midi);
      ordered.forEach((note, voiceIndex) => {
        const originalMidi = originalByNote.get(note);
        note.voiceIndex = voiceIndex;
        annotateNote(note, "voicing", { variant: selected, fromMidi: originalMidi, toMidi: note.midi });
      });
      operations.push({ type: "voicing", trackId: track.id, groupId, variant: selected, before, after: ordered.map((note) => note.midi) });
      groupCount += 1;
    }
    sortNotes(track.notes);
  }
  if (!groupCount) operations.push({ type: "voicing", variant, groups: 0 });
}

function applyOctaveDoubling(tracks, direction, targets, random, operations) {
  if (!direction) return;
  const resolvedDirection = direction === "seeded" ? randomChoice(random, ["up", "down", "both"]) : direction;
  const intervals = resolvedDirection === "both" ? [-12, 12] : [resolvedDirection === "down" ? -12 : 12];
  let added = 0;
  let skippedOutOfRange = 0;
  for (const track of tracks.filter((candidate) => targets.includes(candidate.id))) {
    const sourceNotes = [...track.notes];
    const nextVoice = new Map();
    for (const note of sourceNotes) {
      const key = note.groupId ?? String(note.sourceIndex);
      if (!nextVoice.has(key)) {
        nextVoice.set(key, Math.max(...sourceNotes.filter((candidate) => (candidate.groupId ?? String(candidate.sourceIndex)) === key).map((candidate) => candidate.voiceIndex ?? 0)) + 1);
      }
      for (const interval of intervals) {
        const midi = note.midi + interval;
        if (midi < 0 || midi > 127) {
          skippedOutOfRange += 1;
          continue;
        }
        const doubled = clonePlan(note);
        doubled.midi = midi;
        doubled.voiceIndex = nextVoice.get(key);
        nextVoice.set(key, doubled.voiceIndex + 1);
        doubled.doubledFromMidi = note.midi;
        annotateNote(doubled, "octave-doubling", { interval, fromMidi: note.midi, toMidi: midi });
        track.notes.push(doubled);
        added += 1;
      }
    }
    sortNotes(track.notes);
  }
  operations.push({ type: "octave-doubling", direction: resolvedDirection, targets, added, skippedOutOfRange });
}

function applySyncopation(tracks, ticks, probability, random, operations) {
  if (!ticks) return;
  const groups = new Map();
  for (const track of tracks) {
    for (const note of track.notes) {
      const key = String(note.sourceBeat ?? `${track.id}:${note.groupId}`);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ track, note });
    }
  }
  const orderedGroups = [...groups.entries()].sort(([, left], [, right]) => (
    Math.min(...left.map(({ note }) => note.ticks)) - Math.min(...right.map(({ note }) => note.ticks))
  ));
  let applied = 0;
  for (const [groupId, entries] of orderedGroups) {
    if (random() > probability) continue;
    const earliest = Math.min(...entries.map(({ note }) => note.ticks));
    const requested = random() < 0.5 && earliest >= ticks ? -ticks : ticks;
    for (const { note } of entries) {
      note.ticks = Math.max(0, note.ticks + requested);
      annotateNote(note, "syncopation", { ticksOffset: requested });
    }
    operations.push({ type: "syncopation", groupId, ticksOffset: requested });
    applied += 1;
  }
  if (!applied && orderedGroups.length && probability > 0) {
    const [groupId, entries] = randomChoice(random, orderedGroups);
    for (const { note } of entries) {
      note.ticks += ticks;
      annotateNote(note, "syncopation", { ticksOffset: ticks });
    }
    operations.push({ type: "syncopation", groupId, ticksOffset: ticks, forced: true });
  }
  for (const track of tracks) sortNotes(track.notes);
}

function applyStrum(tracks, ticks, direction, random, operations) {
  if (!ticks) return;
  for (const track of tracks.filter((candidate) => candidate.id === "harmony" || candidate.decodedChords?.length)) {
    for (const [groupId, notes] of groupedNotes(track)) {
      if (notes.length < 2) continue;
      const resolvedDirection = direction === "seeded" ? randomChoice(random, ["up", "down"]) : direction;
      const ordered = [...notes].sort((a, b) => (
        resolvedDirection === "down" ? b.midi - a.midi : a.midi - b.midi
      ));
      ordered.forEach((note, index) => {
        const offset = index * ticks;
        note.ticks += offset;
        note.durationTicks = Math.max(1, note.durationTicks - offset);
        annotateNote(note, "strum", { direction: resolvedDirection, ticksOffset: offset });
      });
      operations.push({ type: "strum", trackId: track.id, groupId, direction: resolvedDirection, spacingTicks: ticks });
    }
    sortNotes(track.notes);
  }
}

function applyBassSplit(tracks, normalized, operations) {
  if (!normalized.bassSplit) return tracks;
  const bassNotes = [];
  for (const track of tracks.filter((candidate) => candidate.id === "harmony" || candidate.decodedChords?.length)) {
    const moved = new Set();
    for (const [groupId, notes] of groupedNotes(track)) {
      if (!notes.length) continue;
      const source = [...notes].sort((a, b) => a.midi - b.midi || (a.voiceIndex ?? 0) - (b.voiceIndex ?? 0))[0];
      const bass = normalized.bassMode === "duplicate" ? clonePlan(source) : source;
      if (normalized.bassMode === "move") moved.add(source);
      const previousMidi = bass.midi;
      bass.midi = fitPitchClass(bass.midi + normalized.bassOctaveShift * 12);
      bass.sourceTrack = bass.sourceTrack || { id: track.id, name: track.name, channel: track.channel, program: track.program };
      annotateNote(bass, "bass-split", {
        mode: normalized.bassMode,
        octaveShift: normalized.bassOctaveShift,
        fromMidi: previousMidi,
        toMidi: bass.midi,
      });
      bassNotes.push(bass);
      operations.push({ type: "bass-split", groupId, mode: normalized.bassMode, fromMidi: previousMidi, toMidi: bass.midi });
    }
    if (moved.size) track.notes = track.notes.filter((note) => !moved.has(note));
    sortNotes(track.notes);
  }
  if (!bassNotes.length) return tracks;
  sortNotes(bassNotes);
  return [...tracks, {
    id: "bass",
    name: "Bass",
    channel: normalized.bassChannel,
    program: normalized.bassProgram,
    splitFrom: "harmony",
    notes: bassNotes,
    controlChanges: [],
    decodedChords: [],
  }];
}

function applySustainPedal(tracks, targets, operations) {
  for (const track of tracks.filter((candidate) => targets.includes(candidate.id) && candidate.notes.length)) {
    const start = Math.min(...track.notes.map((note) => note.ticks));
    const end = Math.max(...track.notes.map((note) => note.ticks + note.durationTicks));
    track.controlChanges = [...(track.controlChanges || []),
      { number: 64, ticks: start, value: 1, source: "augmentation" },
      { number: 64, ticks: end, value: 0, source: "augmentation" },
    ].sort((a, b) => a.ticks - b.ticks || a.number - b.number || a.value - b.value);
    operations.push({ type: "sustain-pedal", trackId: track.id, controller: 64, startTicks: start, endTicks: end });
  }
}

function perturbNotes(tracks, normalized, random, operations) {
  const enabled = normalized.velocityScale !== 1
    || normalized.velocityJitter
    || normalized.timingJitterTicks
    || normalized.durationJitterTicks;
  if (!enabled) return;
  const groupOffsets = new Map();
  for (const track of tracks) {
    for (const note of track.notes) {
      const groupKey = `${track.id}:${note.groupId}`;
      let offsets = groupOffsets.get(groupKey);
      if (!offsets) {
        offsets = {
          ticks: randomSignedInteger(random, normalized.timingJitterTicks),
          durationTicks: randomSignedInteger(random, normalized.durationJitterTicks),
          velocity: (random() * 2 - 1) * normalized.velocityJitter,
        };
        groupOffsets.set(groupKey, offsets);
      }
      const previous = note.augmentation && typeof note.augmentation === "object" ? note.augmentation : {};
      note.augmentation = {
        ...previous,
        ticksOffset: offsets.ticks,
        durationTicksOffset: offsets.durationTicks,
        velocityOffset: offsets.velocity,
        operations: [...(previous.operations || []), { type: "humanize", ...offsets }],
      };
      note.ticks = Math.max(0, note.ticks + offsets.ticks);
      note.durationTicks = Math.max(1, note.durationTicks + offsets.durationTicks);
      note.velocity = Math.min(1, Math.max(1 / 127, (note.velocity * normalized.velocityScale) + offsets.velocity));
    }
    sortNotes(track.notes);
  }
  operations.push({
    type: "humanize",
    velocityScale: normalized.velocityScale,
    velocityJitter: normalized.velocityJitter,
    timingJitterTicks: normalized.timingJitterTicks,
    durationJitterTicks: normalized.durationJitterTicks,
  });
}

const PROGRAM_POOLS = {
  melody: [0, 4, 11, 40, 73, 80],
  harmony: [0, 4, 19, 24, 48, 89],
  bass: [32, 33, 34, 35, 36, 38],
  default: [0, 4, 24, 48, 80],
};

function applyInstrumentPrograms(tracks, specification, random, operations) {
  if (!specification) return;
  for (const track of tracks) {
    let program;
    if (specification === "seeded") {
      const pool = PROGRAM_POOLS[track.id] || PROGRAM_POOLS.default;
      const alternatives = pool.filter((candidate) => candidate !== track.program);
      program = randomChoice(random, alternatives.length ? alternatives : pool);
    } else {
      program = specification[track.id] ?? specification["*"];
    }
    if (program === undefined || program === track.program) continue;
    const previousProgram = track.program;
    track.program = program;
    track.instrumentAugmentation = { fromProgram: previousProgram, toProgram: program };
    operations.push({ type: "instrument-program", trackId: track.id, fromProgram: previousProgram, toProgram: program });
  }
}

function dropTracks(tracks, normalized, random, forceDropout) {
  const protectedIds = new Set(normalized.protectedTrackIds);
  const explicitIds = new Set(normalized.dropTrackIds);
  for (const id of explicitIds) {
    if (!tracks.some((track) => track.id === id)) throw new RangeError(`dropTrackIds contains unknown track ${JSON.stringify(id)}`);
  }
  const dropped = tracks.filter((track) => (
    !protectedIds.has(track.id)
    && (explicitIds.has(track.id) || random() < normalized.trackDropoutProbability)
  ));
  if (forceDropout && !dropped.length && tracks.length > 1) {
    const candidates = tracks.filter((track) => !protectedIds.has(track.id));
    if (candidates.length) dropped.push(randomChoice(random, candidates));
  }
  if (dropped.length === tracks.length) {
    if (explicitIds.size === tracks.length) throw new Error("track dropout cannot remove every track");
    const retained = tracks.find((track) => track.id === "melody") || tracks[0];
    dropped.splice(dropped.indexOf(retained), 1);
  }
  const droppedSet = new Set(dropped);
  return {
    tracks: tracks.filter((track) => !droppedSet.has(track)),
    dropped: dropped.map((track) => ({ id: track.id, name: track.name, noteCount: track.notes.length, program: track.program })),
  };
}

function permuteTracks(tracks, random) {
  const original = tracks.map((track) => track.id);
  for (let index = tracks.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
  }
  if (tracks.length > 1 && tracks.every((track, index) => track.id === original[index])) {
    tracks.push(tracks.shift());
  }
}

function mergeTracks(tracks, mergedProgram) {
  const notes = tracks.flatMap((track) => track.notes.map((note) => ({
    ...note,
    sourceTrack: note.sourceTrack || { id: track.id, name: track.name, channel: track.channel, program: track.program },
  })));
  sortNotes(notes);
  const controlChanges = tracks.flatMap((track) => (track.controlChanges || []).map((control) => ({
    ...control,
    sourceTrackId: track.id,
  }))).sort((a, b) => a.ticks - b.ticks || a.number - b.number || a.value - b.value);
  return [{
    id: "combined",
    name: "Combined",
    channel: 0,
    program: mergedProgram,
    mergedFrom: tracks.map((track) => ({ id: track.id, name: track.name, channel: track.channel, program: track.program })),
    notes,
    controlChanges,
    decodedChords: tracks.flatMap((track) => (track.decodedChords || []).map((chord) => ({
      ...chord,
      sourceTrackId: track.id,
    }))),
  }];
}

function refreshDecodedChords(tracks) {
  const renderedBySource = new Map();
  for (const track of tracks) {
    for (const note of track.notes) {
      if (note.sourceChordRoot === undefined || note.sourceChordRoot === null) continue;
      if (!renderedBySource.has(note.sourceIndex)) renderedBySource.set(note.sourceIndex, new Set());
      renderedBySource.get(note.sourceIndex).add(note.midi);
    }
  }
  for (const track of tracks) {
    for (const chord of track.decodedChords || []) {
      chord.renderedMidi = [...(renderedBySource.get(chord.sourceIndex) || [])].sort((a, b) => a - b);
    }
  }
}

function resolveLayout(normalized, random) {
  const variant = normalized.layoutVariant === "seeded"
    ? randomChoice(random, ["dropout", "merge", "permutation"])
    : normalized.layoutVariant;
  return {
    variant,
    dropout: variant === "dropout"
      || normalized.dropTrackIds.length > 0
      || (!variant && normalized.trackDropoutProbability > 0),
    merge: variant === "merge" || normalized.mergeTracks,
    permutation: variant === "permutation" || normalized.permuteTracks,
  };
}

/**
 * Apply deterministic, within-example augmentation to a render plan. Recipes
 * assign stable renderer-family IDs; callers cannot mix sources or alter the
 * source split, fold, or grouping identity.
 */
export function augmentRenderPlan(plan, config = {}) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.tracks)) {
    throw new TypeError("plan must be a render plan returned by createRenderPlan()");
  }
  assertSplitSafe(config);
  const family = resolveAugmentationFamily(config);
  const normalized = normalizeAugmentation(family.config);
  const augmented = clonePlan(plan);
  const splitMetadata = clonePlan(plan.provenance?.splitMetadata || {});
  if (splitMetadata.split !== "train") {
    throw new Error("texture augmentation is training-only and requires splitMetadata.split = train");
  }
  if (typeof splitMetadata.group !== "string" || !splitMetadata.group.trim()) {
    throw new Error("texture augmentation requires a frozen non-empty composition group");
  }
  const sourceId = plan.provenance?.source?.id
    ?? plan.provenance?.source?.songId
    ?? plan.name
    ?? "unknown";
  const effectiveSeed = [
    normalized.seed,
    family.rendererFamilyId,
    splitMetadata.split,
    splitMetadata.fold ?? "nofold",
    splitMetadata.group,
    sourceId,
  ].join("|");
  const random = mulberry32(hashSeed(effectiveSeed));
  const sourceTrackOrder = augmented.tracks.map((track) => track.id);
  const operations = [];

  const transpositionDropped = transposeNotes(augmented.tracks, normalized.transposeSemitones, normalized.outOfRange);
  if (normalized.transposeSemitones) {
    operations.push({ type: "transpose", semitones: normalized.transposeSemitones, dropped: transpositionDropped });
    for (const keyEvent of augmented.keyEvents) {
      keyEvent.sourceTonic = keyEvent.sourceTonic ?? keyEvent.tonic;
      keyEvent.tonic = transposeTonic(keyEvent.tonic, normalized.transposeSemitones);
    }
    for (const track of augmented.tracks) {
      for (const note of track.notes) {
        if (note.activeKey?.tonic) {
          note.activeKey.sourceTonic = note.activeKey.sourceTonic ?? note.activeKey.tonic;
          note.activeKey.tonic = transposeTonic(note.activeKey.tonic, normalized.transposeSemitones);
        }
      }
      for (const chord of track.decodedChords || []) {
        if (chord.activeKey?.tonic) {
          chord.activeKey.sourceTonic = chord.activeKey.sourceTonic ?? chord.activeKey.tonic;
          chord.activeKey.tonic = transposeTonic(chord.activeKey.tonic, normalized.transposeSemitones);
        }
      }
    }
  }

  const resolvedOctaveShift = normalized.octaveShiftOctaves === "seeded"
    ? seededOctaveShift(augmented.tracks, random)
    : normalized.octaveShiftOctaves;
  const octaveShift = applyOctaveShift(augmented.tracks, resolvedOctaveShift, normalized.outOfRange);
  if (octaveShift.octaves) operations.push({ type: "octave-shift", ...octaveShift });
  applyVoicingVariants(augmented.tracks, normalized.voicingVariant, random, operations);
  applyOctaveDoubling(augmented.tracks, normalized.octaveDoubling, normalized.octaveTargets, random, operations);
  applySyncopation(augmented.tracks, normalized.syncopationTicks, normalized.syncopationProbability, random, operations);
  applyStrum(augmented.tracks, normalized.strumTicks, normalized.strumDirection, random, operations);
  augmented.tracks = applyBassSplit(augmented.tracks, normalized, operations);
  perturbNotes(augmented.tracks, normalized, random, operations);
  if (normalized.sustainPedal) applySustainPedal(augmented.tracks, normalized.sustainTargets, operations);

  const layout = resolveLayout(normalized, random);
  let droppedTracks = [];
  if (layout.dropout) {
    const dropout = dropTracks(augmented.tracks, normalized, random, layout.variant === "dropout");
    augmented.tracks = dropout.tracks;
    droppedTracks = dropout.dropped;
    operations.push({ type: "track-dropout", droppedTracks });
  }
  if (layout.permutation) {
    const before = augmented.tracks.map((track) => track.id);
    permuteTracks(augmented.tracks, random);
    operations.push({ type: "track-permutation", before, after: augmented.tracks.map((track) => track.id) });
  }
  if (layout.merge) {
    const mergedFrom = augmented.tracks.map((track) => track.id);
    augmented.tracks = mergeTracks(augmented.tracks, normalized.mergedProgram);
    operations.push({ type: "track-merge", mergedFrom, outputTrackId: "combined" });
  }
  applyInstrumentPrograms(augmented.tracks, normalized.instrumentPrograms, random, operations);

  refreshDecodedChords(augmented.tracks);
  augmented.durationTicks = augmented.tracks.reduce((maximum, track) => {
    const noteEnd = track.notes.reduce((trackMaximum, note) => Math.max(trackMaximum, note.ticks + note.durationTicks), maximum);
    return (track.controlChanges || []).reduce((trackMaximum, control) => Math.max(trackMaximum, control.ticks), noteEnd);
  }, plan.durationTicks);
  augmented.provenance.splitMetadata = splitMetadata;
  augmented.augmentation = {
    schemaVersion: "renderer-augmentation/v2",
    rendererFamilyId: family.rendererFamilyId,
    familyHoldoutKey: family.rendererFamilyId,
    recipeId: family.recipeId,
    ...normalized,
    seed: normalized.seed,
    effectiveSeed,
    resolved: {
      ...normalized,
      octaveShiftOctaves: resolvedOctaveShift,
      layoutVariant: layout.variant,
    },
    operations,
    droppedTracks,
    sourceTrackOrder,
    outputTrackOrder: augmented.tracks.map((track) => track.id),
    splitMetadata,
    exampleGroupId: splitMetadata.group,
  };
  if (JSON.stringify(augmented.provenance.splitMetadata) !== JSON.stringify(splitMetadata)) {
    throw new Error("augmentation changed immutable split/group metadata");
  }
  return augmented;
}
