/**
 * Song Selector panel: catalog browse + pipeline actions.
 * Songs with a complete pipeline auto-load into the player on detail view.
 */

import {
  buildSongDetailHtml,
  isPipelineComplete,
  pipelineMissing,
  wirePipelineButtons,
} from "./songSelectorPipeline.js";

const MIN_CHARS = 3;
const MAX_SUGGESTIONS = 10;
const DEBOUNCE_MS = 120;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function loadTooltip(missing) {
  if (!missing?.length) {
    return "Load into player — updates chord ring, timeline, and audio";
  }
  const labels = {
    catalogued: "catalogue",
    harvested: "fetch",
    metadata: "metadata enrich",
    processed: "section extract",
    tested: "oracle test",
  };
  return `Load blocked — needs: ${missing.map((m) => labels[m] || m).join(", ")}`;
}

function catalogModalHtml() {
  return `
    <div class="sel-catalog-backdrop" data-close-catalog></div>
    <div class="sel-catalog-dialog" role="dialog" aria-labelledby="sel-catalog-title">
      <div class="sel-catalog-header">
        <h3 id="sel-catalog-title" class="sel-catalog-title">Light catalog</h3>
        <span id="sel-light-scrape-badge" class="sel-light-scrape-badge" hidden></span>
        <button id="sel-catalog-close" type="button" class="sel-catalog-close" aria-label="Close">×</button>
      </div>
      <div class="sel-catalog-body">
        <p id="sel-batch-mode-hint" class="sel-batch-note"></p>
        <label class="sel-label" for="sel-batch-mode">Mode</label>
        <select id="sel-batch-mode" class="sel-select sel-batch-mode">
          <option value="db-only" selected>Database only — harvest catalog songs</option>
          <option value="discover-harvest">Discover new + harvest (limited)</option>
          <option value="full">Full discover + harvest all pending</option>
        </select>
        <div id="sel-batch-limit-wrap" class="sel-batch-limit-wrap">
          <label class="sel-batch-limit-label" for="sel-batch-limit">Harvest limit</label>
          <input id="sel-batch-limit" class="sel-input sel-batch-limit" type="number" min="1" max="5000" value="50" />
        </div>
        <div id="sel-batch-panel" class="sel-batch-panel">
          <div id="sel-batch-status" class="sel-batch-status">Idle</div>
          <div class="sel-batch-bar-wrap" hidden>
            <div id="sel-batch-bar" class="sel-batch-bar"></div>
          </div>
          <div id="sel-batch-detail" class="sel-batch-detail"></div>
          <pre id="sel-batch-log" class="sel-batch-log">No log yet.</pre>
          <div id="sel-batch-actions" class="sel-batch-actions">
            <button type="button" id="sel-batch-start" class="sel-batch-btn sel-batch-btn--start">Start</button>
            <button type="button" id="sel-batch-pause" class="sel-batch-btn" hidden>Pause</button>
            <button type="button" id="sel-batch-resume" class="sel-batch-btn" hidden>Resume</button>
            <button type="button" id="sel-batch-cancel" class="sel-batch-btn sel-batch-btn--danger" hidden>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderSongSelector(container, options = {}) {
  container.innerHTML = `
    <div class="selector-head">
      <h2 style="margin:0;">Song Selector</h2>
      <button id="sel-catalog-open" type="button" class="sel-catalog-open" hidden>
        Light catalog
        <span id="sel-catalog-open-badge" class="sel-light-scrape-badge" hidden></span>
      </button>
    </div>
    <div id="sel-song-nav" class="sel-song-nav" hidden>
      <div class="sel-song-nav-top">
        <div class="sel-song-nav-sort-wrap">
          <label class="sel-label" for="sel-nav-playable-sort">Sort by</label>
          <select id="sel-nav-playable-sort" class="sel-select sel-playable-sort">
            <option value="complexity" selected>Complexity</option>
            <option value="alphabetical">Alphabetically</option>
            <option value="artist">Artist</option>
          </select>
        </div>
        <button id="sel-back" type="button" class="sel-back" hidden>Back</button>
      </div>
      <div class="sel-song-nav-picker">
        <select id="sel-nav-playable-select" class="sel-select sel-playable-select" aria-label="Playable songs">
          <option value="">Select a song…</option>
        </select>
      </div>
    </div>
    <div id="sel-catalog-modal" class="sel-catalog-modal" hidden>
      ${catalogModalHtml()}
    </div>
    <div id="sel-body" class="selector-body"></div>
  `;

  const body = container.querySelector("#sel-body");
  const songNav = container.querySelector("#sel-song-nav");
  const backBtn = container.querySelector("#sel-back");
  const catalogOpenBtn = container.querySelector("#sel-catalog-open");
  const catalogModal = container.querySelector("#sel-catalog-modal");
  const navPlayableSelect = container.querySelector("#sel-nav-playable-select");
  const navPlayableSort = container.querySelector("#sel-nav-playable-sort");

  // Client-side index from unified library API
  let songs = [];          // [{slug, artist, title, flags, playable, cacheKey, _t, _a}]
  let artists = [];        // [{name, _n}]
  let loaded = false;
  let loadError = null;

  backBtn.addEventListener("click", () => showSearch());

  function setCatalogButtonVisible(visible) {
    if (catalogOpenBtn) catalogOpenBtn.hidden = !visible;
  }

  function openCatalogModal() {
    if (!catalogModal) return;
    catalogModal.hidden = false;
  }

  function closeCatalogModal() {
    if (!catalogModal) return;
    catalogModal.hidden = true;
  }

  function showSongNav({ activeSlug = null, showBack = false } = {}) {
    if (!songNav) return;
    songNav.hidden = false;
    if (navPlayableSort) navPlayableSort.value = playableSortMode;
    if (backBtn) backBtn.hidden = !showBack;
    refreshPlayableDropdown(activeSlug);
  }

  navPlayableSort?.addEventListener("change", () => {
    playableSortMode = navPlayableSort.value;
    refreshPlayableDropdown(navPlayableSelect?.value || null);
  });

  navPlayableSelect?.addEventListener("change", () => {
    const slug = navPlayableSelect.value;
    if (!slug) return;
    showSongDetail(slug);
  });

  async function loadIndex() {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          res.status === 404
            ? "Library API not found — start the player with: node web-player/server.js"
            : `HTTP ${res.status}: ${text.slice(0, 80)}`,
        );
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      songs = (data.songs || []).map((s) => ({
        ...s,
        _t: (s.title || "").toLowerCase(),
        _a: (s.artist || "").toLowerCase(),
      }));
      const seen = new Map();
      for (const s of songs) {
        const name = s.artist || "";
        if (!name) continue;
        const key = name.toLowerCase();
        if (!seen.has(key)) seen.set(key, { name, _n: key });
      }
      artists = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
      loaded = true;
      loadError = null;
    } catch (err) {
      loadError = err.message;
      loaded = false;
    }
  }

  function updateHint(hintEl) {
    if (!hintEl) return;
    if (loadError) {
      hintEl.innerHTML = `${esc(loadError)} <button type="button" class="sel-retry">Retry</button>`;
      hintEl.querySelector(".sel-retry")?.addEventListener("click", () => {
        loadIndex().then(() => {
          updateHint(hintEl);
          if (loaded) runAllSearches();
        });
      });
      return;
    }
    if (!loaded) {
      hintEl.textContent = "Loading catalog…";
      return;
    }
    hintEl.textContent = `${songs.length} songs · ${artists.length} artists · ${songs.filter((s) => s.playable).length} playable`;
    refreshPlayableDropdown();
  }

  let runAllSearches = () => {};
  let batchPollTimer = null;

  function stopBatchPoll() {
    if (batchPollTimer) {
      clearInterval(batchPollTimer);
      batchPollTimer = null;
    }
  }

  function startBatchPoll() {
    if (!batchPollTimer) {
      batchPollTimer = setInterval(refreshBatchPanel, 2000);
    }
  }

  async function refreshBatchPanel() {
    const panel = catalogModal?.querySelector("#sel-batch-panel");
    if (!panel) return;
    try {
      const res = await fetch("/api/library/catalog/batch/status");
      const data = await res.json();
      if (!res.ok) return;

      const active = Boolean(data.jobActive ?? data.running);

      const statusEl = panel.querySelector("#sel-batch-status");
      const detailEl = panel.querySelector("#sel-batch-detail");
      const logEl = panel.querySelector("#sel-batch-log");
      const barWrap = panel.querySelector(".sel-batch-bar-wrap");
      const barEl = panel.querySelector("#sel-batch-bar");
      const pauseBtn = panel.querySelector("#sel-batch-pause");
      const resumeBtn = panel.querySelector("#sel-batch-resume");
      const cancelBtn = panel.querySelector("#sel-batch-cancel");
      const startBtn = panel.querySelector("#sel-batch-start");
      const modeSel = catalogModal.querySelector("#sel-batch-mode");
      const limitInput = catalogModal.querySelector("#sel-batch-limit");
      const scrapeBadge = catalogModal.querySelector("#sel-light-scrape-badge");
      const openBadge = container.querySelector("#sel-catalog-open-badge");
      const queue = data.queue_remaining ?? 0;
      const harvested = data.songs_harvested_session ?? 0;
      const failed = data.songs_failed_session ?? 0;
      const discovered = data.songs_discovered_session ?? 0;
      const total = harvested + failed + queue;
      const pct = total > 0 ? Math.round((harvested / Math.max(total, 1)) * 100) : 0;

      if (active) {
        const modeLabel = data.runModeLabel || data.run_mode || "running";
        const phase = data.phase || "starting";
        statusEl.textContent = `${modeLabel} — ${phase}: ${harvested} harvested, ${failed} failed, ${queue} queued`;
        detailEl.textContent = data.current_slug
          ? `Current: ${data.current_slug}${data.paused ? " (paused)" : ""}`
          : (discovered > 0 ? `${discovered} discovered this session` : (phase === "starting" ? "Worker starting…" : ""));
        barWrap.hidden = false;
        barEl.style.width = `${pct}%`;
        if (startBtn) startBtn.hidden = true;
        if (pauseBtn) pauseBtn.hidden = data.paused;
        if (resumeBtn) resumeBtn.hidden = !data.paused;
        if (cancelBtn) cancelBtn.hidden = false;
      } else {
        statusEl.textContent = queue > 0
          ? `Idle — ${queue} song(s) in catalog need light harvest`
          : "Idle — catalog up to date for light harvest";
        detailEl.textContent = data.last_error ? `Last error: ${data.last_error}` : "";
        barWrap.hidden = true;
        if (startBtn) startBtn.hidden = false;
        if (pauseBtn) pauseBtn.hidden = true;
        if (resumeBtn) resumeBtn.hidden = true;
        if (cancelBtn) cancelBtn.hidden = true;
      }

      const badgeText = active
        ? (data.paused ? "Paused" : (data.phase || "Running"))
        : (queue > 0 ? `${queue} pending` : "");
      const showBadge = Boolean(badgeText);
      for (const badge of [scrapeBadge, openBadge]) {
        if (!badge) continue;
        badge.hidden = !showBadge;
        if (showBadge) badge.textContent = badgeText;
      }
      if (active && catalogModal?.hidden) openCatalogModal();

      if (logEl && Array.isArray(data.logTail)) {
        logEl.textContent = data.logTail.join("\n") || "No log yet.";
        logEl.scrollTop = logEl.scrollHeight;
      }

      const formDisabled = active;
      if (startBtn) startBtn.disabled = formDisabled;
      if (modeSel) modeSel.disabled = formDisabled;
      if (limitInput) limitInput.disabled = formDisabled;

      if (active && !batchPollTimer) {
        startBatchPoll();
      }
      if (!active && batchPollTimer) {
        stopBatchPoll();
        await loadIndex();
        updateHint(body.querySelector("#sel-hint"));
        refreshPlayableDropdown();
      }
    } catch (_) {
      /* ignore poll errors */
    }
  }

  function updateBatchModeHint(root) {
    const mode = root.querySelector("#sel-batch-mode")?.value || "db-only";
    const hint = root.querySelector("#sel-batch-mode-hint");
    const limitWrap = root.querySelector("#sel-batch-limit-wrap");
    if (!hint) return;
    if (mode === "db-only") {
      hint.textContent = "Harvest songs already in the catalog DB (no Meili discover). API-only, rate-limited.";
      if (limitWrap) limitWrap.hidden = false;
    } else if (mode === "discover-harvest") {
      hint.textContent = "Discover new songs via Meili (limited pages), then light-harvest up to the limit.";
      if (limitWrap) limitWrap.hidden = false;
    } else {
      hint.textContent = "Full Meili discover + harvest all pending songs. Long-running — confirm before start.";
      if (limitWrap) limitWrap.hidden = true;
    }
  }

  function wireCatalogBatch(root) {
    const startBtn = root.querySelector("#sel-batch-start");
    const modeSel = root.querySelector("#sel-batch-mode");
    const limitInput = root.querySelector("#sel-batch-limit");
    const pauseBtn = root.querySelector("#sel-batch-pause");
    const resumeBtn = root.querySelector("#sel-batch-resume");
    const cancelBtn = root.querySelector("#sel-batch-cancel");
    const statusEl = root.querySelector("#sel-batch-status");

    modeSel?.addEventListener("change", () => updateBatchModeHint(root));
    updateBatchModeHint(root);

    startBtn?.addEventListener("click", async () => {
      const mode = modeSel?.value || "db-only";
      const limit = Math.max(1, Math.min(5000, Number(limitInput?.value) || 50));
      if (mode === "full") {
        const ok = window.confirm(
          "Full light catalog: discover all Meili pages and harvest every pending song.\n\nThis can run for hours. Continue?"
        );
        if (!ok) return;
      }
      startBtn.disabled = true;
      if (statusEl) statusEl.textContent = "Starting…";
      startBatchPoll();
      try {
        const qs = new URLSearchParams({ mode, limit: String(limit) });
        const res = await fetch(`/api/library/catalog/batch/start?${qs}`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message;
        startBtn.disabled = false;
        stopBatchPoll();
        return;
      }
      refreshBatchPanel();
    });

    pauseBtn?.addEventListener("click", async () => {
      await fetch("/api/library/catalog/batch/pause", { method: "POST" });
      refreshBatchPanel();
    });
    resumeBtn?.addEventListener("click", async () => {
      await fetch("/api/library/catalog/batch/resume", { method: "POST" });
      refreshBatchPanel();
    });
    cancelBtn?.addEventListener("click", async () => {
      if (!window.confirm("Cancel the running light catalog job?")) return;
      await fetch("/api/library/catalog/batch/cancel", { method: "POST" });
      refreshBatchPanel();
    });

    refreshBatchPanel();
  }

  function matchSongs(q) {
    const needle = q.toLowerCase();
    const out = [];
    for (const s of songs) {
      if (s._t.includes(needle) || s._a.includes(needle)) {
        out.push(s);
        if (out.length >= MAX_SUGGESTIONS) break;
      }
    }
    return out;
  }

  let playableSortMode = "complexity";

  function getPlayableSortMode() {
    return navPlayableSort?.value || playableSortMode;
  }

  function formatSongLabel(s, sortBy) {
    const title = s.title || "(untitled)";
    const artist = s.artist || "";
    if (sortBy === "complexity") {
      const c = s.complexity_rating != null
        ? Number(s.complexity_rating).toFixed(1)
        : "—";
      return `${c} — ${title} — ${artist}`;
    }
    return artist ? `${title} — ${artist}` : title;
  }

  function playableSongsSorted(sortBy = getPlayableSortMode()) {
    const list = songs.filter((s) => s.playable && s.cacheKey);
    const cmpTitle = (a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
    const cmpArtist = (a, b) => (a.artist || "").localeCompare(b.artist || "", undefined, { sensitivity: "base" });

    if (sortBy === "complexity") {
      return list.sort((a, b) => {
        const ca = a.complexity_rating;
        const cb = b.complexity_rating;
        const aMissing = ca == null;
        const bMissing = cb == null;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (!aMissing && cb !== ca) return ca - cb;
        const byTitle = cmpTitle(a, b);
        if (byTitle !== 0) return byTitle;
        return cmpArtist(a, b);
      });
    }
    if (sortBy === "artist") {
      return list.sort((a, b) => {
        const byArtist = cmpArtist(a, b);
        if (byArtist !== 0) return byArtist;
        return cmpTitle(a, b);
      });
    }
    return list.sort((a, b) => {
      const byTitle = cmpTitle(a, b);
      if (byTitle !== 0) return byTitle;
      return cmpArtist(a, b);
    });
  }

  function refreshPlayableDropdown(activeSlug = null) {
    const sortBy = getPlayableSortMode();
    const playable = playableSongsSorted(sortBy);
    const optionsHtml = [
      '<option value="">Select a song…</option>',
      ...playable.map((s) => `<option value="${esc(s.slug)}">${esc(formatSongLabel(s, sortBy))}</option>`),
    ].join("");

    for (const sel of container.querySelectorAll(".sel-playable-select")) {
      sel.innerHTML = optionsHtml;
      if (activeSlug && sel.closest("#sel-song-nav")) {
        sel.value = activeSlug;
      }
    }
  }

  function matchArtists(q) {
    const needle = q.toLowerCase();
    const out = [];
    for (const a of artists) {
      if (a._n.includes(needle)) {
        out.push(a);
        if (out.length >= MAX_SUGGESTIONS) break;
      }
    }
    return out;
  }

  // ---- Search view ----
  function showSearch() {
    setCatalogButtonVisible(true);
    showSongNav({ showBack: false });
    body.innerHTML = `
      <div class="sel-field">
        <label class="sel-label" for="sel-url-input">Add song by URL</label>
        <div class="sel-url-example">https://www.hooktheory.com/theorytab/view/artist/song</div>
        <div class="sel-url-row">
          <input id="sel-url-input" class="sel-input" type="url"
            autocomplete="off" spellcheck="false" />
          <button id="sel-url-add" class="sel-url-add" type="button">Add</button>
        </div>
        <div id="sel-url-status" class="sel-hint"></div>
      </div>
      <div class="sel-field">
        <label class="sel-label" for="sel-song-input">Search by song</label>
        <div class="autocomplete">
          <input id="sel-song-input" class="sel-input" type="text"
            placeholder="Type 3+ letters…" autocomplete="off" spellcheck="false" />
          <div id="sel-song-drop" class="autocomplete-drop" hidden></div>
        </div>
      </div>
      <div class="sel-field">
        <label class="sel-label" for="sel-artist-input">Search by artist</label>
        <div class="autocomplete">
          <input id="sel-artist-input" class="sel-input" type="text"
            placeholder="Type 3+ letters…" autocomplete="off" spellcheck="false" />
          <div id="sel-artist-drop" class="autocomplete-drop" hidden></div>
        </div>
      </div>
      <div id="sel-hint" class="sel-hint"></div>
    `;

    const songInput = body.querySelector("#sel-song-input");
    const songDrop = body.querySelector("#sel-song-drop");
    const artistInput = body.querySelector("#sel-artist-input");
    const artistDrop = body.querySelector("#sel-artist-drop");
    const hint = body.querySelector("#sel-hint");
    const urlInput = body.querySelector("#sel-url-input");
    const urlAddBtn = body.querySelector("#sel-url-add");
    const urlStatus = body.querySelector("#sel-url-status");

    updateHint(hint);
    wireAddUrl(urlInput, urlAddBtn, urlStatus);

    const songRun = wireSongInput(songInput, songDrop);
    const artistRun = wireArtistInput(artistInput, artistDrop);
    runAllSearches = () => {
      songRun();
      artistRun();
    };
  }

  function closeDrop(drop) {
    drop.hidden = true;
    drop.innerHTML = "";
  }

  async function pollAddJob(jobId) {
    for (;;) {
      const res = await fetch(`/api/library/pipeline/job?id=${encodeURIComponent(jobId)}`);
      const job = await res.json();
      if (!res.ok) throw new Error(job.error || `HTTP ${res.status}`);
      if (job.status === "running") {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return job;
    }
  }

  function wireAddUrl(input, addBtn, statusEl) {
    const setStatus = (msg) => {
      if (statusEl) statusEl.textContent = msg || "";
    };

    const run = async () => {
      const url = input.value.trim();
      if (!url) {
        setStatus("Paste a Hooktheory TheoryTab URL");
        return;
      }
      addBtn.disabled = true;
      input.disabled = true;
      setStatus("Adding — catalog + Fetch (one browser pass)…");
      try {
        const res = await fetch("/api/library/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const job = await pollAddJob(data.jobId);
        if (job.status === "error") throw new Error(job.error || "add pipeline failed");
        await loadIndex();
        updateHint(body.querySelector("#sel-hint"));
        setStatus(`Added ${data.slug} — opening detail`);
        input.value = "";
        showSongDetail(data.slug);
      } catch (err) {
        setStatus(err.message);
      } finally {
        addBtn.disabled = false;
        input.disabled = false;
      }
    };

    addBtn.addEventListener("click", run);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        run();
      }
    });
  }

  function wireSongInput(input, drop) {
    const run = debounce(() => {
      const q = input.value.trim();
      if (q.length < MIN_CHARS) return closeDrop(drop);
      if (!loaded) {
        drop.innerHTML = `<div class="autocomplete-empty">Catalog still loading…</div>`;
        drop.hidden = false;
        return;
      }
      const matches = matchSongs(q);
      if (!matches.length) {
        drop.innerHTML = `<div class="autocomplete-empty">No matches</div>`;
        drop.hidden = false;
        return;
      }
      drop.innerHTML = matches.map((s) => `
        <div class="autocomplete-item" data-slug="${esc(s.slug)}">
          <span class="ac-title">${esc(s.title || "(untitled)")}${s.playable ? ' <span class="ac-ready">●</span>' : ""}</span>
          <span class="ac-sub">${esc(s.artist || "")}</span>
        </div>
      `).join("");
      drop.hidden = false;
    }, DEBOUNCE_MS);

    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrop(drop); });
    input.addEventListener("blur", () => setTimeout(() => closeDrop(drop), 200));
    drop.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".autocomplete-item");
      if (!item) return;
      e.preventDefault();
      showSongDetail(item.dataset.slug);
    });
    return run;
  }

  function wireArtistInput(input, drop) {
    const run = debounce(() => {
      const q = input.value.trim();
      if (q.length < MIN_CHARS) return closeDrop(drop);
      if (!loaded) {
        drop.innerHTML = `<div class="autocomplete-empty">Catalog still loading…</div>`;
        drop.hidden = false;
        return;
      }
      const matches = matchArtists(q);
      if (!matches.length) {
        drop.innerHTML = `<div class="autocomplete-empty">No matches</div>`;
        drop.hidden = false;
        return;
      }
      drop.innerHTML = matches.map((a) => `
        <div class="autocomplete-item" data-artist="${esc(a.name)}">
          <span class="ac-title">${esc(a.name)}</span>
        </div>
      `).join("");
      drop.hidden = false;
    }, DEBOUNCE_MS);

    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrop(drop); });
    input.addEventListener("blur", () => setTimeout(() => closeDrop(drop), 200));
    drop.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".autocomplete-item");
      if (!item) return;
      e.preventDefault();
      showArtist(item.dataset.artist);
    });
    return run;
  }

  // ---- Artist view ----
  function showArtist(artistName) {
    setCatalogButtonVisible(false);
    showSongNav({ showBack: false });
    const list = songs
      .filter((s) => (s.artist || "") === artistName)
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    body.innerHTML = `
      <div class="sel-artist-name">${esc(artistName)}</div>
      <div class="sel-sub">${list.length} song${list.length === 1 ? "" : "s"}</div>
      <div id="sel-song-list" class="sel-song-list">
        ${list.map((s) => `
          <a class="song-link" data-slug="${esc(s.slug)}">
            ${esc(s.title || "(untitled)")}
            ${s.playable ? '<span class="song-link-ready">ready</span>' : ""}
            <span class="song-link-status">${esc(s.status || "")}</span>
          </a>
        `).join("")}
      </div>
    `;
    body.querySelector("#sel-song-list").addEventListener("click", (e) => {
      const link = e.target.closest(".song-link");
      if (!link) return;
      showSongDetail(link.dataset.slug);
    });
  }

  // ---- Song detail view ----
  async function loadSongIntoPlayer(slug, { auto = false } = {}) {
    const loadBtn = body.querySelector("#sel-load-btn");
    const statusEl = body.querySelector("#pipeline-status");
    if (loadBtn) {
      loadBtn.disabled = true;
      loadBtn.textContent = "Loading…";
    } else if (auto && statusEl) {
      statusEl.textContent = "Loading into player…";
    }
    try {
      const res = await fetch(`/api/library/load?slug=${encodeURIComponent(slug)}`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      await options.onLoad?.({ slug, cacheKey: payload.cacheKey });
      if (loadBtn) {
        loadBtn.textContent = "Loaded";
        loadBtn.hidden = true;
        loadBtn.closest(".entry-load-row")?.remove();
      } else if (auto && statusEl) {
        statusEl.textContent = "";
      }
    } catch (err) {
      if (loadBtn) {
        loadBtn.disabled = false;
        loadBtn.textContent = "Load";
        loadBtn.title = err.message;
      } else if (statusEl) {
        statusEl.textContent = `Load failed: ${err.message}`;
      }
      throw err;
    }
  }

  async function showSongDetail(slug) {
    setCatalogButtonVisible(false);
    showSongNav({ activeSlug: slug, showBack: false });
    body.innerHTML = `<div class="sel-hint">Loading song…</div>`;
    let data;
    try {
      const res = await fetch(`/api/library/song?slug=${encodeURIComponent(slug)}`);
      data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (err) {
      body.innerHTML = `<div class="sel-hint">Failed to load song: ${esc(err.message)}</div>`;
      return;
    }
    const s = data.song || {};
    const flags = s.flags || {};
    const sections = data.sections || [];
    const canLoad = !!s.canLoad;
    const complete = isPipelineComplete(flags);
    const alreadyLoaded = !!s.cacheKey && options.isSongLoaded?.(s.cacheKey);
    const missing = complete ? (s.loadGateMissing || []) : pipelineMissing(flags);

    body.innerHTML = buildSongDetailHtml(s, sections, flags, canLoad, missing, esc, loadTooltip);
    showSongNav({ activeSlug: slug, showBack: true });

    wirePipelineButtons(body, slug, flags, {
      esc,
      loadTooltip,
      reloadIndex: () => loadIndex(),
      onJobDone: (jobSlug) => showSongDetail(jobSlug),
    });

    const loadBtn = body.querySelector("#sel-load-btn");
    loadBtn?.addEventListener("click", async () => {
      if (!canLoad || loadBtn.disabled) return;
      await loadSongIntoPlayer(slug);
    });

    if (complete && canLoad && !alreadyLoaded) {
      await loadSongIntoPlayer(slug, { auto: true });
    }
  }

  catalogOpenBtn?.addEventListener("click", openCatalogModal);
  catalogModal?.querySelector("#sel-catalog-close")?.addEventListener("click", closeCatalogModal);
  catalogModal?.querySelector("[data-close-catalog]")?.addEventListener("click", closeCatalogModal);
  wireCatalogBatch(catalogModal);

  // init: render once, load index, refresh hint (don't wipe inputs)
  showSearch();
  loadIndex().then(() => {
    updateHint(body.querySelector("#sel-hint"));
    if (loaded) runAllSearches();
  });

  return {
    showSearch,
    showArtist,
    showSongDetail,
    reload: () => loadIndex().then(() => showSearch()),
  };
}
