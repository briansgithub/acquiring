/**
 * Verify transition grouping + roman HTML rendering for transition table.
 */
import { romanNumeralToHtml } from '../web-player/lib/romanNumeralCanvas.js';

function groupTransitions(counts) {
  const byCount = new Map();
  for (const [transition, count] of counts.entries()) {
    if (!byCount.has(count)) byCount.set(count, []);
    byCount.get(count).push(transition);
  }
  return Array.from(byCount.keys()).sort((a, b) => b - a).map((count) => ({
    count,
    transitions: byCount.get(count).sort(),
  }));
}

function findLongestRepeatedPhrases(sequence) {
  const result = new Map();
  if (!Array.isArray(sequence) || sequence.length < 2) return result;

  let selectedLength = 0;
  for (let phraseLength = sequence.length - 1; phraseLength >= 2; phraseLength--) {
    if (hasAnyRepeatedPhrase(sequence, phraseLength)) {
      selectedLength = phraseLength;
      break;
    }
  }
  if (selectedLength === 0) selectedLength = sequence.length;

  let start = 0;
  while (start < sequence.length) {
    const remaining = sequence.length - start;
    const phraseLength = Math.min(selectedLength, remaining);
    const phrase = sequence.slice(start, start + phraseLength).join(" → ");
    result.set(phrase, (result.get(phrase) || 0) + 1);
    start += phraseLength;
  }

  return result;
}

function hasAnyRepeatedPhrase(sequence, phraseLength) {
  const startsByPhrase = new Map();
  const end = sequence.length - phraseLength;
  for (let start = 0; start <= end; start++) {
    const phrase = sequence.slice(start, start + phraseLength).join(" → ");
    if (!startsByPhrase.has(phrase)) startsByPhrase.set(phrase, []);
    startsByPhrase.get(phrase).push(start);
  }
  for (const starts of startsByPhrase.values()) {
    let count = 0;
    let lastEnd = -1;
    for (const phraseStart of starts) {
      if (phraseStart >= lastEnd) {
        count += 1;
        lastEnd = phraseStart + phraseLength;
      }
    }
    if (count >= 2) return true;
  }
  return false;
}

function findAllSubstringsWithStarts(sequence, beats) {
  const counts = new Map();
  const starts = new Map();
  if (!Array.isArray(sequence) || sequence.length < 1 || !Array.isArray(beats)) {
    return { counts, starts };
  }

  for (let phraseLength = sequence.length; phraseLength >= 1; phraseLength--) {
    const end = sequence.length - phraseLength;
    for (let start = 0; start <= end; start++) {
      const phrase = sequence.slice(start, start + phraseLength).join(" → ");
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
      if (!starts.has(phrase)) starts.set(phrase, beats[start] ?? 1);
    }
  }

  return { counts, starts };
}

const counts = new Map([
  ['IV → V', 5],
  ['I → vi', 5],
  ['Vsus2sus47/V → iii7', 3],
  ['ii7 → V64', 1],
]);

const groups = groupTransitions(counts);
if (groups[0].count !== 5 || groups[0].transitions.length !== 2) {
  throw new Error(`expected first group ×5 with 2 items got ${JSON.stringify(groups[0])}`);
}
if (groups[1].count !== 3) throw new Error('expected ×3 group second');

const html = romanNumeralToHtml('Vsus2sus47');
if (!html.includes('roman-stack') || !html.includes('roman-figured-digit') || !html.includes('sus2sus4')) {
  throw new Error(`expected stacked sus html got ${html}`);
}

const longest = findLongestRepeatedPhrases(["I", "vi", "IV", "V", "I", "vi", "IV", "V", "I"]);
if (longest.size !== 2 || longest.get("I → vi → IV → V") !== 2 || longest.get("I") !== 1) {
  throw new Error(`expected non-overlapping maximal phrases with uniques got ${JSON.stringify(Array.from(longest.entries()))}`);
}

const tied = findLongestRepeatedPhrases(["I", "ii", "I", "ii", "V", "vi", "V", "vi"]);
const tiedGroups = groupTransitions(tied);
if (tiedGroups.length !== 1 || tiedGroups[0].count !== 2 || tiedGroups[0].transitions.length !== 2) {
  throw new Error(`expected longest repeated pairs plus unique suffix got ${JSON.stringify(tiedGroups)}`);
}

const noRepeat = findLongestRepeatedPhrases(["I", "ii", "iii", "IV"]);
if (noRepeat.size !== 1 || noRepeat.get("I → ii → iii → IV") !== 1) {
  throw new Error(`expected full unique sequence when no repeats got ${JSON.stringify(Array.from(noRepeat.entries()))}`);
}

const allSubstrings = findAllSubstringsWithStarts(
  ["I", "ii", "I"],
  [1, 3, 5]
);
if (allSubstrings.counts.get("I") !== 2 || allSubstrings.counts.get("I → ii") !== 1 || allSubstrings.counts.get("I → ii → I") !== 1) {
  throw new Error(`expected overlapping substring counts got ${JSON.stringify(Array.from(allSubstrings.counts.entries()))}`);
}
if (allSubstrings.starts.get("I") !== 1 || allSubstrings.starts.get("ii") !== 3 || allSubstrings.starts.get("I → ii → I") !== 1) {
  throw new Error(`expected earliest first starts got ${JSON.stringify(Array.from(allSubstrings.starts.entries()))}`);
}

const allSubGroups = groupTransitions(allSubstrings.counts);
if (allSubGroups[0].count !== 2 || !allSubGroups[0].transitions.includes("I")) {
  throw new Error(`expected grouped substring counts got ${JSON.stringify(allSubGroups)}`);
}

console.log('OK', { groups, html, longest, tiedGroups, noRepeat, allSubstrings: allSubstrings.counts, allSubGroups });
