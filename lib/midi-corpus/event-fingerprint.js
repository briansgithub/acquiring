'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const MidiFile = require('midi-file');
const { stableStringify } = require('./stable-json');

const { parseMidi } = MidiFile;

const EVENT_FINGERPRINT_VERSION = 'smf-structural-v1';
const DEFAULT_MAX_FINGERPRINT_BYTES = 100 * 1024 * 1024;

function fingerprintError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function greatestCommonDivisor(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function rationalString(numerator, denominator) {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

function normalizeValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return [...value];
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeValue(value[key])]));
  }
  return String(value);
}

function timingNormalizer(header) {
  if (Number.isInteger(header.ticksPerBeat) && header.ticksPerBeat > 0) {
    const denominator = BigInt(header.ticksPerBeat);
    return {
      timeBase: { kind: 'quarter_note' },
      atTick: (tick) => rationalString(tick, denominator),
    };
  }
  if (
    Number.isInteger(header.framesPerSecond) && header.framesPerSecond > 0
    && Number.isInteger(header.ticksPerFrame) && header.ticksPerFrame > 0
  ) {
    const denominator = BigInt(header.framesPerSecond) * BigInt(header.ticksPerFrame);
    return {
      timeBase: { kind: 'second' },
      atTick: (tick) => rationalString(tick, denominator),
    };
  }
  throw fingerprintError('INVALID_MIDI_TIME_DIVISION', 'MIDI has no valid PPQ or SMPTE time division');
}

function normalizeEvent(event, absoluteTick, atTick) {
  if (event.type === 'endOfTrack') return null;
  const normalized = { at: atTick(absoluteTick) };
  for (const key of Object.keys(event).sort()) {
    if (key === 'deltaTime' || key === 'running' || key === 'byte9' || key === 'meta') continue;
    normalized[key] = normalizeValue(event[key]);
  }
  // Note-on with velocity zero is the Standard MIDI File running-status-friendly
  // encoding of note-off. Canonicalize both spellings without release velocity,
  // which is not interpreted by this project's symbolic analyzer.
  if (normalized.type === 'noteOn' && normalized.velocity === 0) {
    normalized.type = 'noteOff';
  }
  if (normalized.type === 'noteOff') delete normalized.velocity;
  return normalized;
}

function normalizeTrack(track, atTick) {
  let absoluteTick = 0n;
  const events = [];
  for (const event of track) {
    if (!Number.isSafeInteger(event.deltaTime) || event.deltaTime < 0) {
      throw fingerprintError('INVALID_MIDI_DELTA_TIME', 'MIDI event has an invalid delta time');
    }
    absoluteTick += BigInt(event.deltaTime);
    const normalized = normalizeEvent(event, absoluteTick, atTick);
    if (normalized) events.push({ absoluteTick, normalized });
  }
  // Ordering independent simultaneous events is an SMF serialization choice.
  // A deterministic event sort also makes track permutations canonical below.
  events.sort((left, right) => {
    if (left.absoluteTick < right.absoluteTick) return -1;
    if (left.absoluteTick > right.absoluteTick) return 1;
    return stableStringify(left.normalized).localeCompare(stableStringify(right.normalized));
  });
  return { end: atTick(absoluteTick), events: events.map((entry) => entry.normalized) };
}

function normalizeMidiEvents(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let midi;
  try {
    midi = parseMidi(bytes);
  } catch (cause) {
    throw fingerprintError('INVALID_MIDI_FOR_FINGERPRINT', 'Cannot parse MIDI for event fingerprinting', cause);
  }
  if (![0, 1, 2].includes(midi.header?.format)) {
    throw fingerprintError('INVALID_MIDI_FORMAT', `Unsupported or invalid SMF format: ${midi.header?.format}`);
  }
  const { timeBase, atTick } = timingNormalizer(midi.header);
  const tracks = midi.tracks.map((track) => normalizeTrack(track, atTick));
  tracks.sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  return {
    schema: EVENT_FINGERPRINT_VERSION,
    time_base: timeBase,
    tracks,
  };
}

function fingerprintMidiBytes(input) {
  const normalized = normalizeMidiEvents(input);
  const canonical = stableStringify(normalized);
  const normalizedEventCount = normalized.tracks.reduce((sum, track) => sum + track.events.length, 0);
  return {
    algorithm_version: EVENT_FINGERPRINT_VERSION,
    event_fingerprint_sha256: crypto.createHash('sha256').update(canonical, 'utf8').digest('hex'),
    normalized_event_count: normalizedEventCount,
    track_count: normalized.tracks.length,
    canonical_byte_count: Buffer.byteLength(canonical, 'utf8'),
  };
}

async function fingerprintMidiFile(filePath, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FINGERPRINT_BYTES;
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw fingerprintError('MIDI_FINGERPRINT_NOT_FILE', `Not a regular MIDI file: ${filePath}`);
  if (stat.size > maxBytes) {
    const error = fingerprintError(
      'MIDI_FINGERPRINT_TOO_LARGE',
      `MIDI event fingerprint input exceeds ${maxBytes} bytes`,
    );
    error.details = { byte_count: stat.size, maximum_bytes: maxBytes };
    throw error;
  }
  return fingerprintMidiBytes(await fs.readFile(filePath));
}

module.exports = {
  DEFAULT_MAX_FINGERPRINT_BYTES,
  EVENT_FINGERPRINT_VERSION,
  fingerprintMidiBytes,
  fingerprintMidiFile,
  normalizeMidiEvents,
};
