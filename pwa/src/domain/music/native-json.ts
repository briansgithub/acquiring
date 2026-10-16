import type {JsonValue} from '../../contracts';

/** Kotlin JsonPrimitive.booleanOrNull: ignore ASCII case, never trim/coerce containers/numbers. */
export function nativeBooleanOrNull(value:JsonValue|undefined):boolean|null {
  if(typeof value==='boolean')return value;
  if(typeof value!=='string')return null;
  const text=value.toLowerCase();
  return text==='true' ? true : text==='false' ? false : null;
}
