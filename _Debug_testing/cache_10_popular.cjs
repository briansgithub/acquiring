/** Batch-cache 10 popular Hooktheory songs via extract_hooktheory_data.js */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXTRACT = path.join(ROOT, 'extract_hooktheory_data.js');

const URLS = [
  'https://www.hooktheory.com/theorytab/view/adele/someone-like-you',
  'https://www.hooktheory.com/theorytab/view/the-beatles/hey-jude',
  'https://www.hooktheory.com/theorytab/view/journey/dont-stop-believin',
  'https://www.hooktheory.com/theorytab/view/oasis/wonderwall',
  'https://www.hooktheory.com/theorytab/view/ed-sheeran/shape-of-you',
  'https://www.hooktheory.com/theorytab/view/michael-jackson/billie-jean',
  'https://www.hooktheory.com/theorytab/view/coldplay/yellow',
  'https://www.hooktheory.com/theorytab/view/taylor-swift/love-story',
  'https://www.hooktheory.com/theorytab/view/john-lennon/imagine', // hotel-california URL 404 on Hooktheory
  'https://www.hooktheory.com/theorytab/view/bruno-mars/just-the-way-you-are',
];

const results = [];

for (let i = 0; i < URLS.length; i++) {
  const url = URLS[i];
  console.log(`\n========== [${i + 1}/${URLS.length}] ${url} ==========`);
  const r = spawnSync(process.execPath, [EXTRACT, url], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 180000,
  });
  results.push({ url, ok: r.status === 0, status: r.status ?? 'timeout' });
}

console.log('\n========== SUMMARY ==========');
for (const { url, ok, status } of results) {
  console.log(`${ok ? 'OK' : 'FAIL'} (${status}) ${url}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
