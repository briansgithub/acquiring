# Section Name Identification - Findings Summary

**Test URL:** https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag  
**Test Date:** December 11, 2025

---

## Key Findings

### H2 Elements Structure

The page contains exactly **4 H2 elements** with section names:
1. **Intro** (y: 361.64)
2. **Chorus** (y: 1332.11)
3. **Bridge** (y: 1761.25)
4. **Outro** (y: 2190.39)

All H2 elements have the format: `<h2 class="margin-0">SectionName</h2>`

### Song ID Loading Pattern

1. **Initial Page Load:**
   - `nvgy-kVrgkA` loads automatically (likely for Intro section)

2. **When Scrolling to Chorus:**
   - `ZbgOR-qQmnY` loads

3. **When Scrolling to Bridge:**
   - `RPxenBQAob_` loads (may require proper scrolling/waiting)

4. **When Scrolling to Outro:**
   - `yvgPqBwKxYq` loads

### Mapping Strategy

**Correct Approach:**
1. Find all H2 elements with section names (Intro, Verse, Chorus, Bridge, Outro)
2. Track song IDs that load on initial page load
3. Scroll to each H2 section in order and track which new song IDs load
4. Map song IDs to sections:
   - If a section triggers new song IDs when scrolled to → map those IDs to that section
   - If a section doesn't trigger new IDs → assign from initial/remaining unmapped IDs in order
5. **Never use "Unknown"** - always map to an H2 section name

### Implementation Notes

- H2 elements are the authoritative source for section names
- Once all H2 sections have been scrolled into view, all song IDs should be captured
- The order of H2 sections on the page determines the order of sections
- Some sections may load multiple song IDs (e.g., Intro might have 2 parts)

### Expected Mapping for Test Song

Based on previous tests and H2 order:
- `nvgy-kVrgkA` → **Intro** (loads on initial page load)
- `ZbgOR-qQmnY` → **Chorus** (loads when scrolling to Chorus)
- `RPxenBQAob_` → **Bridge** (loads when scrolling to Bridge)
- `yvgPqBwKxYq` → **Outro** (loads when scrolling to Outro)

---

**Report Generated:** December 11, 2025  
**Test Scripts:** `investigate_section_names.js`, `investigate_section_names_v2.js`

