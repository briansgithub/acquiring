export const CONTROL_DEFAULTS = {
  tempoPercent: 100,
  melodyVolume: -16,
  chordVolume: -9,
  arpeggiated: false,
  arpeggiationSpeed: 100,
};

export function formatArpSpeedLabel(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function renderControls(container, {
  onPlayPause,
  onRestart,
  onSectionChange,
  onTempoChange,
  onResetDefaults,
}) {
  container.innerHTML = `
    <div class="pane-panel-head controls-head">
      <h2 class="pane-panel-title">Controls</h2>
    </div>
    <div class="row">
      <button id="play-toggle">Play</button>
      <button id="restart-btn">Restart</button>
    </div>
    <div class="row">
      <label for="section-select" style="font-size:18px;color:#9ca3af;width:60px;">Section:</label>
      <select id="section-select" class="select"></select>
    </div>
    <div class="row">
      <label for="tempo-slider" style="font-size:12px;color:#9ca3af;width:60px;">Tempo:</label>
      <input type="range" id="tempo-slider" min="1" max="100" value="100" step="1" class="volume-slider">
      <span id="tempo-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">100%</span>
    </div>
    <div class="row">
      <button id="reset-defaults-btn" type="button">Reset to default</button>
    </div>
  `;

  const playBtn = container.querySelector("#play-toggle");
  const restartBtn = container.querySelector("#restart-btn");
  const sectionSelect = container.querySelector("#section-select");
  const tempoSlider = container.querySelector("#tempo-slider");
  const tempoLabel = container.querySelector("#tempo-label");
  const resetDefaultsBtn = container.querySelector("#reset-defaults-btn");

  resetDefaultsBtn.addEventListener("click", () => {
    onResetDefaults?.();
  });

  playBtn.addEventListener("click", () => {
    const isPlaying = playBtn.dataset.state === "playing";
    playBtn.dataset.state = isPlaying ? "paused" : "playing";
    playBtn.textContent = isPlaying ? "Play" : "Pause";
    onPlayPause?.(!isPlaying);
  });

  restartBtn.addEventListener("click", () => {
    onRestart?.();
  });

  sectionSelect.addEventListener("change", (e) => {
    onSectionChange?.(e.target.value);
  });

  let baseTempo = 120;

  tempoSlider.addEventListener("input", (e) => {
    const percentage = Number(e.target.value);
    tempoLabel.textContent = `${percentage}%`;
    const actualBpm = (percentage / 100) * baseTempo;
    onTempoChange?.(actualBpm);
  });

  return {
    setTempo(bpm, originalBpm) {
      baseTempo = originalBpm || bpm;
      const percentage = Math.round((bpm / baseTempo) * 100);
      tempoSlider.value = Math.max(1, Math.min(100, percentage));
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
      playBtn.dataset.state = "paused";
      playBtn.textContent = "Play";
    },
    setTempoPercent(percentage) {
      const pct = Math.max(1, Math.min(100, percentage));
      tempoSlider.value = pct;
      tempoLabel.textContent = `${pct}%`;
      onTempoChange?.((pct / 100) * baseTempo);
    },
    resetSlidersToDefaults() {
      const d = CONTROL_DEFAULTS;
      const pct = Math.max(1, Math.min(100, d.tempoPercent));
      tempoSlider.value = pct;
      tempoLabel.textContent = `${pct}%`;
    },
  };
}
