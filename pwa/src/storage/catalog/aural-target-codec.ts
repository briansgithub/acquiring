import { auralPatternId } from '../../domain/catalog/catalog-identity';
import { CatalogError } from './protocol';
import type { AuralRunBlobInput, AuralDecodedCatalogRun, AuralCatalogPosition, AuralCatalogKey,
  AuralTargetSpan, AuralCatalogPatternTarget, AuralTargetCodecApi } from './aural-target-contracts';
const MiB = 1_048_576;
function bad(): never { throw new CatalogError('INTEGRITY', 'Invalid aural catalog data'); }
function limit(): never { throw new CatalogError('LIMIT', 'Aural catalog resource limit'); }
function spanError(): never { throw new CatalogError('INVALID_REQUEST', 'Invalid aural target span'); }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return bad();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 65536): string {
  if (typeof value !== 'string') return bad();
  if (value.length > max) return limit();
  return value;
}
function array(value: unknown): { values: unknown[]; count: number } {
  if (!Array.isArray(value)) return bad();
  const count: unknown = value.length;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return bad();
  if (count > 10000) return limit();
  return { values: value, count };
}
function signed(value: unknown, fail: () => never = bad): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) return fail();
  return value === 0 ? 0 : value;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function copyBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)) return bad();
  const proto = Object.getPrototypeOf(Uint8Array.prototype);
  const get = (name: string) => Object.getOwnPropertyDescriptor(proto, name)!.get!.call(value);
  const count = get('byteLength') as number;
  if (count > 8 * MiB) return limit();
  const result = new Uint8Array(count);
  result.set(new Uint8Array(get('buffer') as ArrayBufferLike, get('byteOffset') as number, count));
  return result;
}
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let count = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > 16 * MiB) return limit();
      parts.push(next.value);
    }
    const raw = new Uint8Array(count);
    let offset = 0;
    for (const part of parts) { raw.set(part, offset); offset += part.byteLength; }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

type Node = { kind: 'string'; value: string; raw: string } | { kind: 'atom'; raw: string }
  | { kind: 'array'; items: Node[] } | { kind: 'object'; entries: [string, Node][] };
