import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ToneMidi from "@tonejs/midi";

import { MidiAnalysisError, invalidMidi } from "./errors.js";

const { Midi } = ToneMidi;

const HEADER_ID = "MThd";
const TRACK_ID = "MTrk";
const HOOKTHEORY_META_PREFIX = /^hooktheory:(provenance|key|tempo|meter):/;
const HOOKTHEORY_META_EVENT = /^hooktheory:(provenance|key|tempo|meter):v1:([A-Za-z0-9_-]+)$/;

export const MAX_MIDI_BYTES = 100 * 1024 * 1024;
export const MAX_MIDI_EVENTS = 5_000_000;

function fourCc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes, offset) {
  return (((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]) >>> 0;
}

function readVlq(bytes, state, end) {
  let value = 0;
  for (let count = 0; count < 4; count += 1) {
    if (state.offset >= end) throw invalidMidi("Truncated MIDI variable-length value");
    const byte = bytes[state.offset++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw invalidMidi("Invalid MIDI variable-length value");
}

function decodeText(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "").trim();
  } catch {
    return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("").replace(/\0/g, "").trim();
  }
}

function decodeHooktheoryMeta(text, tick, trackIndex) {
  const prefix = HOOKTHEORY_META_PREFIX.exec(text);
  if (!prefix) return { reserved: false };
  const match = HOOKTHEORY_META_EVENT.exec(text);
  if (!match) {
    return { reserved: true, invalid: { tick, trackIndex, kind: prefix[1], reason: "unsupported_format" } };
  }
  try {
    const value = JSON.parse(Buffer.from(match[2], "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("metadata payload must be an object");
    }
    return { reserved: true, event: { kind: match[1], tick, trackIndex, value } };
  } catch (error) {
    return {
      reserved: true,
      invalid: { tick, trackIndex, kind: match[1], reason: "invalid_payload", message: error.message },
    };
  }
}

function systemDataLength(status) {
  if (status === 0xf1 || status === 0xf3) return 1;
  if (status === 0xf2) return 2;
  return 0;
}

function scanTrackMeta(bytes, start, end, trackIndex, eventBudget, maxEvents) {
  const markers = [];
  const trackNames = [];
  const hooktheoryEvents = [];
  const invalidHooktheoryEvents = [];
  const state = { offset: start };
  let tick = 0;
  let runningStatus = null;
  let eventCount = 0;

  while (state.offset < end) {
    tick += readVlq(bytes, state, end);
    if (state.offset >= end) break;
    eventCount += 1;
    if (eventCount > eventBudget) {
      throw new MidiAnalysisError(`MIDI exceeds the ${maxEvents} event limit`, {
        code: "MIDI_TOO_MANY_EVENTS",
        statusCode: 413,
        details: { maxEvents, trackIndex },
      });
    }

    let status = bytes[state.offset++];
    let firstDataByte = null;
    if (status < 0x80) {
      if (runningStatus === null) throw invalidMidi("MIDI running status used before a channel status");
      firstDataByte = status;
      status = runningStatus;
    }

    if (status === 0xff) {
      runningStatus = null;
      if (state.offset >= end) throw invalidMidi("Truncated MIDI meta event");
      const type = bytes[state.offset++];
      const length = readVlq(bytes, state, end);
      const payloadEnd = state.offset + length;
      if (payloadEnd > end) throw invalidMidi("Truncated MIDI meta-event payload");
      const payload = bytes.subarray(state.offset, payloadEnd);
      state.offset = payloadEnd;

      if (type === 0x03) {
        const name = decodeText(payload);
        if (name) trackNames.push({ tick, name, trackIndex });
      } else if (type === 0x01 || type === 0x06 || type === 0x07) {
        const name = decodeText(payload);
        if (name) {
          const decoded = decodeHooktheoryMeta(name, tick, trackIndex);
          if (decoded.event) hooktheoryEvents.push(decoded.event);
          if (decoded.invalid) invalidHooktheoryEvents.push(decoded.invalid);
          if (!decoded.reserved && (type === 0x06 || type === 0x07)) {
            markers.push({
              tick,
              name,
              type: type === 0x06 ? "marker" : "cue",
              trackIndex,
            });
          }
        }
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      runningStatus = null;
      const length = readVlq(bytes, state, end);
      state.offset += length;
      if (state.offset > end) throw invalidMidi("Truncated MIDI system-exclusive event");
      continue;
    }

    if (status >= 0x80 && status <= 0xef) {
      runningStatus = status;
      const kind = status & 0xf0;
      const dataLength = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      const remaining = dataLength - (firstDataByte === null ? 0 : 1);
      state.offset += remaining;
      if (state.offset > end) throw invalidMidi("Truncated MIDI channel event");
      continue;
    }

    runningStatus = null;
    state.offset += systemDataLength(status);
    if (state.offset > end) throw invalidMidi("Truncated MIDI system event");
  }

  return { markers, trackNames, hooktheoryEvents, invalidHooktheoryEvents, eventCount };
}

export function inspectSmf(bytes, { maxEvents = MAX_MIDI_EVENTS } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 14) {
    throw invalidMidi("Input is too short to contain an SMF header");
  }
  if (fourCc(bytes, 0) !== HEADER_ID) {
    throw invalidMidi("Input is not a Standard MIDI File (missing MThd header)");
  }

  const headerLength = readU32(bytes, 4);
  if (headerLength < 6 || 8 + headerLength > bytes.byteLength) {
    throw invalidMidi("Invalid or truncated SMF header", { headerLength });
  }

  const format = readU16(bytes, 8);
  const declaredTrackCount = readU16(bytes, 10);
  const division = readU16(bytes, 12);
  if (format === 2) {
    throw new MidiAnalysisError("SMF type 2 contains asynchronous songs and is not supported", {
      code: "UNSUPPORTED_MIDI_FORMAT",
      statusCode: 422,
      details: { format },
    });
  }
  if (format !== 0 && format !== 1) {
    throw invalidMidi(`Unsupported SMF format ${format}`, { format });
  }
  if ((division & 0x8000) !== 0) {
    throw new MidiAnalysisError("SMPTE time-division MIDI is not supported; PPQ timing is required", {
      code: "UNSUPPORTED_MIDI_TIMING",
      statusCode: 422,
      details: { division },
    });
  }
  if (division === 0) throw invalidMidi("SMF PPQ division must be greater than zero");
  if (format === 0 && declaredTrackCount !== 1) {
    throw invalidMidi("SMF type 0 must declare exactly one track", { declaredTrackCount });
  }

  const markers = [];
  const trackNames = [];
  const hooktheoryEvents = [];
  const invalidHooktheoryEvents = [];
  let trackCount = 0;
  let eventCount = 0;
  let offset = 8 + headerLength;
  while (offset + 8 <= bytes.byteLength) {
    const id = fourCc(bytes, offset);
    const length = readU32(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.byteLength) throw invalidMidi(`Truncated ${id || "SMF"} chunk`, { length });
    if (id === TRACK_ID) {
      const meta = scanTrackMeta(bytes, dataStart, dataEnd, trackCount, maxEvents - eventCount, maxEvents);
      for (const marker of meta.markers) markers.push(marker);
      for (const trackName of meta.trackNames) trackNames.push(trackName);
      for (const event of meta.hooktheoryEvents) hooktheoryEvents.push(event);
      for (const event of meta.invalidHooktheoryEvents) invalidHooktheoryEvents.push(event);
      eventCount += meta.eventCount;
      trackCount += 1;
    }
    offset = dataEnd;
  }

  if (trackCount !== declaredTrackCount) {
    throw invalidMidi("SMF track count does not match its header", {
      declaredTrackCount,
      parsedTrackCount: trackCount,
    });
  }

  markers.sort((a, b) => (
    a.tick - b.tick
    || a.trackIndex - b.trackIndex
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  ));
  hooktheoryEvents.sort((a, b) => (
    a.tick - b.tick
    || a.trackIndex - b.trackIndex
    || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
  ));
  const hooktheory = {
    provenance: hooktheoryEvents.filter((event) => event.kind === "provenance").at(-1)?.value ?? null,
    keys: hooktheoryEvents.filter((event) => event.kind === "key").map((event) => ({
      ...event.value,
      tick: event.tick,
      trackIndex: event.trackIndex,
    })),
    tempos: hooktheoryEvents.filter((event) => event.kind === "tempo").map((event) => ({
      ...event.value,
      tick: event.tick,
      trackIndex: event.trackIndex,
    })),
    meters: hooktheoryEvents.filter((event) => event.kind === "meter").map((event) => ({
      ...event.value,
      tick: event.tick,
      trackIndex: event.trackIndex,
    })),
    invalidEvents: invalidHooktheoryEvents,
  };
  return {
    format,
    declaredTrackCount,
    ppq: division,
    eventCount,
    markers,
    trackNames,
    hooktheory,
  };
}

function enforceByteLimit(byteLength, maxBytes) {
  if (byteLength > maxBytes) {
    throw new MidiAnalysisError(`MIDI exceeds the ${maxBytes} byte limit`, {
      code: "MIDI_TOO_LARGE",
      statusCode: 413,
      details: { byteLength, maxBytes },
    });
  }
}

export async function inputToBytes(input, { maxBytes = MAX_MIDI_BYTES } = {}) {
  if (typeof input === "string" || input instanceof URL) {
    try {
      const filePath = input instanceof URL ? fileURLToPath(input) : input;
      const fileInfo = await stat(filePath);
      enforceByteLimit(fileInfo.size, maxBytes);
      return new Uint8Array(await readFile(filePath));
    } catch (cause) {
      if (cause instanceof MidiAnalysisError) throw cause;
      throw new MidiAnalysisError("Unable to read MIDI input", {
        code: "MIDI_INPUT_READ_FAILED",
        statusCode: 400,
        details: { input: String(input) },
        cause,
      });
    }
  }
  if (input instanceof ArrayBuffer) {
    enforceByteLimit(input.byteLength, maxBytes);
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    enforceByteLimit(input.byteLength, maxBytes);
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new MidiAnalysisError("MIDI input must be a Buffer, Uint8Array, ArrayBuffer, URL, or file path", {
    code: "INVALID_MIDI_INPUT",
    statusCode: 400,
  });
}

export async function parseSmf(input, {
  maxBytes = MAX_MIDI_BYTES,
  maxEvents = MAX_MIDI_EVENTS,
} = {}) {
  const bytes = await inputToBytes(input, { maxBytes });
  const envelope = inspectSmf(bytes, { maxEvents });
  try {
    const midi = new Midi(bytes);
    return { bytes, envelope, midi };
  } catch (cause) {
    if (cause instanceof MidiAnalysisError) throw cause;
    throw invalidMidi("Unable to parse Standard MIDI File events", null, cause);
  }
}
