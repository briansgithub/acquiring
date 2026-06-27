/**
 * Expand discovered_urls.json via TheoryTab search (a-z, 0-9).
 *   node _Research_testing/discover_theorytab_search.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'discovered_urls.json');
const BASE = 'https://www.hooktheory.com';

function norm(h) {
  const m = (h || '').match(/theorytab\/view\/([^/?#]+)\/([^/?#]+)/);
  return m ? `${BASE}/theorytab/view/${m[1]}/${m[2]}` : null;
}

async function main() {
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).urls : [];
  const found = new Set(existing);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const queries = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  for (const q of queries) {
    const url = `${BASE}/theorytab/search?q=${q}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 1200));
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/theorytab/view/"]')].map((a) => a.href),
      );
      for (const h of links) {
        const u = norm(h);
        if (u) found.add(u);
      }
      console.log(`[search] ${q} +${links.length} → total ${found.size}`);
    } catch (e) {
      console.log(`[search] ${q} err: ${e.message}`);
    }
  }

  await browser.close();
  const urls = [...found].sort();
  fs.writeFileSync(OUT, JSON.stringify({ discovered: new Date().toISOString(), count: urls.length, urls }, null, 2));
  console.log(`[search] wrote ${urls.length} URLs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
