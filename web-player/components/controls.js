export function renderControls(container, { onPlayPause, onSeek, onSongChange, onSectionChange }) {
  container.innerHTML = `
    <h2>Controls</h2>
    <div class="row">
      <button id="play-toggle">Play</button>
    </div>
    <div class="row">
      <select id="song-select" class="select"></select>
    </div>
    <div class="row">
      <select id="section-select" class="select"></select>
    </div>
    <div class="row">
      <div class="progress" id="progress-bar">
        <div class="fill" id="progress-fill"></div>
      </div>
      <span id="progress-label" style="font-size:12px;color:#9ca3af;width:42px;text-align:right;">0%</span>
    </div>
  `;

  const playBtn = container.querySelector("#play-toggle");
  const progress = container.querySelector("#progress-bar");
  const fill = container.querySelector("#progress-fill");
  const label = container.querySelector("#progress-label");
  const songSelect = container.querySelector("#song-select");
  const sectionSelect = container.querySelector("#section-select");

  playBtn.addEventListener("click", () => {
    const isPlaying = playBtn.dataset.state === "playing";
    playBtn.dataset.state = isPlaying ? "paused" : "playing";
    playBtn.textContent = isPlaying ? "Play" : "Pause";
    onPlayPause?.(!isPlaying);
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

  return {
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

