/**
 * report.js
 * Turns a compareSong() result into durable artifacts:
 *   - report.json          : full per-chord comparison
 *   - summary.md           : headline accuracy + section breakdown
 *   - attribute_matrix.md  : accuracy sliced by JSON chord attribute (type, inversion,
 *                            applied, borrowed, suspensions, alterations, adds, omits)
 *   - discrepancies.md     : every mismatching chord with its strip screenshot reference
 *
 * Metrics tracked per slice:
 *   romanExact - canonical Roman strings identical
 *   romanCore  - identical after dropping parenthetical borrowed/alteration tags
 *   notesOk    - full pitch-class set matches letter-name implication (pcsExact) AND bass agrees
 *   browserOk  - web-player #chord-notes matches engine notes (set in run.js after browserVerify)
 */

const fs = require('fs');
const path = require('path');

function attrBuckets(chord) {
  const b = [];
  b.push(['type', String(chord.type ?? 5)]);
  b.push(['inversion', String(chord.inversion ?? 0)]);
  b.push(['applied', chord.applied ? 'yes' : 'no']);
  const borrowed = chord.borrowed;
  let bor = 'none';
  if (Array.isArray(borrowed)) bor = 'custom-array';
  else if (typeof borrowed === 'string' && borrowed) bor = borrowed;
  b.push(['borrowed', bor]);
  if (chord.suspensions && chord.suspensions.length) b.push(['suspensions', chord.suspensions.join('+')]);
  if (chord.alterations && chord.alterations.length) b.push(['alterations', chord.alterations.join('+')]);
  if (chord.adds && chord.adds.length) b.push(['adds', chord.adds.join('+')]);
  if (chord.omits && chord.omits.length) b.push(['omits', chord.omits.join('+')]);
  return b;
}

function rowMetrics(r) {
  return {
    romanExact: !!r.flags.romanExact,
    romanCore: !!r.flags.romanCore,
    notesOk: !!r.notesOk,
    pianoOk: !!(r.flags.pianoExact || r.flags.pianoPcsExact),
    browserOk: r.browserOk === true,
  };
}

function pct(n, d) { return d ? ((100 * n) / d).toFixed(0) + '%' : '-'; }

