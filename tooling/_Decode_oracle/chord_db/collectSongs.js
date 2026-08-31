/**
 * collectSongs.js — discover scrape.json sources, optionally filter by corpus.
 */

const fs = require('fs');
const path = require('path');
const { getHarvestRoot } = require('../../lib/dataRoot');
const { compareSong } = require('../compare');
const { activeKeyAtBeat } = require('../engineRun');
const { slugForUrl } = require('../run');
const { discoverAllScrapeDirs, resolveHarvestDir } = require('../../_Research_testing/hooktheory_catalog/lib/harvestPaths');

const OUT = getHarvestRoot();

function reportIsComplete(report) {
  if (!report?.sections?.length) return false;
  for (const sec of report.sections) {
    for (const row of sec.rows || []) {
      if (row.notesOk === undefined || row.truthPcs === undefined) return false;
    }
  }
  return true;
}

function loadCorpusSlugs(corpusFile) {
  const entries = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  const slugs = new Set();
  for (const e of entries) {
    slugs.add(e.slug || slugForUrl(e.url));
    for (const alt of e.alternates || []) slugs.add(slugForUrl(alt));
  }
  return slugs;
}

function discoverScrapeDirs(opts = {}) {
  const corpusSlugs = opts.corpusFile ? loadCorpusSlugs(opts.corpusFile) : opts.corpusSlugs || null;
  return discoverAllScrapeDirs({ corpusSlugs, fullTruthOnly: opts.fullTruthOnly });
}

async function loadSongCompare({ slug, dir, scrapeFile }, { useReports = false } = {}) {
  const resolvedDir = dir || resolveHarvestDir(slug);
  const resolvedFile = scrapeFile || path.join(resolvedDir, 'scrape.json');
  const scrape = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
  const reportFile = path.join(resolvedDir, 'report.json');
  let compareResult = null;
  if (useReports && fs.existsSync(reportFile)) {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    if (reportIsComplete(report)) compareResult = report;
  }
  if (!compareResult) compareResult = await compareSong(scrape);
  return { slug, scrape, compareResult, dir: resolvedDir, scrapeFile: resolvedFile };
}

function enrichRowsWithKeys(slug, scrape, compareResult) {
  const out = [];
  compareResult.sections.forEach((sec, si) => {
    const json = (scrape.sections[si]?.json) || {};
    const keys = (json.metadata && json.metadata.keys) || [];
    for (const row of sec.rows) {
      const key = activeKeyAtBeat(keys, row.beat ?? 1);
      out.push({
        row,
        ctx: { song: slug, section: sec.name, countMatch: sec.countMatch, key },
      });
    }
  });
  return out;
}

module.exports = {
  OUT,
  discoverScrapeDirs,
  loadSongCompare,
  enrichRowsWithKeys,
  reportIsComplete,
  loadCorpusSlugs,
};
