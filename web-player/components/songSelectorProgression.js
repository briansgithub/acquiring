/**
 * Progression search UI for Song Selector.
 * Integrates Graphical Progression Builder for visual chord construction & reordering.
 */

import { renderGraphicalProgressionBuilder } from "./graphicalProgressionBuilder.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const SECTION_OPTIONS = [
  "", "Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Outro", "Instrumental",
];

export function renderProgressionSearch(body, deps) {
  const {
    songs,
    esc: escFn = esc,
    onBack,
    onPlayResult,
    onCompare,
    onProgressionResults,
  } = deps;

  body.innerHTML = `
    <div class="sel-prog-search">
      <div id="sel-gpb-container" class="sel-gpb-container"></div>

      <div class="sel-field">
        <label class="sel-label" for="sel-prog-mode">Search mode</label>
        <select id="sel-prog-mode" class="sel-select">
          <option value="functional">Functional (I, V/V, …)</option>
          <option value="pitch_class">Pitch class offset</option>
        </select>
      </div>

      <div class="sel-field sel-prog-row">
        <div>
          <label class="sel-label" for="sel-prog-length">Length</label>
          <input id="sel-prog-length" class="sel-input" type="number" min="1" max="32" placeholder="auto" />
        </div>
        <div>
          <label class="sel-label" for="sel-prog-section">Section</label>
          <select id="sel-prog-section" class="sel-select">
            ${SECTION_OPTIONS.map((s) => `<option value="${escFn(s)}">${s || "Any"}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="sel-field">
        <label class="sel-label" for="sel-prog-beat">Min chord duration (beats)</label>
        <input id="sel-prog-beat" class="sel-input" type="number" min="0" max="8" step="0.25" value="0" />
      </div>

      <div class="sel-field">
        <span class="sel-label">Chord filters</span>
        <div id="sel-prog-filters" class="sel-prog-filters">
          <label><input type="checkbox" value="minorTriads" /> Minor</label>
          <label><input type="checkbox" value="sevenths" /> 7ths</label>
          <label><input type="checkbox" value="inversions" /> Inv.</label>
          <label><input type="checkbox" value="suspended" /> Sus</label>
          <label><input type="checkbox" value="altered" /> Alt</label>
          <label><input type="checkbox" value="hasBorrowed" /> Borrowed</label>
          <label><input type="checkbox" value="hasApplied" /> Applied</label>
        </div>
      </div>

      <button type="button" id="sel-prog-run" class="sel-btn sel-btn-primary">Search Progression</button>
      <div id="sel-prog-status" class="sel-hint"></div>
    </div>
  `;

  const gpbContainer = body.querySelector("#sel-gpb-container");
  const modeEl = body.querySelector("#sel-prog-mode");
  const lenEl = body.querySelector("#sel-prog-length");
  const sectionEl = body.querySelector("#sel-prog-section");
  const beatEl = body.querySelector("#sel-prog-beat");
  const statusEl = body.querySelector("#sel-prog-status");
  const runBtn = body.querySelector("#sel-prog-run");

  // Instantiate Graphical Progression Builder
  const gpb = renderGraphicalProgressionBuilder(gpbContainer, {
    initialChords: ["I", "V", "vi", "IV"],
    onChange: (tokens) => {
      if (tokens.length) {
        statusEl.textContent = `${tokens.length} chord pattern: ${tokens.join(" → ")}`;
      } else {
        statusEl.textContent = "Click palette chords to build progression.";
      }
    },
  });

  function songMeta(slug) {
    return songs.find((s) => s.slug === slug) || { title: slug, artist: "" };
  }

  async function runSearch() {
    const tokens = gpb.getSequenceTokens();
    if (!tokens.length) {
      statusEl.textContent = "Select at least one chord from palette to search.";
      return;
    }
    const length = lenEl.value ? Number(lenEl.value) : tokens.length;
    const filters = [...body.querySelectorAll("#sel-prog-filters input:checked")].map((el) => el.value);
    const params = new URLSearchParams({
      mode: modeEl.value,
      sequence: tokens.join("|"),
      length: String(length),
      beatThreshold: beatEl.value || "0",
      limit: "50",
    });
    if (sectionEl.value) params.set("sectionType", sectionEl.value);
    if (filters.length) params.set("filter", filters.join(","));

    statusEl.textContent = "Searching progression index…";
    runBtn.disabled = true;
    try {
      const res = await fetch(`/api/progression/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const results = data.results || [];
      statusEl.textContent = `${results.length} matches found (results displayed in main pane)`;

      // Pass results to #ring-pane results manager
      onProgressionResults?.(results, data, {
        songMeta,
        onPlayResult,
        onCompare,
      });
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    } finally {
      runBtn.disabled = false;
    }
  }

  runBtn.addEventListener("click", runSearch);

  return { runSearch, gpb };
}

export function showProgressionView(deps) {
  const { body, showSongNav, setUrlFooterVisible, onEnterProgressionMode } = deps;
  setUrlFooterVisible?.(false);
  showSongNav?.({ showBack: false, mode: "progression" });
  onEnterProgressionMode?.();
  return renderProgressionSearch(body, deps);
}
