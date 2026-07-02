/**
 * Generate temporary pronunciation audit document (~300+ chords).
 * Usage: node _Research_testing/generatePronunciationAudit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const OUT = path.join(REPO, '_Research_testing', 'pronunciationAudit.md');

const CORPUS_DIRS = [
  'chord_db', 'chord_db_corpus2', 'chord_db_corpus3', 'chord_db_corpus4',
].map((d) => path.join(REPO, '_Decode_oracle', d, 'byModification'));

const { getChordSymbol } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'jsonToSymbol.js')).href
);
const { getChordPronunciation, UNKNOWN } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralSpeak.js')).href
);

function loadEntries() {
  const byId = new Map();
  for (const dir of CORPUS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const bucket = file.replace('.json', '');
      const rows = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const row of rows) {
        if (!row?.id || !row.chord?.root || row.chord.isRest) continue;
        if (!byId.has(row.id)) byId.set(row.id, { ...row, bucket });
      }
    }
  }
  return [...byId.values()];
}

function flagIssues(row) {
  const flags = [];
  const { analytic, functional, letter } = row.pronunciation;
  const sym = row.symbol;

  if (!analytic || analytic === UNKNOWN) flags.push('EMPTY/UNKNOWN');
  if (/\b(undefined|null)\b/i.test(analytic + functional + letter)) flags.push('UNDEFINED_TOKEN');
  if (/\b(seven seven|major seven seven|minor minor|diminished diminished)\b/i.test(analytic)) {
    flags.push('DUPLICATE_WORD');
  }
  if (/\b(one one|two two|five five)\b/i.test(analytic)) flags.push('DUPLICATE_DEGREE');
  if (analytic && functional && analytic === functional && row.chord.inversion) {
    flags.push('FUNC_SAME_AS_ANALYTIC_WITH_INVERSION');
  }
  if (sym.includes('°') && !/diminished|half-diminished/.test(analytic + functional)) {
    flags.push('MISSING_DIM_QUALITY');
  }
  if (sym.includes('△') && !/major seven/.test(analytic + functional)) {
    flags.push('MISSING_MAJ7');
  }
  if (sym.includes('/') && !/of |secondary dominant/.test(analytic + functional)) {
    flags.push('MISSING_APPLIED');
  }
  if (/\(mix\)|\(min\)|\(dor\)/.test(sym) && !/mixolydian|minor|dorian|borrowed/.test(analytic + functional)) {
    flags.push('MISSING_BORROWED');
  }
  if (/sus/.test(sym) && !/suspended/.test(analytic + functional)) flags.push('MISSING_SUS');
  if (/\(add/.test(sym) && !/add /.test(analytic + functional)) flags.push('MISSING_ADD');
  if (/\(no\d/.test(sym) && !/no (third|fifth)/.test(analytic + functional)) flags.push('MISSING_OMIT');
  if (/#11|b9|#9/.test(sym) && !/sharp|flat/.test(analytic + functional)) flags.push('MISSING_ALTERATION');
  if (analytic.split(' ').length > 14) flags.push('VERY_LONG');
  if (/^\d/.test(letter) || /\badd \d\b/.test(analytic)) flags.push('RAW_DIGIT');

  return flags;
}

const all = loadEntries();
const byBucket = new Map();
for (const e of all) {
  const b = e.bucket || 'unknown';
  if (!byBucket.has(b)) byBucket.set(b, []);
  byBucket.get(b).push(e);
}

const selected = new Map();
// 2 per bucket
for (const [, rows] of byBucket) {
  for (let i = 0; i < Math.min(2, rows.length); i++) selected.set(rows[i].id, rows[i]);
}
// fill to 280 with spread sample
const step = Math.max(1, Math.floor(all.length / 220));
for (let i = 0; i < all.length && selected.size < 300; i += step) {
  selected.set(all[i].id, all[i]);
}

// curated edge cases
const curated = [
  { chord: { root: 1, type: 7, inversion: 0, applied: 0, borrowed: null }, key: { tonic: 'F', scale: 'major' }, label: 'curated I△7' },
  { chord: { root: 5, type: 7, inversion: 1, applied: 5, borrowed: null }, key: { tonic: 'C', scale: 'major' }, label: 'curated V65/V' },
  { chord: { root: 5, type: 7, suspensions: [2, 4], applied: 5, borrowed: null }, key: { tonic: 'F', scale: 'major' }, label: 'curated Vsus2sus47/V' },
  { chord: { root: 5, type: 7, inversion: 2, applied: 0, borrowed: null }, key: { tonic: 'F', scale: 'major' }, label: 'curated V64' },
  { chord: { root: 5, type: 7, inversion: 1, applied: 0, borrowed: null }, key: { tonic: 'F', scale: 'major' }, label: 'curated V65' },
  { chord: { root: 6, type: 7, inversion: 3, borrowed: null }, key: { tonic: 'F', scale: 'major' }, label: 'curated vi42' },
  { chord: { root: 1, type: 9, borrowed: 'mixolydian', adds: [6] }, key: { tonic: 'C', scale: 'major' }, label: 'curated I9(add13)(mix)' },
  { chord: { root: 5, applied: 7, type: 7, borrowed: null }, key: { tonic: 'F', scale: 'major' }, label: 'curated vii°7/V' },
  { chord: { root: 1, type: 7, inversion: 1, alterations: ['#9'], borrowed: 'mixolydian' }, key: { tonic: 'G#', scale: 'dorian' }, label: 'curated I6(#9)5(mix)' },
  { chord: { root: 5, type: 7, omits: [5], suspensions: [4] }, key: { tonic: 'G', scale: 'major' }, label: 'curated V7(no5)sus4' },
  { chord: { root: 4, type: 9, alterations: ['b5'], borrowed: 'locrian' }, key: { tonic: 'D', scale: 'minor' }, label: 'curated IV9(b5)(loc)' },
  { chord: { root: 7, borrowed: [1, 3, 4, 6, 8, 10, 11] }, key: { tonic: 'Ab', scale: 'major' }, label: 'curated VII(bor)' },
];

const rows = [];
for (const e of selected.values()) {
  const symbol = getChordSymbol(e.chord, e.key);
  const pronunciation = getChordPronunciation(e.chord, e.key);
  const flags = flagIssues({ ...e, symbol, pronunciation });
  rows.push({ id: e.id, bucket: e.bucket, key: e.key, symbol, truthRoman: e.truthRoman, pronunciation, flags });
}

for (const c of curated) {
  const symbol = getChordSymbol(c.chord, c.key);
  const pronunciation = getChordPronunciation(c.chord, c.key);
  const flags = flagIssues({ chord: c.chord, key: c.key, symbol, pronunciation });
  rows.push({ id: c.label, bucket: 'curated', key: c.key, symbol, truthRoman: symbol, pronunciation, flags });
}

const flagged = rows.filter((r) => r.flags.length);
const lines = [
  '# Pronunciation Audit (temporary)',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Total entries: ${rows.length}`,
  `Flagged: ${flagged.length}`,
  '',
  '## Summary flags',
  '',
];

const flagCounts = {};
for (const r of flagged) {
  for (const f of r.flags) flagCounts[f] = (flagCounts[f] || 0) + 1;
}
for (const [f, n] of Object.entries(flagCounts).sort((a, b) => b[1] - a[1])) {
  lines.push(`- **${f}**: ${n}`);
}
if (!flagged.length) lines.push('- (none)');

lines.push('', '## Flagged entries', '');
for (const r of flagged) {
  lines.push(`### ${r.id}`);
  lines.push(`- **Symbol**: \`${r.symbol}\` (truth: \`${r.truthRoman}\`)`);
  lines.push(`- **Key**: ${r.key.tonic} ${r.key.scale}`);
  lines.push(`- **Read**: ${r.pronunciation.analytic}`);
  lines.push(`- **Func**: ${r.pronunciation.functional}`);
  lines.push(`- **Letter**: ${r.pronunciation.letter}`);
  lines.push(`- **Flags**: ${r.flags.join(', ')}`);
  lines.push('');
}

lines.push('## Full table', '');
lines.push('| Symbol | Read | Func | Letter | Flags |');
lines.push('|--------|------|------|--------|-------|');
for (const r of rows) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  lines.push(`| ${esc(r.symbol)} | ${esc(r.pronunciation.analytic)} | ${esc(r.pronunciation.functional)} | ${esc(r.pronunciation.letter)} | ${esc(r.flags.join(', ') || '—')} |`);
}

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`Wrote ${rows.length} entries to ${OUT}`);
console.log(`Flagged: ${flagged.length}`);
if (flagged.length) {
  console.log('Flag breakdown:', flagCounts);
}
