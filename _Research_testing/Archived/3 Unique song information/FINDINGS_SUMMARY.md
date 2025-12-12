# Unique Song Identifier Investigation - Findings Summary

**Test URL:** https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag  
**Test Date:** December 11, 2025

---

## Questions Investigated

1. **Is a song ID ever identified from the loaded URL webpage?**
2. **Is there unique identifier information unique to the song (ID number, song title, artist, etc.)?**

---

## Key Findings

### 1. Song IDs in Page Source

✅ **YES** - All section song IDs are present in the page HTML source:
- `nvgy-kVrgkA`
- `ZbgOR-qQmnY`
- `yvgPqBwKxYq`
- `RPxenBQAob_`

These IDs are embedded in the page HTML, likely in data attributes or JavaScript variables that trigger lazy loading.

### 2. Unique Song-Level Identifiers

#### From URL Structure:
- **Artist:** `scott-joplin` (extracted from URL path)
- **Song Title (slug):** `maple-leaf-rag` (extracted from URL path)

#### From API Responses:
✅ **Song Title:** `"Maple Leaf Rag"` - **CONSISTENT across ALL section API responses**

This is the **only field that is identical across all section API responses**, making it a reliable song-level identifier.

#### From Page Metadata:
- **Page Title:** "Maple Leaf Rag by Scott Joplin Chords, Melody, and Music Theory Analysis - Hooktheory"
- **Meta Description:** "Chords, melody, and music theory analysis of Maple Leaf Rag by Scott Joplin."

### 3. Section-Specific Identifiers

Each section has:
- **String Song ID** (e.g., `nvgy-kVrgkA`) - unique per section
- **Numeric ID** (e.g., `785200`) - unique per section
- **jsonData** - unique chord/melody data per section

**Important:** The numeric `ID` field in API responses is **NOT** a song-level identifier - it's section-specific:
- Section 1: `785200`
- Section 2: `749422`
- Section 3: `785201`
- Section 4: `766313`

### 4. What is NOT Available

❌ **No single song-level ID number** - Each section has its own unique ID
❌ **No artist field in API responses** - Artist must be extracted from URL
❌ **No main song ID** that links all sections together in the API

---

## Summary

### Answer to Question 1:
**YES** - Song IDs (section IDs) are present in the page source HTML. They can be found by parsing the page content.

### Answer to Question 2:
**PARTIALLY** - There is unique song-level information, but it's distributed:

1. **Song Title:** Available from any API response's `song` field (consistent across all sections)
2. **Artist:** Must be extracted from the URL path (`/theorytab/view/artist/song`)
3. **Song Slug:** Available from URL path
4. **No single song ID:** There is no single numeric or string ID that identifies the song itself - only section-specific IDs

### Recommended Approach:

To uniquely identify a song, use a combination of:
- **Artist** (from URL): `scott-joplin`
- **Song Title** (from API): `"Maple Leaf Rag"`
- **URL Path:** `/theorytab/view/scott-joplin/maple-leaf-rag`

This combination uniquely identifies the song, even though there's no single "song ID" field in the API responses.

---

## Data Structure

### API Response Structure:
```json
{
  "ID": 785200,              // Section-specific numeric ID
  "song": "Maple Leaf Rag",  // Song title (SAME across all sections)
  "xmlData": null,
  "jsonData": "..."          // Section-specific chord/melody data
}
```

### Common Fields (Song-Level):
- `song`: "Maple Leaf Rag" ✅ (consistent)
- `xmlData`: null ✅ (consistent)

### Unique Fields (Section-Level):
- `ID`: Different numeric ID per section
- `jsonData`: Different chord/melody data per section

---

**Report Generated:** December 11, 2025  
**Test Script:** `investigate_song_identifiers.js`  
**Results File:** `song_identifier_analysis.json`

