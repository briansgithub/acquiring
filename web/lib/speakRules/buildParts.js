import { resolveChordContext } from './chordContext.js';
import {
  speakAccidentalPrefix,
  speakDegree,
  speakExtension,
  speakAlteration,
  speakAdd,
  speakSus,
  FIGURED_ANALYTIC,
  BORROWED_SPOKEN,
  speakAppliedTarget,
} from './words.js';

export const UNKNOWN = 'UNKNOWN';

function qualityCaseWord(quality) {
  if (quality === 'minor') return 'minor';
  if (quality === 'diminished') return 'diminished';
  if (quality === 'augmented') return 'augmented';
  return null;
}

function figuredKey(chord) {
  if (chord.inversion === 1) return chord.type >= 7 ? '65' : '6';
  if (chord.inversion === 2) return chord.type >= 7 ? '43' : '64';
  if (chord.inversion === 3 && chord.type >= 7) return '42';
  return null;
}

function buildSuffixParts(chord, ctx) {
  const suspended = Array.isArray(chord.suspensions) && chord.suspensions.length > 0;
  const alterations = Array.isArray(chord.alterations) ? chord.alterations : [];
  const augmented = ctx.quality === 'augmented' || alterations.includes('#5');
  const isHalfDim = !suspended && ctx.quality === 'diminished' && chord.type >= 7 && !ctx.fullyDiminished;

  const parts = {
    prefix: speakAccidentalPrefix(ctx.prefix),
    degree: speakDegree(ctx.isApplied ? ctx.appliedDegree : ctx.degree),
    caseQuality: isHalfDim ? 'minor' : qualityCaseWord(ctx.quality),
    glyphs: [],
    figured: [],
    embeddedAlterations: [],
    extension: null,
    suspensions: [],
    adds: [],
    omits: [],
    alterations: [],
    borrowed: null,
    appliedOf: null,
    inversion: chord.inversion || 0,
    isSeventh: chord.type >= 7,
    substitution: null,
    unknown: false,
  };

  if (augmented && ctx.quality !== 'augmented') parts.glyphs.push('augmented');

  if (!suspended) {
    if (ctx.quality === 'diminished') {
      if (isHalfDim) parts.glyphs.push('half-diminished');
    } else if (chord.type >= 7 && ctx.majorSeventh) {
      parts.glyphs.push('major seven');
    }
  }

  const figKey = figuredKey(chord);
  if (figKey) {
    if (alterations.length && chord.inversion >= 1) {
      parts.embeddedAlterations = alterations.map(speakAlteration);
      parts.figured = FIGURED_ANALYTIC[figKey] || [figKey];
    } else {
      parts.figured = FIGURED_ANALYTIC[figKey] || [figKey];
    }
  }

  if (suspended) {
    const sortedSus = [...chord.suspensions].sort((a, b) => a - b);
    parts.suspensions = sortedSus.map(speakSus);
    if (chord.type >= 7 && !figKey) {
      parts.extension = speakExtension(chord.type);
    }
  } else if (chord.type >= 7 && !figKey && !ctx.majorSeventh) {
    parts.extension = speakExtension(chord.type);
  }

  if (ctx.borrowedTag) {
    parts.borrowed = BORROWED_SPOKEN[ctx.borrowedTag] || BORROWED_SPOKEN[ctx.borrowedMode] || ctx.borrowedTag;
  }

  if (Array.isArray(chord.adds)) {
    for (const v of chord.adds) {
      const spoken = speakAdd(v, chord.type);
      if (!spoken || spoken.includes('undefined')) parts.unknown = true;
      parts.adds.push(spoken);
    }
  }

  if (Array.isArray(chord.omits)) {
    for (const v of chord.omits) {
      if (v === 3) parts.omits.push('no third');
      else if (v === 5) parts.omits.push('no fifth');
      else parts.unknown = true;
    }
  }

  if (alterations.length && !parts.embeddedAlterations.length) {
    for (const a of alterations) {
      const spoken = speakAlteration(a);
      if (!spoken || spoken === a && !/^[b#]/.test(a)) parts.unknown = true;
      parts.alterations.push(spoken);
    }
  } else if (parts.embeddedAlterations.length) {
    parts.alterations.push(...parts.embeddedAlterations);
  }

  if (augmented) {
    parts.alterations = parts.alterations.filter((a) => a !== 'sharp five');
  }

  if (ctx.isApplied) {
    parts.appliedOf = speakAppliedTarget(ctx.denominatorDegree, ctx.denominatorQuality);
  }

  if (Array.isArray(chord.substitutions) && chord.substitutions.includes('tri')) {
    parts.substitution = 'tritone substitution';
  }

  return parts;
}

/** Build structured speak parts for one chord (numerator only if applied). */
export function buildSpeakParts(chord, key) {
  const ctx = resolveChordContext(chord, key);
  if (!ctx) return { unknown: true, parts: null };
  return { unknown: false, parts: buildSuffixParts(chord, ctx), ctx };
}
