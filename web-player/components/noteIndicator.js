export function renderNoteIndicator(container) {
  container.innerHTML = `
    <h2>Now Playing</h2>
    <div class="card">
      <div class="label">Melody</div>
      <div class="value" id="melody-note">--</div>
    </div>
    <div class="card">
      <div class="label">Chord</div>
      <div class="notes-list" id="chord-notes"></div>
    </div>
  `;

  const melodyEl = container.querySelector("#melody-note");
  const chordList = container.querySelector("#chord-notes");

  return {
    updateMelody(absoluteLabel, relativeLabel) {
      if (!absoluteLabel && !relativeLabel) {
        melodyEl.textContent = "--";
        return;
      }
      if (absoluteLabel && relativeLabel) {
        melodyEl.textContent = `${absoluteLabel} (${relativeLabel})`;
      } else {
        melodyEl.textContent = absoluteLabel || relativeLabel || "--";
      }
    },
    updateChord(notes) {
      chordList.innerHTML = (notes || [])
        .map((n) => `<span class="pill">${n}</span>`)
        .join("");
      if (!notes?.length) {
        chordList.innerHTML = '<span style="color:#6b7280;">--</span>';
      }
    },
    reset() {
      melodyEl.textContent = "--";
      chordList.innerHTML = '<span style="color:#6b7280;">--</span>';
    },
  };
}

