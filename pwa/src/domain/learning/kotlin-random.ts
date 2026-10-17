/* Private port of Kotlin 2.2.10 Random/XorWow. Modified to TypeScript.
 * Copyright 2010-2021 JetBrains s.r.o. and Kotlin Programming Language contributors.
 * Apache-2.0; attribution, source URLs and full license: KOTLIN_RANDOM_LICENSE.txt.
 * Deliberately not exported from the learning barrel/public generator API.
 */
import type { AuralSeed } from './evidence-contracts';

const MIN_INT = -2147483648;
const MAX_INT = 2147483647;

function int32(value:number):number {
  if (!Number.isInteger(value) || value < MIN_INT || value > MAX_INT) {
    throw new RangeError('Expected a signed 32-bit integer');
  }
  return value;
}

export function parseKotlinLongSeed(seed:AuralSeed):bigint {
  if (typeof seed !== 'string' || seed.length > 20 || !/^(0|-?[1-9][0-9]*)$/.test(seed)) {
    throw new RangeError('Expected a canonical signed 64-bit decimal seed');
  }
  const value = BigInt(seed);
  if (value.toString() !== seed || value < -9223372036854775808n || value > 9223372036854775807n) {
    throw new RangeError('Expected a canonical signed 64-bit decimal seed');
  }
  return value;
}

/** Safe arithmetic input, with Kotlin/JVM Int overflow at the output boundary. */
export function wrapKotlinInt(value:number):number {
  if (!Number.isSafeInteger(value)) throw new RangeError('Expected safe integer arithmetic');
  return value | 0;
}

export class KotlinRandom {
  private x:number;
  private y:number;
  private z = 0;
  private w = 0;
  private v:number;
  private addend:number;

  constructor(seed:AuralSeed) {
    const value = parseKotlinLongSeed(seed);
    // Only already narrowed 32-bit words become Number, never the Long seed.
    this.x = Number(BigInt.asIntN(32, value));
    this.y = Number(BigInt.asIntN(32, value >> 32n));
    this.v = ~this.x;
    this.addend = (this.x << 10) ^ (this.y >>> 4);
    for (let i = 0; i < 64; i++) this.rawInt();
  }

  private rawInt():number {
    let t = this.x ^ (this.x >>> 2);
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    const v0 = this.v;
    this.w = v0;
    t = (t ^ (t << 1)) ^ v0 ^ (v0 << 4);
    this.v = t;
    this.addend = (this.addend + 362437) | 0;
    return (t + this.addend) | 0;
  }

  nextBits(bitCount:number):number {
    if (!Number.isInteger(bitCount) || bitCount < 0 || bitCount > 32) {
      throw new RangeError('Expected bit count 0..32');
    }
    // nextBits(0) still consumes one native draw; shifting by32 uses JVM masking.
    return (this.rawInt() >>> (32 - bitCount)) & ((-bitCount) >> 31);
  }

  nextInt():number;
  nextInt(until:number):number;
  nextInt(from:number, until:number):number;
  nextInt(first?:number, second?:number):number {
    if (first === undefined) {
      if (arguments.length !== 0) throw new RangeError('Expected integer bounds');
      return this.rawInt();
    }
    const from = second === undefined ? 0 : int32(first);
    const until = int32(second === undefined ? first : second);
    if (until <= from) throw new RangeError('Random range is empty');
    const n = (until - from) | 0;
    if (n > 0 || n === MIN_INT) {
      let value:number;
      if ((n & -n) === n) {
        value = this.nextBits(31 - Math.clz32(n));
      } else {
        let bits:number;
        do {
          bits = this.rawInt() >>> 1;
          value = bits % n;
        } while (((bits - value + (n - 1)) | 0) < 0);
      }
      return (from + value) | 0;
    }
    for (;;) {
      const value = this.rawInt();
      if (value >= from && value < until) return value;
    }
  }

  nextDouble():number {
    return (this.nextBits(26) * 134217728 + this.nextBits(27)) / 9007199254740992;
  }

  /** Kotlin List.random, including its draw for singleton lists. */
  choose<T>(values:readonly T[]):T {
    const length = values.length;
    if (!Number.isInteger(length) || length < 1 || length > MAX_INT) throw new RangeError('Empty or invalid list');
    return values[this.nextInt(length)];
  }

  /** Kotlin shuffled(): copy, then descend lastIndex through1; no draw for size0/1. */
  shuffled<T>(values:readonly T[]):T[] {
    const length = values.length;
    if (!Number.isInteger(length) || length < 0 || length > MAX_INT) throw new RangeError('Invalid list');
    const result:T[] = [];
    for (let i = 0; i < length; i++) result.push(values[i]);
    for (let i = length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const previous = result[i];
      result[i] = result[j];
      result[j] = previous;
    }
    return result;
  }
}

export function jvmStringHash(value:string):number {
  if (typeof value !== 'string') throw new TypeError('Expected a string');
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  return hash;
}

export function kotlinUIntHex(value:number):string {
  return (int32(value) >>> 0).toString(16);
}

/** The generator fingerprints lists of Int, String, Boolean, null and nested lists.
 * This intentionally is not a general JVM Any/Double/Map formatter or JSON encoder.
 */
export type KotlinListValue = string | number | boolean | null | readonly KotlinListValue[];
export function kotlinListText(value:KotlinListValue):string {
  if (value === null) return 'null';
  if (typeof value === 'number') return String(int32(value));
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (!Array.isArray(value)) throw new TypeError('Expected a native generator list value');
  const length = value.length;
  const parts:string[] = [];
  for (let i = 0; i < length; i++) parts.push(kotlinListText(value[i]));
  return '[' + parts.join(', ') + ']';
}
