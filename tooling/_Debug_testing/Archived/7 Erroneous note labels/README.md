# Erroneous Note Labels Test

This test script validates the `getNoteLabel` and `getAbsoluteOctave` functions by testing them against real song data.

## Purpose

Tests note label generation and octave calculation using:
- Lady Gaga - Bad Romance (Verse) - A minor key
- Scott Joplin - Maple Leaf Rag (Intro) - Ab major key

## Usage

```bash
npm test
```

## What it tests

1. **Note Label Generation**: Verifies that scale degrees are correctly converted to note names (e.g., "1" → "A", "7" → "G#")
2. **Octave Calculation**: Checks that relative octave values are correctly converted to absolute octaves (base octave 4 + relative octave)
3. **Edge Cases**: Identifies notes with unusual octave values or potential calculation errors

## Output

The script displays:
- First 20 notes with detailed breakdown (SD, relative octave, absolute octave, semitone, label, full note name)
- Octave distribution statistics
- Potential issues (notes outside typical octave range 2-7)
- Scale degree patterns showing how different relative octaves map to absolute octaves
