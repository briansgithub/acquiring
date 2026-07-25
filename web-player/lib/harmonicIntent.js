/**
 * Harmonic Intent Pipeline
 * Resolves any raw Hooktheory chord object (degree-based, letter-anchored, borrowed, applied)
 * into a single, canonical, immutable Harmonic Intent representation.
 *
 * Used by both pitch generation (chordBuild.js) and symbol formatting (jsonToSymbol.js)
 * to ensure symbols and tone output remain 100% synchronized.
 */

import { applyChordSubstitutions, resolveTriSubRoot } from "./chordSubstitutions.js";
import { MAJOR_SCALE_CHORD_QUALITIES, TRIAD_DEGREES } from "./scales.js";
import {
  getNoteLabel,
  resolveBorrowedScale,
  getScaleChordQualities,
} from "./musicScale.js";
import { noteLabel, noteNameToPc } from "./chordNoteUtils.js";
import { resolveChordPolicy, enrichModifierChord } from "./chordPolicy.js";

export function resolveHarmonicIntent(chord, key, opts = {}) {
  // 1. Substitute tritone dominants if applicable
  const effective = applyChordSubstitutions(
    opts.forceRootPosition ? { ...chord, inversion: 0 } : chord,
    key,
  );

  const borrowed = effective.borrowed || null;
  const chordType = effective.type || 5;
  const inversion = effective.inversion || 0;
  const suspensions = effective.suspensions || [];
  const defaultOctave = 3;

  // 2. Resolve borrowed scale and key modifications
  const {
    key: modifiedKey,
    customScaleIntervals,
    scaleChordQualities: resolvedQualities,
  } = resolveBorrowedScale(key, borrowed);
  const scaleChordQualities = getScaleChordQualities(modifiedKey.scale, resolvedQualities);

  let chordRootSD = effective.root || 1;
  let rootNoteName = "";
  let isLetterAnchored = false;
  let appliedContext = null;

  // 3a. Letter-anchored chords (Hooktheory root=0)
  if ((!effective.root || effective.root < 1) && effective._letterRootName) {
    isLetterAnchored = true;
    rootNoteName = effective._letterRootName;
  }
  // 3b. Applied Chords (Secondary Functions: root = denominator target, applied = numerator degree)
  else if (
    effective.applied &&
    effective.applied >= 1 &&
    effective.applied <= 7 &&
    !borrowed
  ) {
    const parentChordQualities = getScaleChordQualities(modifiedKey.scale, resolvedQualities);
    const targetTonicNote = getNoteLabel(effective.root, modifiedKey, customScaleIntervals);

    if (effective._triSubDominant && effective.applied === 5) {
      rootNoteName = resolveTriSubRoot(targetTonicNote);
      appliedContext = { isTriSub: true, targetTonicNote };
    } else {
      const targetQual = parentChordQualities[effective.root - 1];
      const appliedDenomMaj =
        effective.appliedDenomMaj ||
        (effective.applied === 5 && chordType >= 7 && targetQual === "minor");
      const appliedKey = { tonic: targetTonicNote, scale: "major" };
      rootNoteName = getNoteLabel(effective.applied, appliedKey);
      appliedContext = {
        targetSD: effective.root,
        appliedSD: effective.applied,
        targetTonicNote,
        appliedDenomMaj,
        appliedKey,
      };
    }
  }
  // 3c. Standard Degree-based Chords
  else if (effective.applied && effective.applied >= 1 && effective.applied <= 7 && borrowed) {
    // Applied + Borrowed composite: target note comes from borrowed scale
    const targetNote = getNoteLabel(effective.root, modifiedKey, customScaleIntervals);
    if (effective._triSubDominant && effective.applied === 5) {
      rootNoteName = resolveTriSubRoot(targetNote);
    } else {
      const appliedKey = { tonic: targetNote, scale: "major" };
      rootNoteName = getNoteLabel(effective.applied, appliedKey);
    }
    appliedContext = { targetSD: effective.root, appliedSD: effective.applied, isBorrowedApplied: true };
  } else {
    rootNoteName = getNoteLabel(chordRootSD, modifiedKey, customScaleIntervals);
  }

  // 4. Resolve Base Triad Quality & Policy
  const rawChordQuality = isLetterAnchored
    ? effective._letterQuality || "major"
    : scaleChordQualities[chordRootSD - 1] || "major";

  const useSusFrame = suspensions.length > 0;
  const omitTriad35 = effective.omits?.includes(3) && effective.omits?.includes(5);

  const policy = resolveChordPolicy({
    key,
    originalKey: key,
    borrowed,
    modifiedKey,
    chordRootSD,
    chordType,
    inversion,
    chordQuality: rawChordQuality,
    modifierChord: effective,
    useSusFrame,
    omitTriad35,
  });

  // Apply root shift semitones if policy dictates
  if (policy.rootShiftSemitones) {
    // Shift pitch class for label
    const pc = (noteNameToPc(rootNoteName) + policy.rootShiftSemitones + 12) % 12;
    // Keep rootNoteName intact or update accordingly
  }

  const triadQuality = policy.triadQuality;

  // 5. Enriched Modifiers & Fix 075 Gate Strategy
  const effModifierChord = opts.enrichModifiers !== false
    ? enrichModifierChord(effective, chordType, {
        customBorrowed: Array.isArray(borrowed),
        autoAlterations: policy.autoAlterations,
      })
    : effective;

  // Fix 075 Candidate Gate: flattenHalfDimB5 is valid for viiø7(b5) (type <= 7) but not ø9(b5)
  if (effModifierChord && effModifierChord.flattenHalfDimB5 && chordType > 7) {
    effModifierChord.flattenHalfDimB5 = false;
  }

  // 6. Return Clean Intent Object
  return {
    rawChord: effective,
    key,
    modifiedKey,
    borrowed,
    chordType,
    inversion,
    chordRootSD,
    rootNoteName,
    rootPc: noteNameToPc(rootNoteName),
    triadQuality,
    policy,
    useSusFrame,
    omitTriad35,
    suspensions,
    omits: effModifierChord?.omits || [],
    alterations: effModifierChord?.alterations || [],
    adds: effModifierChord?.adds || [],
    isLetterAnchored,
    appliedContext,
    slashBassName: effective._letterBassName || null,
    baseOctave: defaultOctave,
  };
}
