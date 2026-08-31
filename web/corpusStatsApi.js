const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { getCatalogDir } = require('../lib/dataRoot.js');

let rawCache = null;
let gzipCache = null;

function corpusStatsPath() {
  return path.join(getCatalogDir(), 'corpus_stats.json');
}

function handleCorpusStats(req, res) {
  const filePath = corpusStatsPath();
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'corpus stats not built' }));
    return;
  }

  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (!rawCache || rawCache.mtime !== mtime) {
      const buf = fs.readFileSync(filePath);
      rawCache = { mtime, buf };
      gzipCache = { mtime, buf: zlib.gzipSync(buf) };
    }

    const accept = req.headers['accept-encoding'] || '';
    if (accept.includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
      });
      res.end(gzipCache.buf);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(rawCache.buf);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = { handleCorpusStats };
