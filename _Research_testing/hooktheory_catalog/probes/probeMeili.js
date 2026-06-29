/**
 * Probe Meilisearch theorytabs index for catalog enumeration.
 */
const https = require('https');

const MEILI = 'https://search.hooktheory.com/indexes/theorytabs/search';

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0',
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const queries = [
    { q: '', limit: 5 },
    { q: 'a', limit: 5 },
    { q: 'adele', limit: 3 },
  ];
  for (const body of queries) {
    const { status, json } = await postJson(MEILI, body);
    console.log('\n--- query', JSON.stringify(body), 'status', status);
    console.log('hits', json.estimatedTotalHits ?? json.totalHits, 'returned', (json.hits || []).length);
    const hit = (json.hits || [])[0];
    if (hit) console.log('sample keys:', Object.keys(hit).join(', '));
    if (hit) console.log('sample:', JSON.stringify(hit, null, 2).slice(0, 800));
  }
}

main().catch(console.error);
