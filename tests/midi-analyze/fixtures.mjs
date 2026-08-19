function u16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function vlq(value) {
  const bytes = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  return bytes;
}

function textEvent(type, text) {
  const encoded = [...new TextEncoder().encode(text)];
  return [0xff, type, ...vlq(encoded.length), ...encoded];
}

function tempoEvent(bpm) {
  const micros = Math.round(60_000_000 / bpm);
  return [0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff];
}

function timeSignatureEvent(numerator, denominator) {
  const denominatorPower = Math.round(Math.log2(denominator));
  return [0xff, 0x58, 0x04, numerator, denominatorPower, 24, 8];
}

function keySignatureEvent(fifths = 0, minor = false) {
  return [0xff, 0x59, 0x02, fifths & 0xff, minor ? 1 : 0];
}

function trackChunk(events, endTick) {
  const sorted = events
    .map((event, index) => ({ order: index, ...event }))
    .sort((a, b) => a.tick - b.tick || a.order - b.order);
  const bytes = [];
  let priorTick = 0;
  for (const event of sorted) {
    bytes.push(...vlq(event.tick - priorTick), ...event.bytes);
    priorTick = event.tick;
  }
  bytes.push(...vlq(Math.max(0, endTick - priorTick)), 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(bytes.length), ...bytes];
}

export function buildMidi(format, tracks, ppq = 480) {
  const chunks = tracks.map((track) => trackChunk(track.events, track.endTick));
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64,
    ...u32(6),
    ...u16(format),
    ...u16(chunks.length),
    ...u16(ppq),
    ...chunks.flat(),
  ]);
}

function note(events, { start, end, midi, channel = 0, velocity = 100 }) {
  events.push({ tick: start, bytes: [0x90 | channel, midi, velocity] });
  events.push({ tick: end, bytes: [0x80 | channel, midi, 0] });
}

function chord(events, start, end, pitches, channel = 0) {
  for (const midi of pitches) note(events, { start, end, midi, channel, velocity: 92 });
}

export function type0HarmonyFixture() {
  const events = [
    { tick: 0, bytes: textEvent(0x03, "Harmony") },
    { tick: 0, bytes: textEvent(0x06, "Verse") },
    { tick: 0, bytes: tempoEvent(120) },
    { tick: 0, bytes: timeSignatureEvent(4, 4) },
    { tick: 0, bytes: keySignatureEvent(0, false) },
    { tick: 0, bytes: [0xc0, 0] },
    { tick: 0, bytes: [0xb0, 64, 127] },
    { tick: 960, bytes: [0xb0, 64, 0] },
  ];
  chord(events, 0, 480, [48, 52, 55]);
  chord(events, 960, 1920, [53, 57, 60]);
  chord(events, 1920, 2880, [43, 47, 50, 53]);
  chord(events, 2880, 3840, [48, 52, 55]);
  return buildMidi(0, [{ events, endTick: 3840 }]);
}

export function type1SongFixture() {
  const conductor = {
    endTick: 3840,
    events: [
      { tick: 0, bytes: textEvent(0x03, "Conductor") },
      { tick: 0, bytes: tempoEvent(100) },
      { tick: 0, bytes: timeSignatureEvent(4, 4) },
      { tick: 0, bytes: keySignatureEvent(0, false) },
      { tick: 0, bytes: textEvent(0x06, "Verse") },
      { tick: 1920, bytes: textEvent(0x06, "Chorus") },
    ],
  };
  const harmonyEvents = [
    { tick: 0, bytes: textEvent(0x03, "Piano Chords") },
    { tick: 0, bytes: [0xc0, 0] },
  ];
  chord(harmonyEvents, 0, 960, [48, 52, 55]);
  chord(harmonyEvents, 960, 1920, [53, 57, 60]);
  chord(harmonyEvents, 1920, 2880, [43, 47, 50, 53]);
  chord(harmonyEvents, 2880, 3840, [48, 52, 55]);

  const melodyEvents = [
    { tick: 0, bytes: textEvent(0x03, "Lead Flute") },
    { tick: 0, bytes: [0xc1, 73] },
  ];
  [72, 74, 76, 77, 79, 77, 76, 72].forEach((midi, index) => {
    note(melodyEvents, { start: index * 480, end: (index + 1) * 480, midi, channel: 1, velocity: 104 });
  });
  return buildMidi(1, [
    conductor,
    { events: harmonyEvents, endTick: 3840 },
    { events: melodyEvents, endTick: 3840 },
  ]);
}

export function modulationFixture() {
  const endTick = 7680;
  const conductor = {
    endTick,
    events: [
      { tick: 0, bytes: textEvent(0x03, "Conductor") },
      { tick: 0, bytes: tempoEvent(112) },
      { tick: 0, bytes: timeSignatureEvent(4, 4) },
    ],
  };
  const harmonyEvents = [
    { tick: 0, bytes: textEvent(0x03, "Piano Chords") },
    { tick: 0, bytes: [0xc0, 0] },
  ];
  const melodyEvents = [
    { tick: 0, bytes: textEvent(0x03, "Lead Flute") },
    { tick: 0, bytes: [0xc1, 73] },
  ];
  const regions = [
    { start: 0, pitches: [36, 48, 52, 55], scale: [72, 74, 76, 77, 79, 81, 83, 84] },
    { start: 3840, pitches: [38, 50, 54, 57], scale: [74, 76, 78, 79, 81, 83, 85, 86] },
  ];
  for (const region of regions) {
    for (let window = 0; window < 4; window += 1) {
      const windowStart = region.start + window * 960;
      chord(harmonyEvents, windowStart, windowStart + 960, region.pitches);
      region.scale.forEach((midi, index) => {
        note(melodyEvents, {
          start: windowStart + index * 120,
          end: windowStart + (index + 1) * 120,
          midi,
          channel: 1,
          velocity: 108,
        });
      });
    }
  }
  return buildMidi(1, [
    conductor,
    { events: harmonyEvents, endTick },
    { events: melodyEvents, endTick },
  ]);
}

export function syncopatedHarmonyFixture() {
  const events = [
    { tick: 0, bytes: textEvent(0x03, "Syncopated Harmony") },
    { tick: 0, bytes: tempoEvent(120) },
    { tick: 0, bytes: timeSignatureEvent(4, 4) },
    { tick: 0, bytes: keySignatureEvent(0, false) },
    { tick: 0, bytes: [0xc0, 0] },
  ];
  chord(events, 0, 720, [36, 48, 52, 55]);
  chord(events, 720, 1440, [41, 53, 57, 60]);
  chord(events, 1440, 2160, [43, 55, 59, 62]);
  chord(events, 2160, 2880, [36, 48, 52, 55]);
  return buildMidi(0, [{ events, endTick: 2880 }]);
}

export function type2Fixture() {
  return buildMidi(2, [
    { events: [], endTick: 0 },
    { events: [], endTick: 0 },
  ]);
}
