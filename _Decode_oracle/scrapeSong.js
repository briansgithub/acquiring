/**
 * scrapeSong.js
 * Loads a Hooktheory theorytab page and, for EACH section tab (ignoring "All Sections"),
 * captures:
 *   - the section's API JSON (chords/notes/metadata) via the sniffed network response body
 *   - the ordered rendered chord-view elements (structured SVG text + fill colors) = ground truth
 *   - high-resolution strip screenshots of the chord row (for the vision channel)
 *
 * Layout notes (current Hooktheory):
 *   - Each section is a tab: <a class="tb-section-tab" href="#intro">Intro</a>, plus an
 *     "All Sections" tab (href="#") which we skip.
 *   - Clicking a section tab shows that section's container <div id="tab-{songId}"> (display:block);
 *     other sections are display:none. The container id encodes the songId, giving an airtight
 *     rendered<->JSON association.
 *   - Chord glyphs lazy-render based on viewport visibility, so we use a very tall viewport to
 *     force the whole section to render at once (no scrolling needed).
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { extractChordAndMelodyObjects } = require('../lib/extractor/dataExtractor');
const { fetchSongData } = require('../lib/api/hooktheoryApi');
const { attachPianoNotes } = require('./pianoNotes');

const CHORDS_PER_STRIP = 10;
const SCALE = 2;
// All chords render into a full-width inner SVG inside div.staff-container__scroll
// (overflow-x:auto). The DOM holds every chord-view regardless of horizontal scroll,
// so a normal viewport suffices for text extraction; screenshots scroll the inner
// container horizontally to capture chords beyond the visible strip.
const VIEWPORT = { width: 1500, height: 1100, deviceScaleFactor: SCALE };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(fn, timeoutMs, pollMs = 150) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(pollMs);
  }
  return last;
}

// The chord row is horizontally virtualized: only ~15-17 chord-views exist in the DOM
// at once (those near the visible 950px window). To capture ALL chords we scroll the
// inner staff container across its full width, reading at each step and deduping by a
// scroll-stable X coordinate (viewportX - areaLeft + scrollLeft).
async function extractAllRendered(page, containerId, expectedCount = 0) {
  const handle = await page.evaluateHandle((cid) => {
    const c = document.getElementById(cid);
    return c ? c.querySelector('.staff-scroll-area') : null;
  }, containerId);
  const el = handle.asElement();
  if (!el) return [];
  const cw = await page.evaluate((s) => s.clientWidth, el);
  const map = new Map();

  const accumulate = async () => {
    const items = await page.evaluate((cid) => {
      const c = document.getElementById(cid);
      if (!c) return [];
      return Array.from(c.querySelectorAll('g.chord-view')).map((g) => {
        const gb = g.getBoundingClientRect();
        const svg = g.closest('svg');
        const sr = svg ? svg.getBoundingClientRect() : { x: 0 };
        const stableX = Math.round(gb.x - sr.x); // x within the SVG content = scroll-independent
        const texts = Array.from(g.querySelectorAll('text'))
          .map((t) => {
            const b = t.getBoundingClientRect();
            let fill = t.getAttribute('fill');
            if (!fill) { try { fill = getComputedStyle(t).fill; } catch (e) { fill = null; } }
            return { s: (t.textContent || '').trim(), relX: Math.round(b.x - gb.x), y: Math.round(b.y), fill };
          })
          .filter((t) => t.s.length);
        return { stableX, raw: (g.textContent || '').trim(), texts };
      });
    }, containerId);
    for (const it of items) {
      const key = Math.round(it.stableX / 8);
      const prev = map.get(key);
      if (!prev || it.texts.length > prev.texts.length) map.set(key, it);
    }
  };

  // Scroll left-to-right re-measuring scrollWidth each step: the content (and scrollWidth)
  // grows as chords lazily render, so a fixed initial width would stop short of the tail.
  const sweep = async (step, settle) => {
    let left = 0, guard = 0, lastSw = 0;
    while (guard++ < 500) {
      await page.evaluate((s, l) => { s.scrollLeft = l; }, el, left);
      await sleep(settle);
      await accumulate();
      const m = await page.evaluate((s) => ({ sl: s.scrollLeft, sw: s.scrollWidth, cw: s.clientWidth }), el);
      lastSw = m.sw;
      if (m.sl + m.cw >= m.sw - 2) { await sleep(settle); await accumulate(); break; }
      left = m.sl + step;
    }
    return lastSw;
  };

  await sweep(Math.max(140, Math.floor(cw * 0.5)), 170);
  // If we still came up short of the JSON chord count, do a slower, finer sweep.
  if (expectedCount && map.size < expectedCount) await sweep(Math.max(110, Math.floor(cw * 0.3)), 300);

  await page.evaluate((s) => { s.scrollLeft = 0; }, el);

  return [...map.values()]
    .sort((a, b) => a.stableX - b.stableX)
    .map((it, order) => ({ order, raw: it.raw, stableX: it.stableX, texts: it.texts }));
}

// Which tab-{songId} container is currently visible/active
async function activeContainerId(page) {
  return page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('[id^="tab-"]'));
    for (const c of cands) {
      const b = c.getBoundingClientRect();
      let disp = 'block';
      try { disp = getComputedStyle(c).display; } catch (e) {}
      if (disp !== 'none' && b.width > 2 && b.height > 2 && c.querySelector('g.chord-view')) return c.id;
    }
    return null;
  });
}

// Capture the chord row by horizontally scrolling the inner staff container and
// screenshotting the visible strip at each offset (strips overlap to avoid splits).
function stripFilesExist(outDir, sectionSlug) {
  const dir = path.join(outDir, 'screens');
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((f) => f.startsWith(`${sectionSlug}_strip`) && f.endsWith('.png'));
}

async function screenshotStrips(page, containerId, screensDir, sectionSlug) {
  fs.mkdirSync(screensDir, { recursive: true });
  if (fs.readdirSync(screensDir).some((f) => f.startsWith(`${sectionSlug}_strip`) && f.endsWith('.png'))) {
    return fs.readdirSync(screensDir)
      .filter((f) => f.startsWith(`${sectionSlug}_strip`) && f.endsWith('.png'))
      .sort()
      .map((f) => ({ file: path.relative(process.cwd(), path.join(screensDir, f)), cached: true }));
  }
  const handle = await page.evaluateHandle((cid) => {
    const c = document.getElementById(cid);
    return c ? c.querySelector('.staff-scroll-area') : null;
  }, containerId);
  const el = handle.asElement();
  if (!el) return [];
  const dims = await page.evaluate((s) => ({ sw: s.scrollWidth, cw: s.clientWidth }), el);
  const strips = [];
  const step = Math.max(120, dims.cw - 80); // overlap so no chord is split between strips
  let idx = 0;
  for (let left = 0; left < dims.sw; left += step) {
    await page.evaluate((s, l) => { s.scrollLeft = l; }, el, left);
    await sleep(120);
    const file = path.join(screensDir, `${sectionSlug}_strip${idx}.png`);
    try {
      await el.screenshot({ path: file });
      strips.push({ file: path.relative(process.cwd(), file), scrollLeft: left });
    } catch (e) {
      strips.push({ file: null, scrollLeft: left, error: e.message });
    }
    idx++;
    if (dims.sw <= dims.cw) break;
  }
  await page.evaluate((s) => { s.scrollLeft = 0; }, el);
  return strips;
}

async function scrapeSong(url, outDir, opts = {}) {
  const verbose = opts.verbose !== false;
  const skipScreenshots = opts.skipScreenshots !== false;
  const scrapePiano = opts.scrapePiano !== false;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const result = { url, title: null, sections: [], errors: [] };
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    const responses = new Map(); // songId -> body
    page.on('response', async (resp) => {
      const u = resp.url();
      if (u.includes('/v1/songs/public/')) {
        const m = u.match(/public\/([A-Za-z0-9_-]+)/);
        if (!m) return;
        try { const body = await resp.json(); responses.set(m[1], body); } catch (e) {}
      }
    });

    const navResp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (navResp && navResp.status() >= 400) { result.errors.push(`HTTP ${navResp.status()}`); await browser.close(); return result; }
    await sleep(2500);
    result.title = await page.title();

    const tabs = await page.$$eval('a.tb-section-tab', (els) =>
      els.map((e) => ({ name: e.textContent.trim(), hash: e.getAttribute('href') }))
    );
    const sectionTabs = tabs.filter((t) => t.name.toLowerCase() !== 'all sections' && t.hash && t.hash !== '#');
    if (!sectionTabs.length) { result.errors.push('No section tabs found'); await browser.close(); return result; }

    for (let i = 0; i < sectionTabs.length; i++) {
      const tab = sectionTabs[i];
      // Click the tab by matching its text
      await page.evaluate((name) => {
        const a = Array.from(document.querySelectorAll('a.tb-section-tab')).find((x) => x.textContent.trim() === name);
        if (a) a.click();
      }, tab.name);

      // Wait for an active section container with chord-views to appear
      let cid = await waitUntil(() => activeContainerId(page), 8000);
      if (cid) {
        await waitUntil(async () => {
          const n = await page.evaluate((id) => { const c = document.getElementById(id); return c ? c.querySelectorAll('g.chord-view').length : 0; }, cid);
          return n > 0;
        }, 6000, 250);
        cid = (await activeContainerId(page)) || cid;
      }

      const songId = cid ? cid.replace(/^tab-/, '') : null;
      let body = songId ? responses.get(songId) : null;
      if (!body && songId) { try { body = await fetchSongData(songId); } catch (e) { result.errors.push(`fetch ${tab.name}/${songId}: ${e.message}`); } }

      let json = null;
      if (body) { try { json = await extractChordAndMelodyObjects(body); } catch (e) { result.errors.push(`extract ${tab.name}: ${e.message}`); } }

      const expectedCount = json ? (json.chords || []).filter((c) => !c.isRest).length : 0;
      let rendered = cid ? await extractAllRendered(page, cid, expectedCount) : [];
      const sectionSlug = tab.name.replace(/[^a-zA-Z0-9]+/g, '_');
      const strips = cid && !skipScreenshots
        ? await screenshotStrips(page, cid, path.join(outDir, 'screens'), sectionSlug)
        : (stripFilesExist(outDir, sectionSlug)
          ? fs.readdirSync(path.join(outDir, 'screens'))
            .filter((f) => f.startsWith(`${sectionSlug}_strip`) && f.endsWith('.png'))
            .sort()
            .map((f) => ({ file: path.relative(process.cwd(), path.join(outDir, 'screens', f)), cached: true }))
          : []);

      if (scrapePiano && cid && rendered.length) {
        try {
          const secDraft = { name: tab.name, json };
          rendered = await attachPianoNotes(page, cid, secDraft, rendered);
        } catch (e) {
          result.errors.push(`piano ${tab.name}: ${e.message}`);
        }
      }

      const sec = {
        name: tab.name,
        hash: tab.hash,
        songId,
        containerId: cid,
        renderedCount: rendered.length,
        jsonChordCount: json ? (json.chords || []).length : null,
        jsonNonRestCount: json ? (json.chords || []).filter((c) => !c.isRest).length : null,
        json,
        rendered,
        strips,
      };
      result.sections.push(sec);
      if (verbose) console.log(`  [${tab.name}] songId=${songId} rendered=${sec.renderedCount} jsonNonRest=${sec.jsonNonRestCount} strips=${strips.length}`);
    }

    await browser.close();
    return result;
  } catch (e) {
    result.errors.push(e.message);
    try { await browser.close(); } catch (_) {}
    return result;
  }
}

module.exports = { scrapeSong };

// CLI: node _Decode_oracle/scrapeSong.js <url> [outDir]
if (require.main === module) {
  const url = process.argv[2] || 'https://www.hooktheory.com/theorytab/view/the-proclaimers/500-miles';
  const outDir = process.argv[3] || path.join(__dirname, 'out', '_test');
  fs.mkdirSync(outDir, { recursive: true });
  console.log('Scraping', url);
  scrapeSong(url, outDir).then((r) => {
    console.log('TITLE:', r.title);
    console.log('ERRORS:', r.errors);
    for (const s of r.sections) {
      const match = s.renderedCount === s.jsonNonRestCount ? 'OK' : 'MISMATCH';
      console.log(`\n== ${s.name} (songId=${s.songId}) rendered=${s.renderedCount} jsonNonRest=${s.jsonNonRestCount} [${match}] ==`);
      console.log('   labels:', s.rendered.map((c) => c.raw).join(' | '));
    }
    fs.writeFileSync(path.join(outDir, 'scrape.json'), JSON.stringify(r, null, 2));
    console.log('\nSaved', path.join(outDir, 'scrape.json'));
  });
}
