/**
 * Page scraping using Puppeteer
 * Extracts song IDs and section mappings from Hooktheory theorytab pages.
 * Uses section tabs (a.tb-section-tab) + tab-{songId} containers — current Hooktheory layout.
 */

const puppeteer = require('puppeteer');

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
    for (const c of document.querySelectorAll('[id^="tab-"]')) {
      let disp = 'block';
      try { disp = getComputedStyle(c).display; } catch (_) {}
      const b = c.getBoundingClientRect();
      if (disp !== 'none' && b.width > 2 && b.height > 2) return c.id;
    }
    return null;
  });
}

async function findAllSongIdsFromPage(url) {
  console.log('Launching browser to extract all section song IDs...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1100 });

    const capturedOrder = [];
    const seen = new Set();
    page.on('response', async (response) => {
      const u = response.url();
      if (!u.includes('api.hooktheory.com/v1/songs/public/')) return;
      const m = u.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      capturedOrder.push(m[1]);
    });

    const nav = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (nav && nav.status() >= 400) {
      throw new Error(`HTTP ${nav.status()}`);
    }
    await sleep(2500);

    const tabs = await page.$$eval('a.tb-section-tab', (els) =>
      els.map((e) => ({ name: e.textContent.trim(), hash: e.getAttribute('href') })),
    );
    const sectionTabs = tabs.filter((t) => t.name.toLowerCase() !== 'all sections' && t.hash && t.hash !== '#');
    if (!sectionTabs.length) {
      throw new Error('No section tabs found on page');
    }

    console.log(`Found ${sectionTabs.length} section tab(s): ${sectionTabs.map((t) => t.name).join(', ')}`);

    const songIds = [];
    const sectionMapping = {};

    for (const tab of sectionTabs) {
      await page.evaluate((name) => {
        const a = Array.from(document.querySelectorAll('a.tb-section-tab'))
          .find((x) => x.textContent.trim() === name);
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
      if (!songId) {
        console.log(`  ⚠ No songId for section "${tab.name}"`);
        continue;
      }
      if (!songIds.includes(songId)) songIds.push(songId);
      sectionMapping[songId] = tab.name;
      console.log(`  ${tab.name} -> ${songId}`);
    }

    await browser.close();

    if (!songIds.length) {
      throw new Error('Could not find any song IDs in page');
    }

    console.log(`\n✓ Captured ${songIds.length} unique song IDs: ${songIds.join(', ')}`);
    console.log('\nSection Mapping:');
    for (const id of songIds) {
      console.log(`  ${id} -> ${sectionMapping[id] || 'Unknown'}`);
    }

    return { songIds, sectionMapping };
  } catch (e) {
    await browser.close();
    throw new Error(`Failed to extract song IDs: ${e.message}`);
  }
}

module.exports = { findAllSongIdsFromPage };
