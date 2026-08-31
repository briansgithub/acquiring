/**
 * Capture Meilisearch auth headers from browser session.
 */
const puppeteer = require('puppeteer');

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const captured = [];

  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('search.hooktheory.com')) {
      captured.push({
        url: u,
        method: req.method(),
        headers: req.headers(),
        postData: req.postData(),
      });
    }
  });

  await page.goto('https://www.hooktheory.com/theorytab/search?q=adele', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 3000));
  await browser.close();

  for (const c of captured) {
    console.log('---', c.method, c.url);
    console.log('headers', JSON.stringify(c.headers, null, 2));
    console.log('body', c.postData);
    if (c.postData) {
      const resp = await fetch(c.url, {
        method: 'POST',
        headers: c.headers,
        body: c.postData,
      });
      const json = await resp.json();
      console.log('replay status', resp.status, 'hits', json.estimatedTotalHits ?? json.totalHits);
      const hit = (json.hits || [])[0];
      if (hit) console.log('sample keys', Object.keys(hit));
      if (hit) console.log('sample', JSON.stringify(hit, null, 2).slice(0, 1200));
    }
  }
}

main().catch(console.error);
