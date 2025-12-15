export function renderNoteIndicator(container) {
  container.innerHTML = `
    <h2>Now Playing</h2>
    <div class="card">
      <div class="label">Melody</div>
      <div class="value" id="melody-note">--</div>
    </div>
    <div class="card">
      <div class="label">Chord</div>
      <div class="chord-root" id="chord-root"></div>
      <div class="notes-list" id="chord-notes"></div>
      <div class="chord-degrees" id="chord-degrees"></div>
      <div class="chord-borrowed" id="chord-borrowed" style="font-style:italic;color:#9ca3af;font-size:0.9em;margin-top:4px;display:none;"></div>
    </div>
  `;

  const melodyEl = container.querySelector("#melody-note");
  const chordRootEl = container.querySelector("#chord-root");
  const chordList = container.querySelector("#chord-notes");
  const chordDegreesEl = container.querySelector("#chord-degrees");
  const chordBorrowedEl = container.querySelector("#chord-borrowed");

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
    updateChord(notes, root, chordDegrees, borrowed) {
      // Update root
      if (root) {
        chordRootEl.textContent = root.toString();
        chordRootEl.style.display = "block";
      } else {
        chordRootEl.style.display = "none";
      }

      // Update notes
      chordList.innerHTML = (notes || [])
        .map((n) => `<span class="pill">${n}</span>`)
        .join("");
      if (!notes?.length) {
        chordList.innerHTML = '<span style="color:#6b7280;">--</span>';
      }

      // Update chord degrees
      if (chordDegrees && chordDegrees.length > 0) {
        chordDegreesEl.textContent = chordDegrees.join("-");
        chordDegreesEl.style.display = "block";
      } else {
        chordDegreesEl.style.display = "none";
      }

      // Update borrowed
      if (borrowed) {
        chordBorrowedEl.textContent = `(${borrowed})`;
        chordBorrowedEl.style.display = "block";
      } else {
        chordBorrowedEl.style.display = "none";
      }
    },
    reset() {
      melodyEl.textContent = "--";
      chordRootEl.style.display = "none";
      chordList.innerHTML = '<span style="color:#6b7280;">--</span>';
      chordDegreesEl.style.display = "none";
      chordBorrowedEl.style.display = "none";
    },
  };
}

