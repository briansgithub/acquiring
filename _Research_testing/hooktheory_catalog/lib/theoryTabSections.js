/**
 * Resolve TheoryTab section → public API song IDs via one page load.
 */

const puppeteer = require('puppeteer');

const BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
const VIEWPORT = { width: 1500, height: 1100, deviceScaleFactor: 2 };
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

async function activeContainerId(page) {
  return page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('[id^="tab-"]'));
    for (const c of cands) {
      const b = c.getBoundingClientRect();
      let disp = 'block';
      try { disp = getComputedStyle(c).display; } catch (_) {}
      if (disp !== 'none' && b.width > 2 && b.height > 2 && c.querySelector('g.chord-view')) return c.id;
    }
    return null;
  });
}

async function launchBrowser() {
  return puppeteer.launch({ headless: 'new', args: BROWSER_ARGS });
}

async function loadTheoryTabPage(url, browser = null) {
  const ownBrowser = !browser;
  const activeBrowser = browser || await launchBrowser();
  try {
    const page = await activeBrowser.newPage();
    await page.setViewport(VIEWPORT);
    const responses = new Map();
    page.on('response', async (resp) => {
      const u = resp.url();
      if (!u.includes('/v1/songs/public/')) return;
      const m = u.match(/public\/([A-Za-z0-9_-]+)/);
      if (!m) return;
      try {
        responses.set(m[1], await resp.json());
      } catch (_) {}
    });

    const nav = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (nav && nav.status() >= 400) {
      const err = new Error(`HTTP ${nav.status()}`);
      err.status = nav.status;
      throw err;
    }
    await new Promise((r) => setTimeout(r, 2000));
    const html = await page.content();

    const tabs = await page.$$eval('a.tb-section-tab', (els) =>
      els.map((e) => ({ name: e.textContent.trim(), hash: e.getAttribute('href') })),
    );
    const sectionTabs = tabs.filter(
      (t) => t.name.toLowerCase() !== 'all sections' && t.hash && t.hash !== '#',
    );

    const sections = [];
    let prevCid = null;
    for (const tab of sectionTabs) {
      await page.evaluate((tabName) => {
        const a = Array.from(document.querySelectorAll('a.tb-section-tab'))
          .find((x) => x.textContent.trim() === tabName);
        if (a) a.click();
      }, tab.name);

      let cid = await waitUntil(() => activeContainerId(page), 8000);
      if (cid) {
        await waitUntil(async () => {
          const n = await page.evaluate((id) => {
            const c = document.getElementById(id);
            return c ? c.querySelectorAll('g.chord-view').length : 0;
          }, cid);
          return n > 0;
        }, 6000, 250);
        cid = (await activeContainerId(page)) || cid;
      }

      const songId = cid ? cid.replace(/^tab-/, '') : null;
      prevCid = cid;
      if (songId) sections.push({ section_name: tab.name, song_id: songId });
    }

    if (prevCid && sectionTabs.length > 1) {
      const uniqueResolved = new Set(sections.map((s) => s.song_id));
      if (uniqueResolved.size < sections.length) {
        sections.length = 0;
        prevCid = null;
        for (const tab of sectionTabs) {
          await page.evaluate((tabName) => {
            const a = Array.from(document.querySelectorAll('a.tb-section-tab'))
              .find((x) => x.textContent.trim() === tabName);
            if (a) a.click();
          }, tab.name);
          let cid = await waitUntil(async () => {
            const c = await activeContainerId(page);
            return c && c !== prevCid ? c : null;
          }, 10000);
          if (!cid) cid = await waitUntil(() => activeContainerId(page), 4000);
          if (cid) {
            await waitUntil(async () => {
              const n = await page.evaluate((id) => {
                const c = document.getElementById(id);
                return c ? c.querySelectorAll('g.chord-view').length : 0;
              }, cid);
              return n > 0;
            }, 6000, 300);
            cid = (await activeContainerId(page)) || cid;
          }
          const songId = cid ? cid.replace(/^tab-/, '') : null;
          prevCid = cid;
          if (songId) sections.push({ section_name: tab.name, song_id: songId });
        }
      }
    }

    if (!sections.length) {
      for (const [songId] of responses) {
        sections.push({ section_name: songId, song_id: songId });
      }
    }

    await page.close();
    return { html, sections, prefetched: responses };
  } finally {
    if (ownBrowser) await activeBrowser.close();
  }
}

module.exports = { launchBrowser, loadTheoryTabPage };
