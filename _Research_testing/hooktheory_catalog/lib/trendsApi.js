/**
 * Hooktheory Trends API client (authenticated).
 * POST users/auth → activkey → Bearer token
 */

const fs = require('fs');
const path = require('path');
const { fetchJson, fetchWithRetry } = require('./api/hooktheoryApi');

const API_BASE = 'https://api.hooktheory.com/v1';
const AUTH_CACHE = path.join(__dirname, '.hooktheory_auth.json');
const AUTH_TTL_MS = 23 * 60 * 60 * 1000;

function loadCachedAuth() {
  if (!fs.existsSync(AUTH_CACHE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(AUTH_CACHE, 'utf8'));
    const age = Date.now() - new Date(data.authenticatedAt).getTime();
    if (data.activkey && age < AUTH_TTL_MS) return data.activkey;
  } catch (_) {}
  return null;
}

function saveAuth(activkey, username) {
  fs.writeFileSync(AUTH_CACHE, JSON.stringify({
    activkey,
    username,
    authenticatedAt: new Date().toISOString(),
  }, null, 2));
}

async function auth(username, password) {
  const res = await fetchWithRetry(`${API_BASE}/users/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = JSON.parse(res.body);
  if (!json.activkey) throw new Error('Auth failed: no activkey in response');
  saveAuth(json.activkey, json.username || username);
  return json.activkey;
}

async function getActivkey() {
  const cached = loadCachedAuth();
  if (cached) return cached;
  const user = process.env.HOOKTHEORY_USERNAME;
  const pass = process.env.HOOKTHEORY_PASSWORD;
  if (!user || !pass) {
    throw new Error('Set HOOKTHEORY_USERNAME and HOOKTHEORY_PASSWORD or run auth()');
  }
  return auth(user, pass);
}

async function trendsGet(pathSuffix, params = {}) {
  const activkey = await getActivkey();
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/${pathSuffix}${qs ? `?${qs}` : ''}`;
  const { status, json } = await fetchJson(url, {
    headers: { Authorization: `Bearer ${activkey}` },
  });
  if (status >= 400) throw new Error(`Trends API ${status}: ${pathSuffix}`);
  return json;
}

async function trendsSongs(cp, page = 1) {
  return trendsGet('trends/songs', { cp, page: String(page) });
}

async function trendsNodes(cp = '') {
  return trendsGet('trends/nodes', cp ? { cp } : {});
}

module.exports = {
  auth,
  getActivkey,
  trendsSongs,
  trendsNodes,
  AUTH_CACHE,
};
