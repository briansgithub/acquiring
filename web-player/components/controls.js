export const TEMPO_MAX_PERCENT = 200;

export const CONTROL_DEFAULTS = {
  tempoPercent: 100,
  melodyVolume: 10,
  chordVolume: 80,
  arpeggiated: false,
  arpeggiationSlider: 12,
  arpFixedSpeed: true,
  arpUnlockFromTempo: true,
};

export function renderControls({ topContainer, tempoContainer, footerContainer, playbackContainer }, {
  onPlayPause,
  onRestart,
  onSectionChange,
  onTempoChange,
  onResetDefaults,
}) {
  if (playbackContainer) {
    playbackContainer.innerHTML = `
      <button id="play-toggle" type="button" data-state="paused">Play</button>
      <button id="restart-btn" type="button">Restart</button>
      <button id="quiz-cloze-btn" type="button" class="quiz-cloze-btn">Cloze Quiz</button>
    `;
    playbackContainer.hidden = true;
  }

  topContainer.innerHTML = `
    <div class="row">
      <label for="section-select" style="font-size:18px;color:#9ca3af;width:60px;">Section:</label>
      <select id="section-select" class="select"></select>
    </div>
  `;

  if (tempoContainer) {
    tempoContainer.innerHTML = `
      <div class="row now-playing-tempo-row">
        <label for="tempo-slider" class="now-playing-tempo-label">Tempo:</label>
        <input type="range" id="tempo-slider" min="1" max="${TEMPO_MAX_PERCENT}" value="100" step="1" class="volume-slider">
        <span id="tempo-label" class="now-playing-tempo-value">100%</span>
        <button
          type="button"
          id="tempo-reset-btn"
          class="tempo-reset-btn"
          title="Reset tempo to 100%"
          aria-label="Reset tempo to 100%"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>
    `;
  }

  footerContainer.innerHTML = `
    <button id="reset-defaults-btn" type="button">Reset to default</button>
  `;

  const playBtn = playbackContainer?.querySelector("#play-toggle");
  const restartBtn = playbackContainer?.querySelector("#restart-btn");
  const quizClozeBtn = playbackContainer?.querySelector("#quiz-cloze-btn");
  const sectionSelect = topContainer.querySelector("#section-select");
  const tempoSlider = (tempoContainer ?? topContainer).querySelector("#tempo-slider");
  const tempoLabel = (tempoContainer ?? topContainer).querySelector("#tempo-label");
  const tempoResetBtn = (tempoContainer ?? topContainer).querySelector("#tempo-reset-btn");
  const resetDefaultsBtn = footerContainer.querySelector("#reset-defaults-btn");

  resetDefaultsBtn.addEventListener("click", () => {
    onResetDefaults?.();
  });

  function setPlayButtonState(playing) {
    if (!playBtn) return;
    playBtn.dataset.state = playing ? "playing" : "paused";
    playBtn.textContent = playing ? "Pause" : "Play";
  }

  playBtn?.addEventListener("click", () => {
    const isPlaying = playBtn.dataset.state === "playing";
    onPlayPause?.(!isPlaying);
  });

  restartBtn?.addEventListener("click", () => {
    onRestart?.();
  });

  quizClozeBtn?.addEventListener("click", () => {
    onToggleCloze?.();
  });

  sectionSelect.addEventListener("change", (e) => {
    onSectionChange?.(e.target.value);
  });

  let baseTempo = 120;

  function applyTempoPercent(percentage) {
    if (!tempoSlider || !tempoLabel) return;
    const pct = Math.max(1, Math.min(TEMPO_MAX_PERCENT, percentage));
    tempoSlider.value = pct;
    tempoLabel.textContent = `${pct}%`;
    onTempoChange?.((pct / 100) * baseTempo);
  }

  tempoSlider?.addEventListener("input", (e) => {
    applyTempoPercent(Number(e.target.value));
  });

  tempoResetBtn?.addEventListener("click", () => {
    applyTempoPercent(CONTROL_DEFAULTS.tempoPercent);
  });

  return {
    setPlaybackVisible(visible) {
      if (!playbackContainer) return;
      playbackContainer.hidden = !visible;
    },
    setTempo(bpm, originalBpm) {
      if (!tempoSlider || !tempoLabel) return;
      baseTempo = originalBpm || bpm;
      const percentage = Math.round((bpm / baseTempo) * 100);
      tempoSlider.value = Math.max(1, Math.min(TEMPO_MAX_PERCENT, percentage));
      tempoLabel.textContent = `${tempoSlider.value}%`;
    },
    setSections(sections) {
      if (!Array.isArray(sections) || !sections.length) {
        sectionSelect.innerHTML = '<option value="">No sections</option>';
        return;
      }
      sectionSelect.innerHTML = sections
        .map((s, idx) => `<option value="${idx}">${s.sectionName || `Section ${idx + 1}`}</option>`)
        .join("");
    },
    updateProgress() {},
    resetPlayState() {
      setPlayButtonState(false);
    },
    setPlayState(playing) {
      setPlayButtonState(!!playing);
    },
    setTempoPercent(percentage) {
      applyTempoPercent(percentage);
    },
    resetSlidersToDefaults() {
      if (!tempoSlider || !tempoLabel) return;
      const pct = Math.max(1, Math.min(TEMPO_MAX_PERCENT, CONTROL_DEFAULTS.tempoPercent));
      tempoSlider.value = pct;
      tempoLabel.textContent = `${pct}%`;
    },
    setQuizClozeState(active) {
      if (!quizClozeBtn) return;
      quizClozeBtn.classList.toggle("active", active);
      quizClozeBtn.textContent = active ? "Stop Quiz" : "Cloze Quiz";
    },
  };
}
