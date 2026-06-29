/**
 * Phase 0: probe TheoryTab page HTML + network for SongMetrics and songIds.
 *   node _Research_testing/hooktheory_catalog/probeEndpoints.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const OUT = path.join(__dirname, 'probe_results.json');
const TEST_URL = 'https://www.hooktheory.com/theorytab/view/adele/hello';

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    }).on('error', reject);
  });
}

function parseMetricsFromHtml(html) {
  const metrics = {};
  const labels = [
    ['chord_complexity_ht', /Chord Complexity[\s\S]{0,400}?(\d+\.?\d*)\s*<\/div>/i],
    ['melodic_complexity_ht', /Melodic Complexity[\s\S]{0,400}?(\d+\.?\d*)\s*<\/div>/i],
    ['chord_melody_tension_ht', /Chord-Melody Tension[\s\S]{0,400}?(\d+\.?\d*)\s*<\/div>/i],
    ['chord_progression_novelty_ht', /Chord Progression Novelty[\s\S]{0,400}?(\d+\.?\d*)\s*<\/div>/i],
    ['chord_bass_melody_ht', /Chord Bass Melody[\s\S]{0,400}?(\d+\.?\d*)\s*<\/div>/i],
  ];
  for (const [key, re] of labels) {
    const m = html.match(re);
    if (m) metrics[key] = parseFloat(m[1]);
  }

  const advLink = html.match(/advanced-search\?([^"']+)/);
  if (advLink) {
    const qs = advLink[1];
    const pairs = {
      chord_complexity_ht: /chordComplexity=([\d.]+)/,
      melodic_complexity_ht: /melodicComplexity=([\d.]+)/,
      chord_melody_tension_ht: /chordMelodyTension=([\d.]+)/,
      chord_progression_novelty_ht: /chordProgressionNovelty=([\d.]+)/,
      chord_bass_melody_ht: /chordBassMelody=([\d.]+)/,
    };
    for (const [key, re] of Object.entries(pairs)) {
      const m = qs.match(re);
      if (m && !metrics[key]) metrics[key] = parseFloat(m[1]);
    }
  }

  const difficulty = html.match(/difficulty[^>]*>([^<]+)</i)
    || html.match(/Complexity Level[^>]*>([^<]+)</i);
  return { metrics, difficulty_label: difficulty ? difficulty[1].trim() : null };
}

async function probeNetwork(url) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const apiCalls = [];
  page.on('response', async (resp) => {
    const u = resp.url();
    if (!u.includes('hooktheory')) return;
    const entry = { url: u, status: resp.status(), type: resp.request().resourceType() };
    if (u.includes('/v1/songs/public/') || u.includes('metric') || u.includes('search')) {
      try {
        const ct = resp.headers()['content-type'] || '';
        if (ct.includes('json')) entry.body = await resp.json();
        else entry.bodyPreview = (await resp.text()).slice(0, 300);
      } catch (_) {}
      apiCalls.push(entry);
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));

  const songIds = await page.$$eval('a.tb-section-tab', (els) =>
    els.map((e) => e.textContent.trim()).filter((n) => n.toLowerCase() !== 'all sections'),
  );
  const containerIds = await page.$$eval('[id^="tab-"]', (els) =>
    els.map((e) => e.id).filter((id) => id.startsWith('tab-')),
  );

  await browser.close();
  return {
    sectionTabs: songIds,
    containerIds,
    apiCalls: apiCalls.map((c) => ({
      url: c.url,
      status: c.status,
      hasBody: !!c.body,
      songId: (c.url.match(/public\/([A-Za-z0-9_-]+)/) || [])[1] || null,
    })),
    fullApiCalls: apiCalls,
  };
}

async function main() {
  console.log('[probe] fetching HTML for', TEST_URL);
  const { status, html } = await fetchHtml(TEST_URL);
  const htmlMetrics = parseMetricsFromHtml(html);

  console.log('[probe] HTML status', status);
  console.log('[probe] metrics from HTML', htmlMetrics.metrics);

  console.log('[probe] network sniff...');
  const network = await probeNetwork(TEST_URL);

  const results = {
    probedAt: new Date().toISOString(),
    testUrl: TEST_URL,
    htmlMetrics,
    network: {
      sectionTabs: network.sectionTabs,
      containerIds: network.containerIds,
      apiCalls: network.apiCalls,
    },
    conclusions: {
      metricsSource: Object.keys(htmlMetrics.metrics).length ? 'html_parse' : 'unknown',
      songIdSource: 'puppeteer_page_sniff_v1_songs_public',
      searchApiJson: false,
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log('[probe] wrote', OUT);
  console.log('[probe] song API calls:', network.apiCalls.filter((c) => c.url.includes('songs/public')));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
