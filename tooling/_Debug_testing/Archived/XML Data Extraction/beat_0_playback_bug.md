# Beat 0 Playback Bug - XML Data Extraction

## Summary

Chords and notes extracted from XML format can start at `beat: 0` (0-based indexing), causing playback issues in the visualizer. JSON format sections use 1-based indexing (`beat: 1`), creating an inconsistency that breaks first-chord playback.

## Root Cause

The XML parser extracts `start_beat_abs` values directly from XML, which uses 0-based indexing. When `start_beat_abs = 0`, the extracted chord/note has `beat: 0`, which causes:

1. **Negative tick calculation**: `startTick = (0 - 1) * 192 = -192`
2. **Tone.js scheduling failure**: Tone.js doesn't schedule events at negative ticks
3. **First chord doesn't play**: Block chords fail to play entirely
4. **Indicator doesn't update**: Chord indicator doesn't appear until the second chord

## Evidence

### XML-Extracted Section (Solo)
```json
{
  "chords": [
    {
      "root": 1,
      "beat": 0,  // ❌ 0-based indexing from XML
      "duration": 4,
      ...
    }
  ]
}
```

### JSON-Extracted Section (Verse, Intro)
```json
{
  "chords": [
    {
      "root": 1,
      "beat": 1,  // ✅ 1-based indexing
      "duration": 8,
      ...
    }
  ]
}
```

## Affected Code

### XML Parser (`lib/extractor/xmlParser.js`)
- Line 151-153: Extracts `start_beat_abs` directly without normalization
- Line 202-204: Same issue for notes

### Player (`web-player/player.js`)
- Line 479: `const startTick = (note.beat - 1) * 192;` - fails when `beat = 0`
- Line 508: `const startTick = (chord.beat - 1) * 192;` - fails when `beat = 0`
- Line 628: `findCurrentChordAtTick` comparison fails for `beat = 0`

## Symptoms

1. **First chord doesn't play** (non-arpeggiated mode)
   - Chord event scheduled at tick -192 (negative)
   - Tone.js doesn't schedule negative ticks
   - Chord never plays

2. **First chord indicator doesn't appear**
   - Indicator only updates when chord event fires
   - Since event doesn't fire, indicator stays blank
   - Appears when second chord starts

3. **Arpeggiated chords may work differently**
   - Arpeggiated mode has different tick calculation logic
   - May partially work but timing is incorrect

## Fix Applied

### Player-Side Normalization (Temporary Fix)
Added normalization in `web-player/player.js`:
- Line 479: `const normalizedBeat = note.beat === 0 ? 1 : note.beat;`
- Line 508: `const normalizedBeat = chord.beat === 0 ? 1 : chord.beat;`
- Line 634: `const chordStartBeat = chord.beat === 0 ? 1 : chord.beat;`

This treats `beat: 0` as `beat: 1` for tick calculations, allowing playback to work.

### Better Solution (Recommended)

Normalize beats in the XML parser itself to match JSON format conventions:

```javascript
// In convertChordXmlToJson and convertNoteXmlToJson
const beat = chordXml.start_beat_abs !== undefined 
  ? Math.max(1, parseFloat(chordXml.start_beat_abs) + 1)  // Normalize to 1-based
  : parseFloat(chordXml.start_beat || '1');
```

This would:
- Make XML-extracted sections consistent with JSON sections
- Prevent the issue at the source
- Remove the need for player-side normalization
- Ensure all sections use 1-based indexing

## Files Affected

- `lib/extractor/xmlParser.js` - XML parser (root cause)
- `web-player/player.js` - Player normalization (temporary fix)
- `.hooktheory_cache/guns-n-roses - Sweet_Child_O__Mine/Solo - 104651 - ZwxKJE_Zged.json` - Example affected file

## Related Issues

- First chord indicator not appearing (fixed with immediate update on load)
- First chord not playing for non-arpeggiated chords (fixed with beat normalization)

## Testing

To verify the fix:
1. Load Solo section (XML-extracted, starts at beat 0)
2. Verify first chord plays immediately
3. Verify first chord indicator appears on load
4. Compare with Verse section (JSON-extracted, starts at beat 1) - should behave identically

## Date

December 15, 2025

