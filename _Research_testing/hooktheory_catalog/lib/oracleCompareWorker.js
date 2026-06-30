/**
 * Worker thread: compareSong + buildReport from harvest scrape.json path.
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { compareSong } = require('../../../_Decode_oracle/compare');
const { buildReport } = require('../../../_Decode_oracle/report');

const { relFromDataRoot } = require('../../../lib/dataRoot');

async function run() {
  const { scrapePath } = workerData;
  const scrape = JSON.parse(fs.readFileSync(scrapePath, 'utf8'));
  const cmp = await compareSong(scrape);
  const outDir = path.dirname(scrapePath);
  const rep = buildReport(cmp, scrape, outDir);
  const relOut = relFromDataRoot(outDir);
  const summary = {
    total: rep.total,
    notesOk: rep.notesOk,
    romanExact: rep.romanExact,
    romanCore: rep.romanCore,
    discrepancies: rep.discrepancies,
    testedAt: new Date().toISOString(),
    sections: rep.sectionStats || [],
    attributes: rep.attributeStats || [],
  };
  parentPort.postMessage({ ok: true, summary, outDir: relOut });
}

run().catch((err) => {
  parentPort.postMessage({ ok: false, error: err.message });
});
