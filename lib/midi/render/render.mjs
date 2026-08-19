import crypto from "node:crypto";
import ToneMidi from "@tonejs/midi";
import MidiFile from "midi-file";

import { midiKeySignatureFor, PPQ } from "./pitch.mjs";

const { Midi } = ToneMidi;
const { parseMidi, writeMidi } = MidiFile;

export const RENDERER_NAME = "diatonic-ring-theory-to-midi";
export const RENDERER_VERSION = "1.0.0";

function ascii(value, fallback = "") {
  const normalized = String(value ?? fallback).normalize("NFKD");
  return normalized.replace(/[^\x20-\x7E]/g, "?");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function base64UrlJson(value) {
  return Buffer.from(stableStringify(value), "utf8").toString("base64url");
}

function embeddedMeta(plan, sourceSha256) {
  const provenance = {
    schemaVersion: "1.0.0",
    renderer: {
      name: RENDERER_NAME,
      version: RENDERER_VERSION,
      ppq: PPQ,
    },
    decoder: plan.provenance?.decoder ?? null,
    decoderVersion: plan.provenance?.decoderVersion ?? null,
    artifactKind: plan.provenance?.artifactKind ?? "synthetic",
    source: plan.provenance?.source ?? null,
    sourceSha256,
    splitMetadata: plan.provenance?.splitMetadata ?? null,
    augmentation: plan.augmentation ?? null,
  };
  const events = [{
    ticks: 0,
    type: "text",
    text: `hooktheory:provenance:v1:${base64UrlJson(provenance)}`,
  }];
  for (const event of plan.keyEvents) {
    events.push({
      ticks: event.ticks,
      type: "marker",
      text: `hooktheory:key:v1:${base64UrlJson({
        beat: event.beat,
        tonic: event.tonic,
        scale: event.scale,
        tonic_sd: event.tonic_sd ?? null,
      })}`,
    });
  }
  for (const event of plan.tempoEvents) {
    events.push({
      ticks: event.ticks,
      type: "marker",
      text: `hooktheory:tempo:v1:${base64UrlJson({
        beat: event.beat,
        bpm: event.bpm,
        swingFactor: event.swingFactor ?? null,
        swingBeat: event.swingBeat ?? null,
        inferred: Boolean(event.inferred),
      })}`,
    });
  }
  for (const event of plan.meterEvents) {
    events.push({
      ticks: event.ticks,
      type: "marker",
      text: `hooktheory:meter:v1:${base64UrlJson({
        beat: event.beat,
        numBeats: event.numBeats ?? event.numerator,
        beatUnit: event.beatUnit ?? null,
        numerator: event.numerator,
        denominator: event.denominator,
        inferred: Boolean(event.inferred),
      })}`,
    });
  }
  return events.sort((a, b) => a.ticks - b.ticks || a.text.localeCompare(b.text));
}

function createMidiHeader(plan, sourceSha256) {
  const keySignatures = plan.keyEvents.flatMap((event) => {
    const signature = midiKeySignatureFor(event);
    if (!signature) return [];
    return [{
      ticks: event.ticks,
      key: signature.signatureKey,
      scale: signature.scale,
    }];
  });
  return {
    name: ascii(plan.name, "Hooktheory section"),
    ppq: PPQ,
    tempos: plan.tempoEvents.map((event) => ({ ticks: event.ticks, bpm: event.bpm })),
    timeSignatures: plan.meterEvents.map((event) => ({
      ticks: event.ticks,
      timeSignature: [event.numerator, event.denominator],
    })),
    keySignatures,
    meta: embeddedMeta(plan, sourceSha256),
  };
}

function correctToneJsKeySignatures(encoded, plan) {
  const expected = plan.keyEvents.flatMap((event) => {
    const signature = midiKeySignatureFor(event);
    return signature ? [signature] : [];
  });
  if (!expected.length) return encoded;

  // @tonejs/midi 2.0.28 encodes index + 7 where the MIDI event requires
  // index - 7. Round-trip through its low-level dependency and replace only
  // key-signature payloads, leaving Tone's high-level track encoding intact.
  const rawMidi = parseMidi(encoded);
  const keyEvents = rawMidi.tracks.flatMap((track) => (
    track.filter((event) => event.type === "keySignature")
  ));
  if (keyEvents.length !== expected.length) {
    throw new Error(`Expected ${expected.length} encoded key signatures, found ${keyEvents.length}`);
  }
  keyEvents.forEach((event, index) => {
    event.key = expected[index].fifths;
    event.scale = expected[index].scale === "minor" ? 1 : 0;
  });
  return new Uint8Array(writeMidi(rawMidi));
}

function addPlanTrack(midi, planTrack, durationTicks) {
  const track = midi.addTrack();
  track.name = ascii(planTrack.name, planTrack.id || "Track");
  track.channel = planTrack.channel;
  track.instrument.number = planTrack.program;
  for (const note of planTrack.notes) {
    track.addNote({
      midi: note.midi,
      ticks: note.ticks,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
      noteOffVelocity: note.noteOffVelocity ?? 0,
    });
  }
  for (const control of planTrack.controlChanges || []) {
    track.addCC({
      number: control.number,
      ticks: control.ticks,
      value: control.value,
    });
  }
  track.endOfTrackTicks = durationTicks;
  return track;
}

function renderSummary(plan, midi) {
  const keyEvents = plan.keyEvents.map((event) => ({
    beat: event.beat,
    ticks: event.ticks,
    tonic: event.tonic,
    scale: event.scale,
    midiKeySignature: midiKeySignatureFor(event),
  }));
  return {
    ppq: PPQ,
    midiFormat: 1,
    durationTicks: plan.durationTicks,
    tempoEvents: plan.tempoEvents.map((event) => ({
      beat: event.beat,
      ticks: event.ticks,
      bpm: event.bpm,
      swingFactor: event.swingFactor ?? null,
      swingBeat: event.swingBeat ?? null,
      inferred: Boolean(event.inferred),
    })),
    meterEvents: plan.meterEvents.map((event) => ({
      beat: event.beat,
      ticks: event.ticks,
      numerator: event.numerator,
      denominator: event.denominator,
      sourceBeatUnit: event.beatUnit ?? null,
      inferred: Boolean(event.inferred),
    })),
    keyEvents,
    tracks: midi.tracks.map((track, index) => ({
      index,
      id: plan.tracks[index]?.id ?? null,
      name: track.name,
      channel: track.channel,
      program: track.instrument.number,
      noteCount: track.notes.length,
      controlChangeCount: Object.values(track.controlChanges).reduce((total, events) => total + events.length, 0),
      durationTicks: track.durationTicks,
    })),
  };
}

function noteProvenance(note) {
  return {
    midi: note.midi,
    decodedName: note.decodedName ?? null,
    ticks: note.ticks,
    durationTicks: note.durationTicks,
    velocity: note.velocity,
    groupId: note.groupId,
    sourceIndex: note.sourceIndex,
    voiceIndex: note.voiceIndex,
    sourceBeat: note.sourceBeat,
    sourceDuration: note.sourceDuration,
    sourceScaleDegree: note.sourceScaleDegree ?? null,
    sourceChordRoot: note.sourceChordRoot ?? null,
    activeKey: note.activeKey ?? null,
    sourceTrack: note.sourceTrack ?? null,
    augmentation: note.augmentation ?? null,
    transposedFromMidi: note.transposedFromMidi ?? null,
  };
}

function createSidecar(plan, sourceSha256, midiSha256, midi) {
  return {
    schemaVersion: "1.0.0",
    generator: {
      name: RENDERER_NAME,
      version: RENDERER_VERSION,
    },
    rendererFamilyId: plan.augmentation?.rendererFamilyId ?? "canonical-v1",
    familyHoldoutKey: plan.augmentation?.familyHoldoutKey ?? "canonical-v1",
    source: plan.provenance?.source ?? null,
    sourceProvenance: plan.provenance?.sourceProvenance ?? null,
    splitMetadata: plan.provenance?.splitMetadata ?? null,
    decoder: plan.provenance?.decoder ?? null,
    decoderVersion: plan.provenance?.decoderVersion ?? null,
    artifactKind: plan.provenance?.artifactKind ?? "synthetic",
    sourceSha256,
    midiSha256,
    augmentation: plan.augmentation ?? null,
    render: renderSummary(plan, midi),
    tracks: plan.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      channel: track.channel,
      program: track.program,
      sourceLane: track.sourceLane ?? null,
      mergedFrom: track.mergedFrom ?? null,
      splitFrom: track.splitFrom ?? null,
      instrumentAugmentation: track.instrumentAugmentation ?? null,
      controlChanges: track.controlChanges ?? [],
      notes: track.notes.map(noteProvenance),
      decodedChords: track.decodedChords ?? null,
    })),
  };
}

export function renderPlanToMidi(plan, { sourceSha256 = null } = {}) {
  if (!plan || plan.ppq !== PPQ || !Array.isArray(plan.tracks)) {
    throw new TypeError(`plan must be a ${PPQ}-PPQ render plan`);
  }
  const midi = new Midi();
  midi.header.fromJSON(createMidiHeader(plan, sourceSha256));
  plan.tracks.forEach((track) => addPlanTrack(midi, track, plan.durationTicks));
  const bytes = correctToneJsKeySignatures(midi.toArray(), plan);
  const midiSha256 = sha256(bytes);
  const sidecar = createSidecar(plan, sourceSha256, midiSha256, midi);
  return { bytes, midi, sidecar };
}
