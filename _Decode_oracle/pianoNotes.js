/**
 * pianoNotes.js
 * Scrape Hooktheory piano-roll chord tones (g.note-view data-sd / data-octave)
 * and convert to Tone-style note names for ground-truth comparison.
 */

const { activeKeyAtBeat } = require('./engineRun');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function enablePianoChordsView(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t === 'Piano' || t === 'Chords') b.click();
    }
  });
  await sleep(400);
}

async function extractAllNoteViews(page, containerId, expectedChordCount = 0) {
  const handle = await page.evaluateHandle((cid) => {
    const c = document.getElementById(cid);
    return c ? c.querySelector('.staff-scroll-area') : null;
  }, containerId);
  const el = handle.asElement();
  if (!el) return [];

  const map = new Map();
  const accumulate = async () => {
    const items = await page.evaluate((cid) => {
      const c = document.getElementById(cid);
      if (!c) return [];
      const staffSvg = [...c.querySelectorAll('svg')].find((s) => s.querySelector('g.chord-view'));
      if (!staffSvg) return [];
      const sr = staffSvg.getBoundingClientRect();
      return [...staffSvg.querySelectorAll('g.note-view')].map((nv) => {
        const nb = nv.getBoundingClientRect();
        const stableX = Math.round(nb.x - sr.x);
        return {
          stableX,
          sd: nv.getAttribute('data-sd'),
          octave: nv.getAttribute('data-octave'),
          cy: Math.round(nb.y + nb.height / 2),
        };
      });
    }, containerId);
    for (const it of items) {
      const key = `${Math.round(it.stableX / 6)}:${it.sd}:${it.octave}:${it.cy}`;
      if (!map.has(key)) map.set(key, it);
    }
  };

  const cw = await page.evaluate((s) => s.clientWidth, el);
  const sweep = async (step, settle) => {
    let left = 0, guard = 0;
    while (guard++ < 500) {
      await page.evaluate((s, l) => { s.scrollLeft = l; }, el, left);
      await sleep(settle);
      await accumulate();
      const m = await page.evaluate((s) => ({ sl: s.scrollLeft, sw: s.scrollWidth, cw: s.clientWidth }), el);
      if (m.sl + m.cw >= m.sw - 2) { await sleep(settle); await accumulate(); break; }
      left = m.sl + step;
    }
  };

  await sweep(Math.max(140, Math.floor(cw * 0.5)), 170);
  if (expectedChordCount && map.size < expectedChordCount) await sweep(Math.max(110, Math.floor(cw * 0.3)), 280);
  await page.evaluate((s) => { s.scrollLeft = 0; }, el);

  return [...map.values()].sort((a, b) => a.stableX - b.stableX || a.cy - b.cy);
}

function groupNotesToRendered(noteViews, rendered) {
  if (!rendered?.length) return [];
  return rendered.map((r) => {
    const raw = noteViews.filter((n) => Math.abs(n.stableX - r.stableX) <= 22);
    const dedup = new Map();
    for (const n of raw) {
      const k = `${n.sd}|${n.octave}|${n.cy}`;
      if (!dedup.has(k)) dedup.set(k, n);
    }
    return { order: r.order, stableX: r.stableX, pianoRaw: [...dedup.values()] };
  });
}

let musicEngine = null;
async function loadMusic() {
  if (musicEngine) return musicEngine;
  const url = (p) => require('url').pathToFileURL(require('path').join(__dirname, '..', 'web-player', 'lib', p)).href;
  musicEngine = await import(url('music.js'));
  return musicEngine;
}

async function rawToNoteNames(pianoRaw, chordRootTonic, baseOctave = 3) {
  if (!pianoRaw?.length || !chordRootTonic) return [];
  const { sdToToneJSNoteName } = await loadMusic();
  const rootKey = { tonic: chordRootTonic, scale: 'major' };
  const ordered = [...pianoRaw].sort((a, b) => b.cy - a.cy);
  const names = [];
  const seen = new Set();
  for (const n of ordered) {
    if (!n.sd) continue;
    const relOct = parseInt(n.octave, 10);
    if (Number.isNaN(relOct)) continue;
    try {
      const name = sdToToneJSNoteName(n.sd, relOct, rootKey, baseOctave);
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    } catch (_) { /* skip */ }
  }
  return names;
}

async function chordRootTonic(chord, parentKey) {
  const sym = await import(require('url').pathToFileURL(
    require('path').join(__dirname, '..', 'web-player', 'lib', 'jsonToSymbol.js'),
  ).href);
  const letter = sym.getChordLetterName(chord, parentKey);
  const m = String(letter || '').match(/^([A-G](?:x|#|b)*)/);
  return m ? m[1] : parentKey.tonic;
}

async function attachPianoNotes(page, containerId, section, rendered) {
  await enablePianoChordsView(page);
  const noteViews = await extractAllNoteViews(page, containerId, rendered.length);
  const grouped = groupNotesToRendered(noteViews, rendered);
  const keys = section.json?.metadata?.keys || [];
  const chords = (section.json?.chords || []).filter((c) => !c.isRest);

  for (let i = 0; i < rendered.length; i++) {
    const g = grouped[i] || { pianoRaw: [] };
    const beat = chords[i]?.beat ?? 1;
    const key = activeKeyAtBeat(keys, beat);
    const chord = chords[i];
    const rootTonic = chord ? await chordRootTonic(chord, key) : key.tonic;
    let pianoNotes = await rawToNoteNames(g.pianoRaw, rootTonic);
    const minNotes = chord?.type >= 7 ? 3 : 2;
    if (pianoNotes.length < minNotes || pianoNotes.length > 8) pianoNotes = [];
    rendered[i].pianoRaw = g.pianoRaw;
    rendered[i].pianoNotes = pianoNotes.length ? pianoNotes : null;
  }
  return rendered;
}

module.exports = {
  enablePianoChordsView, extractAllNoteViews, groupNotesToRendered,
  rawToNoteNames, attachPianoNotes,
};
