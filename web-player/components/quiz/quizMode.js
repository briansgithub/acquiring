import { qualityFlash } from "./modes/qualityFlash.js";
import { degreeId } from "./modes/degreeId.js";
import { transitionDrill as transition } from "./modes/transitionDrill.js";
import { dictation } from "./modes/dictation.js";
import { cloze } from "./modes/cloze.js";
import { singRoot } from "./modes/singRoot.js";
import { singArpeggio } from "./modes/singArpeggio.js";
import { singCallResponse } from "./modes/singCallResponse.js";
import { renderQuizFreqPanel } from "./quizFreqPanel.js";
import { mountWorkspaceChordMenu } from "./quizChordInspect.js";

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
    2. Press <em>Start</em> on a mode tab to load the first question<br />
    3. <em>Tonicize</em> for key context, then <em>Repeat</em> to hear the prompt<br />
    4. Answer or sing — all choices come from this section's chords
  </div>`;

/** Map section object name to a display label showing type (Chorus, Verse, etc.) */
function sectionDisplayName(section, index) {
  const raw = section?.name;
  if (!raw) return `Section ${index + 1}`;
  // Already descriptive enough
  return raw;
}

export function renderQuizMode(container, ctx) {
  let active = null;
  let activeHandle = null;
  let tonicSynth = null;

  container.innerHTML = `
    <div class="quiz-workspace">
      <div class="quiz-top-bar">
        <div class="quiz-song-title" id="quiz-song-title"></div>
        <div class="quiz-song-meta" id="quiz-song-meta">
          <div class="quiz-song-banner" id="quiz-song-banner"></div>
          <div class="quiz-section-bar" id="quiz-section-bar"></div>
        </div>
      </div>
      <div class="quiz-stats-top" id="quiz-freq-mount"></div>
      <div class="quiz-mode-tabs" id="quiz-mode-tabs"></div>
      <div class="quiz-session-header" id="quiz-session-header"></div>
      <div class="quiz-playback-controls" id="quiz-playback-controls">
        <button type="button" class="quiz-tonic-btn" id="quiz-tonic-btn"
          title="Hold to play the tonic note continuously">♩ Tonic</button>
        <div class="quiz-tempo-row">
          <span class="quiz-tempo-label">Tempo</span>
          <input type="range" id="quiz-tempo-slider" class="quiz-tempo-slider"
            min="40" max="240" step="1" value="120" />
          <span class="quiz-tempo-val" id="quiz-tempo-val">120</span>
        </div>
        <div class="quiz-arp-toggle">
          <input type="checkbox" id="quiz-arp-cb"> <label for="quiz-arp-cb">Arpeggio</label>
        </div>
        <div class="quiz-arp-speed-row" id="quiz-arp-speed-row" style="display:none;">
          <label class="quiz-arp-speed-label">Speed:</label>
          <input type="range" class="quiz-arp-speed-slider" id="quiz-arp-speed" min="0" max="5" step="1" value="3">
          <span class="quiz-arp-speed-val" id="quiz-arp-speed-val">4 c/b</span>
        </div>
      </div>
      <div class="quiz-mode-body" id="quiz-mode-body"></div>
    </div>
  `;

  const songTitleEl = container.querySelector("#quiz-song-title");
  const songBannerEl = container.querySelector("#quiz-song-banner");
  const sectionBarEl = container.querySelector("#quiz-section-bar");
  const freqMount = container.querySelector("#quiz-freq-mount");
  const headerEl = container.querySelector("#quiz-session-header");
  const tabsEl = container.querySelector("#quiz-mode-tabs");
  const bodyEl = container.querySelector("#quiz-mode-body");

  // Tonic button — plays a sustained tonic while held
  const tonicBtn = container.querySelector("#quiz-tonic-btn");
  function startTonic() {
    stopTonic();
    const Tone = window.Tone;
    if (!Tone) return;
    if (Tone.context.state !== "running") Tone.start();
    const songCtx = ctx.getSongContext?.();
    if (!songCtx?.key) return;
    const rootSd = 1;
    const rootKey = songCtx.key;
    // Compute tonic note name from key
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const rootNote = NOTE_NAMES[((rootKey.root - 1) % 12 + 12) % 12] + "4";
    tonicSynth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.3 },
      volume: -8,
    }).toDestination();
    tonicSynth.triggerAttack(rootNote, Tone.now());
    tonicBtn.classList.add("is-active");
  }
  function stopTonic() {
    if (tonicSynth) {
      try { tonicSynth.triggerRelease(); } catch {}
      setTimeout(() => {
        try { tonicSynth?.dispose(); } catch {}
        tonicSynth = null;
      }, 400);
    }
    tonicBtn.classList.remove("is-active");
  }
  tonicBtn.addEventListener("mousedown", startTonic);
  tonicBtn.addEventListener("mouseup", stopTonic);
  tonicBtn.addEventListener("mouseleave", stopTonic);
  tonicBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startTonic(); });
  tonicBtn.addEventListener("touchend", stopTonic);
  tonicBtn.addEventListener("touchcancel", stopTonic);

  // Tempo slider
  const tempoSlider = container.querySelector("#quiz-tempo-slider");
  const tempoVal = container.querySelector("#quiz-tempo-val");
  function syncTempoFromCtx() {
    const songCtx = ctx.getSongContext?.();
    if (songCtx?.key?.bpm) {
      tempoSlider.value = songCtx.key.bpm;
      tempoVal.textContent = songCtx.key.bpm;
    }
  }
  tempoSlider.addEventListener("input", () => {
    tempoVal.textContent = tempoSlider.value;
    ctx.setTempo?.(Number(tempoSlider.value));
  });

  // Arpeggio toggle + speed
  const arpCb = container.querySelector("#quiz-arp-cb");
  const arpSpeedRow = container.querySelector("#quiz-arp-speed-row");
  const arpSpeedSlider = container.querySelector("#quiz-arp-speed");
  const arpSpeedVal = container.querySelector("#quiz-arp-speed-val");

  const arpLabels = ["1 c/b", "2 c/b", "3 c/b", "4 c/b", "6 c/b", "8 c/b"];

  function syncArpFromCtx() {
    if (ctx.isArpeggiated !== undefined) {
      arpCb.checked = ctx.isArpeggiated;
      arpSpeedRow.style.display = ctx.isArpeggiated ? "flex" : "none";
    }
    if (ctx.arpeggiationSlider !== undefined) {
      arpSpeedSlider.value = ctx.arpeggiationSlider;
      arpSpeedVal.textContent = arpLabels[ctx.arpeggiationSlider] || "";
    }
  }

  arpCb.addEventListener("change", () => {
    const on = arpCb.checked;
    arpSpeedRow.style.display = on ? "flex" : "none";
    ctx.setArpeggiated?.(on);
  });
  arpSpeedSlider.addEventListener("input", () => {
    const val = Number(arpSpeedSlider.value);
    arpSpeedVal.textContent = arpLabels[val] || "";
    ctx.setArpSlider?.(val);
  });

  const freqPanel = renderQuizFreqPanel(freqMount, ctx);
  ctx.onStatsChange = () => {
    freqPanel.refresh();
    updateHeader();
  };

  function updateSectionBar() {
    const sections = ctx.getSections?.() ?? [];
    const idx = ctx.getSectionIndex?.() ?? 0;
    if (!sections.length) {
      sectionBarEl.innerHTML = "";
      return;
    }
    const options = sections
      .map(
        (s, i) =>
          `<option value="${i}"${i === idx ? " selected" : ""}>${sectionDisplayName(s, i)}</option>`,
      )
      .join("");
    sectionBarEl.innerHTML = `
      <label class="quiz-section-label" for="quiz-section-select">Section</label>
      <select id="quiz-section-select" class="select quiz-select quiz-section-select" title="Switch section for this song">${options}</select>
      <span class="quiz-section-hint" title="Expand the Songs strip on the left (») to change songs">Songs: left panel »</span>
    `;
    const sel = sectionBarEl.querySelector("#quiz-section-select");
    sel?.addEventListener("change", () => {
      const next = Number(sel.value);
      if (Number.isFinite(next)) ctx.setSectionIndex?.(next);
    });
  }

  mountWorkspaceChordMenu(container.querySelector(".quiz-workspace"), ctx);

  function updateSongBanner() {
    const title = ctx.getSongTitle?.();
    const stats = ctx.getSectionStats?.();
    const sectionOnly = ctx.getSectionName?.();

    songTitleEl.classList.toggle("is-empty", !title);
    if (!title) {
      songTitleEl.textContent = "No song loaded";
      songBannerEl.textContent =
        "Expand Songs (left ») or switch to Player to load one";
      return;
    }

    songTitleEl.textContent = title;
    const chordNote = stats?.total ? `${stats.total} chords` : "";
    const sectionLabel = sectionOnly ? `Section: ${sectionOnly}` : "";
    songBannerEl.textContent = [sectionLabel, chordNote].filter(Boolean).join(" · ");
  }

  function updateHeader() {
    if (!active) {
      headerEl.textContent = "";
      return;
    }
    const s = ctx.session.statsFor(active.id);
    headerEl.textContent = `${active.label} — streak ${s.streak} (best ${s.bestStreak}) · ${s.accuracy}%`;
  }

  function clearVisualOverlays() {
    if (typeof ctx.chordRing?.clearQuizOverlays === 'function') {
      ctx.chordRing.clearQuizOverlays();
    }
    if (typeof ctx.timeline?.clearQuizOverlays === 'function') {
      ctx.timeline.clearQuizOverlays();
    }
  }

  function syncFrequencyOverlay() {
    if (typeof ctx.chordRing?.setFrequencyOverlay !== 'function') return;
    const profile = ctx.getFrequencyProfile?.();
    if (profile?.symbolCounts) {
      ctx.chordRing.setFrequencyOverlay(profile.symbolCounts);
    }
  }

  function refreshChrome() {
    syncTempoFromCtx();
    syncArpFromCtx();
    updateSongBanner();
    updateSectionBar();
    updateHeader();
    freqPanel.refresh();
    syncFrequencyOverlay();
  }

  function mountMode(mode) {
    activeHandle?.destroy?.();
    clearVisualOverlays();
    active = mode;
    bodyEl.innerHTML = "";
    activeHandle = mode.render(bodyEl, ctx) || {};
    refreshChrome();
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
  refreshChrome();

  return {
    refresh(opts = {}) {
      if (opts.remount && active) {
        mountMode(active);
        return;
      }
      refreshChrome();
    },
    destroy() {
      activeHandle?.destroy?.();
      clearVisualOverlays();
      stopTonic();
    },
  };
}
