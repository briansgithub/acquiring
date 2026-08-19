import { createHash } from "node:crypto";

export const BINARY_SCHEMA = "hooktheory-android-priors/v1";
export const ANALYZER_CONTRACT_VERSION = "android-deterministic-v1";
export const MAX_PACKAGED_PRIOR_BYTES = 12 * 1024 * 1024;

const MAGIC = Buffer.from("HTPR");
const VERSION = 1;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function assertInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
}

class Writer {
  constructor() {
    this.parts = [];
    this.length = 0;
  }

  bytes(value) {
    const bytes = Buffer.from(value);
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u8(value) {
    const bytes = Buffer.allocUnsafe(1);
    bytes.writeUInt8(value);
    this.bytes(bytes);
  }

  u16(value) {
    const bytes = Buffer.allocUnsafe(2);
    bytes.writeUInt16LE(value);
    this.bytes(bytes);
  }

  u32(value) {
    const bytes = Buffer.allocUnsafe(4);
    bytes.writeUInt32LE(value);
    this.bytes(bytes);
  }

  f64(value) {
    const bytes = Buffer.allocUnsafe(8);
    bytes.writeDoubleLE(Number(value));
    this.bytes(bytes);
  }

  varUint(value) {
    let remaining = BigInt(assertInteger(value, "varuint"));
    if (remaining < 0n) throw new RangeError("varuint cannot be negative");
    do {
      let byte = Number(remaining & 0x7fn);
      remaining >>= 7n;
      if (remaining) byte |= 0x80;
      this.u8(byte);
    } while (remaining);
  }

  varInt(value) {
    const integer = BigInt(assertInteger(value, "varint"));
    const zigzag = integer >= 0n ? integer * 2n : (-integer * 2n) - 1n;
    this.varUint(Number(zigzag));
  }

  finish() {
    return Buffer.concat(this.parts, this.length);
  }
}

class Reader {
  constructor(bytes) {
    this.bytes = Buffer.from(bytes);
    this.offset = 0;
  }

  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      throw new RangeError("Truncated Android prior asset");
    }
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  u8() { return this.take(1).readUInt8(); }
  u16() { return this.take(2).readUInt16LE(); }
  u32() { return this.take(4).readUInt32LE(); }
  f64() { return this.take(8).readDoubleLE(); }

  varUint() {
    let value = 0n;
    let shift = 0n;
    for (let index = 0; index < 10; index += 1) {
      const byte = this.u8();
      value |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new RangeError("Prior varuint exceeds safe integer range");
        return number;
      }
      shift += 7n;
    }
    throw new RangeError("Invalid prior varuint");
  }

  varInt() {
    const value = this.varUint();
    return value & 1 ? -((value + 1) / 2) : value / 2;
  }
}

function shaBytes(id) {
  const match = /^sha256:([0-9a-f]{64})$/i.exec(String(id));
  if (!match) throw new TypeError(`Invalid structural id: ${id}`);
  return Buffer.from(match[1], "hex");
}

function shaId(bytes) {
  return `sha256:${Buffer.from(bytes).toString("hex")}`;
}

