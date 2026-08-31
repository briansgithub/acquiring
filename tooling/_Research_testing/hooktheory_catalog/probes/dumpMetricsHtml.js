const https = require('https');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, 'sample_page.html');
https.get('https://www.hooktheory.com/theorytab/view/adele/hello', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
  let d = '';
  r.on('data', (c) => { d += c; });
  r.on('end', () => {
    const idx = d.indexOf('SongMetrics');
    console.log('SongMetrics idx', idx);
    const block = d.slice(idx, idx + 8000);
    fs.writeFileSync(out, block);
    const scores = [...block.matchAll(/(\d+\.\d{1,2})<\/div>/g)].map((m) => m[1]);
    console.log('decimal scores', scores);
    const tiles = [...block.matchAll(/tile:\s*(\d+)\/100/gi)].map((m) => m[1]);
    console.log('tiles', tiles);
  });
});
