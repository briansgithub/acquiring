/**
 * Scrape TheoryTab browse/popular pages for theorytab/view URLs.
 * Output: _Research_testing/discovered_urls.json
 *
 *   node _Research_testing/discover_theorytab_urls.js [--pages N]
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'discovered_urls.json');
const BASE = 'https://www.hooktheory.com';

const PAGES = [
  '/theorytab',
  '/theorytab/popular',
  '/theorytab/recent',
  '/theorytab/trends',
];

function normalizeUrl(href) {
  if (!href) return null;
  const m = href.match(/theorytab\/view\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  return `${BASE}/theorytab/view/${m[1]}/${m[2]}`;
}

async function extractLinks(page) {
  return page.evaluate(() => {
    const urls = new Set();
    document.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href') || '';
      if (h.includes('/theorytab/view/')) urls.add(h);
    });
    return [...urls];
  });
}

async function main() {
  const maxPages = Number(process.argv.find((a, i) => process.argv[i - 1] === '--pages') || 5);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const found = new Map();

  for (const p of PAGES) {
    const url = BASE + p;
    console.log(`[discover] ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 2000));
      for (const href of await extractLinks(page)) {
        const u = normalizeUrl(href.startsWith('http') ? href : BASE + href);
        if (u) found.set(u, p);
      }
    } catch (e) {
      console.log(`  skip: ${e.message}`);
    }
  }

  // Paginate popular if available
  for (let pg = 2; pg <= maxPages; pg++) {
    const url = `${BASE}/theorytab/popular?page=${pg}`;
    console.log(`[discover] ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1500));
      const links = await extractLinks(page);
      if (!links.length) break;
      for (const href of links) {
        const u = normalizeUrl(href.startsWith('http') ? href : BASE + href);
        if (u) found.set(u, `/theorytab/popular?page=${pg}`);
      }
    } catch (e) {
      break;
    }
  }

  await browser.close();
  const urls = [...found.keys()].sort();
  fs.writeFileSync(OUT, JSON.stringify({ discovered: new Date().toISOString(), count: urls.length, urls, sources: Object.fromEntries(found) }, null, 2));
  console.log(`[discover] wrote ${urls.length} URLs → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
