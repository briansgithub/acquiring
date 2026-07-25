/**
 * Resolve active tonic/scale at a beat from Hooktheory metadata.keys[].
 */

function normalizeTonic(tonic, fallback) {
  return String(tonic || fallback || 'C')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/♮/g, '')
    .trim();
}

function activeKeyAtBeat(keys, beat, fallbackKey = { tonic: 'C', scale: 'major' }) {
  const normalizedBeat = beat === 0 ? 1 : beat;
  if (!Array.isArray(keys) || !keys.length) {
    return {
      tonic: normalizeTonic(fallbackKey.tonic),
      scale: fallbackKey.scale || 'major',
    };
  }
  let chosen = keys[0];
  for (const k of keys) {
    const kb = k?.beat ?? 1;
    if (kb <= normalizedBeat) chosen = k;
    else break;
  }
  return {
    tonic: normalizeTonic(chosen.tonic, fallbackKey.tonic),
    scale: chosen.scale || fallbackKey.scale || 'major',
  };
}

module.exports = { activeKeyAtBeat, normalizeTonic };
