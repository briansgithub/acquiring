'use strict';

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    throw new TypeError('Cannot canonicalize a cyclic value');
  }
  seen.add(value);

  let result;
  if (Array.isArray(value)) {
    result = value.map((item) => {
      const normalized = canonicalize(item, seen);
      return normalized === undefined ? null : normalized;
    });
  } else if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    result = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
  } else {
    result = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = canonicalize(value[key], seen);
      if (normalized !== undefined) result[key] = normalized;
    }
  }

  seen.delete(value);
  return result;
}

function stableStringify(value, space = 0) {
  return JSON.stringify(canonicalize(value), null, space);
}

module.exports = {
  canonicalize,
  stableStringify,
};
