/**
 * Oracle-style modification signature tokens for chord grouping.
 */

function sigOf(c) {
  if (!c || c.isRest) return '';
  const parts = [];
  parts.push(`type=${c.type ?? 5}`);
  if (c.inversion) parts.push(`inv=${c.inversion}`);
  if (c.applied) parts.push('applied');
  if (Array.isArray(c.borrowed)) parts.push('bor=custom');
  else if (c.borrowed) parts.push(`bor=${c.borrowed}`);
  if (c.suspensions?.length) parts.push(`sus=${c.suspensions.join('&')}`);
  if (c.alterations?.length) parts.push(`alt=${c.alterations.join('&')}`);
  if (c.adds?.length) parts.push(`add=${c.adds.join('&')}`);
  if (c.omits?.length) parts.push(`omit=${c.omits.join('&')}`);
  return parts.join(' ');
}

function hasMods(c) {
  if (!c || c.isRest) return false;
  return !!(
    c.applied
    || c.borrowed
    || (c.suspensions?.length)
    || (c.alterations?.length)
    || (c.adds?.length)
    || (c.omits?.length)
    || (c.inversion && c.inversion > 0)
    || (c.type && c.type > 5)
  );
}

function tokenMatch(c, token) {
  const t = token.toLowerCase();
  if (t === 'applied') return !!c.applied;
  if (t.startsWith('type=')) return String(c.type ?? 5) === t.slice(5);
  if (t.startsWith('inv=')) return String(c.inversion ?? 0) === t.slice(4);
  if (t.startsWith('bor=')) {
    const v = t.slice(4);
    if (v === 'custom') return Array.isArray(c.borrowed);
    return String(c.borrowed || '').toLowerCase() === v;
  }
  if (t.startsWith('sus=')) return (c.suspensions || []).join('&') === t.slice(4);
  if (t.startsWith('alt=')) {
    return (c.alterations || []).map(String).join('&').toLowerCase().includes(t.slice(4));
  }
  if (t.startsWith('add=')) return (c.adds || []).join('&') === t.slice(4);
  if (t.startsWith('omit=')) return (c.omits || []).join('&') === t.slice(5);
  return false;
}

function chordShape(chord) {
  if (!chord) return null;
  const { beat, duration, recordingEndBeat, pedal, alternate, ...rest } = chord;
  return rest;
}

module.exports = { sigOf, hasMods, tokenMatch, chordShape };
