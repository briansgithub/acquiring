/**
 * truthLetterParse.js
 * Parse Hooktheory letter-name + Roman text for chord quality, extensions, alterations.
 */

const PAREN_RE = /\(([^)]+)\)/g;

function allParenTags(letter, roman) {
  const tags = [];
  for (const src of [letter || '', roman || '']) {
    let m;
    const re = new RegExp(PAREN_RE.source, 'g');
    while ((m = re.exec(src))) tags.push(m[1].toLowerCase());
  }
  return tags;
}

function stripForQuality(letter) {
  let s = (letter || '');
  const slash = s.lastIndexOf('/');
  if (slash >= 0) s = s.slice(0, slash);
  s = s.replace(PAREN_RE, '');
  return s;
}

function triadQualityFromLetter(letter, roman) {
  const l = stripForQuality(letter).toLowerCase();
  const r = (roman || '').toLowerCase();
  if (/°|ø|dim/.test(l + r)) return 'diminished';
  if (/\+|aug/.test(l)) return 'augmented';
  const m = (letter || '').match(/^([b#]{0,2})([A-Ga-g])/);
  if (m && m[2] >= 'a' && m[2] <= 'z') return 'minor';
  if (/\bm(?!aj)\b|min/.test(l) && !/maj/.test(l)) return 'minor';
  return 'major';
}

function seventhKind(quality, letter, roman, chordType) {
  if (!chordType || chordType < 7) return null;
  const l = stripForQuality(letter).toLowerCase();
  const r = (roman || '').toLowerCase();
  if (quality === 'diminished' || /°7|dim7/.test(l + r)) return 'dim7';
  if (/ø7|m7b5|min7b5|half/.test(l + r)) return 'halfdim7';
  if (/maj7|△|ma7|major7/.test(l + r)) return 'maj7';
  if (/\b7\b|⁷|m7|min7/.test(l + r) || chordType >= 7) return 'min7';
  return 'min7';
}

function susFromText(letter, roman) {
  const s = ((letter || '') + (roman || '')).toLowerCase();
  if (/sus2/.test(s)) return 2;
  if (/sus4|sus(?!\d)/.test(s)) return 4;
  return null;
}

function addsFromText(letter, roman) {
  const adds = new Set();
  const s = ((letter || '') + (roman || '')).toLowerCase();
  const m = s.match(/add(\d+)/g);
  if (m) m.forEach((x) => adds.add(parseInt(x.replace('add', ''), 10)));
  for (const t of allParenTags(letter, roman)) {
    const a = t.match(/^add(\d+)$/);
    if (a) adds.add(parseInt(a[1], 10));
  }
  return [...adds];
}

function omitsFromText(letter, roman) {
  const omits = new Set();
  for (const t of allParenTags(letter, roman)) {
    const o = t.match(/^no(\d+)$/);
    if (o) omits.add(parseInt(o[1], 10));
    const n = t.match(/^n[°o]?(\d+)n?[°o]?(\d+)$/i);
    if (n) {
      omits.add(parseInt(n[1], 10));
      omits.add(parseInt(n[2], 10));
    }
  }
  const s = ((letter || '') + (roman || '')).toLowerCase();
  const m = s.match(/\(no(\d+)\)|no(\d+)/g);
  if (m) m.forEach((x) => {
    const d = x.match(/(\d+)/);
    if (d) omits.add(parseInt(d[1], 10));
  });
  const nm = s.match(/n[°o]?(\d+)n?[°o]?(\d+)/gi);
  if (nm) nm.forEach((x) => {
    const d = x.match(/(\d+)/g);
    if (d) d.forEach((n) => omits.add(parseInt(n, 10)));
  });
  return [...omits];
}

function splitAltToken(tag) {
  const out = [];
  const re = /([#b]?\d+)/g;
  let m;
  while ((m = re.exec(tag))) {
    const tok = m[1];
    if (!tok.startsWith('add') && !tok.startsWith('no')) out.push(tok);
  }
  return out;
}

function altsFromText(letter, roman) {
  const alts = new Set();
  for (const t of allParenTags(letter, roman)) {
    if (/^n[°o]?\d/i.test(t)) continue;
    if (/^[#b]?\d+$/.test(t) && !t.startsWith('add') && !t.startsWith('no')) {
      alts.add(t);
    } else if (/[b#]\d/.test(t)) {
      splitAltToken(t).forEach((x) => alts.add(x));
    }
  }
  const s = ((letter || '') + (roman || '')).toLowerCase();
  const m = s.match(/\(([^)]+)\)/g);
  if (m) {
    for (const x of m) {
      const inner = x.slice(1, -1);
      if (/^no\d/.test(inner)) continue;
      if (/^n[°o]?\d/i.test(inner)) continue;
      if (/^add\d/.test(inner)) continue;
      if (/^[#b]?\d+$/.test(inner)) alts.add(inner);
      else splitAltToken(inner).forEach((tok) => alts.add(tok));
    }
  }
  return [...alts];
}

function extensionsFromType(chordType) {
  const ext = [];
  if (chordType >= 9) ext.push(9);
  if (chordType >= 11) ext.push(11);
  if (chordType >= 13) ext.push(13);
  return ext;
}

function mergeMods(letter, roman, chord) {
  const c = chord || {};
  const susText = susFromText(letter, roman);
  const suspensions = [...(c.suspensions || [])];
  if (susText && !suspensions.includes(susText)) suspensions.push(susText);
  const adds = [...new Set([...addsFromText(letter, roman), ...(c.adds || [])])];
  const omits = [...new Set([...omitsFromText(letter, roman), ...(c.omits || [])])];
  const alterations = [...new Set([...altsFromText(letter, roman), ...(c.alterations || []).map(String)])];
  return { suspensions, adds, omits, alterations, type: c.type ?? 5 };
}

module.exports = {
  allParenTags, stripForQuality, triadQualityFromLetter, seventhKind,
  susFromText, addsFromText, omitsFromText, altsFromText, extensionsFromType, mergeMods,
};
