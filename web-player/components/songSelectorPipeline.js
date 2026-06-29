/**
 * Song Selector pipeline buttons: HTML, tooltips, run/clear wiring.
 */

import { attachPipelineButton } from "./pipelineHold.js";

export const PIPELINE_TIPS = {
  metadata: {
    pending: "Click: enrich from TheoryTab (Puppeteer, ~1–2 min)",
    done: "Hold: clear enrich data and reset status to pending",
  },
  processed: {
    pending: "Click: extract sections to .hooktheory_cache/",
    done: "Hold: delete cache folder and clear processed flags",
  },
  tested: {
    pending: "Click: run decode-oracle compare and save report",
    done: "Hold: delete oracle output folder and clear tested flags",
  },
};

export function btnClass(done) {
  return done ? "entry-btn entry-btn--done" : "entry-btn entry-btn--pending";
}

export function pipelineStatusHtml(action, done, esc) {
  const cls = done
    ? "entry-btn entry-btn--done entry-btn--readonly"
    : "entry-btn entry-btn--pending entry-btn--readonly";
  const title = done
    ? "Song is in the catalog DB (automatic)"
    : "Not in catalog — use Add song by URL above";
  return `<span class="${cls}" data-action="${action}" title="${esc(title)}">${action}</span>`;
}

export function pipelineBtnHtml(action, done, esc) {
  const tips = PIPELINE_TIPS[action];
  const title = done ? tips.done : tips.pending;
  return `<button type="button" class="${btnClass(done)} pipeline-action-btn" data-action="${action}" data-done="${done ? "1" : "0"}" title="${esc(title)}">${action}</button>`;
}

function pct(ok, total) {
  if (!total) return null;
  return Math.round((ok / total) * 100);
}

function errPct(ok, total) {
  const p = pct(ok, total);
  return p == null ? null : 100 - p;
}

function rateRow(label, row, esc) {
  const t = row.total || 0;
  if (!t) return "";
  return `<tr>
    <th scope="row">${esc(label)}</th>
    <td>${t}</td>
    <td>${pct(row.romanExact, t)}%</td>
    <td>${errPct(row.romanExact, t)}%</td>
    <td>${pct(row.romanCore, t)}%</td>
    <td>${errPct(row.romanCore, t)}%</td>
    <td>${pct(row.notesOk, t)}%</td>
    <td>${errPct(row.notesOk, t)}%</td>
  </tr>`;
}

function oracleTableHead() {
  return `<thead><tr>
    <th scope="col"></th>
    <th scope="col">chords</th>
    <th scope="col">romanOK</th>
    <th scope="col">roman err</th>
    <th scope="col">coreOK</th>
    <th scope="col">core err</th>
    <th scope="col">notesOK</th>
    <th scope="col">notes err</th>
  </tr></thead>`;
}

export function oracleErrorRateHtml(s, flags, esc) {
  if (!flags?.tested || !s.oracleSummary) return "";
  const sum = s.oracleSummary;
  if (!sum.total) return "";

  const overall = rateRow("Overall", sum, esc);
  const sectionRows = (sum.sections || [])
    .filter((sec) => sec.total > 0)
    .map((sec) => rateRow(sec.name, sec, esc))
    .join("");
  const attrRows = (sum.attributes || [])
    .filter((a) => a.total > 0)
    .map((a) => rateRow(a.key, a, esc))
    .join("");

  const outTip = s.oracleOutDir ? `Oracle output: ${s.oracleOutDir}` : "";
  return `
    <div class="entry-oracle">
      <div class="entry-sub">Oracle error rates</div>
      <div class="entry-oracle-meta">
        ${sum.discrepancies != null ? `<span>${esc(sum.discrepancies)} discrepancies</span>` : ""}
        ${s.oracleOutDir ? `<span class="entry-oracle-path" title="${esc(outTip)}">${esc(s.oracleOutDir)}</span>` : ""}
      </div>
      <div class="oracle-table-wrap">
        <table class="oracle-table">
          ${oracleTableHead()}
          <tbody>${overall}${sectionRows}</tbody>
        </table>
      </div>
      ${attrRows ? `
        <div class="entry-sub entry-sub--minor">By chord attribute</div>
        <div class="oracle-table-wrap">
          <table class="oracle-table oracle-table--attrs">
            ${oracleTableHead()}
            <tbody>${attrRows}</tbody>
          </table>
        </div>
      ` : ""}
    </div>
  `;
}

