import { buildSpeakParts, UNKNOWN } from './speakRules/buildParts.js';
import { formatAnalytic, formatFunctional, formatFunctionalLetter } from './speakRules/formatReadings.js';
import { speakLetterChord } from './speakRules/speakLetter.js';

/**
 * Spoken readings for a Hooktheory chord.
 * @returns {{ analytic: string, functional: string, letter: string, functionalLetter: string }}
 */
export function getChordPronunciation(chord, key) {
  if (!chord || chord.isRest || !chord.root) {
    return { analytic: '', functional: '', letter: '', functionalLetter: '' };
  }

  const { parts, ctx, unknown } = buildSpeakParts(chord, key);
  if (!parts) {
    const letter = speakLetterChord(chord, key);
    return { analytic: UNKNOWN, functional: UNKNOWN, letter, functionalLetter: letter ? UNKNOWN : '' };
  }

  const analytic = unknown ? UNKNOWN : formatAnalytic(parts);
  const functional = unknown ? UNKNOWN : formatFunctional(parts, ctx);
  const letter = speakLetterChord(chord, key);
  const functionalLetter = unknown ? UNKNOWN : formatFunctionalLetter(parts, ctx, key, chord);

  return { analytic, functional, letter, functionalLetter };
}

/** Analytic reading only. */
export function speakRomanNumeral(chord, key) {
  return getChordPronunciation(chord, key).analytic;
}

export { UNKNOWN };

const ROMAN_ANALYTIC_HINT =
  'Reads the roman symbol left to right — degree, quality, figured bass, extensions, and alterations as written.';
const ROMAN_FUNCTIONAL_HINT =
  'Theory shorthand — names inversions, secondary dominants, and borrowed-scale context instead of repeating symbol fragments.';
const LETTER_ANALYTIC_HINT =
  'Reads the chord symbol left to right — root note, quality, extensions, and bass as written.';
const LETTER_FUNCTIONAL_HINT =
  'Theory shorthand using note names — inversions, secondary dominants, and borrowed-scale context.';

/** HTML block for tooltip / Now Playing pronunciation lines. */
export function pronunciationDisplayHtml(pronunciation, options = {}) {
  const useRoman = options.useRoman !== false;
  if (useRoman) {
    if (!pronunciation?.analytic) return '';
    return `
    <div class="chord-pronunciation">
      <div class="pronunciation-analytic chord-tooltip-pronunciation">
        <div class="pronunciation-label" title="${ROMAN_ANALYTIC_HINT}">Analytic Reading:</div>
        <div class="pronunciation-text">${pronunciation.analytic}</div>
      </div>
      <div class="pronunciation-functional">
        <div class="pronunciation-label" title="${ROMAN_FUNCTIONAL_HINT}">Functional Reading:</div>
        <div class="pronunciation-text">${pronunciation.functional}</div>
      </div>
    </div>
  `;
  }

  if (!pronunciation?.letter) return '';
  return `
    <div class="chord-pronunciation">
      <div class="pronunciation-analytic chord-tooltip-pronunciation">
        <div class="pronunciation-label" title="${LETTER_ANALYTIC_HINT}">Analytic Reading:</div>
        <div class="pronunciation-text">${pronunciation.letter}</div>
      </div>
      <div class="pronunciation-functional">
        <div class="pronunciation-label" title="${LETTER_FUNCTIONAL_HINT}">Functional Reading:</div>
        <div class="pronunciation-text">${pronunciation.functionalLetter}</div>
      </div>
    </div>
  `;
}
