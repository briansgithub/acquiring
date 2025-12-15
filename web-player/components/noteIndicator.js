import { getScaleDegreeColor } from "../lib/scales.js";
import { getChordSymbol } from "../lib/jsonToSymbol.js";

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
    <div class="row" style="margin-top:10px;">
      <input type="checkbox" id="scale-degree-toggle" style="cursor:pointer;">
      <label for="scale-degree-toggle" style="font-size:12px;color:#9ca3af;cursor:pointer;user-select:none;">Show Scale Degrees</label>
    </div>
  `;

  const melodyEl = container.querySelector("#melody-note");
  const chordRootEl = container.querySelector("#chord-root");
  const chordList = container.querySelector("#chord-notes");
  const chordDegreesEl = container.querySelector("#chord-degrees");
  const chordBorrowedEl = container.querySelector("#chord-borrowed");
  const scaleDegreeToggle = container.querySelector("#scale-degree-toggle");
  
  let showScaleDegrees = false; // Default to showing note names
  let currentKey = options.key || { tonic: "C", scale: "major" };
  
  // Store current state for redrawing
  let currentMelodyData = { absoluteLabel: null, relativeLabel: null };
  let currentChordData = { notes: null, chordDegrees: null, root: null, borrowed: null, key: null, chordObj: null };
  
  // Toggle handler
  scaleDegreeToggle.addEventListener("change", (e) => {
    showScaleDegrees = e.target.checked;
    // Redraw current state with new display mode
    if (currentMelodyData.absoluteLabel !== null || currentMelodyData.relativeLabel !== null) {
      updateMelodyDisplay();
    }
    if (currentChordData.notes !== null) {
      updateChordNotesDisplay();
    }
  });
  
  function updateMelodyDisplay() {
    const { absoluteLabel, relativeLabel } = currentMelodyData;
    if (!absoluteLabel && !relativeLabel) {
      melodyEl.textContent = "--";
      return;
    }
    if (showScaleDegrees) {
      // Show scale degree number
      melodyEl.textContent = relativeLabel || "--";
    } else {
      // Show note name (original behavior)
      if (absoluteLabel && relativeLabel) {
        melodyEl.textContent = `${absoluteLabel} (${relativeLabel})`;
      } else {
        melodyEl.textContent = absoluteLabel || relativeLabel || "--";
      }
    }
  }
  
  function updateChordNotesDisplay() {
    const { notes, chordDegrees, root, key } = currentChordData;
    const chordColor = root && key ? getScaleDegreeColor(root, key.scale) : null;
    
    if (!notes?.length) {
      chordList.innerHTML = '<span style="color:#6b7280;">--</span>';
      return;
    }
    
    // Clear existing pills
    chordList.innerHTML = "";
    
    // Create and append pills with event listeners
    (notes || []).forEach((n, index) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      
      // Convert to display format
      if (showScaleDegrees && chordDegrees && Array.isArray(chordDegrees) && chordDegrees[index] !== undefined) {
        // Show scale degree with modifier (preserve modifiers like "b3", "#4")
        pill.textContent = chordDegrees[index];
        // Store original note name for click handler
        pill.dataset.noteName = n;
      } else {
        // Show note name
        pill.textContent = n;
      }
      
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
      
      // Add click handler to play the note (use original note name)
      pill.addEventListener("click", () => {
        if (options.onNoteClick) {
          const noteToPlay = pill.dataset.noteName || n;
          options.onNoteClick(noteToPlay);
        }
      });
      
      chordList.appendChild(pill);
    });
  }

  return {
    updateMelody(absoluteLabel, relativeLabel) {
      currentMelodyData = { absoluteLabel, relativeLabel };
      updateMelodyDisplay();
    },
    updateChord(notes, root, chordDegrees, borrowed, key, chordObj = null) {
      // Store current chord data
      currentChordData = { notes, chordDegrees, root, borrowed, key, chordObj };
      
      // Update currentKey
      if (key) {
        currentKey = key;
      }
      
      // Update chord symbol (always use roman numeral)
      if (chordObj && key) {
        const symbol = getChordSymbol(chordObj, key);
        chordRootEl.textContent = symbol;
        chordRootEl.style.display = "block";
      } else if (root) {
        chordRootEl.textContent = root.toString();
        chordRootEl.style.display = "block";
      } else {
        chordRootEl.style.display = "none";
      }

      // Update notes display
      updateChordNotesDisplay();

      // Update chord degrees (always show)
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
      // Match by original note name (stored in dataset) or by displayed text
      const target = Array.from(pills).find(p => {
        const originalNote = p.dataset.noteName;
        return originalNote === note || p.textContent === note;
      });
      if (target) {
        target.classList.add("highlighted");
      }
    },
    reset() {
      currentMelodyData = { absoluteLabel: null, relativeLabel: null };
      currentChordData = { notes: null, chordDegrees: null, root: null, borrowed: null, key: null, chordObj: null };
      melodyEl.textContent = "--";
      chordRootEl.style.display = "none";
      chordList.innerHTML = '<span style="color:#6b7280;">--</span>';
      chordDegreesEl.style.display = "none";
      chordBorrowedEl.style.display = "none";
    },
  };
}

