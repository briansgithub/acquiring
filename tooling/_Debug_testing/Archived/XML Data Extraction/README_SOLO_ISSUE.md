# Solo Section Extraction Issue - Debug Summary

## Quick Summary

The Solo section from Guns N' Roses - Sweet Child O' Mine is **detected correctly** but **not extracted** because:

1. ✅ **Page scraping works** - Solo section is found with ID `ZwxKJE_Zged`
2. ✅ **API fetch works** - API returns data successfully  
3. ❌ **Data extraction fails** - Solo section uses XML format (`xmlData`) instead of JSON format (`jsonData`)
4. ❌ **Extractor only supports JSON** - `lib/extractor/dataExtractor.js` throws error when `jsonData` is missing

## Root Cause

The `extractChordAndMelodyObjects` function in `lib/extractor/dataExtractor.js` line 7-9:

```javascript
if (!apiResponse.jsonData) {
  throw new Error('No jsonData in API response');
}
```

This causes the extraction to fail for sections that only have XML data.

## Evidence

- **Solo section** (`ZwxKJE_Zged`): `hasXmlData: true`, `hasJsonData: false` → ❌ Fails
- **Verse section** (`ZwxKKqYwxed`): `hasXmlData: false`, `hasJsonData: true` → ✅ Works

## Test Script

Run the debug test to reproduce:

```bash
node _Debug_testing/test_solo_extraction.js
```

## Solution

See `SOLO_EXTRACTION_ISSUE.md` for detailed solution options:
1. Add XML parsing support (recommended)
2. Graceful skip with warning
3. Store XML data for future processing

## Files

- `test_solo_extraction.js` - Debug test script
- `SOLO_EXTRACTION_ISSUE.md` - Detailed analysis and solutions
- `README_SOLO_ISSUE.md` - This summary

