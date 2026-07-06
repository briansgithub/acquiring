import { qualityFlash } from "./modes/qualityFlash.js";
import { degreeId } from "./modes/degreeId.js";
import { transitionDrill as transition } from "./modes/transitionDrill.js";
import { dictation } from "./modes/dictation.js";
import { cloze } from "./modes/cloze.js";
import { singRoot } from "./modes/singRoot.js";
import { singArpeggio } from "./modes/singArpeggio.js";
import { singCallResponse } from "./modes/singCallResponse.js";
import { renderQuizFreqPanel } from "./quizFreqPanel.js";

const MODES = [
  qualityFlash,
  degreeId,
  transition,
  dictation,
  cloze,
  singRoot,
  singArpeggio,
  singCallResponse,
];

const IDLE_HTML = `
  <div class="quiz-idle-prompt quiz-prompt">
    <strong>Start a drill</strong><br />
    1. Pick a mode tab above<br />
    2. Press <em>Next</em> to load a question (no audio yet)<br />
    3. <em>Tonicize</em> for key context, then <em>Repeat</em> to hear the prompt<br />
    4. Answer or sing — stats update in the table above
  </div>`;

export function renderQuizMode(container, ctx) {
  let active = null;
  let activeHandle = null;

  container.innerHTML = `
    <div class="quiz-workspace">
      <div class="quiz-song-banner" id="quiz-song-banner"></div>
      <div class="quiz-mode-tabs" id="quiz-mode-tabs"></div>
      <div class="quiz-stats-top" id="quiz-freq-mount"></div>
      <div class="quiz-session-header" id="quiz-session-header"></div>
      <div class="quiz-mode-body" id="quiz-mode-body"></div>
    </div>
  `;

  const songBannerEl = container.querySelector("#quiz-song-banner");
  const freqMount = container.querySelector("#quiz-freq-mount");
  const headerEl = container.querySelector("#quiz-session-header");
  const tabsEl = container.querySelector("#quiz-mode-tabs");
  const bodyEl = container.querySelector("#quiz-mode-body");

  const freqPanel = renderQuizFreqPanel(freqMount, ctx);
  ctx.onStatsChange = () => {
    freqPanel.refresh();
    updateHeader();
  };

  function updateSongBanner() {
    const label = ctx.getSongLabel?.();
    const stats = ctx.getSectionStats?.();
    songBannerEl.classList.toggle("is-empty", !label);
    if (!label) {
      songBannerEl.textContent =
        "No song loaded — expand Songs (left) or switch to Player to load one";
      return;
    }
    const chordNote = stats?.total ? ` · ${stats.total} chords` : "";
    songBannerEl.textContent = `${label}${chordNote}`;
  }

  function updateHeader() {
    if (!active) {
      headerEl.textContent = "";
      return;
    }
    const s = ctx.session.statsFor(active.id);
    headerEl.textContent = `${active.label} — streak ${s.streak} (best ${s.bestStreak}) · ${s.accuracy}%`;
  }

  function mountMode(mode) {
    activeHandle?.destroy?.();
    active = mode;
    bodyEl.innerHTML = "";
    activeHandle = mode.render(bodyEl, ctx) || {};
    updateSongBanner();
    updateHeader();
    freqPanel.refresh();
    for (const btn of tabsEl.querySelectorAll(".quiz-mode-tab")) {
      btn.classList.toggle("active", btn.dataset.modeId === mode.id);
    }
  }

  for (const mode of MODES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-mode-tab";
    btn.dataset.modeId = mode.id;
    btn.textContent = mode.label;
    btn.addEventListener("click", () => mountMode(mode));
    tabsEl.appendChild(btn);
  }

  bodyEl.innerHTML = IDLE_HTML;
  updateSongBanner();
  updateHeader();
  freqPanel.refresh();

  return {
    refresh() {
      updateSongBanner();
      updateHeader();
      freqPanel.refresh();
    },
    destroy() {
      activeHandle?.destroy?.();
    },
  };
}
