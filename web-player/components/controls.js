export const CONTROL_DEFAULTS = {
  tempoPercent: 100,
  melodyVolume: -16,
  chordVolume: -9,
  arpeggiated: false,
  arpeggiationSlider: 6,
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
        <input type="range" id="tempo-slider" min="1" max="100" value="100" step="1" class="volume-slider">
        <span id="tempo-label" class="now-playing-tempo-value">100%</span>
      </div>
    `;
  }

  footerContainer.innerHTML = `
    <button id="reset-defaults-btn" type="button">Reset to default</button>
  `;

  const playBtn = playbackContainer?.querySelector("#play-toggle");
  const restartBtn = playbackContainer?.querySelector("#restart-btn");
  const sectionSelect = topContainer.querySelector("#section-select");
  const tempoSlider = (tempoContainer ?? topContainer).querySelector("#tempo-slider");
  const tempoLabel = (tempoContainer ?? topContainer).querySelector("#tempo-label");
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

  sectionSelect.addEventListener("change", (e) => {
    onSectionChange?.(e.target.value);
  });

  let baseTempo = 120;

  tempoSlider?.addEventListener("input", (e) => {
    const percentage = Number(e.target.value);
    tempoLabel.textContent = `${percentage}%`;
    const actualBpm = (percentage / 100) * baseTempo;
    onTempoChange?.(actualBpm);
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
      setPlayButtonState(false);
    },
    setPlayState(playing) {
      setPlayButtonState(!!playing);
    },
    setTempoPercent(percentage) {
      if (!tempoSlider || !tempoLabel) return;
      const pct = Math.max(1, Math.min(100, percentage));
      tempoSlider.value = pct;
      tempoLabel.textContent = `${pct}%`;
      onTempoChange?.((pct / 100) * baseTempo);
    },
    resetSlidersToDefaults() {
      if (!tempoSlider || !tempoLabel) return;
      const d = CONTROL_DEFAULTS;
      const pct = Math.max(1, Math.min(100, d.tempoPercent));
      tempoSlider.value = pct;
      tempoLabel.textContent = `${pct}%`;
    },
  };
}
