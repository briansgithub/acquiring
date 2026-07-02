#!/usr/bin/env node
/**
 * Assert pipeline flags distinguish light catalog vs full Fetch.
 */

const fs = require('fs');
const path = require('path');
const { openDb, upsertSong, setHarvestMode } = require('../lib/db');
const { computeFlags } = require('../lib/pipelineFlags');
const { harvestDirForSlug, harvestFileForSlug } = require('../lib/harvestArtifact');
const { DATA_DIR } = require('../lib/paths');

const SLUG = '__pipeline_flags_test__';

function fail(msg) {
  console.error('FAIL', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('PASS', msg);
}

function main() {
  const db = openDb();
  const url = 'https://www.hooktheory.com/theorytab/view/test/flags-test';
  upsertSong(db, { slug: SLUG, url, title: 'Flags Test', artist: 'Test', status: 'pending' });

  const dir = harvestDirForSlug(SLUG);
  fs.mkdirSync(dir, { recursive: true });
  const scrape = {
    harvestMode: 'light',
    harvestedAt: new Date().toISOString(),
    sections: [{ section_name: 'Verse', json: { chords: [] }, rendered: [] }],
  };
  fs.writeFileSync(harvestFileForSlug(SLUG), JSON.stringify(scrape));
  setHarvestMode(db, SLUG, 'light');
  db.prepare(`
    UPDATE songs SET status = 'enriched', cache_dir = 'test', processed_at = datetime('now')
    WHERE slug = ?
  `).run(SLUG);

  const row = db.prepare('SELECT * FROM songs WHERE slug = ?').get(SLUG);
  const flags = computeFlags(row, SLUG);
  if (!flags.scrapeReady) fail('scrapeReady should be true for light harvest');
  if (flags.harvested) fail('harvested should be false for light-only');
  if (!flags.metadata) fail('metadata should be true when enriched');
  if (!flags.processed) fail('processed should be true when cache_dir set');
  ok('light harvest: Fetch red, scrapeReady true');

  scrape.harvestMode = undefined;
  delete scrape.harvestMode;
  fs.writeFileSync(harvestFileForSlug(SLUG), JSON.stringify(scrape));
  setHarvestMode(db, SLUG, 'full');
  const row2 = db.prepare('SELECT * FROM songs WHERE slug = ?').get(SLUG);
  const flags2 = computeFlags(row2, SLUG);
  if (!flags2.harvested) fail('harvested should be true after full fetch artifact');
  ok('full fetch: harvested true');

  setHarvestMode(db, SLUG, 'full');
  scrape.harvestMode = 'light';
  fs.writeFileSync(harvestFileForSlug(SLUG), JSON.stringify(scrape));
  const row3 = db.prepare('SELECT * FROM songs WHERE slug = ?').get(SLUG);
  const flags3 = computeFlags(row3, SLUG);
  if (!flags3.harvested) fail('harvest_mode full should keep Fetch green even if scrape stale');
  ok('harvest_mode full: harvested true');

  fs.rmSync(dir, { recursive: true, force: true });
  db.prepare('DELETE FROM songs WHERE slug = ?').run(SLUG);
  console.log('pipelineFlagsTest: all passed');
}

main();
