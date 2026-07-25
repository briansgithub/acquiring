/**
 * Progression Results View for rendering interactive section timelines
 * in the #ring-pane area during Progression Matcher search.
 * Features:
 * - Lazy loading 10 song timelines at a time to prevent UI overwhelm.
 * - Full colored & drawn interactive timelines per result section.
 * - Per-card Play/Pause buttons for independent section playback.
 * - Progress tracking on result timelines.
 * - Highlighted match ranges over the progression search sequence.
 */

import { renderTimeline } from "./timeline.js";
import { AudioEngine } from "../audio/engine.js";
import { normalizeToneNotes } from "../lib/chordVoicing.js";
import { chordInterpreter } from "../lib/music.js";

const PAGE_SIZE = 10;
const bundleCache = new Map();

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function fetchSongBundle(slug, sectionType) {
  const cacheKey = `${slug}:${sectionType || ""}`;
  if (bundleCache.has(cacheKey)) return bundleCache.get(cacheKey);

  const libRes = await fetch(`/api/library/song?slug=${encodeURIComponent(slug)}`);
  if (!libRes.ok) throw new Error("Library fetch failed");
  const lib = await libRes.json();
  let song = lib.song || {};

  if (!song.cacheKey) {
    const loadRes = await fetch(`/api/library/load?slug=${encodeURIComponent(slug)}`, { method: "POST" });
    if (loadRes.ok) {
      const loadData = await loadRes.json();
      if (loadData.cacheKey) song.cacheKey = loadData.cacheKey;
    }
  }
  if (!song.cacheKey) throw new Error("Song data not ready");

  const entryRes = await fetch(`/api/songs/entry?key=${encodeURIComponent(song.cacheKey)}`);
  if (!entryRes.ok) throw new Error("Entry fetch failed");
  const entry = await entryRes.json();

  let section = entry.sections?.[0];
  if (sectionType) {
    section = entry.sections?.find((s) => (s.sectionName || "").toLowerCase() === (sectionType || "").toLowerCase()) || section;
  }
  if (!section?.relPath) throw new Error("Section path not found");

  const dataRes = await fetch(`/api/song?file=${encodeURIComponent(section.relPath)}`);
  if (!dataRes.ok) throw new Error("Section JSON fetch failed");
  const data = await dataRes.json();

  const bundle = { song, section, data };
  bundleCache.set(cacheKey, bundle);
  return bundle;
}

