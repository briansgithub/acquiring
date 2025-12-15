import { MAJOR_SCALE_CHORD_QUALITIES, MINOR_SCALE_CHORD_QUALITIES } from "./scales.js";

/**
 * Converts a chord object to its Roman Numeral representation.
 * @param {Object} chord - The chord object from the JSON data.
 * @param {Object} key - The key object { tonic, scale }.
 * @returns {string} The Roman Numeral symbol (e.g., "ii", "V7/IV", "bVI").
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
            // If we are in Major and borrow from Minor, use Minor scale qualities
            if (scale === 'major' && chord.borrowed === 'minor') scale = 'minor';
            // If we are in Minor and borrow from Major (Picardy 3rd etc), use Major
            else if (scale === 'minor' && chord.borrowed === 'major') scale = 'major';
        }
    }

    let qualities = (scale === 'minor') ? MINOR_SCALE_CHORD_QUALITIES : MAJOR_SCALE_CHORD_QUALITIES;

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
    if (chord.inversion === 3) suffix += "⁴²";

    // Diminished symbol
    if (quality === "diminished") {
        suffix += "°";
    } else if (chord.type === 7 && quality === "major" && root === 5) {
        // V7 is dominant, no suffix needed usually for triad part, just 7
    }

    // Type handling (add 7, etc)
    if (chord.type === 7) {
        suffix = suffix.replace("°", "ø"); // Half-diminished logic if applicable, but simplistic for now
        if (quality !== 'diminished') suffix += "⁷"; // Avoid redundant logic if I implement full mapping later
        // Actually standard notation:
        // V7 -> V7
        // ii7 -> ii7 (min7)
        // vii°7 -> full dim? viiø7 -> half dim?
        // Hooktheory type 7 usually means Dominant 7th shape if applied to major?
        // Or just "The 7th chord of this degree".
        if (!suffix.includes("⁶") && !suffix.includes("⁴")) suffix += "⁷"; // Only add 7 if not inverted figures? No, V6/5 has 7th.

        // CORRECTION: Standard figured bass for 7th chord inversions implies the 7th.
        // Root pos: 7 -> "⁷" (or just 7)
        // 1st inv: 6/5 -> "⁶⁵"
        // 2nd inv: 4/3 -> "⁴³"
        // 3rd inv: 4/2 (or 2) -> "⁴²"
        // So if an inversion suffix was added, we DON'T add "7" again.

        // Clean up: existing logic `if (!suffix.includes("6") && ...)` was for ASCII numbers.
        // Update for unicode.
        const hasInversionSuffix = (suffix.includes("⁶") || suffix.includes("⁴") || suffix.includes("⁵") || suffix.includes("³") || suffix.includes("²"));
        if (!hasInversionSuffix && !suffix.includes("⁷")) {
            suffix += "⁷";
        }

        // Clean up overlaps.
        // E.g. inversion 1 of 7th chord is "65", we don't add "7".
        // With code above: 
        // Inv 1 -> suffix="⁶⁵". hasInversionSuffix=true. "⁷" NOT added. Correct.
    }

    // Clean up overlaps.
    // E.g. inversion 1 of 7th chord is "65", we don't add "7".

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

    return prefix + baseRoman + suffix;
}

