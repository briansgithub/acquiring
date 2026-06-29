const puppeteer = require('puppeteer');

async function getMeiliAuth() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let auth = null;
  page.on('request', (req) => {
    if (req.url().includes('search.hooktheory.com') && req.method() === 'POST') {
      auth = req.headers().authorization;
    }
  });
  await page.goto('https://www.hooktheory.com/theorytab/search?q=a', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await browser.close();
  return auth;
}

async function meiliSearch(auth, body) {
  const resp = await fetch('https://search.hooktheory.com/indexes/theorytabs/search', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json', referer: 'https://www.hooktheory.com/' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function main() {
  const auth = await getMeiliAuth();
  console.log('auth', auth ? auth.slice(0, 20) + '...' : null);

  const tests = [
    { limit: 0, q: '' },
    { limit: 3, offset: 0, q: '' },
    { limit: 3, offset: 100, q: '' },
    { limit: 3, offset: 0, q: 'a' },
  ];
  for (const body of tests) {
    const json = await meiliSearch(auth, body);
    console.log('\nbody', body);
    console.log('estimatedTotalHits', json.estimatedTotalHits, 'totalHits', json.totalHits, 'offset', json.offset, 'limit', json.limit);
    console.log('hits', (json.hits || []).map((h) => ({ id: h.id, artist: h.artist, song: h.song, section: h.section })));
  }
}

main().catch(console.error);