export function createProgressionResultsManager(ringPane, options = {}) {
  let isProgressionModeActive = false;
  let allResults = [];
  let renderedCount = 0;
  let activePlayingCard = null; // { cardEl, playBtn, audioEngine, cancelProgress, slug, sectionType }
  let cardPlaybackEngine = new AudioEngine();

  const resultsPane = document.createElement("div");
  resultsPane.id = "progression-results-pane";
  resultsPane.className = "progression-results-pane";
  resultsPane.hidden = true;
  resultsPane.innerHTML = `
    <div class="prv-head">
      <div id="prv-status" class="prv-status">Enter a progression pattern to search across catalog...</div>
    </div>
    <div id="prv-list" class="prv-list"></div>
    <div class="prv-footer">
      <button type="button" id="prv-load-more" class="sel-btn prv-load-more" hidden>Load More Timelines</button>
    </div>
  `;

  ringPane.appendChild(resultsPane);

  const statusEl = resultsPane.querySelector("#prv-status");
  const listEl = resultsPane.querySelector("#prv-list");
  const loadMoreBtn = resultsPane.querySelector("#prv-load-more");

  function deduplicateResults(results) {
    if (!Array.isArray(results)) return [];
    const seen = new Set();
    const unique = [];
    for (const r of results) {
      const key = `${r.slug}:${(r.sectionType || "").toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }
    return unique;
  }

  function enterProgressionMode() {
    isProgressionModeActive = true;
    ringPane.classList.remove("disabled");
    ringPane.style.pointerEvents = "auto";
    ringPane.style.opacity = "1";
    ringPane.style.filter = "none";
    Array.from(ringPane.children).forEach((child) => {
      if (child !== resultsPane) child.style.display = "none";
    });
    resultsPane.hidden = false;
  }

  function exitProgressionMode() {
    isProgressionModeActive = false;
    resultsPane.hidden = true;
    stopCardPlayback();
    ringPane.style.pointerEvents = "";
    ringPane.style.opacity = "";
    ringPane.style.filter = "";
    Array.from(ringPane.children).forEach((child) => {
      if (child !== resultsPane) child.style.display = "";
    });
    clearResults();
  }

  function clearResults() {
    stopCardPlayback();
    allResults = [];
    renderedCount = 0;
    if (listEl) listEl.innerHTML = "";
    if (loadMoreBtn) loadMoreBtn.hidden = true;
    if (statusEl) statusEl.textContent = "Enter a progression pattern to search across catalog...";
  }

  function stopCardPlayback() {
    if (activePlayingCard) {
      try {
        cardPlaybackEngine.stop();
      } catch (_) {}
      if (activePlayingCard.playBtn) {
        activePlayingCard.playBtn.textContent = "▶ Play";
        activePlayingCard.playBtn.classList.remove("is-playing");
      }
      if (activePlayingCard.cancelProgress) {
        activePlayingCard.cancelProgress();
      }
      activePlayingCard = null;
    }
  }

  async function setResults(results, searchMetadata = {}, deps = {}) {
    if (!isProgressionModeActive) enterProgressionMode();

    clearResults();
    allResults = deduplicateResults(results);

    if (allResults.length === 0) {
      statusEl.textContent = "No song sections matched this progression pattern.";
      return;
    }

    const matchCount = searchMetadata.songCount ?? allResults.length;
    statusEl.textContent = `Found ${allResults.length} matching section${allResults.length === 1 ? "" : "s"} across ${matchCount} song${matchCount === 1 ? "" : "s"}`;

    renderNextBatch(deps);
  }

  function renderNextBatch(deps) {
    const startIndex = renderedCount;
    const nextBatch = allResults.slice(startIndex, startIndex + PAGE_SIZE);
    if (!nextBatch.length) {
      if (loadMoreBtn) loadMoreBtn.hidden = true;
      return;
    }

    const { songMeta, onCompare, onPlayResult } = deps;

    nextBatch.forEach((r, batchIdx) => {
      const globalIdx = startIndex + batchIdx;
      const meta = songMeta?.(r.slug) || { title: r.slug, artist: "" };
      const startBeat = r.metadata?.beats?.[0] ?? 1;

      const card = document.createElement("div");
      card.className = "prv-card";
      card.dataset.index = globalIdx;
      card.dataset.slug = r.slug;
      card.dataset.section = r.sectionType;
      card.innerHTML = `
        <div class="prv-card-head">
          <div class="prv-card-title-wrap">
            <span class="prv-card-title">${esc(meta.title)}</span>
            <span class="prv-card-sub">${esc(meta.artist)} · ${esc(r.sectionType)} @ beat ${startBeat}</span>
          </div>
          <div class="prv-card-actions">
            <button type="button" class="sel-btn prv-btn-play">▶ Play</button>
            <button type="button" class="sel-btn prv-btn-compare">Compare</button>
          </div>
        </div>
        <div class="prv-card-timeline-wrap">
          <div class="prv-loading-skel">Loading timeline...</div>
        </div>
      `;

      listEl.appendChild(card);

      const timelineWrap = card.querySelector(".prv-card-timeline-wrap");
      const playBtn = card.querySelector(".prv-btn-play");
      const compareBtn = card.querySelector(".prv-btn-compare");

      // Per-card Play/Pause button
      playBtn.addEventListener("click", async () => {
        if (activePlayingCard?.cardEl === card) {
          stopCardPlayback();
          return;
        }

        stopCardPlayback();
        playBtn.textContent = "⏳ Loading…";
        playBtn.disabled = true;

        try {
          const bundle = await fetchSongBundle(r.slug, r.sectionType);
          const chords = bundle.data.chords || bundle.data.mainData || [];
          const keys = bundle.data.metadata?.keys || [bundle.data.key || { tonic: "C", scale: "major" }];
          const fallbackKey = keys[0] || { tonic: "C", scale: "major" };

          // Build chord events for playback
          const chordEvents = chords.filter((c) => !c.isRest).map((c) => {
            const beat = c.beat === 0 ? 1 : c.beat;
            const time = (beat - 1) * 192;
            const interpreted = chordInterpreter(c, fallbackKey);
            const notes = normalizeToneNotes(interpreted.notes || []);
            return { time, notes, duration: c.duration || 4 };
          });

          playBtn.disabled = false;
          playBtn.textContent = "⏸ Pause";
          playBtn.classList.add("is-playing");

          await cardPlaybackEngine.setupTransport(120);
          cardPlaybackEngine.scheduleChords(chordEvents);
          await cardPlaybackEngine.play();

          // Progress line updates on card timeline canvas
          let progressAnim = null;
          const endBeat = bundle.data.metadata?.endBeat || 16;
          const totalTicks = endBeat * 192;

          const updateProgress = () => {
            if (!activePlayingCard || activePlayingCard.cardEl !== card) return;
            const windowTone = window.Tone;
            if (windowTone && windowTone.Transport) {
              const currentTicks = windowTone.Transport.ticks;
              const ratio = Math.min(1, Math.max(0, currentTicks / totalTicks));
              if (card._tlInstance) {
                card._tlInstance.updateProgress(ratio);
              }
              if (ratio >= 1) {
                stopCardPlayback();
                return;
              }
            }
            progressAnim = requestAnimationFrame(updateProgress);
          };
          progressAnim = requestAnimationFrame(updateProgress);

          activePlayingCard = {
            cardEl: card,
            playBtn,
            cancelProgress: () => {
              if (progressAnim) cancelAnimationFrame(progressAnim);
            },
          };
        } catch (err) {
          playBtn.disabled = false;
          playBtn.textContent = "▶ Play";
          console.error("Card playback error:", err);
        }
      });

      compareBtn.addEventListener("click", () => {
        onCompare?.({
          slug: r.slug,
          sectionType: r.sectionType,
          seekBeat: Number(startBeat),
        });
      });

      // Render timeline for card
      loadAndRenderCardTimeline(r, card, timelineWrap);
    });

    renderedCount += nextBatch.length;

    // Update Load More button state
    if (renderedCount < allResults.length) {
      loadMoreBtn.hidden = false;
      loadMoreBtn.textContent = `Load More Timelines (Showing ${renderedCount} of ${allResults.length})`;
    } else {
      loadMoreBtn.hidden = true;
    }
  }

  async function loadAndRenderCardTimeline(result, cardEl, wrapEl) {
    try {
      const bundle = await fetchSongBundle(result.slug, result.sectionType);
      wrapEl.innerHTML = "";

      const tl = renderTimeline(wrapEl, {
        showTitle: false,
        onChordClick: (chord) => {
          // Click on chord rectangle previews audio
          const keys = bundle.data.metadata?.keys || [bundle.data.key || { tonic: "C", scale: "major" }];
          const fallbackKey = keys[0] || { tonic: "C", scale: "major" };
          const chordData = chordInterpreter(chord, fallbackKey);
          const notes = normalizeToneNotes(chordData.notes || []);
          if (notes.length) {
            cardPlaybackEngine.previewChord(notes, "4n", false, 100);
          }
        },
      });

      cardEl._tlInstance = tl;

      const keys = bundle.data.metadata?.keys || [bundle.data.key || { tonic: "C", scale: "major" }];
      const fallbackKey = keys[0] || { tonic: "C", scale: "major" };
      const chords = bundle.data.chords || bundle.data.mainData || [];

      tl.setSongData({
        title: bundle.song.title || result.slug,
        artist: bundle.song.artist || "",
        chords: chords,
        key: fallbackKey,
        songLengthBeats: bundle.data.metadata?.endBeat || 16,
        sectionKeys: keys,
      });

      tl.forceRelayout?.();
      setTimeout(() => tl.forceRelayout?.(), 30);

      // Highlight match range
      if (Array.isArray(result.metadata?.beats) && result.metadata.beats.length >= 1) {
        const beats = result.metadata.beats;
        const start = Math.min(...beats);
        const end = Math.max(...beats) + (result.beatDuration || 4);
        tl.highlightBeatRange(start, end);
      }
    } catch (err) {
      wrapEl.innerHTML = `<div class="prv-timeline-error">Timeline unavailable (${esc(err.message)})</div>`;
    }
  }

  // Load More button click handler
  loadMoreBtn.addEventListener("click", () => {
    renderNextBatch(resultsPane._activeDeps || {});
  });

  return {
    enterProgressionMode,
    exitProgressionMode,
    setResults: (results, searchMetadata, deps) => {
      resultsPane._activeDeps = deps;
      setResults(results, searchMetadata, deps);
    },
    clearResults,
    isModeActive: () => isProgressionModeActive,
  };
}
