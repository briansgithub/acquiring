import type { JsonObject, JsonValue } from '../../contracts';

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// JsonPrimitive.content includes the spelling of booleans and JSON null.
export function primitiveContent(value: JsonValue | undefined): string | undefined {
  if (value === undefined || typeof value === 'object' && value !== null) return undefined;
  return String(value);
}

export function intOrUndefined(value: JsonValue | undefined): number | undefined {
  const text = primitiveContent(value);
  if (text === undefined || !/^[+-]?[0-9]+$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : undefined;
}

export function doubleOrUndefined(value: JsonValue | undefined): number | undefined {
  const text = primitiveContent(value)?.trim();
  if (!text || !/^[+-]?(?:NaN|Infinity|(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)[dDfF]?)$/.test(text)) return undefined;
  return Number(text.replace(/[dDfF]$/, ''));
}

/** Catalog IDs are text or safe JSON numbers. Reject precision loss instead of changing identity. */
export function assertSafeNumericId(value: JsonValue | undefined): void {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Numeric catalog ID exceeds JavaScript safe precision; supply a string ID');
  }
}
