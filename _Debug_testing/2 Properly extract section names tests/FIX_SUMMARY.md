# Section Name Extraction Fix Summary

**Date:** December 11, 2025

## Issues Fixed

### 1. Section Name Normalization Too Restrictive
**Problem:** `normalizeSectionName()` only handled fixed set: Intro, Verse, Chorus, Bridge, Outro  
**Fix:** Use actual H2 text as section name (preserves "Pre-Chorus", case, hyphens, etc.)

### 2. Initial Load Song IDs Not Mapped
**Problem:** Song IDs that load on initial page load weren't mapped to first H2 sections  
**Fix:** Map unmapped song IDs to H2 sections in order (initial IDs → first sections)

### 3. Full Scroll Song IDs Not Mapped
**Problem:** Song IDs that load during full page scroll weren't mapped  
**Fix:** Added full page scroll step, then map remaining IDs to remaining sections

### 4. H2 Element Filtering Too Restrictive
**Problem:** Only found H2s matching fixed section name list  
**Fix:** Find all H2s that look like section titles (filter out page headings)

## Changes Made

1. **Replaced `normalizeSectionName()` with `extractSectionNameFromH2()`**
   - Uses actual H2 text instead of normalizing to fixed set
   - Preserves original section names (case, hyphens, etc.)

2. **Added `isSectionH2()` helper**
   - Identifies section H2s vs page headings
   - Filters based on length and content, not fixed names

3. **Updated H2 finding logic**
   - Finds all visible H2s that look like section titles
   - No longer limited to fixed section name list

4. **Added full page scroll**
   - Ensures all sections are loaded
   - Catches song IDs that load during scroll

5. **Improved mapping logic**
   - Maps song IDs triggered by H2 sections first
   - Maps remaining IDs to remaining H2 sections in order
   - Never uses "Unknown" - always maps to actual H2 section name

## Test Results

### ✅ maple-leaf-rag
- Found 4 H2 sections: Intro, Chorus, Bridge, Outro
- Captured 4 song IDs
- **All correctly mapped:**
  - nvgy-kVrgkA → Intro
  - ZbgOR-qQmnY → Chorus
  - RPxenBQAob_ → Bridge
  - yvgPqBwKxYq → Outro

### ✅ we-are-young
- Found 3 H2 sections: Verse, Pre-Chorus, Chorus
- Captured 3 song IDs
- **All correctly mapped:**
  - nLgalZE_mYp → Verse
  - veoYrYykmdn → Pre-Chorus
  - KexEjKRKo_B → Chorus
- ✅ "Pre-Chorus" handled correctly (not in fixed normalization list)

## Key Improvements

1. **Arbitrary section names supported** - Any H2 text can be a section name
2. **All song IDs mapped** - No unmapped IDs, no "Unknown" sections
3. **Proper order mapping** - Initial IDs map to first sections, scroll IDs to remaining
4. **Full page coverage** - Full scroll ensures all sections are loaded

## Implementation Status

✅ **Complete** - All issues resolved, script working correctly for all test URLs

