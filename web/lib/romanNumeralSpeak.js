import { buildSpeakParts, UNKNOWN } from './speakRules/buildParts.js';
import {
  formatColloquial,
  formatAcademic,
  formatAcademicLetter,
} from './speakRules/formatReadings.js';
import { speakLetterChord } from './speakRules/speakLetter.js';

/**
 * Spoken readings for a Hooktheory chord.
 * @returns {{ colloquial: string, academic: string, colloquialLetter: string, academicLetter: string, analytic: string, functional: string, letter: string, functionalLetter: string }}
 */
export function getChordPronunciation(chord, key) {
  if (!chord || chord.isRest || !chord.root) {
    return {
      colloquial: '', academic: '', colloquialLetter: '', academicLetter: '',
      analytic: '', functional: '', letter: '', functionalLetter: '',
    };
  }

  const { parts, ctx, unknown } = buildSpeakParts(chord, key);
  const letter = speakLetterChord(chord, key);

  if (!parts) {
    return {
      colloquial: UNKNOWN, academic: UNKNOWN, colloquialLetter: letter || UNKNOWN, academicLetter: letter || UNKNOWN,
      analytic: UNKNOWN, functional: UNKNOWN, letter: letter || UNKNOWN, functionalLetter: letter ? UNKNOWN : '',
    };
  }

  const colloquial = unknown ? UNKNOWN : formatColloquial(parts, ctx);
  const academic = unknown ? UNKNOWN : formatAcademic(parts, ctx);
  const colloquialLetter = letter;
  const academicLetter = unknown ? UNKNOWN : formatAcademicLetter(parts, ctx, key, chord);

  return {
    colloquial,
    academic,
    colloquialLetter,
    academicLetter,
    // Backwards-compatibility aliases
    analytic: colloquial,
    functional: academic,
    letter: colloquialLetter,
    functionalLetter: academicLetter,
  };
}

/** Colloquial musician reading only. */
export function speakRomanNumeral(chord, key) {
  return getChordPronunciation(chord, key).colloquial;
}

export { UNKNOWN };

const COLLOQUIAL_ROMAN_HINT =
  'Efficient musician rehearsal reading — uses natural speech, lead-sheet terms, and figured-bass numbers.';
const ACADEMIC_ROMAN_HINT =
  'Academic & educational elucidation — explains structural inversions, harmonic functions, and scale derivations.';
const COLLOQUIAL_LETTER_HINT =
  'Efficient lead-sheet musician speech — root note, quality, extensions, and bass as spoken in rehearsal.';
const ACADEMIC_LETTER_HINT =
  'Academic & educational elucidation using note names — explains inversions and secondary target functions.';

function pronunciationShellHtml(useRoman, colloquialText = "", academicText = "", { masked = false } = {}) {
  const colloquialHint = useRoman ? COLLOQUIAL_ROMAN_HINT : COLLOQUIAL_LETTER_HINT;
  const academicHint = useRoman ? ACADEMIC_ROMAN_HINT : ACADEMIC_LETTER_HINT;
  const maskedClass = masked ? " pronunciation-masked" : "";
  return `
    <div class="chord-pronunciation${maskedClass}">
      <div class="pronunciation-analytic chord-tooltip-pronunciation">
        <div class="pronunciation-label" title="${colloquialHint}">Colloquial Reading:</div>
        <div class="pronunciation-text">${colloquialText}</div>
      </div>
      <div class="pronunciation-functional">
        <div class="pronunciation-label" title="${academicHint}">Academic Reading:</div>
        <div class="pronunciation-text">${academicText}</div>
      </div>
    </div>
  `;
}

/** HTML block for tooltip / Now Playing pronunciation lines. */
export function pronunciationDisplayHtml(pronunciation, options = {}) {
  const useRoman = options.useRoman !== false;
  if (options.masked) {
    return pronunciationShellHtml(useRoman, "", "", { masked: true });
  }
  if (useRoman) {
    const col = pronunciation?.colloquial || pronunciation?.analytic;
    const aca = pronunciation?.academic || pronunciation?.functional;
    if (!col) return '';
    return pronunciationShellHtml(useRoman, col, aca);
  }

  const colL = pronunciation?.colloquialLetter || pronunciation?.letter;
  const acaL = pronunciation?.academicLetter || pronunciation?.functionalLetter;
  if (!colL) return '';
  return pronunciationShellHtml(useRoman, colL, acaL);
}

