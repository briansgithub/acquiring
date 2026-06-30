/**
 * Validate TheoryTab URLs and resolve real public API section song IDs.
 * Meilisearch hit.id is NOT a public song ID — page scrape is required.
 */

const { fetchHtml, fetchSongData } = require('./api/hooktheoryApi');
const { isJunkUrl, parseTheoryTabUrl } = require('./catalogUtils');
const { listSectionsForSlug, upsertMeiliSectionStub, setSongStatus } = require('./db');
const { loadTheoryTabPage } = require('./theoryTabSections');

/** Hooktheory public IDs are alphanumeric tokens (e.g. RPxek_wemb_), not Meili row ids. */
function isPublicSongId(songId) {
  const id = String(songId || '').trim();
  if (id.length < 6) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return false;
  if (/^\d+$/.test(id)) return false;
  return /[A-Za-z]/.test(id);
}

function stubsAreValid(sections) {
  return sections.length > 0 && sections.every((s) => isPublicSongId(s.song_id));
}

function clearSectionStubs(db, slug) {
  db.prepare('DELETE FROM song_sections WHERE slug = ?').run(slug);
}

function saveSectionStubs(db, slug, sections) {
  clearSectionStubs(db, slug);
  for (const sec of sections) {
    if (!sec.section_name || !isPublicSongId(sec.song_id)) continue;
    upsertMeiliSectionStub(db, slug, sec.section_name, sec.song_id);
  }
}

async function validateTheoryTabUrl(url) {
  if (!url || !parseTheoryTabUrl(url)) {
    return { ok: false, status: 400, reason: 'invalid TheoryTab URL' };
  }
  if (isJunkUrl(url)) {
    return { ok: false, status: 400, reason: 'junk or test URL' };
  }
  try {
    await fetchHtml(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, status: e.status || 500, reason: e.message };
  }
}

async function probePublicSongId(songId) {
  if (!isPublicSongId(songId)) return false;
  try {
    await fetchSongData(songId);
    return true;
  } catch (_) {
    return false;
  }
}

async function resolveSectionsFromPage(url, browser = null) {
  const { sections } = await loadTheoryTabPage(url, browser);
  return sections.filter((s) => isPublicSongId(s.song_id));
}

/**
 * Ensure song_sections holds valid public API ids (page resolve when missing/stale).
 */
async function ensureSectionsResolved(db, slug, url, { browser = null } = {}) {
  const check = await validateTheoryTabUrl(url);
  if (!check.ok) {
    if (check.status === 404) setSongStatus(db, slug, 'dead', check.reason);
    throw Object.assign(new Error(check.reason), { status: check.status, permanent: true });
  }

  let sections = listSectionsForSlug(db, slug);
  if (stubsAreValid(sections)) {
    const probe = await probePublicSongId(sections[0].song_id);
    if (probe) return sections;
  }

  const resolved = await resolveSectionsFromPage(url, browser);
  if (!resolved.length) {
    throw Object.assign(new Error('no section songIds resolved from page'), { permanent: true });
  }

  saveSectionStubs(db, slug, resolved);
  return listSectionsForSlug(db, slug);
}

module.exports = {
  isPublicSongId,
  stubsAreValid,
  clearSectionStubs,
  saveSectionStubs,
  validateTheoryTabUrl,
  probePublicSongId,
  resolveSectionsFromPage,
  ensureSectionsResolved,
};
