import { getScaleDegreeColor } from "../lib/scales.js";

export function renderNoteIndicator(container, options = {}) {
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
    updateChord(notes, root, chordDegrees, borrowed, key) {
      // Update root
      if (root) {
        chordRootEl.textContent = root.toString();
        chordRootEl.style.display = "block";
      } else {
        chordRootEl.style.display = "none";
      }

      // Get color for this chord based on root
      const chordColor = root && key ? getScaleDegreeColor(root, key.scale) : null;

      // Update notes with colored pills and click handlers
      if (!notes?.length) {
        chordList.innerHTML = '<span style="color:#6b7280;">--</span>';
      } else {
        // Clear existing pills
        chordList.innerHTML = "";
        
        // Create and append pills with event listeners
        (notes || []).forEach((n) => {
          const pill = document.createElement("span");
          pill.className = "pill";
          pill.textContent = n;
          pill.style.cursor = "pointer";
          
          if (chordColor) {
            // Convert hex to rgba for background with opacity
            const r = parseInt(chordColor.slice(1, 3), 16);
            const g = parseInt(chordColor.slice(3, 5), 16);
            const b = parseInt(chordColor.slice(5, 7), 16);
            pill.style.background = `rgba(${r}, ${g}, ${b}, 0.12)`;
            pill.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
            pill.style.color = `rgb(${r}, ${g}, ${b})`;
          }
          
          // Add click handler to play the note
          pill.addEventListener("click", () => {
            if (options.onNoteClick) {
              options.onNoteClick(n);
            }
          });
          
          chordList.appendChild(pill);
        });
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
        // If borrowed is an array (custom scale), show "(borrowed)"
        // Otherwise show the mode name
        const borrowedLabel = Array.isArray(borrowed) ? `(borrowed: ${borrowed})` : `(${borrowed})`;
        chordBorrowedEl.textContent = borrowedLabel;
        chordBorrowedEl.style.display = "block";
      } else {
        chordBorrowedEl.style.display = "none";
      }
    },
    highlightNote(note) {
      // Remove highlight from all pills
      const pills = chordList.querySelectorAll(".pill");
      pills.forEach(p => p.classList.remove("highlighted"));

      // Find and highlight the specific note
      // Note: This matches the exact text content.
      // If there are duplicate notes (unlikely in a chord set diff), it highlights all.
      const target = Array.from(pills).find(p => p.textContent === note);
      if (target) {
        target.classList.add("highlighted");
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

