import type { AuralRankEligibility, AuralRankEligibilityApi } from './rank-eligibility-contracts';

const typed = Object.getPrototypeOf(Uint32Array.prototype) as object;
const getter = (key: PropertyKey) => Object.getOwnPropertyDescriptor(typed, key)!.get!;
const tag = getter(Symbol.toStringTag), lengthOf = getter('length');
const bufferOf = getter('buffer'), offsetOf = getter('byteOffset');
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const MAX_WORDS = 8_388_608;
function signed(value: number): void {
  if (typeof value !== 'number') throw new TypeError('Rank endpoints must be numbers');
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new RangeError('Rank endpoints must be signed32 integers');
}
function population(value: number): number {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  value = (value + (value >>> 4)) & 0x0f0f0f0f;
  return Math.imul(value, 0x01010101) >>> 24;
}

/** Private copied packed bitmap and population prefix; no catalog scan or cache. */
export function createAuralRankEligibility(input: Uint32Array): AuralRankEligibility {
  if (tag.call(input) !== 'Uint32Array') throw new TypeError('Expected Uint32Array rank words');
  const length = lengthOf.call(input) as number;
  const buffer = bufferOf.call(input) as ArrayBuffer;
  const offset = offsetOf.call(input) as number;
  bufferLength.call(buffer); // Reject shared buffers, including cross-realm ones.
  if (length > MAX_WORDS) throw new RangeError('Rank bitmap exceeds the browser limit');
  const source = new Uint32Array(buffer, offset, length); // Also rejects detached buffers.
  const words = new Uint32Array(length);
  Uint32Array.prototype.set.call(words, source);
  let count = length;
  while (count > 0 && words[count - 1] === 0) count--;
  const prefix = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) prefix[i + 1] = prefix[i]! + population(words[i]!);
  return Object.freeze({
    isEmpty: count === 0,
    hasAny(start: number, end: number): boolean {
      signed(start); signed(end);
      const first = start >>> 5;
      if (start > end || first >= count) return false;
      const actualLast = end >>> 5, last = Math.min(actualLast, count - 1);
      const firstMask = 0xffffffff << (start & 31);
      const lastMask = last < actualLast ? 0xffffffff : 0xffffffff >>> (31 - (end & 31));
      if (first === last) return (words[first]! & firstMask & lastMask) !== 0;
      return (words[first]! & firstMask) !== 0 || (words[last]! & lastMask) !== 0
        || prefix[last]! > prefix[first + 1]!;
    },
  });
}
export const auralRankEligibilityApi: AuralRankEligibilityApi = Object.freeze({ createAuralRankEligibility });