function buildReport(compareResult, scrape, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const matrix = new Map(); // "attr=value" -> {total, romanExact, romanCore, notesOk, browserOk}
  const discrepancies = [];
  let total = 0, romanExact = 0, romanCore = 0, notesOk = 0, browserOk = 0;

  const stripFor = (section, idx) => {
    // best-effort: map chord order to the strip that covers it
    const strips = section.strips || [];
    if (!strips.length) return null;
    return strips[Math.min(strips.length - 1, Math.floor(idx / Math.ceil(section.rendered.length / strips.length)))]?.file || null;
  };

  compareResult.sections.forEach((sec, si) => {
    const scrapeSec = scrape.sections[si];
    sec.rows.forEach((r, idx) => {
      total++;
      const m = rowMetrics(r);
      if (m.romanExact) romanExact++;
      if (m.romanCore) romanCore++;
      if (m.notesOk) notesOk++;
      if (m.browserOk) browserOk++;
      for (const [k, v] of attrBuckets(r.chord)) {
        const key = `${k}=${v}`;
        if (!matrix.has(key)) matrix.set(key, { total: 0, romanExact: 0, romanCore: 0, notesOk: 0, browserOk: 0 });
        const e = matrix.get(key);
        e.total++; if (m.romanExact) e.romanExact++; if (m.romanCore) e.romanCore++;
        if (m.notesOk) e.notesOk++; if (m.browserOk) e.browserOk++;
      }
      const browserGate = r.browserOk == null || m.browserOk;
      if (!(m.romanCore && m.notesOk && browserGate)) {
        discrepancies.push({
          section: sec.name, beat: r.beat, chord: r.chord,
          truthRoman: r.truthRoman, engRoman: r.engRoman,
          truthLetter: r.truthLetter, engLetter: r.engLetter,
          engNotes: r.engNotes, truthPcs: r.truthPcs, engPcs: r.engPcs,
          pianoNotes: r.pianoNotes, pianoPcs: r.pianoPcs,
          flags: r.flags, browserOk: r.browserOk, browserNotes: r.browserNotes,
          strip: stripFor(scrapeSec, idx), engineError: r.engineError,
        });
      }
    });
  });

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url: compareResult.url, title: compareResult.title, sections: compareResult.sections }, null, 2));

  // summary.md
  let md = `# Decode oracle report\n\n**${compareResult.title || compareResult.url}**\n\n`;
  md += `- Chords compared: **${total}**\n`;
  md += `- Roman exact: **${pct(romanExact, total)}** (${romanExact}/${total})\n`;
  md += `- Roman core (ignoring borrowed/alteration tags): **${pct(romanCore, total)}** (${romanCore}/${total})\n`;
  md += `- Notes exact (full PC set + bass): **${pct(notesOk, total)}** (${notesOk}/${total})\n`;
  if (compareResult.sections.some((s) => s.rows.some((r) => r.browserOk != null))) {
    md += `- Browser display matches engine: **${pct(browserOk, total)}** (${browserOk}/${total})\n`;
  }
  md += `\n## Sections\n\n| Section | chords | romanExact | romanCore | notesOk | browserOk |\n|---|---|---|---|---|---|\n`;
  compareResult.sections.forEach((sec) => {
    let t = 0, re = 0, rc = 0, no = 0, bo = 0;
    sec.rows.forEach((r) => {
      t++; const m = rowMetrics(r);
      if (m.romanExact) re++; if (m.romanCore) rc++; if (m.notesOk) no++; if (m.browserOk) bo++;
    });
    md += `| ${sec.name} | ${t} | ${pct(re, t)} | ${pct(rc, t)} | ${pct(no, t)} | ${pct(bo, t)} |\n`;
  });
  fs.writeFileSync(path.join(outDir, 'summary.md'), md);

  // attribute_matrix.md
  let am = `# Attribute accuracy matrix\n\n${compareResult.title || ''}\n\n`;
  am += `| Attribute | total | romanExact | romanCore | notesOk | browserOk |\n|---|---|---|---|---|---|\n`;
  [...matrix.entries()].sort().forEach(([key, e]) => {
    am += `| ${key} | ${e.total} | ${pct(e.romanExact, e.total)} | ${pct(e.romanCore, e.total)} | ${pct(e.notesOk, e.total)} | ${pct(e.browserOk, e.total)} |\n`;
  });
  fs.writeFileSync(path.join(outDir, 'attribute_matrix.md'), am);

  // discrepancies.md
  let dm = `# Discrepancies (${discrepancies.length})\n\n`;
  for (const d of discrepancies) {
    const c = d.chord;
    const attrs = `root=${c.root} applied=${c.applied} type=${c.type} inv=${c.inversion}` +
      (c.borrowed ? ` borrowed=${JSON.stringify(c.borrowed)}` : '') +
      (c.suspensions && c.suspensions.length ? ` sus=${JSON.stringify(c.suspensions)}` : '') +
      (c.alterations && c.alterations.length ? ` alt=${JSON.stringify(c.alterations)}` : '');
    dm += `## ${d.section} beat ${d.beat}\n`;
    dm += `- truth: \`${d.truthRoman}\` (${d.truthLetter}) | engine: \`${d.engRoman}\` (${d.engLetter})\n`;
    dm += `- engine notes: ${JSON.stringify(d.engNotes)} | truth PCs: [${(d.truthPcs || []).join(',')}] | engine PCs: [${(d.engPcs || []).join(',')}]\n`;
    if (d.pianoNotes) dm += `- piano scrape: ${JSON.stringify(d.pianoNotes)} | piano PCs: [${(d.pianoPcs || []).join(',')}]\n`;
    if (d.browserNotes) dm += `- browser DOM: ${JSON.stringify(d.browserNotes)} (browserOk=${d.browserOk})\n`;
    dm += `- json: ${attrs}\n`;
    dm += `- failing: ${Object.entries(d.flags).filter(([, v]) => !v).map(([k]) => k).join(', ')}\n`;
    if (d.engineError) dm += `- engine error: ${d.engineError}\n`;
    if (d.strip) dm += `- strip: ![strip](${d.strip.replace(/\\/g, '/')})\n`;
    dm += `\n`;
  }
  fs.writeFileSync(path.join(outDir, 'discrepancies.md'), dm);

  return { total, romanExact, romanCore, notesOk, browserOk, discrepancies: discrepancies.length, discrepancyList: discrepancies, matrix };
}

function pctExport(n, d) { return pct(n, d); }

module.exports = { buildReport, pctExport, attrBuckets, rowMetrics };
