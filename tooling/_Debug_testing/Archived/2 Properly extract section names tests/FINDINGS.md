# Section Name Extraction Debug Findings

**Date:** December 11, 2025

## Problem Identified

The section name extraction is working correctly for finding H2 elements, but the **mapping logic** has issues:

### Issue 1: Initial Load Song IDs Not Mapped
- Song IDs that load on initial page load are not being mapped to the first H2 section
- Example: `nvgy-kVrgkA` loads initially but isn't mapped to "Intro"

### Issue 2: Full Page Scroll Song IDs Not Mapped
- Song IDs that load during full page scroll (but not when scrolling to specific H2) are not mapped
- Example: `RPxenBQAob_` loads during full scroll but isn't mapped to "Bridge"

### Issue 3: Section Name Normalization Too Restrictive
- Current `normalizeSectionName()` only handles: Intro, Verse, Chorus, Bridge, Outro
- But sections can have any name (e.g., "Pre-Chorus", "Pre-chorus", etc.)
- Should use actual H2 text, not normalize to fixed set

## Test Results

### Test 1: maple-leaf-rag
- ✅ Found 4 H2 sections: Intro, Chorus, Bridge, Outro
- ✅ Captured 4 song IDs: nvgy-kVrgkA, ZbgOR-qQmnY, yvgPqBwKxYq, RPxenBQAob_
- ⚠ Only 2 sections triggered new song IDs (Chorus, Outro)
- ⚠ Intro and Bridge song IDs loaded at different times (initial load and full scroll)

### Test 2: 500-miles
- ✅ Found 2 H2 sections: Verse, Chorus
- ✅ Captured 2 song IDs
- ⚠ Only 1 section triggered new song ID (Chorus)

### Test 3: let-it-be
- ✅ Found 3 H2 sections: Verse, Chorus, Bridge
- ✅ Captured 3 song IDs
- ✅ 2 sections triggered new song IDs (Chorus, Bridge)

### Test 4: we-are-young
- ✅ Found 3 H2 sections: Verse, Pre-Chorus, Chorus
- ✅ Captured 3 song IDs
- ✅ 2 sections triggered new song IDs (Pre-Chorus, Chorus)
- ✅ Handled "Pre-Chorus" correctly (not in fixed normalization list)

## Root Cause

The mapping logic in `findAllSongIdsFromPage()` only maps song IDs that are **triggered when scrolling to specific H2 sections**. It doesn't properly handle:

1. **Initial load song IDs** → Should map to first H2 section(s) in order
2. **Full scroll song IDs** → Should map to remaining H2 sections in order
3. **Arbitrary section names** → Should use actual H2 text, not normalize

## Solution

1. **Track song ID loading order** - Know when each song ID loads
2. **Map in order** - Initial IDs → first sections, scroll IDs → remaining sections
3. **Use actual H2 text** - Don't normalize to fixed set, use the actual section name from H2
4. **Handle all cases** - Ensure every song ID gets mapped to an H2 section

## Implementation Notes

- H2 elements are correctly identified
- All song IDs are being captured
- The issue is purely in the mapping logic
- Need to preserve actual H2 section names (case-sensitive, with hyphens, etc.)

