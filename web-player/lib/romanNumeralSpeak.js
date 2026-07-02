import { buildSpeakParts, UNKNOWN } from './speakRules/buildParts.js';
import { formatAnalytic, formatFunctional } from './speakRules/formatReadings.js';
import { speakLetterChord } from './speakRules/speakLetter.js';

/**
 * Spoken readings for a Hooktheory chord.
 * @returns {{ analytic: string, functional: string, letter: string }}
 */
export function getChordPronunciation(chord, key) {
  if (!chord || chord.isRest || !chord.root) {
    return { analytic: '', functional: '', letter: '' };
  }

  const { parts, ctx, unknown } = buildSpeakParts(chord, key);
  if (!parts) {
    return { analytic: UNKNOWN, functional: UNKNOWN, letter: speakLetterChord(chord, key) };
  }

  const analytic = unknown ? UNKNOWN : formatAnalytic(parts);
  const functional = unknown ? UNKNOWN : formatFunctional(parts, ctx);
  const letter = speakLetterChord(chord, key);

  return { analytic, functional, letter };
}

/** Analytic reading only. */
export function speakRomanNumeral(chord, key) {
  return getChordPronunciation(chord, key).analytic;
}

export { UNKNOWN };

const ANALYTIC_READING_HINT =
  'Reads the roman symbol left to right — degree, quality, figured bass, extensions, and alterations as written.';
const FUNCTIONAL_READING_HINT =
  'Theory shorthand — names inversions, secondary dominants, and borrowed-scale context instead of repeating symbol fragments.';

/** HTML block for tooltip / Now Playing pronunciation lines. */
export function pronunciationDisplayHtml(pronunciation) {
  if (!pronunciation?.analytic) return '';
  return `
    <div class="chord-pronunciation">
      <div class="pronunciation-analytic chord-tooltip-pronunciation">
        <div class="pronunciation-label" title="${ANALYTIC_READING_HINT}">Analytic Reading:</div>
        <div class="pronunciation-text">${pronunciation.analytic}</div>
      </div>
      <div class="pronunciation-functional">
        <div class="pronunciation-label" title="${FUNCTIONAL_READING_HINT}">Functional Reading:</div>
        <div class="pronunciation-text">${pronunciation.functional}</div>
      </div>
    </div>
  `;
}
