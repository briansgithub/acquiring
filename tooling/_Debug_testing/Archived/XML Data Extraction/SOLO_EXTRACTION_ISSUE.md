# Solo Section Extraction Issue - Root Cause Analysis

## Problem
The "Solo" section from `https://www.hooktheory.com/theorytab/view/guns-n-roses/sweet-child-o-mine` is not being extracted by `extract_hooktheory_data.js`.

## Root Cause
The Solo section uses **XML format** (`xmlData`) instead of **JSON format** (`jsonData`), but the `extractChordAndMelodyObjects` function in `lib/extractor/dataExtractor.js` only handles JSON data and throws an error when `jsonData` is missing.

### Evidence

1. **Page Scraping Works**: The Solo section IS detected correctly:
   - Song ID: `ZwxKJE_Zged`
   - Section name: `Solo`
   - Found in section mapping

2. **API Fetch Works**: The API call succeeds:
   - HTTP Status: 200 OK
   - Response contains: `ID: 104651`, `song: "Sweet Child O' Mine"`
   - Has `xmlData: true`
   - Has `jsonData: false` (missing!)

3. **Data Extraction Fails**: The extractor throws an error:
   ```javascript
   if (!apiResponse.jsonData) {
     throw new Error('No jsonData in API response');
   }
   ```

4. **Error Handling**: In `extract_hooktheory_data.js`, the error is caught but the section is not saved:
   ```javascript
   } catch (e) {
     console.log(`    ✗ Error: ${e.message}`);
   }
   ```

## Comparison with Other Sections

- **Verse section** (`ZwxKKqYwxed`): Has `jsonData: true`, `xmlData: null` → ✅ Extracts successfully
- **Solo section** (`ZwxKJE_Zged`): Has `xmlData: true`, `jsonData: false` → ❌ Extraction fails

## Solution Options

### Option 1: Add XML Parsing Support (Recommended)
Implement XML parsing to convert `xmlData` to the same structure as `jsonData`. This would require:
- XML parser (e.g., `xml2js` or native DOMParser)
- Conversion logic to transform XML structure to JSON structure
- Testing with XML-only sections

### Option 2: Graceful Skip with Warning
Modify the extractor to skip XML-only sections gracefully and log a clear warning:
```javascript
if (!apiResponse.jsonData) {
  if (apiResponse.xmlData) {
    console.warn(`⚠ Section has XML data but no JSON data. XML parsing not yet implemented. Skipping.`);
    return null; // Signal to skip this section
  }
  throw new Error('No jsonData or xmlData in API response');
}
```

### Option 3: Store XML Data for Future Processing
Save sections with XML data but mark them as "unprocessed":
```javascript
if (!apiResponse.jsonData && apiResponse.xmlData) {
  return {
    songId: apiResponse.ID,
    songInfo: apiResponse.song,
    chords: [],
    notes: null,
    metadata: {
      format: 'xml',
      xmlData: apiResponse.xmlData,
      note: 'XML parsing not yet implemented'
    }
  };
}
```

## Test Results

Run `node _Debug_testing/test_solo_extraction.js` to reproduce the issue.

## Files Involved

- `lib/extractor/dataExtractor.js` - Needs modification to handle XML
- `extract_hooktheory_data.js` - Error handling could be improved
- `lib/api/hooktheoryApi.js` - Already fetches both xmlData and jsonData

