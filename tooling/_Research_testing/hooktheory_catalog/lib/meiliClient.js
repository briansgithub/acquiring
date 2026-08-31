/**
 * Meilisearch client for TheoryTab discovery (auth via browser session).
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { acquire, updatePoolFromHeaders } = require('./api/rateLimitPool');

const MEILI_HOST = 'search.hooktheory.com';
const MEILI_URL = `https://${MEILI_HOST}/indexes/theorytabs/search`;
const { dataPath } = require('./paths');
const AUTH_CACHE = dataPath('.meili_auth.json');
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

async function captureAuthFromBrowser() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let auth = null;
  page.on('request', (req) => {
    if (req.url().includes('search.hooktheory.com') && req.method() === 'POST') {
      auth = req.headers().authorization;
    }
  });
  await page.goto('https://www.hooktheory.com/theorytab/search?q=a', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 2000));
  await browser.close();
  if (!auth) throw new Error('Failed to capture Meilisearch authorization header');
  const payload = { auth, capturedAt: new Date().toISOString() };
  fs.writeFileSync(AUTH_CACHE, JSON.stringify(payload, null, 2));
  return auth;
}

async function getMeiliAuth(forceRefresh = false) {
  if (!forceRefresh && fs.existsSync(AUTH_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(AUTH_CACHE, 'utf8'));
      const age = Date.now() - new Date(cached.capturedAt).getTime();
      if (cached.auth && age < AUTH_TTL_MS) return cached.auth;
    } catch (_) {}
  }
  return captureAuthFromBrowser();
}

async function meiliSearch(body, auth) {
  await acquire(MEILI_HOST);
  const resp = await fetch(MEILI_URL, {
    method: 'POST',
    headers: {
      authorization: auth,
      'content-type': 'application/json',
      referer: 'https://www.hooktheory.com/',
    },
    body: JSON.stringify(body),
  });
  updatePoolFromHeaders(MEILI_HOST, Object.fromEntries(resp.headers.entries()));
  if (resp.status === 401) {
    const err = new Error('Meilisearch auth expired');
    err.status = 401;
    throw err;
  }
  if (!resp.ok) throw new Error(`Meilisearch HTTP ${resp.status}`);
  return resp.json();
}

async function searchWithAuth(body) {
  let auth = await getMeiliAuth();
  try {
    return await meiliSearch(body, auth);
  } catch (e) {
    if (e.status === 401) {
      auth = await getMeiliAuth(true);
      return meiliSearch(body, auth);
    }
    throw e;
  }
}

async function* paginateAll({ pageSize = 200, query = '', startOffset = 0, maxPages = 0 } = {}) {
  let offset = startOffset;
  let page = 0;
  while (true) {
    const json = await searchWithAuth({
      q: query,
      limit: pageSize,
      offset,
      attributesToRetrieve: ['artist', 'song', 'section', 'id', 'key'],
    });
    const hits = json.hits || [];
    if (!hits.length) break;
    page++;
    yield { hits, offset, page };
    offset += hits.length;
    if (hits.length < pageSize) break;
    if (maxPages > 0 && page >= maxPages) break;
  }
  return offset;
}

module.exports = {
  getMeiliAuth,
  searchWithAuth,
  paginateAll,
};