function collectStrings(priors) {
  const values = new Set();
  for (const object of priors.objects) {
    const chord = object.chord;
    if (typeof chord.borrowed === "string" && chord.borrowed) values.add(chord.borrowed);
    for (const value of chord.alterations || []) values.add(String(value));
    for (const value of chord.substitutions || []) values.add(String(value));
    for (const row of object.byScale || []) values.add(String(row.scale));
  }
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function writeNumberArray(writer, values = []) {
  writer.varUint(values.length);
  for (const value of values) writer.varInt(value);
}

function readNumberArray(reader) {
  return Array.from({ length: reader.varUint() }, () => reader.varInt());
}

function writeStringArray(writer, values, stringIndex) {
  writer.varUint((values || []).length);
  for (const value of values || []) writer.varUint(stringIndex.get(String(value)));
}

function readStringArray(reader, strings) {
  return Array.from({ length: reader.varUint() }, () => strings[reader.varUint()]);
}

function sortedPriors(priors) {
  const objects = priors.objects.slice().sort((left, right) => left.id.localeCompare(right.id, "en"));
  const starts = (priors.transitions?.starts || []).slice()
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const bySource = (priors.transitions?.bySource || []).map((row) => ({
    ...row,
    successors: row.successors.slice().sort((left, right) => left.toId.localeCompare(right.toId, "en")),
  })).sort((left, right) => left.fromId.localeCompare(right.fromId, "en"));
  return { ...priors, objects, transitions: { starts, bySource } };
}

export function canonicalizePriors(priors) {
  const sorted = sortedPriors(priors);
  return {
    algorithmVersion: sorted.algorithmVersion,
    manifestId: sorted.manifestId,
    objects: sorted.objects.map((object) => ({
      byScale: (object.byScale || []).slice().sort((left, right) => left.scale.localeCompare(right.scale, "en")),
      chord: stableValue(object.chord),
      id: object.id,
      occurrenceProbability: object.occurrenceProbability,
      signature: stableJson(object.chord),
      smoothedLogProbability: object.smoothedLogProbability,
      trainGroups: object.trainGroups,
      trainOccurrences: object.trainOccurrences,
      trainSongs: object.trainSongs,
    })),
    policy: stableValue(sorted.policy),
    schemaVersion: sorted.schemaVersion,
    source: stableValue(sorted.source),
    summary: stableValue(sorted.summary),
    trainingSplit: sorted.trainingSplit,
    transitions: sorted.transitions,
  };
}

export function encodeCatalogPriors(input) {
  const priors = canonicalizePriors(input);
  if (priors.schemaVersion !== "hooktheory-catalog-priors/v1") {
    throw new TypeError(`Unsupported prior schema: ${priors.schemaVersion}`);
  }
  const strings = collectStrings(priors);
  const stringIndex = new Map(strings.map((value, index) => [value, index]));
  const objectIndex = new Map(priors.objects.map((object, index) => [object.id, index]));
  const metadata = Buffer.from(stableJson({
    algorithmVersion: priors.algorithmVersion,
    analyzerContractVersion: ANALYZER_CONTRACT_VERSION,
    binarySchema: BINARY_SCHEMA,
    manifestId: priors.manifestId,
    policy: priors.policy,
    schemaVersion: priors.schemaVersion,
    source: priors.source,
    summary: priors.summary,
    trainingSplit: priors.trainingSplit,
  }));

  const writer = new Writer();
  writer.bytes(MAGIC);
  writer.u16(VERSION);
  writer.u16(0);
  writer.u32(metadata.length);
  writer.u32(strings.length);
  writer.u32(priors.objects.length);
  writer.u32(priors.transitions.starts.length);
  writer.u32(priors.transitions.bySource.length);
  writer.bytes(metadata);
  for (const value of strings) {
    const bytes = Buffer.from(value);
    writer.varUint(bytes.length);
    writer.bytes(bytes);
  }

  for (const object of priors.objects) {
    const chord = object.chord;
    writer.bytes(shaBytes(object.id));
    writer.u8(chord.root);
    writer.u8(chord.type);
    writer.u8(chord.inversion);
    writer.u8(chord.applied);
    if (chord.borrowed === null) writer.u8(0);
    else if (chord.borrowed === "") writer.u8(1);
    else if (typeof chord.borrowed === "string") {
      writer.u8(2);
      writer.varUint(stringIndex.get(chord.borrowed));
    } else if (Array.isArray(chord.borrowed)) {
      writer.u8(3);
      writeNumberArray(writer, chord.borrowed);
    } else throw new TypeError(`Unsupported borrowed value for ${object.id}`);
    writeNumberArray(writer, chord.adds);
    writeNumberArray(writer, chord.omits);
    writeStringArray(writer, chord.alterations, stringIndex);
    writeNumberArray(writer, chord.suspensions);
    writeStringArray(writer, chord.substitutions, stringIndex);
    writer.varUint(object.trainOccurrences);
    writer.varUint(object.trainSongs);
    writer.varUint(object.trainGroups);
    writer.f64(object.occurrenceProbability);
    writer.f64(object.smoothedLogProbability);
    const scales = (object.byScale || []).slice().sort((left, right) => left.scale.localeCompare(right.scale, "en"));
    writer.varUint(scales.length);
    for (const row of scales) {
      writer.varUint(stringIndex.get(row.scale));
      writer.varUint(row.trainOccurrences);
      writer.varUint(row.trainSongs);
      writer.varUint(row.trainGroups);
    }
  }

  for (const start of priors.transitions.starts) {
    writer.varUint(objectIndex.get(start.id));
    writer.varUint(start.count);
    writer.f64(start.smoothedLogProbability);
  }
  for (const row of priors.transitions.bySource) {
    writer.varUint(objectIndex.get(row.fromId));
    writer.varUint(row.totalCount);
    writer.varUint(row.otherCount);
    writer.varUint(row.successors.length);
    for (const successor of row.successors) {
      writer.varUint(objectIndex.get(successor.toId));
      writer.varUint(successor.count);
      writer.f64(successor.smoothedLogProbability);
    }
  }
  const result = writer.finish();
  if (result.length > MAX_PACKAGED_PRIOR_BYTES) {
    throw new RangeError(`Android prior asset is ${result.length} bytes; limit is ${MAX_PACKAGED_PRIOR_BYTES}`);
  }
  return result;
}

export function decodeCatalogPriors(bytes) {
  const reader = new Reader(bytes);
  if (!reader.take(4).equals(MAGIC)) throw new TypeError("Invalid Android prior magic");
  if (reader.u16() !== VERSION) throw new TypeError("Unsupported Android prior version");
  reader.u16();
  const metadataLength = reader.u32();
  const stringCount = reader.u32();
  const objectCount = reader.u32();
  const startCount = reader.u32();
  const sourceCount = reader.u32();
  const metadata = JSON.parse(reader.take(metadataLength).toString("utf8"));
  if (metadata.binarySchema !== BINARY_SCHEMA) throw new TypeError("Android prior metadata schema mismatch");
  const strings = Array.from({ length: stringCount }, () => reader.take(reader.varUint()).toString("utf8"));
  const objects = [];
  for (let index = 0; index < objectCount; index += 1) {
    const id = shaId(reader.take(32));
    const chord = {
      root: reader.u8(),
      type: reader.u8(),
      inversion: reader.u8(),
      applied: reader.u8(),
    };
    const borrowedTag = reader.u8();
    if (borrowedTag === 0) chord.borrowed = null;
    else if (borrowedTag === 1) chord.borrowed = "";
    else if (borrowedTag === 2) chord.borrowed = strings[reader.varUint()];
    else if (borrowedTag === 3) chord.borrowed = readNumberArray(reader);
    else throw new TypeError(`Unknown borrowed tag ${borrowedTag}`);
    chord.adds = readNumberArray(reader);
    chord.omits = readNumberArray(reader);
    chord.alterations = readStringArray(reader, strings);
    chord.suspensions = readNumberArray(reader);
    chord.substitutions = readStringArray(reader, strings);
    const trainOccurrences = reader.varUint();
    const trainSongs = reader.varUint();
    const trainGroups = reader.varUint();
    const occurrenceProbability = reader.f64();
    const smoothedLogProbability = reader.f64();
    const byScale = Array.from({ length: reader.varUint() }, () => ({
      scale: strings[reader.varUint()],
      trainOccurrences: reader.varUint(),
      trainSongs: reader.varUint(),
      trainGroups: reader.varUint(),
    }));
    objects.push({
      byScale,
      chord: stableValue(chord),
      id,
      occurrenceProbability,
      signature: stableJson(chord),
      smoothedLogProbability,
      trainGroups,
      trainOccurrences,
      trainSongs,
    });
  }
  const starts = Array.from({ length: startCount }, () => ({
    id: objects[reader.varUint()].id,
    count: reader.varUint(),
    smoothedLogProbability: reader.f64(),
  }));
  const bySource = Array.from({ length: sourceCount }, () => {
    const fromId = objects[reader.varUint()].id;
    const totalCount = reader.varUint();
    const otherCount = reader.varUint();
    const successors = Array.from({ length: reader.varUint() }, () => ({
      toId: objects[reader.varUint()].id,
      count: reader.varUint(),
      smoothedLogProbability: reader.f64(),
    }));
    return { fromId, otherCount, successors, totalCount };
  });
  if (reader.offset !== reader.bytes.length) throw new TypeError("Trailing bytes in Android prior asset");
  return canonicalizePriors({
    algorithmVersion: metadata.algorithmVersion,
    manifestId: metadata.manifestId,
    objects,
    policy: metadata.policy,
    schemaVersion: metadata.schemaVersion,
    source: metadata.source,
    summary: metadata.summary,
    trainingSplit: metadata.trainingSplit,
    transitions: { starts, bySource },
  });
}

export function priorManifest(bytes, priors, filename = "catalog-priors-v1.bin") {
  return stableValue({
    analyzerContractVersion: ANALYZER_CONTRACT_VERSION,
    binarySchema: BINARY_SCHEMA,
    counts: {
      objects: priors.objects.length,
      starts: priors.transitions?.starts?.length || 0,
      transitionSources: priors.transitions?.bySource?.length || 0,
    },
    file: filename,
    manifestId: priors.manifestId,
    schemaVersion: "hooktheory-android-priors-manifest/v1",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  });
}
