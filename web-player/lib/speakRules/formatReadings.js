import { UNKNOWN } from './buildParts.js';
import { speakDegree } from './words.js';

function joinWords(words) {
  return words.filter(Boolean).join(' ');
}

function borrowedRedundantWithCase(parts) {
  return parts.borrowed && parts.caseQuality && parts.borrowed === parts.caseQuality;
}

function appendBorrowed(words, parts) {
  if (!parts.borrowed || borrowedRedundantWithCase(parts)) return;
  words.push(parts.borrowed);
}

function appendBorrowedFunctional(words, parts) {
  if (!parts.borrowed || borrowedRedundantWithCase(parts)) return;
  words.push('borrowed from', parts.borrowed);
}

function inversionFunctionalLabel(parts) {
  const inv = parts.inversion;
  const isSeventh = parts.isSeventh;
  if (!inv) return null;
  if (!isSeventh) {
    if (inv === 1) return 'first inversion';
    if (inv === 2) return 'second inversion';
    return null;
  }
  if (inv === 1) return 'first inversion seventh';
  if (inv === 2) return 'second inversion seventh';
  if (inv === 3) return 'third inversion seventh';
  return null;
}

/** Literal left-to-right analytic reading. */
export function formatAnalytic(parts) {
  if (!parts) return UNKNOWN;
  const words = [
    ...parts.prefix,
    parts.degree,
    parts.caseQuality,
    ...parts.glyphs,
    ...parts.figured,
    parts.extension,
    ...parts.suspensions,
    ...parts.adds,
    ...parts.omits,
    ...parts.alterations,
  ];
  if (parts.appliedOf) words.push('of', parts.appliedOf);
  appendBorrowed(words, parts);
  return joinWords(words);
}

/** Functional shorthand reading. */
export function formatFunctional(parts, ctx) {
  if (!parts) return UNKNOWN;
  const words = [
    ...parts.prefix,
    parts.degree,
    parts.caseQuality,
  ];

  const invLabel = inversionFunctionalLabel(parts);
  if (invLabel) {
    words.push(invLabel);
  } else {
    if (parts.extension) words.push(parts.extension);
    for (const g of parts.glyphs) {
      if (g !== 'diminished' && g !== 'half-diminished') words.push(g);
    }
  }

  if (parts.suspensions.length) words.push(...parts.suspensions);
  if (parts.adds.length) words.push(...parts.adds);
  if (parts.omits.length) words.push(...parts.omits);
  if (parts.alterations.length) words.push(...parts.alterations);

  if (ctx?.isApplied) {
    words.push('secondary dominant to', parts.appliedOf || speakDegree(ctx.denominatorDegree));
  }

  appendBorrowedFunctional(words, parts);

  return joinWords(words);
}
