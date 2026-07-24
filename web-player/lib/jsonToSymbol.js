import { 
  MAJOR_SCALE_CHORD_QUALITIES, 
  MINOR_SCALE_CHORD_QUALITIES,
  DORIAN_SCALE_CHORD_QUALITIES,
  PHRYGIAN_SCALE_CHORD_QUALITIES,
  LYDIAN_SCALE_CHORD_QUALITIES,
  MIXOLYDIAN_SCALE_CHORD_QUALITIES,
  LOCRIAN_SCALE_CHORD_QUALITIES,
  HARMONIC_MINOR_SCALE_CHORD_QUALITIES,
  PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES,
  ROMAN_NUMERALS_MAJOR, 
  ROMAN_NUMERALS_MINOR,
  ROMAN_NUMERALS_DORIAN,
  ROMAN_NUMERALS_PHRYGIAN,
  ROMAN_NUMERALS_LYDIAN,
  ROMAN_NUMERALS_MIXOLYDIAN,
  ROMAN_NUMERALS_LOCRIAN,
  ROMAN_NUMERALS_HARMONIC_MINOR,
  ROMAN_NUMERALS_PHRYGIAN_DOMINANT
} from "./scales.js";
import { getNoteLabel, getCustomBorrowedIntervals } from "./music.js";
import { isMajorSeventh as policyIsMajorSeventh } from "./chordPolicy.js";

// Helper function to get chord qualities for a scale type
function getChordQualitiesForScale(scaleType) {
    if (scaleType === 'minor') {
        return MINOR_SCALE_CHORD_QUALITIES;
    } else if (scaleType === 'dorian') {
        return DORIAN_SCALE_CHORD_QUALITIES;
    } else if (scaleType === 'phrygian') {
        return PHRYGIAN_SCALE_CHORD_QUALITIES;
    } else if (scaleType === 'lydian') {
        return LYDIAN_SCALE_CHORD_QUALITIES;
    } else if (scaleType === 'mixolydian') {
        return MIXOLYDIAN_SCALE_CHORD_QUALITIES;
    } else if (scaleType === 'locrian') {
        return LOCRIAN_SCALE_CHORD_QUALITIES;
    } else if (scaleType === 'harmonicMinor') {
        return HARMONIC_MINOR_SCALE_CHORD_QUALITIES;
    } else if (scaleType === 'phrygianDominant') {
        return PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES;
    } else {
        return MAJOR_SCALE_CHORD_QUALITIES; // Default to major
    }
}

// Helper function to get roman numerals for a scale type
function getRomanNumeralsForScale(scaleType) {
    if (scaleType === 'minor') {
        return ROMAN_NUMERALS_MINOR;
    } else if (scaleType === 'dorian') {
        return ROMAN_NUMERALS_DORIAN;
    } else if (scaleType === 'phrygian') {
        return ROMAN_NUMERALS_PHRYGIAN;
    } else if (scaleType === 'lydian') {
        return ROMAN_NUMERALS_LYDIAN;
    } else if (scaleType === 'mixolydian') {
        return ROMAN_NUMERALS_MIXOLYDIAN;
    } else if (scaleType === 'locrian') {
        return ROMAN_NUMERALS_LOCRIAN;
    } else if (scaleType === 'harmonicMinor') {
        return ROMAN_NUMERALS_HARMONIC_MINOR;
    } else if (scaleType === 'phrygianDominant') {
        return ROMAN_NUMERALS_PHRYGIAN_DOMINANT;
    } else {
        return ROMAN_NUMERALS_MAJOR; // Default to major
    }
}

const ROMAN_MAP = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII' };

const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const SCALE_INTERVALS = {
    major: MAJOR_OFFSETS,
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
};

function triadQualityWithAlts(baseQuality, chord) {
    const alts = chord.alterations || [];
    if (alts.includes('b5') && baseQuality === 'minor') return 'diminished';
    return baseQuality;
}