type Token = { kind: string; value: string; raw: string };
/** Local ordered lexical representation: known duplicates never lose an earlier invalid value. */
class Reader {
  private at = 0;
  private used = 0;
  private token: Token = { kind: '', value: '', raw: '' };
  constructor(private readonly source: string) { this.advance(); }
  private advance(): void {
    const s = this.source;
    while (this.at < s.length && /[ \t\r\n]/.test(s[this.at])) this.at++;
    if (this.at === s.length) { this.token = { kind: 'eof', value: '', raw: '' }; return; }
    if (++this.used > 250000) return limit();
    const start = this.at, c = s[this.at++];
    if ('{}[]:,'.includes(c)) { this.token = { kind: c, value: c, raw: c }; return; }
    if (c === '"') {
      let units = 0;
      for (;;) {
        if (this.at >= s.length) return bad();
        const ch = s[this.at++];
        if (ch === '"') break;
        if (ch.charCodeAt(0) < 32) return bad();
        if (ch === '\\') {
          const escape = s[this.at++];
          if (escape === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(s.slice(this.at, this.at + 4))) return bad();
            this.at += 4;
          } else if (!escape || !'"\\/bfnrt'.includes(escape)) return bad();
        }
        if (++units > 65536) return limit();
      }
      const raw = s.slice(start + 1, this.at - 1), value: unknown = JSON.parse(s.slice(start, this.at));
      if (typeof value !== 'string') return bad();
      this.token = { kind: 'string', value, raw }; return;
    }
    if (c.charCodeAt(0) < 32 || c === '\\') return bad();
    while (this.at < s.length && !/[ \t\r\n{}\[\]:,"\\]/.test(s[this.at])) this.at++;
    const raw = s.slice(start, this.at);
    this.token = { kind: 'atom', value: raw, raw };
  }
  private consume(kind: string): void { if (this.token.kind !== kind) return bad(); this.advance(); }
  private value(depth: number): Node {
    const token = this.token;
    if (token.kind === 'string') { this.advance(); return { kind: 'string', value: token.value, raw: token.raw }; }
    if (token.kind === 'atom') { this.advance(); return { kind: 'atom', raw: token.raw }; }
    if (depth >= 32) return limit();
    if (token.kind === '[') {
      this.advance(); const items: Node[] = [];
      if (this.token.kind !== ']') for (;;) {
        if (items.length >= 10000) return limit();
        items.push(this.value(depth + 1));
        if (this.token.kind !== ',') break;
        this.advance();
      }
      this.consume(']'); return { kind: 'array', items };
    }
    if (token.kind === '{') {
      this.advance(); const entries: [string, Node][] = [];
      if (this.token.kind !== '}') for (;;) {
        if (entries.length >= 10000) return limit();
        const key = this.token;
        if (key.kind !== 'string') return bad();
        this.advance(); this.consume(':'); entries.push([key.value, this.value(depth + 1)]);
        if (this.token.kind !== ',') break;
        this.advance();
      }
      this.consume('}'); return { kind: 'object', entries };
    }
    return bad();
  }
  parse(): Node { const result = this.value(0); if (this.token.kind !== 'eof') return bad(); return result; }
}
function str(value: Node): string { return value.kind === 'string' ? value.value : bad(); }
function literal(value: Node, rawQuoted = false): string {
  if (value.kind === 'string') return rawQuoted ? value.raw : value.value;
  if (value.kind === 'atom') return value.raw;
  return bad();
}
/** Native lexer1.8.1 consumeNumericLiteral545..630; bounded signed64 lanes, no exponent-sized allocations. */
function int(value: Node): number {
  const raw = literal(value, true);
  let accumulator = 0n, exponent = 0n, negative = false, hasExponent = false, positiveExponent = true;
  if (!raw.length || raw === '-') return bad();
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if ((c === 'e' || c === 'E') && !hasExponent) { if (!i) return bad(); hasExponent = true; continue; }
    if ((c === '+' || c === '-') && hasExponent) { positiveExponent = c === '+'; continue; }
    if (c === '-') { if (i) return bad(); negative = true; continue; }
    if (c < '0' || c > '9') return bad();
    const digit = BigInt(c.charCodeAt(0) - 48);
    if (hasExponent) exponent = BigInt.asIntN(64, exponent * 10n + digit);
    else { accumulator = BigInt.asIntN(64, accumulator * 10n - digit); if (accumulator > 0n) return bad(); }
  }
  if (hasExponent) {
    const scaled = Number(accumulator) * 10 ** (positiveExponent ? Number(exponent) : -Number(exponent));
    if (!Number.isInteger(scaled) || scaled < -(2 ** 63) || scaled > 2 ** 63) return bad();
    accumulator = BigInt(scaled);
  }
  const result = negative ? accumulator : -accumulator;
  if (result < -2147483648n || result > 2147483647n) return bad();
  return Number(result);
}
/** Java finite Double grammar; hex conversion rounds directly to nearest-even IEEE significand. */
function double(value: Node): number {
  const s = literal(value).replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  const hex = /^([+-]?)0[xX](?:([0-9a-fA-F]+)(?:\.([0-9a-fA-F]*))?|\.([0-9a-fA-F]+))[pP]([+-]?[0-9]+)[fFdD]?$/.exec(s);
  if (hex) {
    const fraction = hex[3] ?? hex[4] ?? '', digits = ((hex[2] ?? '') + fraction).replace(/^0+/, '');
    const sign = hex[1] === '-' ? -1 : 1;
    if (!digits.length) return sign * 0;
    const significand = BigInt('0x' + digits), power = Number(hex[5]) - 4 * fraction.length;
    const top = significand.toString(2).length - 1 + power;
    if (top > 1023) return bad();
    if (top < -1075) return sign * 0;
    const scale = Math.max(top - 52, -1074), shift = scale - power;
    let rounded: bigint;
    if (shift > 0) {
      rounded = significand >> BigInt(shift);
      const remainder = significand - (rounded << BigInt(shift)), half = 1n << BigInt(shift - 1);
      if (remainder > half || remainder === half && (rounded & 1n) === 1n) rounded++;
    } else rounded = significand << BigInt(-shift);
    const result = sign * Number(rounded) * 2 ** scale;
    return Number.isFinite(result) ? result : bad();
  }
  if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[fFdD]?$/.test(s)) return bad();
  const result = Number(s.replace(/[fFdD]$/, ''));
  return Number.isFinite(result) ? result : bad();
}
function bool(value: Node): boolean { const s = literal(value, true).toLowerCase(); return s === 'true' ? true : s === 'false' ? false : bad(); }
function list<T>(value: Node, decode: (node: Node) => T): T[] { return value.kind === 'array' ? value.items.map(decode) : bad(); }
type Decoder = (node: Node) => unknown;
function struct(value: Node, fields: Record<string, Decoder>, defaults: Record<string, unknown> = {}): Record<string, unknown> {
  if (value.kind !== 'object') return bad();
  const result: Record<string, unknown> = {};
  for (const [name, member] of value.entries) if (Object.hasOwn(fields, name)) result[name] = fields[name](member);
  for (const name of Object.keys(fields)) if (!Object.hasOwn(result, name)) {
    if (!Object.hasOwn(defaults, name)) return bad();
    result[name] = defaults[name];
  }
  return result;
}
function position(value: Node): AuralCatalogPosition {
  return struct(value, { startIndex: int, endIndex: int, startBeat: double, endBeat: double,
    degree: str, roman: str, notes: node => list(node, int), rootMidi: int, bassMidi: int, varyingBass: bool },
  { varyingBass: false }) as unknown as AuralCatalogPosition;
}
function key(value: Node): AuralCatalogKey { return struct(value, { tonic: str, scale: str }) as unknown as AuralCatalogKey; }
function keyJson(value: unknown): string {
  const s = text(value);
  if (new TextEncoder().encode(s).byteLength > 65536) return limit();
  return s;
}
function tokenBytes(tokens: readonly string[]): void {
  let total = 0; const encoder = new TextEncoder();
  for (const value of tokens) { total += encoder.encode(value).byteLength; if (total > 8 * MiB) return limit(); }
}
export async function decodeAuralCatalogRun(input: AuralRunBlobInput): Promise<AuralDecodedCatalogRun> {
  try {
    const row = record(input), id = row.id, stableId = row.stableId, view = row.view, song = row.song;
    const section = row.section, revision = row.revision, supports = row.supportsModeAnalysis;
    const rawTokens = row.tokens, rawPositions = row.positions, rawKey = row.keyJson;
    const rawSourceKey = supports === true ? row.sourceKeyJson : undefined;
    if (typeof supports !== 'boolean') return bad();
    const metadata = { id: signed(id), stableId: text(stableId, 4096), view: text(view, 4096), song: text(song, 4096),
      section: text(section, 4096), revision: text(revision, 4096) };
    const tokensBlob = copyBytes(rawTokens), positionsBlob = copyBytes(rawPositions);
    const keyText = keyJson(rawKey), sourceText = supports ? keyJson(rawSourceKey) : keyText;
    // All used caller fields and both byte buffers have been captured before this await.
    const tokensText = await inflate(tokensBlob);
    const tokens = list(new Reader(tokensText).parse(), str); tokenBytes(tokens);
    const positionsText = await inflate(positionsBlob), positions = list(new Reader(positionsText).parse(), position);
    const decodedKey = key(new Reader(keyText).parse()), sourceKey = key(new Reader(sourceText).parse());
    return freeze({ ...metadata, tokens, positions, key: decodedKey, sourceKey });
  } catch (error) { if (error instanceof CatalogError) throw error; return bad(); }
}
export async function createAuralCatalogTarget(run: AuralDecodedCatalogRun, input: AuralTargetSpan): Promise<AuralCatalogPatternTarget> {
  const source = record(run), span = record(input), view = text(source.view, 4096);
  const rawTokens = source.tokens, rawPositions = source.positions;
  const rawOffset = span.offset, rawLength = span.length, rawStart = span.start, rawEnd = span.end, rawSnapshot = span.snapshotId;
  const offset = signed(rawOffset, spanError), length = signed(rawLength, spanError), start = signed(rawStart, spanError), end = signed(rawEnd, spanError);
  if (offset < 0 || length < 0 || length > 10000) return spanError();
  const snapshotId = text(rawSnapshot, 4096), tokenInput = array(rawTokens), positionInput = array(rawPositions);
  if (offset > tokenInput.count || length > tokenInput.count - offset || offset > positionInput.count || length > positionInput.count - offset) return spanError();
  const tokens: string[] = [], labels: string[] = [], field = view.endsWith('harmony_bass') ? 'roman' : 'degree';
  for (let i = offset; i < offset + length; i++) {
    tokens.push(text(tokenInput.values[i]));
    labels.push(text(record(positionInput.values[i])[field]));
  }
  Object.freeze(tokens); Object.freeze(labels);
  // Preserve identity RangeError (malformed UTF16/identity limits) and real crypto failures.
  const id = await auralPatternId(tokens, view);
  return Object.freeze({ id, view, tokens, labels, start, end, snapshotId });
}
export const auralTargetCodecApi: AuralTargetCodecApi = Object.freeze({ decodeAuralCatalogRun, createAuralCatalogTarget });
