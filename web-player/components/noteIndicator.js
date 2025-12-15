import { getScaleDegreeColor } from "../lib/scales.js";
import { getChordSymbol } from "../lib/jsonToSymbol.js";

export function renderNoteIndicator(container, options = {}) {
  container.innerHTML = `
    <h2>Now Playing</h2>
    <div class="card">
      <div class="label">Melody</div>
      <div class="value" id="melody-note">--</div>
    </div>
    <div class="card" style="position:relative;">
      <div class="label">Chord</div>
      <div class="chord-root" id="chord-root" style="min-height:24px;"></div>
      <div class="notes-list" id="chord-notes" style="min-height:32px;margin-top:2px;"></div>
      <div class="notes-list" id="chord-degrees-pills" style="min-height:32px;margin-top:4px;"></div>
      <div class="chord-borrowed" id="chord-borrowed" style="position:absolute;top:10px;right:10px;font-style:italic;color:#9ca3af;font-size:0.9em;visibility:hidden;"></div>
    </div>
  `;

  const melodyEl = container.querySelector("#melody-note");
  const chordRootEl = container.querySelector("#chord-root");
  const chordList = container.querySelector("#chord-notes");
  const chordDegreesPillsList = container.querySelector("#chord-degrees-pills");
  const chordBorrowedEl = container.querySelector("#chord-borrowed");
  
  let currentKey = options.key || { tonic: "C", scale: "major" };
  
  // Store current state for redrawing
  let currentMelodyData = { absoluteLabel: null, relativeLabel: null };
  let currentChordData = { notes: null, chordDegrees: null, root: null, borrowed: null, key: null, chordObj: null };
  
  function updateMelodyDisplay() {
    const { absoluteLabel, relativeLabel } = currentMelodyData;
    if (!absoluteLabel && !relativeLabel) {
      melodyEl.textContent = "--";
      return;
    }
    // Always show note name with scale degree
    if (absoluteLabel && relativeLabel) {
      melodyEl.textContent = `${absoluteLabel} (${relativeLabel})`;
    } else {
      melodyEl.textContent = absoluteLabel || relativeLabel || "--";
    }
  }
  
  function updateChordNotesDisplay() {
    const { notes, chordDegrees, root, key } = currentChordData;
    const chordColor = root && key ? getScaleDegreeColor(root, key.scale) : null;
    
    // Clear existing pills
    chordList.innerHTML = "";
    chordDegreesPillsList.innerHTML = "";
    
    if (!notes?.length) {
      chordList.innerHTML = '<span style="color:#6b7280;line-height:32px;">--</span>';
      return;
    }
    
    // Create note label pills
    (notes || []).forEach((n, index) => {
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
    
    // Create scale degree pills below
    if (chordDegrees && Array.isArray(chordDegrees) && notes && notes.length > 0) {
      chordDegrees.forEach((degree, index) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = degree;
        pill.style.cursor = "pointer";
        
        // Store the corresponding note name for click handler
        const correspondingNote = notes[index];
        if (correspondingNote) {
          pill.dataset.noteName = correspondingNote;
        }
        
        if (chordColor) {
          // Convert hex to rgba for background with opacity
          const r = parseInt(chordColor.slice(1, 3), 16);
          const g = parseInt(chordColor.slice(3, 5), 16);
          const b = parseInt(chordColor.slice(5, 7), 16);
          pill.style.background = `rgba(${r}, ${g}, ${b}, 0.12)`;
          pill.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
          pill.style.color = `rgb(${r}, ${g}, ${b})`;
        }
        
        // Add click handler to play the corresponding note
        pill.addEventListener("click", () => {
          if (options.onNoteClick && correspondingNote) {
            options.onNoteClick(correspondingNote);
          }
        });
        
        chordDegreesPillsList.appendChild(pill);
      });
    }
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
      
      // Update chord symbol (always use roman numeral) with "Chord: " prefix
      if (chordObj && key) {
        const symbol = getChordSymbol(chordObj, key);
        chordRootEl.textContent = `Chord: ${symbol}`;
        chordRootEl.style.visibility = "visible";
      } else if (root) {
        chordRootEl.textContent = `Chord: ${root.toString()}`;
        chordRootEl.style.visibility = "visible";
      } else {
        chordRootEl.textContent = "";
        chordRootEl.style.visibility = "hidden";
      }

      // Update notes display
      updateChordNotesDisplay();

      // Update borrowed (fixed position, doesn't affect layout)
      if (borrowed) {
        // If borrowed is an array (custom scale), show "(borrowed)"
        // Otherwise show the mode name
        const borrowedLabel = Array.isArray(borrowed) ? `(borrowed: ${borrowed})` : `(${borrowed})`;
        chordBorrowedEl.textContent = borrowedLabel;
        chordBorrowedEl.style.visibility = "visible";
      } else {
        chordBorrowedEl.textContent = "";
        chordBorrowedEl.style.visibility = "hidden";
      }
    },
    highlightNote(note) {
      // Remove highlight from all pills (both note labels and scale degrees)
      const allPills = [...chordList.querySelectorAll(".pill"), ...chordDegreesPillsList.querySelectorAll(".pill")];
      allPills.forEach(p => p.classList.remove("highlighted"));

      // Find and highlight the specific note in the note labels row
      const target = Array.from(chordList.querySelectorAll(".pill")).find(p => p.textContent === note);
      if (target) {
        target.classList.add("highlighted");
        // Also highlight corresponding scale degree pill if it exists
        const noteIndex = Array.from(chordList.querySelectorAll(".pill")).indexOf(target);
        const degreePills = chordDegreesPillsList.querySelectorAll(".pill");
        if (degreePills[noteIndex]) {
          degreePills[noteIndex].classList.add("highlighted");
        }
      }
    },
    reset() {
      currentMelodyData = { absoluteLabel: null, relativeLabel: null };
      currentChordData = { notes: null, chordDegrees: null, root: null, borrowed: null, key: null, chordObj: null };
      melodyEl.textContent = "--";
      chordRootEl.textContent = "";
      chordRootEl.style.visibility = "hidden";
      chordList.innerHTML = '<span style="color:#6b7280;line-height:32px;">--</span>';
      chordDegreesPillsList.innerHTML = "";
      chordBorrowedEl.textContent = "";
      chordBorrowedEl.style.visibility = "hidden";
    },
  };
}