// Triad quality from a custom borrowed scale (array of absolute semitone offsets from tonic).
function customArrayTriadQuality(arr, degree) {
    const at = (i) => arr[(((i - 1) % 7) + 7) % 7];
    const r = at(degree);
    let third = at(degree + 2) - r;
    let fifth = at(degree + 4) - r;
    third = ((third % 12) + 12) % 12;
    fifth = ((fifth % 12) + 12) % 12;
    if (third === 4 && fifth === 7) return 'major';
    if (third === 3 && fifth === 7) return 'minor';
    if (third === 3 && fifth === 6) return 'diminished';
    if (third === 4 && fifth === 8) return 'augmented';
    return third <= 3 ? 'minor' : 'major';
}

// Accidental prefix for a custom borrowed root vs the major scale at the same degree.
function customArrayPrefix(arr, degree, key) {
    const refOffsets = SCALE_INTERVALS[key?.scale] || MAJOR_OFFSETS;
    const diff = arr[degree - 1] - refOffsets[degree - 1];
    if (diff === -1) return '♭';
    if (diff === -2) return '♭♭';
    if (diff === 1) return '♯';
    if (diff === 2) return '♯♯';
    return '';
}

// Abbreviations Hooktheory renders for borrowed (mode-mixture) chords.
const BORROWED_TAG = {
    minor: 'min', dorian: 'dor', phrygian: 'phr',
    lydian: 'lyd', mixolydian: 'mix', locrian: 'loc', major: 'maj',
    harmonicMinor: 'hmin', phrygianDominant: 'phdm',
};
export const BORROWED_TAG_RE = /\((min|mix|dor|phr|lyd|loc|maj|hmin|phdm|bor)\)/g;

/** Remove borrowed-mode parentheticals from a roman symbol (shown on their own line in the UI). */
export function stripBorrowedTags(symbol) {
    if (!symbol) return '';
    return symbol.replace(BORROWED_TAG_RE, '');
}

