/**
 * browserVerify.js
 * Live web-player check: notes shown in #chord-notes must match engine output for each
 * compared chord (same path as Tone.js playback).
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = process.env.PLAYER_PORT || 3000;

async function fetchLibrary() {
  const res = await fetch(`http://localhost:${PORT}/api/songs`);
  if (!res.ok) throw new Error(`Player not running at :${PORT} (${res.status})`);
  return res.json();
}

function findSongIndex(library, scrapeUrl) {
  const norm = (u) => (u || '').replace(/\/$/, '').toLowerCase();
  const target = norm(scrapeUrl);
  let idx = library.findIndex((s) => norm(s.url) === target);
  if (idx >= 0) return idx;
  const slug = target.split('/view/').pop();
  idx = library.findIndex((s) => norm(s.url).endsWith(slug));
  return idx;
}

function sectionIndex(library, songIdx, sectionName) {
  const secs = library[songIdx]?.sections || [];
  return secs.findIndex((s) => s.sectionName === sectionName);
}

async function readChordPills(page) {
  return page.evaluate(() => {
    const root = document.getElementById('chord-root')?.textContent?.trim() || '';
    const notes = [...document.querySelectorAll('#chord-notes .pill')]
      .map((p) => p.textContent.trim())
      .filter(Boolean);
    return { root, notes };
  });
}

async function clickBeat(page, beat, sectionJson) {
  const chords = (sectionJson.chords || []).filter((c) => !c.isRest);
  const meta = sectionJson.metadata || {};
  const firstBeat = meta.meters?.[0]?.beat ?? 1;
  const ends = chords.map((c) => (c.beat === 0 ? 1 : c.beat) + c.duration);
  const songLengthBeats = ends.length ? Math.max(...ends) : 1;

  await page.evaluate(() => {
    const cb = document.getElementById('timeline-play-chord-checkbox');
    if (cb) cb.checked = true;
  });

  await page.evaluate((beat, firstBeat, songLengthBeats) => {
    const canvas = document.querySelector('#timeline-pane canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (beat - firstBeat) / songLengthBeats));
    const x = rect.left + ratio * rect.width + 3;
    const y = rect.top + rect.height / 2;
    canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
  }, beat, firstBeat, songLengthBeats);

  await new Promise((r) => setTimeout(r, 120));
}

/**
 * Verify browser DOM notes match engine notes for rows in compare report.
 * @returns {{ checked, passed, failures: Array }}
 */
async function verifyBrowser(scrape, compareResult, { maxChords = 0 } = {}) {
  const library = await fetchLibrary();
  const songIdx = findSongIndex(library, scrape.url);
  if (songIdx < 0) {
    return { checked: 0, passed: 0, failures: [], skipped: 'song not in player cache' };
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#song-select option');

  const failures = [];
  let checked = 0;
  let passed = 0;
  let budget = maxChords || Infinity;

  for (let si = 0; si < compareResult.sections.length && budget > 0; si++) {
    const sec = compareResult.sections[si];
    const scrapeSec = scrape.sections[si];
    const secIdx = sectionIndex(library, songIdx, sec.name);
    if (secIdx < 0) continue;

    await page.select('#song-select', String(songIdx));
    await page.select('#section-select', String(secIdx));
    await new Promise((r) => setTimeout(r, 350));

    for (const row of sec.rows) {
      if (budget <= 0) break;
      if (!row.engNotes?.length) continue;
      budget--;
      checked++;
      await clickBeat(page, row.beat, scrapeSec.json);
      const dom = await readChordPills(page);
      const engSorted = [...row.engNotes].sort().join(',');
      const domSorted = [...dom.notes].sort().join(',');
      const ok = engSorted === domSorted;
      if (ok) passed++;
      else {
        failures.push({
          section: sec.name,
          beat: row.beat,
          engNotes: row.engNotes,
          domNotes: dom.notes,
          engRoman: row.engRoman,
          domRoot: dom.root,
        });
      }
    }
  }

  await browser.close();
  return { checked, passed, failures };
}

module.exports = { verifyBrowser, findSongIndex };

if (require.main === module) {
  const scrapePath = process.argv[2];
  const reportPath = process.argv[3];
  if (!scrapePath || !reportPath) {
    console.error('Usage: node browserVerify.js <scrape.json> <report.json>');
    process.exit(1);
  }
  const scrape = JSON.parse(fs.readFileSync(scrapePath, 'utf8'));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  verifyBrowser(scrape, report).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.failures.length ? 1 : 0);
  });
}
