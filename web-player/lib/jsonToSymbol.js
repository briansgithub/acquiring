import { 
  MAJOR_SCALE_CHORD_QUALITIES, 
  MINOR_SCALE_CHORD_QUALITIES,
  DORIAN_SCALE_CHORD_QUALITIES,
  PHRYGIAN_SCALE_CHORD_QUALITIES,
  LYDIAN_SCALE_CHORD_QUALITIES,
  MIXOLYDIAN_SCALE_CHORD_QUALITIES,
  LOCRIAN_SCALE_CHORD_QUALITIES,
  ROMAN_NUMERALS_MAJOR, 
  ROMAN_NUMERALS_MINOR,
  ROMAN_NUMERALS_DORIAN,
  ROMAN_NUMERALS_PHRYGIAN,
  ROMAN_NUMERALS_LYDIAN,
  ROMAN_NUMERALS_MIXOLYDIAN,
  ROMAN_NUMERALS_LOCRIAN
} from "./scales.js";

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
    } else {
        return ROMAN_NUMERALS_MAJOR; // Default to major
    }
}

/**
 * Converts a chord object to its Roman Numeral representation.
 * @param {Object} chord - The chord object from the JSON data.
 * @param {Object} key - The key object { tonic, scale }.
 * @returns {string} The Roman Numeral symbol (e.g., "ii", "V7/IV", "V/vii°", "bVI").
 */
export function getChordSymbol(chord, key) {
    if (!chord || !chord.root) return "";

    const root = chord.root;
    let scale = key.scale;

    // Handle Borrowed Chords (simple mode mixture)
    if (chord.borrowed) {
        // If borrowed is an array (custom scale), we'll add a prefix later
        // For standard mode borrowing, adjust scale for chord quality calculation
        if (typeof chord.borrowed === 'string') {
            // Use the borrowed scale's qualities
            scale = chord.borrowed;
        }
    }

    // Get chord qualities based on the scale
    const qualities = getChordQualitiesForScale(scale);

    // Safety check for root being 1-7
    const quality = (root >= 1 && root <= 7) ? qualities[root - 1] : "major";

    const romanMap = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII' };
    let baseRoman = romanMap[root] || "";

    if (quality === "minor" || quality === "diminished") {
        baseRoman = baseRoman.toLowerCase();
    }

    let suffix = "";

    // Inversions
    if (chord.inversion === 1) suffix += (chord.type === 7) ? "⁶⁵" : "⁶";
    if (chord.inversion === 2) suffix += (chord.type === 7) ? "⁴³" : "⁶₄";
    if (chord.inversion === 3) suffix += "⁴²"; // Only applies to 7th chords

    // Diminished symbol
    if (quality === "diminished") {
        suffix += "°";
    }

    // Type handling (add 7, etc)
    if (chord.type === 7) {
        suffix = suffix.replace("°", "ø"); // Half-diminished logic if applicable, but simplistic for now
        
        // Standard figured bass for 7th chord inversions implies the 7th.
        // Root pos: 7 -> "⁷"
        // 1st inv: 6/5 -> "⁶⁵" (7th implied, don't add "⁷")
        // 2nd inv: 4/3 -> "⁴³" (7th implied, don't add "⁷")
        // 3rd inv: 4/2 -> "⁴²" (7th implied, don't add "⁷")
        // So if an inversion suffix was added, we DON'T add "7" again.
        const hasInversionSuffix = (suffix.includes("⁶") || suffix.includes("⁴") || suffix.includes("⁵") || suffix.includes("³") || suffix.includes("²"));
        if (!hasInversionSuffix && !suffix.includes("⁷")) {
            suffix += "⁷";
        }
    }

    // Prefix for borrowed roots in Major (e.g. bIII, bVI, bVII)
    // Only add flat for standard mode borrowing where root is actually lowered
    // Custom borrowed scales will use the same symbol but appear as separate nodes with "(borrowed)" label
    let prefix = "";
    if (chord.borrowed && typeof chord.borrowed === 'string') {
        if (key.scale === 'major' && chord.borrowed === 'minor') {
            // Standard mode borrowing - only add flat for roots that are lowered (3, 6, 7)
            if ([3, 6, 7].includes(root)) {
                prefix = "♭";
            }
        }
    }

    const baseSymbol = prefix + baseRoman + suffix;

    // Handle Applied Chords (Secondary Dominants)
    // If applied is set and not 0, this is a secondary dominant
    if (chord.applied && chord.applied !== 0 && chord.applied >= 1 && chord.applied <= 7) {
        const appliedDegree = chord.applied;
        // Get the roman numeral for the target degree based on the key's scale
        const targetRomans = getRomanNumeralsForScale(key.scale);
        const targetRoman = targetRomans[appliedDegree - 1] || "";
        
        // Format: <chordSymbol>/<targetRoman>
        return `${baseSymbol}/${targetRoman}`;
    }

    return baseSymbol;
}

