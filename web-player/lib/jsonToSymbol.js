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
import { getNoteLabel } from "./music.js";

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
function customArrayPrefix(arr, degree) {
    const diff = arr[degree - 1] - MAJOR_OFFSETS[degree - 1];
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
function isMajorSeventh(degree, effKey) {
    try {
        const root = getNoteLabel(degree, effKey);
        const seventhDeg = ((degree - 1 + 6) % 7) + 1;
        const sev = getNoteLabel(seventhDeg, effKey);
        const r = noteToPc(root), s = noteToPc(sev);
        if (r == null || s == null) return false;
        return ((s - r + 12) % 12) === 11;
    } catch (e) { return false; }
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
    if (/bb/.test(note)) return -2;
    if (/x|##/.test(note)) return 2;
    if (note.includes('b')) return -1;
    if (note.includes('#')) return 1;
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
    const altInline = alterations.length ? alterations.map((a) => `(${a})`).join('') : '';
    let suffix = '';
    let alterationsEmbedded = false;

    const augmented = quality === 'augmented' || alterations.includes('#5');
    if (augmented) suffix += '+';

    if (!suspended) {
        if (quality === 'diminished') {
            suffix += (chord.type >= 7 && !fullyDiminished) ? 'ø' : '°';
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
        } else if (altInline) {
            suffix += `6${altInline}4`;
            alterationsEmbedded = true;
        } else {
            suffix += '64';
        }
    } else if (chord.inversion === 3) {
        suffix += '42';
    }

    const susStr = suspended ? chord.suspensions.map((s) => `sus${s}`).join('') : '';
    if (suspended) {
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

    if (Array.isArray(chord.adds) && chord.adds.length) {
        const addBody = chord.adds.map((v) => {
            const n = (v <= 6 && chord.type >= 7) ? v + 7 : v;
            return `add${n}`;
        }).join('');
        suffix += `(${addBody})`;
    }

    if (Array.isArray(chord.omits) && chord.omits.length && !opts.omitsPlaced) {
        suffix += chord.omits.map((v) => `(no${v})`).join('');
    }

    if (alterations.length && !alterationsEmbedded) {
        suffix += `(${alterations.join('')})`;
    }

    return suffix;
}

// Builds a single numeral (no applied "/"), given the chord's degree and the quality array
// to read its quality from. `prefix` is any accidental prefix for borrowed roots.
function buildNumeral(degree, qualities, chord, prefix, opts = {}) {
    const quality = (degree >= 1 && degree <= 7) ? qualities[degree - 1] : 'major';
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
        const majorSeventh = chord.type >= 7 && isMajorSeventh(chord.applied, numeratorKey);
        const numerator = buildNumeral(chord.applied, MAJOR_SCALE_CHORD_QUALITIES, chord, '', { fullyDiminished: fullyDim, majorSeventh, applied: true });
        const targetRomans = getRomanNumeralsForScale(key.scale);
        const denominator = targetRomans[chord.root - 1] || '';
        return `${numerator}/${denominator}`;
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
        const quality = customArrayTriadQuality(borrowed, chord.root);
        prefix = customArrayPrefix(borrowed, chord.root);
        const majorSeventh = chord.type >= 7 && quality !== 'diminished' && customArraySeventhMajor(borrowed, chord.root);
        let roman = ROMAN_MAP[chord.root] || '';
        if (quality === 'minor' || quality === 'diminished') roman = roman.toLowerCase();
        const hasAdds = Array.isArray(chord.adds) && chord.adds.length > 0;
        const suffixOpts = { majorSeventh };
        if (hasAdds) suffixOpts.borrowedTag = tag;
        return prefix + roman + buildSuffix(chord, quality, suffixOpts) + (hasAdds ? '' : tag);
    }

    const qualities = getChordQualitiesForScale(scale);
    const quality = (chord.root >= 1 && chord.root <= 7) ? qualities[chord.root - 1] : 'major';
    const majorSeventh = chord.type >= 7 && quality !== 'diminished' && isMajorSeventh(chord.root, { tonic: key.tonic, scale });
    const hasAdds = Array.isArray(chord.adds) && chord.adds.length > 0;
    const suffixOpts = { majorSeventh };
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
    if (chord.applied && chord.applied >= 1 && chord.applied <= 7) {
        const targetTonic = getNoteLabel(chord.root, key);
        effKey = { tonic: targetTonic, scale: 'major' };
        degree = chord.applied;
        quality = MAJOR_SCALE_CHORD_QUALITIES[degree - 1];
    } else {
        let scale = key.scale;
        if (typeof chord.borrowed === 'string' && chord.borrowed && SUPPORTED_BORROWED.has(chord.borrowed)) scale = chord.borrowed;
        effKey = { tonic: key.tonic, scale };
        degree = chord.root;
        quality = getChordQualitiesForScale(scale)[degree - 1];
    }

    const rootNoteName = getNoteLabel(degree, effKey);
    const majorSeventh = chord.type >= 7 && quality !== 'diminished' && quality !== 'augmented' && isMajorSeventh(degree, effKey);
    const augmented = quality === 'augmented' || (Array.isArray(chord.alterations) && chord.alterations.includes('#5'));

    let suffix = "";
    if (quality === "minor") suffix += "m";
    else if (quality === "diminished") suffix += "°";
    else if (augmented) suffix += "+";
    if (chord.type >= 7) suffix += (majorSeventh ? 'maj' : '') + String(chord.type);
    if (Array.isArray(chord.suspensions) && chord.suspensions.length) {
        suffix += chord.suspensions.map((s) => `sus${s}`).join('');
    }

    // Inversion bass note: nth chord tone read within the effective key.
    let bassOffset = null;
    if (chord.inversion === 1) bassOffset = 2;        // third
    else if (chord.inversion === 2) bassOffset = 4;   // fifth
    else if (chord.inversion === 3 && chord.type >= 7) bassOffset = 6; // seventh
    if (bassOffset != null) {
        const bassDegree = ((degree - 1 + bassOffset) % 7) + 1;
        const bassNoteName = getNoteLabel(bassDegree, effKey);
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

