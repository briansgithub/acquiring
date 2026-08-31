/**
 * Fetch wave manifest — signals when a wave is ready for engine fixes.
 */

const fs = require('fs');
const { dataPath } = require('./paths');

const WAVE_MANIFEST = dataPath('fetch_waves.json');
const FIX_PAUSE_FILE = dataPath('.fetch_pause_for_fix');

const DEFAULT_MANIFEST = { waves: [], activeWaveId: null };

function readManifest() {
  if (!fs.existsSync(WAVE_MANIFEST)) return { ...DEFAULT_MANIFEST, waves: [] };
  try {
    return { ...DEFAULT_MANIFEST, ...JSON.parse(fs.readFileSync(WAVE_MANIFEST, 'utf8')) };
  } catch (_) {
    return { ...DEFAULT_MANIFEST, waves: [] };
  }
}

function writeManifest(manifest) {
  fs.writeFileSync(WAVE_MANIFEST, JSON.stringify(manifest, null, 2));
}

function startWave(waveId, { limit } = {}) {
  const manifest = readManifest();
  const wave = {
    id: waveId,
    limit: limit || null,
    startedAt: new Date().toISOString(),
    readyAt: null,
    slugs: [],
    ok: 0,
    fail: 0,
    comparedRows: 0,
    engineFails: null,
    status: 'running',
  };
  manifest.waves.push(wave);
  manifest.activeWaveId = waveId;
  writeManifest(manifest);
  return wave;
}

function appendWaveSlug(waveId, slug, { comparedRows = 0 } = {}) {
  const manifest = readManifest();
  const wave = manifest.waves.find((w) => w.id === waveId);
  if (!wave) return;
  if (!wave.slugs.includes(slug)) wave.slugs.push(slug);
  wave.comparedRows = (wave.comparedRows || 0) + comparedRows;
  writeManifest(manifest);
}

function finishWave(waveId, { ok, fail, engineFails }) {
  const manifest = readManifest();
  const wave = manifest.waves.find((w) => w.id === waveId);
  if (!wave) return;
  wave.ok = ok;
  wave.fail = fail;
  wave.engineFails = engineFails;
  wave.readyAt = new Date().toISOString();
  wave.status = 'ready_for_fix';
  manifest.activeWaveId = null;
  writeManifest(manifest);
  appendLog(`wave ready: ${waveId} ok=${ok} fail=${fail} engineFails=${engineFails}`);
}

function listWavesReadyForFix() {
  return readManifest().waves.filter((w) => w.status === 'ready_for_fix');
}

function listWavesNotAcknowledged() {
  return readManifest().waves.filter((w) => w.status === 'ready_for_fix' && !w.fixAckAt);
}

function ackWaveFix(waveId) {
  const manifest = readManifest();
  const wave = manifest.waves.find((w) => w.id === waveId);
  if (wave) {
    wave.fixAckAt = new Date().toISOString();
    wave.status = 'fix_in_progress';
  }
  writeManifest(manifest);
}

function shouldPauseForFix() {
  return fs.existsSync(FIX_PAUSE_FILE);
}

function appendLog(line) {
  const ts = new Date().toISOString();
  const logFile = dataPath('full_fetch.log');
  fs.appendFileSync(logFile, `[${ts}] ${line}\n`);
}

module.exports = {
  WAVE_MANIFEST,
  FIX_PAUSE_FILE,
  readManifest,
  startWave,
  appendWaveSlug,
  finishWave,
  listWavesReadyForFix,
  listWavesNotAcknowledged,
  ackWaveFix,
  shouldPauseForFix,
};