function detailRow(label, value, esc) {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="entry-row"><span class="entry-key">${esc(label)}</span><span class="entry-val">${esc(value)}</span></div>`;
}

function detailNum(value, digits) {
  if (value === null || value === undefined) return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return digits != null ? n.toFixed(digits) : String(n);
}

export function buildSongDetailHtml(s, sections, flags, canLoad, missing, esc, loadTooltip) {
  const keyStr = [s.primary_key_tonic, s.primary_key_scale].filter(Boolean).join(" ");
  const row = (label, value) => detailRow(label, value, esc);
  const num = detailNum;
  return `
    <div class="entry-title">${esc(s.title || "(untitled)")}</div>
    <div class="entry-artist">${esc(s.artist || "")}</div>
    <div class="entry-btns" aria-label="Pipeline status">
      ${pipelineStatusHtml("catalogued", flags.catalogued, esc)}
      ${pipelineBtnHtml("metadata", flags.metadata, esc)}
      ${pipelineBtnHtml("processed", flags.processed, esc)}
      ${pipelineBtnHtml("tested", flags.tested, esc)}
    </div>
    <div id="pipeline-status" class="pipeline-status"></div>
    <div class="entry-load-row">
      <button id="sel-load-btn" class="sel-load-btn${canLoad ? " sel-load-btn--ready" : " sel-load-btn--blocked"}" type="button"
        ${canLoad ? "" : "disabled"}
        title="${esc(loadTooltip(missing))}">Load</button>
      ${s.playable ? '<span class="entry-playable">ready to play</span>' : ""}
    </div>
    <div class="entry-data">
      ${row("Status", s.status)}
      ${row("Difficulty", s.difficulty_label)}
      ${row("Key", keyStr)}
      ${row("BPM", num(s.bpm, 0))}
      ${row("Time sig", s.time_sig)}
      ${row("Complexity", num(s.complexity_rating, 1))}
      ${row("Unique chords", num(s.unique_chords))}
      ${row("Unique transitions", num(s.unique_transitions))}
      ${row("Total chords", num(s.total_chords))}
      ${row("Sections", num(s.section_count != null ? s.section_count : sections.length))}
      ${row("Has melody", s.has_melody ? "yes" : (s.has_melody === 0 ? "no" : ""))}
      ${row("Total notes", num(s.total_notes))}
      ${row("Key changes", num(s.key_change_count))}
      ${row("Borrowed chords", num(s.borrowed_chord_count))}
      ${row("Applied chords", num(s.applied_chord_count))}
      ${row("Modified chords", num(s.modified_chord_count))}
      ${row("Metrics source", s.metrics_source)}
      ${row("Discovery source", s.discovery_source)}
      ${row("Cache", s.cache_dir)}
      ${row("YouTube", s.youtube_id)}
    </div>
    ${sections.length ? `
      <div class="entry-sub">Sections</div>
      <div class="entry-sections">
        ${sections.map((sec) => `
          <div class="entry-section">
            <span>${esc(sec.section_name)}</span>
            <span class="entry-section-meta">${esc([
              sec.chord_count != null ? `${sec.chord_count} chords` : "",
              [sec.key_tonic, sec.key_scale].filter(Boolean).join(" "),
            ].filter(Boolean).join(" · "))}</span>
          </div>
        `).join("")}
      </div>
    ` : ""}
    ${s.url ? `<a class="entry-link" href="${esc(s.url)}" target="_blank" rel="noopener">Open on TheoryTab ↗</a>` : ""}
    ${oracleErrorRateHtml(s, flags, esc)}
  `;
}

function applyFlagsToButtons(body, flags) {
  const catalogued = body.querySelector('[data-action="catalogued"]');
  if (catalogued) {
    const done = !!flags.catalogued;
    catalogued.className = done
      ? "entry-btn entry-btn--done entry-btn--readonly"
      : "entry-btn entry-btn--pending entry-btn--readonly";
    catalogued.title = done
      ? "Song is in the catalog DB (automatic)"
      : "Not in catalog — use Add song by URL above";
  }
  for (const btn of body.querySelectorAll(".pipeline-action-btn")) {
    const action = btn.dataset.action;
    const done = !!flags[action];
    btn.className = `${btnClass(done)} pipeline-action-btn`;
    btn.dataset.done = done ? "1" : "0";
    const tips = PIPELINE_TIPS[action];
    btn.title = done ? tips.done : tips.pending;
  }
}

function applyLoadGate(body, canLoad, missing, esc, loadTooltip) {
  const loadBtn = body.querySelector("#sel-load-btn");
  if (!loadBtn) return;
  loadBtn.disabled = !canLoad;
  loadBtn.className = `sel-load-btn${canLoad ? " sel-load-btn--ready" : " sel-load-btn--blocked"}`;
  loadBtn.title = loadTooltip(missing);
  if (!loadBtn.classList.contains("pipeline-running") && loadBtn.textContent !== "Loaded") {
    loadBtn.textContent = "Load";
  }
  const playable = body.querySelector(".entry-playable");
  if (playable) playable.hidden = !canLoad;
}

async function pollJob(jobId) {
  for (;;) {
    const res = await fetch(`/api/library/pipeline/job?id=${encodeURIComponent(jobId)}`);
    const job = await res.json();
    if (!res.ok) throw new Error(job.error || `HTTP ${res.status}`);
    if (job.status === "running") {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    return job;
  }
}

export function wirePipelineButtons(body, slug, flags, callbacks) {
  const { esc, loadTooltip, reloadIndex } = callbacks;
  const statusEl = body.querySelector("#pipeline-status");

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg || "";
  };

  const refreshFromPayload = (payload) => {
    if (payload.flags) {
      applyFlagsToButtons(body, payload.flags);
      applyLoadGate(body, payload.canLoad, payload.loadGateMissing || [], esc, loadTooltip);
    }
  };

  for (const btn of body.querySelectorAll(".pipeline-action-btn")) {
    const action = btn.dataset.action;
    attachPipelineButton(btn, {
      onRun: async () => {
        btn.classList.add("pipeline-running");
        const label = btn.textContent;
        btn.textContent = "…";
        setStatus(`Running ${action}…`);
        try {
          const res = await fetch(
            `/api/library/pipeline/${action}?slug=${encodeURIComponent(slug)}`,
            { method: "POST" },
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const job = await pollJob(data.jobId);
          if (job.status === "error") throw new Error(job.error || `${action} failed`);
          refreshFromPayload(job);
          setStatus(`${action} done`);
          reloadIndex?.();
          callbacks.onJobDone?.(slug, action);
        } catch (err) {
          btn.title = err.message;
          setStatus(err.message);
        } finally {
          btn.classList.remove("pipeline-running");
          if (!btn.classList.contains("pipeline-holding")) {
            btn.textContent = label;
          }
        }
      },
      onClear: async () => {
        setStatus(`Clearing ${action}…`);
        try {
          const res = await fetch(
            `/api/library/pipeline/${action}/clear?slug=${encodeURIComponent(slug)}`,
            { method: "POST" },
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          refreshFromPayload(data);
          setStatus(`${action} cleared`);
          reloadIndex?.();
          callbacks.onJobDone?.(slug, action);
        } catch (err) {
          setStatus(err.message);
        }
      },
    });
  }
}
