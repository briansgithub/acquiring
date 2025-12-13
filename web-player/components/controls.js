export function renderControls(container, { onPlayPause, onRestart, onSeek, onSongChange, onSectionChange, onMelodyVolumeChange, onChordVolumeChange, onTempoChange }) {
  container.innerHTML = `
    <h2>Controls</h2>
    <div class="row">
      <button id="play-toggle">Play</button>
      <button id="restart-btn">Restart</button>
    </div>
    <div class="row">
      <label for="song-select" style="font-size:18px;color:#9ca3af;width:60px;">Song:</label>
      <select id="song-select" class="select"></select>
    </div>
    <div class="row">
      <label for="section-select" style="font-size:18px;color:#9ca3af;width:60px;">Section:</label>
      <select id="section-select" class="select"></select>
    </div>
    <div class="row">
      <div class="progress" id="progress-bar">
        <div class="fill" id="progress-fill"></div>
      </div>
      <span id="progress-label" style="font-size:12px;color:#9ca3af;width:42px;text-align:right;">0%</span>
    </div>
    <div class="row">
      <label for="tempo-slider" style="font-size:12px;color:#9ca3af;width:60px;">Tempo:</label>
      <input type="range" id="tempo-slider" min="1" max="100" value="100" step="1" class="volume-slider">
      <span id="tempo-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">100%</span>
    </div>
    <div class="row">
      <label for="melody-volume" style="font-size:12px;color:#9ca3af;width:60px;">Melody:</label>
      <input type="range" id="melody-volume" min="-60" max="0" value="0" step="1" class="volume-slider">
      <span id="melody-volume-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">0dB</span>
    </div>
    <div class="row">
      <label for="chord-volume" style="font-size:12px;color:#9ca3af;width:60px;">Chords:</label>
      <input type="range" id="chord-volume" min="-60" max="0" value="-10" step="1" class="volume-slider">
      <span id="chord-volume-label" style="font-size:12px;color:#9ca3af;width:35px;text-align:right;">-10dB</span>
    </div>
  `;

  const playBtn = container.querySelector("#play-toggle");
  const restartBtn = container.querySelector("#restart-btn");
  const progress = container.querySelector("#progress-bar");
  const fill = container.querySelector("#progress-fill");
  const label = container.querySelector("#progress-label");
  const songSelect = container.querySelector("#song-select");
  const sectionSelect = container.querySelector("#section-select");
  const tempoSlider = container.querySelector("#tempo-slider");
  const tempoLabel = container.querySelector("#tempo-label");
  const melodyVolumeSlider = container.querySelector("#melody-volume");
  const melodyVolumeLabel = container.querySelector("#melody-volume-label");
  const chordVolumeSlider = container.querySelector("#chord-volume");
  const chordVolumeLabel = container.querySelector("#chord-volume-label");

  playBtn.addEventListener("click", () => {
    const isPlaying = playBtn.dataset.state === "playing";
    playBtn.dataset.state = isPlaying ? "paused" : "playing";
    playBtn.textContent = isPlaying ? "Play" : "Pause";
    onPlayPause?.(!isPlaying);
  });

  restartBtn.addEventListener("click", () => {
    onRestart?.();
  });

  progress.addEventListener("click", (e) => {
    const rect = progress.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek?.(ratio);
  });

  songSelect.addEventListener("change", (e) => {
    onSongChange?.(e.target.value);
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

  let baseTempo = 120; // Store the original tempo for percentage calculation

  tempoSlider.addEventListener("input", (e) => {
    const percentage = Number(e.target.value);
    tempoLabel.textContent = `${percentage}%`;
    // Convert percentage to BPM: actualBPM = (percentage / 100) * baseTempo
    const actualBpm = (percentage / 100) * baseTempo;
    onTempoChange?.(actualBpm);
  });

  return {
    setTempo(bpm, originalBpm) {
      baseTempo = originalBpm || bpm;
      // Convert BPM to percentage: percentage = (currentBPM / originalBPM) * 100
      const percentage = Math.round((bpm / baseTempo) * 100);
      tempoSlider.value = Math.max(1, Math.min(100, percentage));
      tempoLabel.textContent = `${tempoSlider.value}%`;
    },
    setSongs(songs) {
      console.log("setSongs called with:", songs);
      if (!Array.isArray(songs) || !songs.length) {
        console.warn("setSongs: empty or invalid songs array");
        songSelect.innerHTML = '<option value="">No songs</option>';
        return;
      }
      songSelect.innerHTML = songs
        .map((s, idx) => `<option value="${idx}">${s.title || s.artist || `Song ${idx + 1}`}</option>`)
        .join("");
      console.log("Song dropdown populated with", songs.length, "options");
    },
    setSections(sections) {
      console.log("setSections called with:", sections);
      if (!Array.isArray(sections) || !sections.length) {
        console.warn("setSections: empty or invalid sections array");
        sectionSelect.innerHTML = '<option value="">No sections</option>';
        return;
      }
      sectionSelect.innerHTML = sections
        .map((s, idx) => `<option value="${idx}">${s.sectionName || `Section ${idx + 1}`}</option>`)
        .join("");
      console.log("Section dropdown populated with", sections.length, "options");
    },
    updateProgress(ratio) {
      const pct = Math.round(ratio * 100);
      fill.style.width = `${pct}%`;
      label.textContent = `${pct}%`;
    },
    resetPlayState() {
      playBtn.dataset.state = "paused";
      playBtn.textContent = "Play";
    },
  };
}

