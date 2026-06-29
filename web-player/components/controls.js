export function renderControls(container, { onPlayPause, onRestart, onSectionChange, onMelodyVolumeChange, onChordVolumeChange, onTempoChange, onArpeggiateToggle, onArpeggiateSpeedChange }) {
  container.innerHTML = `
    <h2>Controls</h2>
    <div class="row">
      <button id="play-toggle">Play</button>
      <button id="restart-btn">Restart</button>
    </div>
    <div class="row">
      <label for="section-select" style="font-size:18px;color:#9ca3af;width:60px;">Section:</label>
      <select id="section-select" class="select"></select>
    </div>
    <div class="row" style="justify-content:center;margin:10px 0;">
      <div id="song-title" style="font-size:24px;font-weight:bold;color:#ffffff;text-align:center;">-</div>
    </div>
    <div class="row">
      <label for="tempo-slider" style="font-size:12px;color:#9ca3af;width:60px;">Tempo:</label>
      <input type="range" id="tempo-slider" min="1" max="100" value="100" step="1" class="volume-slider">
      <span id="tempo-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">100%</span>
    </div>
    <div class="row">
      <label for="melody-volume" style="font-size:12px;color:#9ca3af;width:60px;">Melody volume:</label>
      <input type="range" id="melody-volume" min="-30" max="0" value="-16" step="1" class="volume-slider">
      <span id="melody-volume-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">-16dB</span>
    </div>
    <div class="row">
      <label for="chord-volume" style="font-size:12px;color:#9ca3af;width:60px;">Chord volume:</label>
      <input type="range" id="chord-volume" min="-30" max="0" value="-9" step="1" class="volume-slider">
      <span id="chord-volume-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">-9dB</span>
    </div>
    <div class="row" style="margin-top:10px;">
      <input type="checkbox" id="arpeggiate-toggle" style="cursor:pointer;">
      <label for="arpeggiate-toggle" style="font-size:12px;color:#9ca3af;cursor:pointer;user-select:none;">Arpeggiate Chords</label>
    </div>
    <div class="row" id="arp-speed-row">
      <label for="arp-speed" style="font-size:12px;color:#9ca3af;width:60px;">Arp Spd:</label>
      <input type="range" id="arp-speed" min="10" max="1000" value="100" step="10" class="volume-slider">
      <span id="arp-speed-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">100ms</span>
    </div>
  `;

  const playBtn = container.querySelector("#play-toggle");
  const restartBtn = container.querySelector("#restart-btn");
  const sectionSelect = container.querySelector("#section-select");
  const tempoSlider = container.querySelector("#tempo-slider");
  const tempoLabel = container.querySelector("#tempo-label");
  const melodyVolumeSlider = container.querySelector("#melody-volume");
  const melodyVolumeLabel = container.querySelector("#melody-volume-label");
  const chordVolumeSlider = container.querySelector("#chord-volume");
  const chordVolumeLabel = container.querySelector("#chord-volume-label");
  const songTitle = container.querySelector("#song-title");
  const arpToggle = container.querySelector("#arpeggiate-toggle");
  const arpSpeedSlider = container.querySelector("#arp-speed");
  const arpSpeedLabel = container.querySelector("#arp-speed-label");
  const arpSpeedRow = container.querySelector("#arp-speed-row");

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

  melodyVolumeSlider.addEventListener("input", (e) => {
    const volume = Number(e.target.value);
    melodyVolumeLabel.textContent = `${volume}dB`;
    onMelodyVolumeChange?.(volume);
  });

  chordVolumeSlider.addEventListener("input", (e) => {
    const volume = Number(e.target.value);
    chordVolumeLabel.textContent = `${volume}dB`;
    onChordVolumeChange?.(volume);
  });

  let baseTempo = 120;

  tempoSlider.addEventListener("input", (e) => {
    const percentage = Number(e.target.value);
    tempoLabel.textContent = `${percentage}%`;
    const actualBpm = (percentage / 100) * baseTempo;
    onTempoChange?.(actualBpm);
  });

  arpToggle.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    arpSpeedRow.style.opacity = isChecked ? "1" : "0.5";
    arpSpeedRow.style.pointerEvents = isChecked ? "auto" : "none";
    onArpeggiateToggle?.(isChecked);
  });

  arpSpeedSlider.addEventListener("input", (e) => {
    const ms = Number(e.target.value);
    if (ms >= 1000) {
      arpSpeedLabel.textContent = `${(ms / 1000).toFixed(1)}s`;
    } else {
      arpSpeedLabel.textContent = `${ms}ms`;
    }
    onArpeggiateSpeedChange?.(ms);
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
    setSongTitle(title) {
      if (songTitle) {
        songTitle.textContent = title || "-";
      }
    },
  };
}