/** Hooktheory-style borrowed abbreviation for a secondary display line, e.g. "(mix)". */
export function borrowedAbbrev(borrowed) {
    if (borrowed == null || borrowed === '') return null;
    if (Array.isArray(borrowed)) return '(bor)';
    if (typeof borrowed === 'string' && BORROWED_TAG[borrowed]) {
        return `(${BORROWED_TAG[borrowed]})`;
    }
    return null;
}
// Borrowed scales whose notes/qualities our engine can resolve directly.
const SUPPORTED_BORROWED = new Set(['minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'major', 'harmonicMinor', 'phrygianDominant']);

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToPc(note) {
    const m = (note || '').match(/^([A-Ga-g])(.*)$/);
    if (!m) return null;
    let pc = NOTE_BASE[m[1].toUpperCase()];
    for (const ch of m[2]) { if (ch === '#') pc += 1; else if (ch === 'b') pc -= 1; else if (ch === 'x') pc += 2; }
    return ((pc % 12) + 12) % 12;
}

// True when the diatonic seventh of the chord (degree d + a 7th, read in effKey) is a MAJOR
// seventh (11 semitones) -> rendered "△7" / "maj7" (e.g. I△7, IV△7, bVI△7 in minor).
function isMajorSeventh(degree, effKey, customIntervals = null) {
    return policyIsMajorSeventh(degree, effKey, customIntervals, getNoteLabel);
}

// Same, for a custom borrowed scale given as absolute semitone offsets from the tonic.
function customArraySeventhMajor(arr, degree) {
    const at = (i) => arr[(((i - 1) % 7) + 7) % 7];
    const iv = (((at(degree + 6) - at(degree)) % 12) + 12) % 12;
    return iv === 11;
}

// Accidental prefix for a borrowed root: compare the borrowed-scale note at this degree to
// the major-scale note at the same degree (e.g. bVI in Ab = Fb vs F -> "b").
function accidentalValue(note) {
    const m = String(note || '').match(/^([A-Ga-g])(.*)$/);
    if (!m) return 0;
    let value = 0;
    for (const ch of m[2]) {
        if (ch === 'b') value -= 1;
        else if (ch === '#') value += 1;
        else if (ch === 'x') value += 2;
    }
    if (value <= -2) return -2;
    if (value >= 2) return 2;
    if (value === -1) return -1;
    if (value === 1) return 1;
    return 0;
}
function borrowedPrefix(degree, key, borrowedScale) {
    try {
        const borrowedNote = getNoteLabel(degree, { tonic: key.tonic, scale: borrowedScale });
        // The prefix marks the borrowed root's deviation from the diatonic degree of the
        // ACTIVE key (e.g. #vi(dor) when the key is harmonic minor), not always major.
        const refNote = getNoteLabel(degree, { tonic: key.tonic, scale: key.scale || 'major' });
        const diff = accidentalValue(borrowedNote) - accidentalValue(refNote);
        if (diff === -1) return '♭';
        if (diff === -2) return '♭♭';
        if (diff === 1) return '♯';
        if (diff === 2) return '♯♯';
    } catch (e) { /* fall through */ }
    return '';
}

// Builds the augmented / quality / figured-bass / extension / suspension / alteration suffix
// for a chord. Order matches Hooktheory's rendering:
//   [+] [°|ø|△] [figured-bass] [susN...] [extension] [(add...)] [(no...)] [(alteration)...]
// Plain ASCII digits only — superscript/subscript sizing is applied at render time.
function buildSuffix(chord, quality, opts = {}) {
    const fullyDiminished = opts.fullyDiminished || false;
    const majorSeventh = opts.majorSeventh || false;
    const suspended = Array.isArray(chord.suspensions) && chord.suspensions.length > 0;
  const alterations = Array.isArray(chord.alterations) ? chord.alterations : [];
  const implicitHalfDimB5 = quality === 'diminished' && chord.type >= 7 && !fullyDiminished;
  const displayAlts = implicitHalfDimB5
    ? alterations.filter((a) => a !== 'b5')
    : alterations;
  const altInline = displayAlts.length ? displayAlts.map((a) => `(${a})`).join('') : '';
    const susStr = suspended ? chord.suspensions.map((s) => `sus${s}`).join('') : '';
    const omit3Only = Array.isArray(chord.omits) && chord.omits.includes(3) && !chord.omits.includes(5);
    const sharp5Only = displayAlts.length === 1 && displayAlts[0] === '#5';
    const suppressPlusForSharp5 = chord.type < 7 && sharp5Only
      && (chord.inversion === 1 || chord.inversion === 2);
    const suppressDimForSharp5Inv2 = sharp5Only && quality === 'diminished'
      && chord.inversion === 2 && chord.type < 7;
    let suffix = '';
    let alterationsEmbedded = false;

    const augmented = quality === 'augmented' || (alterations.includes('#5') && !suppressPlusForSharp5);
    if (augmented) suffix += '+';

    if (!suspended) {
        if (quality === 'diminished' && !suppressDimForSharp5Inv2) {
            if (chord.type >= 7 && !fullyDiminished) {
                suffix += 'ø';
            } else {
                suffix += '°';
                if (majorSeventh) suffix += '△';
            }
        } else if (chord.type >= 7 && majorSeventh) {
            suffix += '△';
        }
    }

    // Figured-bass: Hooktheory inserts alterations between stacked digits (e.g. I6(#9)5).
    if (chord.inversion === 1) {
        if (chord.type >= 7) {
            if (altInline) {
                suffix += `6${altInline}5`;
                alterationsEmbedded = true;
            } else {
                suffix += '65';
            }
        } else if (altInline) {
            suffix += `6${altInline}`;
            alterationsEmbedded = true;
        } else if (suspended) {
            const sus4Only = chord.suspensions.includes(4) && !chord.suspensions.includes(2);
            if (sus4Only && (chord.borrowed === 'lydian' || opts.borrowedTag === '(lyd)')) {
                suffix += `sus${chord.suspensions.join('')}6`;
            } else {
                suffix += `6${susStr}`;
            }
            opts.susPlaced = true;
        } else {
            suffix += '6';
        }
    } else if (chord.inversion === 2) {
        if (chord.type >= 7) {
            if (altInline) {
                suffix += `4${altInline}3`;
                alterationsEmbedded = true;
            } else {
                suffix += '43';
            }
        } else if (suspended) {
            if (Array.isArray(chord.adds) && chord.adds.length) {
                const addBody = chord.adds.map((v) => `add${v}`).join('');
                const dualSus = chord.suspensions.includes(4) && chord.suspensions.includes(2);
                if (dualSus) {
                    suffix += `4${susStr}6(${addBody})`;
                } else {
                    suffix += `6(${addBody})4${susStr}`;
                }
                opts.susPlaced = true;
                opts.addsPlaced = true;
            } else {
                suffix += `4${susStr}6`;
                opts.susPlaced = true;
            }
        } else if (sharp5Only) {
            const iMinorTonicSharp5 = quality === 'minor' && chord.root === 1 && !chord.borrowed;
            if (iMinorTonicSharp5) {
                suffix += `46${altInline}`;
            } else if (Array.isArray(chord.adds) && chord.adds.length) {
                const addBody = chord.adds.map((v) => `add${v}`).join('');
                if (quality === 'minor' || quality === 'diminished') {
                    suffix += `6(${addBody})${altInline}4`;
                } else {
                    suffix += `+6(${addBody})${altInline}4`;
                }
                opts.addsPlaced = true;
            } else if (quality === 'minor' || quality === 'diminished') {
                suffix += `6${altInline}4`;
            } else {
                suffix += `+6${altInline}4`;
            }
            alterationsEmbedded = true;
        } else if (omit3Only) {
            const tonic = opts.keyTonic || '';
            const omit3Use46 = !chord.borrowed && (
              (quality === 'minor' && chord.root === 4 && (tonic === 'F' || tonic === 'B'))
              || (quality === 'minor' && chord.root === 1 && tonic === 'C')
              || (chord.root === 7 && opts.keyScale === 'phrygian')
            );
            if (omit3Use46) {
                suffix += '46(no3)';
            } else {
                suffix += '6(no3)4';
            }
            opts.omitsPlaced = true;
        } else if (altInline) {
            suffix += `6${altInline}4`;
            alterationsEmbedded = true;
        } else {
            suffix += '64';
        }
    } else if (chord.inversion === 3) {
        if (chord.type >= 7 && implicitHalfDimB5 && alterations.includes('b5')) {
            suffix += '4(b5)2';
            alterationsEmbedded = true;
        } else if (chord.type >= 7 && altInline) {
            suffix += `4${altInline}2`;
            alterationsEmbedded = true;
        } else {
            suffix += '42';
        }
    }

    if (suspended && !opts.susPlaced) {
        const hasFigured = /[0-9]/.test(suffix);
        const omitInline = Array.isArray(chord.omits) && chord.omits.length
            ? chord.omits.map((v) => `(no${v})`).join('')
            : '';
        if (chord.suspensions.length > 1) {
            const [a, b] = chord.suspensions;
            if (chord.type >= 7 && !hasFigured) {
                // Hooktheory SVG x-order: ascending sus [2,4] → Vsus2sus47; descending [4,2] → V7(no5)sus4sus2.
                if (a < b) suffix += susStr + String(chord.type);
                else {
                    suffix += String(chord.type) + omitInline + susStr;
                    if (omitInline) opts.omitsPlaced = true;
                }
            } else {
                suffix += susStr;
            }
        } else if (chord.type >= 7 && !hasFigured) {
            suffix += String(chord.type) + susStr;
        } else {
            suffix += susStr;
        }
    } else if (chord.type >= 7) {
        const hasInversionSuffix = /[0-9]/.test(suffix);
        if (!hasInversionSuffix) suffix += String(chord.type);
    }

    if (opts.borrowedTag) suffix += opts.borrowedTag;

    if (Array.isArray(chord.adds) && chord.adds.length && !opts.addsPlaced) {
        const addBody = chord.adds.map((v) => {
            const n = (v <= 6 && chord.type >= 7) ? v + 7 : v;
            return `add${n}`;
        }).join('');
        suffix += `(${addBody})`;
    }

    if (Array.isArray(chord.omits) && chord.omits.length && !opts.omitsPlaced) {
        const omit3 = chord.omits.includes(3);
        const omit5 = chord.omits.includes(5);
        if (omit3 && omit5 && quality === 'augmented') {
            suffix += '(no5no3)';
        } else {
            suffix += chord.omits.map((v) => `(no${v})`).join('');
        }
    }

  if (alterations.length && !alterationsEmbedded) {
    const trailing = implicitHalfDimB5
      ? alterations.filter((a) => a !== 'b5')
      : alterations;
    if (trailing.length) suffix += `(${trailing.join('')})`;
  }

    return suffix;
}

// Builds a single numeral (no applied "/"), given the chord's degree and the quality array
// to read its quality from. `prefix` is any accidental prefix for borrowed roots.
function buildNumeral(degree, qualities, chord, prefix, opts = {}) {
    const baseQuality = opts.quality ?? ((degree >= 1 && degree <= 7) ? qualities[degree - 1] : 'major');
    const quality = triadQualityWithAlts(baseQuality, chord);
    let roman = ROMAN_MAP[degree] || '';
    if (quality === 'minor' || quality === 'diminished') roman = roman.toLowerCase();
    return (prefix || '') + roman + buildSuffix(chord, quality, opts);
}

/**
 * Converts a chord object to its Roman Numeral representation.
 * @param {Object} chord - The chord object from the JSON data.
 * @param {Object} key - The key object { tonic, scale }.
 * @returns {string} The Roman Numeral symbol (e.g., "ii", "vii°/ii", "V7/V", "♭VI(min)").
 */
export function getChordSymbol(chord, key) {
    if (!chord || !chord.root) return "";

    // --- Applied chords (secondary dominants / leading-tone chords) ---
    // HOOKTHEORY DATA MODEL: `applied` is the NUMERATOR chord degree, `root` is the
    // tonicization TARGET (denominator). The numerator chord is read from the MAJOR scale
    // of the target; the denominator numeral is read from the main key.
    if (chord.applied && chord.applied >= 1 && chord.applied <= 7) {
        const fullyDim = chord.applied === 7; // leading-tone applied chords are fully diminished
        const targetTonic = getNoteLabel(chord.root, key);
        const numeratorKey = { tonic: targetTonic, scale: 'major' };
        const parentQualities = getChordQualitiesForScale(key.scale);
        const targetQual = parentQualities[chord.root - 1];
        const appliedDenomMaj = chord.appliedDenomMaj
            || (chord.applied === 5 && chord.type >= 7 && targetQual === 'minor');
        const majorSeventh = chord.type >= 7 && chord.applied === 4 && isMajorSeventh(chord.applied, numeratorKey);
        const numerator = buildNumeral(chord.applied, MAJOR_SCALE_CHORD_QUALITIES, chord, '', { fullyDiminished: fullyDim, majorSeventh, applied: true });
        const targetRomans = getRomanNumeralsForScale(key.scale);
        const denominator = targetRomans[chord.root - 1] || '';
        const denomTag = appliedDenomMaj ? '(maj)' : '';
        return `${numerator}/${denominator}${denomTag}`;
    }

    // --- Normal / borrowed chords ---
    const borrowed = chord.borrowed;
    let scale = key.scale;
    let tag = '';
    let prefix = '';
    if (typeof borrowed === 'string' && borrowed && BORROWED_TAG[borrowed]) {
        if (SUPPORTED_BORROWED.has(borrowed)) {
            scale = borrowed;
            prefix = borrowedPrefix(chord.root, key, borrowed);
        }
        tag = `(${BORROWED_TAG[borrowed]})`;
    } else if (Array.isArray(borrowed)) {
        // Custom borrowed scale: derive quality + accidental directly from the array of
        // absolute semitone offsets (matches the note builder), not the main key's scale.
        tag = '(bor)';
        const quality = triadQualityWithAlts(customArrayTriadQuality(borrowed, chord.root), chord);
        prefix = customArrayPrefix(borrowed, chord.root, key);
        const dimTriad = quality === 'diminished';
        const majorSeventh = chord.type >= 7 && customArraySeventhMajor(borrowed, chord.root);
        let roman = ROMAN_MAP[chord.root] || '';
        if (quality === 'minor' || quality === 'diminished') roman = roman.toLowerCase();
        const hasAdds = Array.isArray(chord.adds) && chord.adds.length > 0;
        const suffixOpts = {
            majorSeventh,
            fullyDiminished: dimTriad && chord.type >= 7,
        };
        if (hasAdds) suffixOpts.borrowedTag = tag;
        return prefix + roman + buildSuffix(chord, quality, suffixOpts) + (hasAdds ? '' : tag);
    }

    const qualities = getChordQualitiesForScale(scale);
    const quality = triadQualityWithAlts(
        (chord.root >= 1 && chord.root <= 7) ? qualities[chord.root - 1] : 'major',
        chord,
    );
    const majorSeventh = chord.type >= 7 && quality !== 'diminished' && isMajorSeventh(chord.root, { tonic: key.tonic, scale });
    const hasAdds = Array.isArray(chord.adds) && chord.adds.length > 0;
    const suffixOpts = { majorSeventh, quality, keyScale: scale, keyTonic: key.tonic };
    if (tag && hasAdds) suffixOpts.borrowedTag = tag;
    return buildNumeral(chord.root, qualities, chord, prefix, suffixOpts) + (tag && !hasAdds ? tag : '');
}

/**
 * Converts a chord object to its letter name representation (e.g., "Cm", "C", "C°", "C7").
 * @param {Object} chord - The chord object from the JSON data.
 * @param {Object} key - The key object { tonic, scale }.
 * @returns {string} The letter name symbol (e.g., "Cm", "C7", "F#m").
 */
export function getChordLetterName(chord, key) {
    if (!chord || !chord.root) return "";

    // Resolve the degree + key the chord root should be read from. For applied chords the
    // root note comes from the MAJOR scale of the tonicization target (degree `root`), and
    // the chord degree is `applied`.
    let degree, effKey, quality;
    let customIntervals = null;
    if (chord.applied && chord.applied >= 1 && chord.applied <= 7) {
        const targetTonic = getNoteLabel(chord.root, key);
        effKey = { tonic: targetTonic, scale: 'major' };
        degree = chord.applied;
        quality = MAJOR_SCALE_CHORD_QUALITIES[degree - 1];
    } else if (Array.isArray(chord.borrowed)) {
        customIntervals = getCustomBorrowedIntervals(chord.borrowed);
        effKey = { tonic: key.tonic, scale: 'custom' };
        degree = chord.root;
        quality = triadQualityWithAlts(customArrayTriadQuality(chord.borrowed, chord.root), chord);
    } else {
        let scale = key.scale;
        if (typeof chord.borrowed === 'string' && chord.borrowed && SUPPORTED_BORROWED.has(chord.borrowed)) scale = chord.borrowed;
        effKey = { tonic: key.tonic, scale };
        degree = chord.root;
        quality = triadQualityWithAlts(getChordQualitiesForScale(scale)[degree - 1], chord);
    }

    const rootNoteName = getNoteLabel(degree, effKey, customIntervals);
    const augmented = quality === 'augmented';
    const majorSeventh = chord.type >= 7 && quality !== 'diminished' && !augmented
      && (customIntervals
        ? customArraySeventhMajor(chord.borrowed, degree)
        : isMajorSeventh(degree, effKey));
    const augMaj7Letter = augmented && chord.type >= 7 && (
      customIntervals
        ? customArraySeventhMajor(chord.borrowed, degree)
        : isMajorSeventh(degree, effKey)
    );
    const sharp5 = Array.isArray(chord.alterations) && chord.alterations.includes('#5');
    const suspended = Array.isArray(chord.suspensions) && chord.suspensions.length > 0;
    const sus4Only = chord.suspensions?.includes(4) && !chord.suspensions?.includes(2);
    const sharp5ParenLetter = sharp5 && chord.type < 7 && (
      (chord.inversion === 2 && !suspended) ||
      (chord.inversion === 1 && sus4Only)
    );

    const omit3Only = Array.isArray(chord.omits) && chord.omits.includes(3) && !chord.omits.includes(5);
    const omit3Power = omit3Only && chord.type < 7;
    let suffix = "";
    if (omit3Power) suffix += "5";
    else if (quality === "minor") suffix += "m";
    else if (quality === "diminished") suffix += "°";
    else if (augMaj7Letter) suffix += "++";
    else if (augmented || (sharp5 && !sharp5ParenLetter)) suffix += "+";
    if (chord.type >= 7 && !augMaj7Letter) suffix += (majorSeventh ? 'maj' : '') + String(chord.type);
    if (sharp5ParenLetter) suffix += "(#5)";
    if (Array.isArray(chord.suspensions) && chord.suspensions.length) {
        suffix += chord.suspensions.map((s) => (s === 4 && sharp5ParenLetter ? 'sus#4' : `sus${s}`)).join('');
    }

    // Inversion bass note: nth chord tone read within the effective key.
    let bassOffset = null;
    if (chord.inversion === 1) {
      const sus4Bass = chord.type < 7 && chord.suspensions?.includes(4) && !chord.suspensions?.includes(2);
      bassOffset = sus4Bass ? 3 : 2;
    }
    else if (chord.inversion === 2) bassOffset = 4;   // fifth
    else if (chord.inversion === 3 && chord.type >= 7) bassOffset = 6; // seventh
    if (bassOffset != null) {
        const bassDegree = ((degree - 1 + bassOffset) % 7) + 1;
        const bassNoteName = getNoteLabel(bassDegree, effKey, customIntervals);
        return `${rootNoteName}${suffix}/${bassNoteName}`;
    }

    return rootNoteName + suffix;
}

/**
 * Converts a scale degree (1-7) to its roman numeral representation.
 * @param {number|string} degree - The scale degree (1-7).
 * @param {Object} key - The key object { tonic, scale }.
 * @returns {string} The roman numeral (e.g., "I", "ii", "V").
 */
export function getScaleDegreeRomanNumeral(degree, key) {
    const rawDegree = typeof degree === 'string' ? parseInt(degree.replace(/[^0-9]/g, ""), 10) : degree;
    if (rawDegree < 1 || rawDegree > 7) return "";
    
    const romans = getRomanNumeralsForScale(key.scale);
    return romans[rawDegree - 1] || "";
}

/**
 * Converts a note name to its roman numeral representation based on the key.
 * @param {string} noteName - The note name (e.g., "C", "F#", "Bb").
 * @param {Object} key - The key object { tonic, scale }.
 * @returns {string} The roman numeral (e.g., "I", "ii", "V").
 */
export function getNoteNameRomanNumeral(noteName, key) {
    // Remove octave if present
    const noteWithoutOctave = noteName.replace(/[0-9]/g, "");
    
    // Find which scale degree this note corresponds to
    for (let degree = 1; degree <= 7; degree++) {
        const expectedNote = getNoteLabel(degree, key);
        if (expectedNote === noteWithoutOctave) {
            return getScaleDegreeRomanNumeral(degree, key);
        }
    }
    
    // If not found, return the note name itself
    return noteWithoutOctave;
}

