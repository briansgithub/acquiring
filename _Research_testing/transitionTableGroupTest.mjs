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
if (!html.includes('roman-stack') || !html.includes('<sup>7</sup>')) {
  throw new Error(`expected stacked sus html got ${html}`);
}

console.log('OK', { groups, html });
