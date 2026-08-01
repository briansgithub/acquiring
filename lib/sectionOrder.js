/**
 * Shared Hooktheory section ordering rules.
 *
 * A corpus audit (34,097 songs / 65,493 section rows) found thirteen recurring
 * structural section types. Exact per-song metadata order always wins. The
 * canonical order below is only used for legacy records that do not carry a
 * section index.
 */

const CANONICAL_SECTION_TYPES = Object.freeze([
  "Intro",
  "Intro and Verse",
  "Verse",
  "Verse and Pre-Chorus",
  "Pre-Chorus",
  "Pre-Chorus and Chorus",
  "Chorus",
  "Chorus Lead-Out",
  "Bridge",
  "Solo",
  "Instrumental",
  "Pre-Outro",
  "Outro",
]);

const UNKNOWN_SECTION_RANK = 100000;

function normalizeSectionType(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2014]/g, "-")
    .replace(/\s+/g, " ");
}

function sectionTypeKey(name) {
  return normalizeSectionType(name)
    .replace(/[-_\s]+/g, " ")
    .trim();
}

function sectionWords(name) {
  return sectionTypeKey(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trailingOrdinal(words) {
  const match = words.match(/\b(\d+)$/);
  return match ? Math.min(Number(match[1]) || 0, 999) : 0;
}

function canonicalSectionRank(name) {
  const words = sectionWords(name);
  const ordinal = trailingOrdinal(words);

  if (!words) return UNKNOWN_SECTION_RANK;
  if (words.includes("intro and verse")) return 1000 + ordinal;
  if (words.includes("verse and pre chorus")) return 3000 + ordinal;
  if (words.includes("pre chorus and chorus")) return 5000 + ordinal;
  if (words.includes("chorus lead out")) return 7000 + ordinal;
  if (words.includes("bridge and outro")) return 11500 + ordinal;
  if (words.includes("pre outro")) return 11000 + ordinal;

  if (/\bintro\b/.test(words)) return 0 + ordinal;
  if (/\bverse\b/.test(words)) return 2000 + ordinal;
  if (/\bpre chorus\b/.test(words)) return 4000 + ordinal;
  if (/\bchorus\b/.test(words)) return 6000 + ordinal;
  if (/\bbridge\b/.test(words)) return 8000 + ordinal;
  if (/\bsolo\b/.test(words)) return 9000 + ordinal;
  if (/\binstrumental\b/.test(words)) return 10000 + ordinal;
  if (/\boutro\b/.test(words)) return 12000 + ordinal;

  return UNKNOWN_SECTION_RANK;
}

function explicitSectionIndex(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

/**
 * Return one entry per normalized section type in song order.
 *
 * Indexed sections use their exact per-song order. If no indices exist, the
 * corpus-derived structural order is used, with unknown/custom labels kept in
 * their original relative order at the end.
 */
function orderUniqueSections(sections, options = {}) {
  if (!Array.isArray(sections)) return [];

  const getName = options.getName || ((section) => section?.sectionName ?? section?.name);
  const getIndex = options.getIndex || ((section) => section?.sectionIndex ?? section?.index);
  const byType = new Map();

  sections.forEach((section, sourcePosition) => {
    const name = getName(section);
    const normalized = sectionTypeKey(name);
    const typeKey = normalized || `\u0000${sourcePosition}`;
    const candidate = {
      section,
      sourcePosition,
      explicitIndex: explicitSectionIndex(getIndex(section)),
      canonicalRank: canonicalSectionRank(name),
    };
    const current = byType.get(typeKey);

    if (
      !current
      || (candidate.explicitIndex !== null
        && (current.explicitIndex === null || candidate.explicitIndex < current.explicitIndex))
    ) {
      byType.set(typeKey, candidate);
    }
  });

  const unique = [...byType.values()];
  const hasExplicitOrder = unique.some((candidate) => candidate.explicitIndex !== null);

  unique.sort((a, b) => {
    if (hasExplicitOrder) {
      if (a.explicitIndex !== null && b.explicitIndex !== null) {
        const indexed = a.explicitIndex - b.explicitIndex;
        if (indexed) return indexed;
      } else if (a.explicitIndex !== null) {
        return -1;
      } else if (b.explicitIndex !== null) {
        return 1;
      }
    }

    const canonical = a.canonicalRank - b.canonicalRank;
    return canonical || (a.sourcePosition - b.sourcePosition);
  });

  return unique.map((candidate) => candidate.section);
}

module.exports = {
  CANONICAL_SECTION_TYPES,
  UNKNOWN_SECTION_RANK,
  normalizeSectionType,
  sectionTypeKey,
  canonicalSectionRank,
  orderUniqueSections,
};
