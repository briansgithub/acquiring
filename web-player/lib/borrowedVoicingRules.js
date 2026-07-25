/**
 * Declarative borrowed / symbol-frame voicing rules (Fix 065).
 * Symbol modifiers (halfDim, dimTriad) drive voicing frame; scale quality drives spelling.
 */

/** ø symbol → dim7 (bb7) voice when nat-dim quality on these scale degrees. */
export const DIM7_BB7_RULES = [
  { scale: "custom", degree: null },
  { scale: "dorian", degree: 6 },
  { scale: "lydian", degree: 4 },
  { scale: "minor", degree: 2 },
  { scale: "harmonicMinor", degree: 2 },
  { scale: "major", degree: 7 },
  { scale: "phrygian", degree: 5 },
  { scale: "locrian", degree: 1 },
];

/**
 * ø65 inv=1 → m6 stack (dim5 + 6th) instead of ø7 perfect fifth.
 * Catalog: mix-borrowed, hm iiø, major viiø, native mixolydian iiiø.
 */
export const HALF_DIM_M6_STACK_RULES = [
  { borrowed: "mixolydian" },
  { scale: "harmonicMinor", degree: 2 },
  { scale: "major", degree: 7 },
  { scale: "mixolydian", degree: 3 },
];

/** Triad-frame overrides — symbol/seventh semantics, not raw scale quality. */
export const TRIAD_FRAME_RULES = [
  {
    id: "phdmBVImaj7",
    borrowed: "phrygianDominant",
    degree: 6,
    minType: 7,
    noAlts: ["#5"],
    triadFrame: "major",
    inversionNot: 3,
  },
  {
    id: "nativePhdmIImaj7",
    nativeScale: "phrygianDominant",
    degree: 2,
    minType: 7,
    inversion: 3,
    triadFrame: "major",
    rootShift: 1,
  },
  {
    id: "borrowedPhdmII64",
    borrowed: "phrygianDominant",
    degree: 2,
    inversion: 2,
    rootShift: 1,
  },
];

function ruleMatches(rule, ctx) {
  if (rule.borrowed != null && ctx.borrowed !== rule.borrowed) return false;
  if (rule.scale != null && ctx.modifiedKey?.scale !== rule.scale) return false;
  if (rule.degree != null && ctx.chordRootSD !== rule.degree) return false;
  if (rule.inversion != null && ctx.inversion !== rule.inversion) return false;
  if (rule.inversionNot != null && ctx.inversion === rule.inversionNot) return false;
  if (rule.minType != null && ctx.chordType < rule.minType) return false;
  if (rule.nativeScale != null) {
    const native = ctx.key?.scale === rule.nativeScale
      && (ctx.borrowed === null || ctx.borrowed === "");
    if (!native) return false;
  }
  if (rule.noAlts?.length) {
    const alts = ctx.modifierChord?.alterations || [];
    if (rule.noAlts.some((a) => alts.includes(a))) return false;
  }
  return true;
}

export function matchesDim7Bb7(chordRootSD, scale, chordQuality, chordType, opts = {}) {
  if (chordType < 7 || chordQuality !== "diminished") return false;
  if (!opts.halfDim) {
    return DIM7_BB7_RULES.some(
      (r) => r.scale === scale && (r.degree === null || r.degree === chordRootSD),
    );
  }
  return DIM7_BB7_RULES.some(
    (r) => r.scale === scale && (r.degree === null || r.degree === chordRootSD),
  );
}

export function matchesHalfDimM6Stack(ctx) {
  const { modifierChord, chordType, inversion, useSusFrame, omitTriad35 } = ctx;
  if (!modifierChord?.halfDim || chordType < 7 || inversion !== 1 || useSusFrame || omitTriad35) {
    return false;
  }
  return HALF_DIM_M6_STACK_RULES.some((r) => ruleMatches(r, ctx));
}

export function lookupTriadFrameOverride(ctx) {
  for (const rule of TRIAD_FRAME_RULES) {
    if (ruleMatches(rule, ctx)) return rule;
  }
  return null;
}
