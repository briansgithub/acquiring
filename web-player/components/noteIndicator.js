import { getScaleDegreeColor, NOTE_NAME_TO_INTEGER_NOTATION } from "../lib/scales.js";
import { getChordSymbol } from "../lib/jsonToSymbol.js";

const NOTE_PC = Object.fromEntries(
  Object.entries(NOTE_NAME_TO_INTEGER_NOTATION).map(([n, v]) => [n.replace(/[#b]/g, (m) => m), v])
);

function noteNameToPitchClass(noteName) {
  const match = noteName?.match(/^([A-G][#b]?)/);
  if (!match) return null;
  const name = match[1];
  return NOTE_NAME_TO_INTEGER_NOTATION[name] ?? NOTE_PC[name] ?? null;
}

function analyzeMelodyTension(melodyNote, chordNotes, chordRootSd) {
  if (!melodyNote || !chordNotes?.length) {
    return { type: "rest", label: "—", description: "No melody or chord", color: "#6b7280" };
  }
  const melodyPc = noteNameToPitchClass(melodyNote);
  if (melodyPc === null) {
    return { type: "unknown", label: "?", description: "Unknown note", color: "#6b7280" };
  }
  const chordPcs = chordNotes.map(noteNameToPitchClass).filter((p) => p !== null);
  if (chordPcs.includes(melodyPc)) {
    const rootPc = chordRootSd ? chordPcs[0] : null;
    const intervalFromRoot = rootPc !== null ? ((melodyPc - rootPc) + 12) % 12 : null;
    if (intervalFromRoot === 0) {
      return { type: "root", label: "Root", description: "Melody is the chord root", color: "#34d399" };
    }
    if ([3, 4].includes(intervalFromRoot)) {
      return { type: "chord-tone", label: "Third", description: "Melody is the chord third", color: "#34d399" };
    }
    if (intervalFromRoot === 7) {
      return { type: "chord-tone", label: "Fifth", description: "Melody is the chord fifth", color: "#34d399" };
    }
    if ([10, 11].includes(intervalFromRoot)) {
      return { type: "extension", label: "Seventh", description: "Melody is the chord seventh", color: "#38bdf8" };
    }
    return { type: "chord-tone", label: "Chord-Tone", description: "Melody is a chord tone", color: "#34d399" };
  }
  const semisAboveRoot = chordRootSd
    ? ((melodyPc - (chordPcs[0] ?? melodyPc)) + 12) % 12
    : null;
  if (semisAboveRoot === 11 || semisAboveRoot === 1) {
    return { type: "tension", label: "Leading-Tone", description: "Leading tone resolving to root", color: "#fbbf24" };
  }
  if ([1, 2, 6, 8, 9].includes(semisAboveRoot)) {
    return { type: "tension", label: "Passing-Tone", description: "Non-chord tone (passing/neighbor)", color: "#fbbf24" };
  }
  return { type: "avoid", label: "Dissonant", description: "Dissonant against chord", color: "#f87171" };
}

export function renderNoteIndicator(container, options = {}) {
  container.innerHTML = `
    <h2>Now Playing</h2>
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 12px; height: calc(100% - 40px); box-sizing: border-box;">
      <div class="card" style="position:relative; height: 180px; box-sizing: border-box; display: flex; flex-direction: column;">
        <div class="label" style="text-align:center;">Melody</div>
        <label for="show-melody-toggle" style="position:absolute;top:10px;right:10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#9ca3af;font-size:12px;">
          <input type="checkbox" id="show-melody-toggle" style="cursor:pointer;" />
          Show Melody
        </label>
        <div id="melody-content-wrapper" style="display:none;margin-top:10px;flex:1;flex-direction:column;justify-content:space-between;">
          <div class="notes-list" id="melody-note-label" style="min-height:32px;margin-top:2px;justify-content:center;"></div>
          <div class="notes-list" id="melody-scale-degree" style="min-height:32px;margin-top:4px;justify-content:center;"></div>
          <div id="tension-badge" class="tension-badge" style="margin-top:8px;padding:6px;border-radius:6px;font-size:12px;text-align:center;box-sizing:border-box;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);color:#64748b;display:flex;flex-direction:column;justify-content:center;height:42px;">
            <div id="tension-title" style="font-size:11px;font-weight:700;">—</div>
            <div id="tension-desc" style="font-size:9px;font-weight:400;margin-top:1px;opacity:0.8;">No active melody</div>
          </div>
        </div>
      </div>
      <div class="card" style="position:relative; height: 180px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div class="label">Chord</div>
          <label for="root-position-toggle" style="position:absolute;top:10px;right:10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#9ca3af;font-size:12px;">
            <input type="checkbox" id="root-position-toggle" style="cursor:pointer;" />
            Root position
          </label>
          <div class="chord-root" id="chord-root" style="min-height:24px;"></div>
        </div>
        <div class="notes-list" id="chord-notes" style="min-height:32px;margin-top:2px;"></div>
        <div class="notes-list" id="chord-degrees-pills" style="min-height:32px;margin-top:4px;"></div>
        <div class="chord-borrowed" id="chord-borrowed" style="position:absolute;top:34px;right:10px;font-style:italic;color:#9ca3af;font-size:0.9em;visibility:hidden;"></div>
      </div>
    </div>
  `;

  const melodyNoteLabelEl = container.querySelector("#melody-note-label");
  const melodyScaleDegreeEl = container.querySelector("#melody-scale-degree");
  const melodyContentWrapper = container.querySelector("#melody-content-wrapper");
  const showMelodyToggle = container.querySelector("#show-melody-toggle");
  const tensionEl = container.querySelector("#tension-badge");
  const tensionTitleEl = container.querySelector("#tension-title");
  const tensionDescEl = container.querySelector("#tension-desc");
  const chordRootEl = container.querySelector("#chord-root");
  const chordList = container.querySelector("#chord-notes");
  const chordDegreesPillsList = container.querySelector("#chord-degrees-pills");
  const chordBorrowedEl = container.querySelector("#chord-borrowed");
  const rootPositionToggle = container.querySelector("#root-position-toggle");

  showMelodyToggle.addEventListener("change", () => {
    if (showMelodyToggle.checked) {
      melodyContentWrapper.style.display = "flex";
    } else {
      melodyContentWrapper.style.display = "none";
    }
  });

  rootPositionToggle.addEventListener("change", () => {
    options.onRootPositionChange?.(rootPositionToggle.checked);
  });
  
  let currentKey = options.key || { tonic: "C", scale: "major" };
  
  // Store current state for redrawing
  let currentMelodyData = { absoluteLabel: null, relativeLabel: null };
  let currentChordData = { notes: null, chordDegrees: null, root: null, borrowed: null, key: null, chordObj: null };
  
  function updateMelodyDisplay() {
    const { absoluteLabel, relativeLabel } = currentMelodyData;
    
    // Clear existing pills
    melodyNoteLabelEl.innerHTML = "";
    melodyScaleDegreeEl.innerHTML = "";
    
    if (!absoluteLabel && !relativeLabel) {
      // Show empty gray pills for rest/no melody
      const notePill = document.createElement("span");
      notePill.className = "pill";
      notePill.textContent = "";
      notePill.style.background = "rgba(107, 114, 128, 0.12)";
      notePill.style.borderColor = "rgba(107, 114, 128, 0.4)";
      notePill.style.color = "#6b7280";
      notePill.style.cursor = "default";
      melodyNoteLabelEl.appendChild(notePill);
      
      const degreePill = document.createElement("span");
      degreePill.className = "pill";
      degreePill.textContent = "";
      degreePill.style.background = "rgba(107, 114, 128, 0.12)";
      degreePill.style.borderColor = "rgba(107, 114, 128, 0.4)";
      degreePill.style.color = "#6b7280";
      degreePill.style.cursor = "default";
      melodyScaleDegreeEl.appendChild(degreePill);

      tensionEl.style.background = "rgba(255, 255, 255, 0.02)";
      tensionEl.style.color = "#64748b";
      tensionEl.style.border = "1px solid rgba(255, 255, 255, 0.05)";
      tensionTitleEl.textContent = "—";
      tensionDescEl.textContent = "No active melody";
      return;
    }
    
    // Create note label pill
    if (absoluteLabel) {
      const notePill = document.createElement("span");
      notePill.className = "pill";
      notePill.textContent = absoluteLabel;
      notePill.style.cursor = "pointer";
      
      // Add click handler to play the note
      notePill.addEventListener("click", () => {
        if (options.onNoteClick) {
          options.onNoteClick(absoluteLabel);
        }
      });
      
      melodyNoteLabelEl.appendChild(notePill);
    }
    
    // Create scale degree pill
    if (relativeLabel) {
      const degreePill = document.createElement("span");
      degreePill.className = "pill";
      degreePill.textContent = relativeLabel;
      degreePill.style.cursor = "pointer";
      
      // Store the corresponding note name for click handler
      if (absoluteLabel) {
        degreePill.dataset.noteName = absoluteLabel;
      }
      
      // Add click handler to play the corresponding note
      degreePill.addEventListener("click", () => {
        if (options.onNoteClick && absoluteLabel) {
          options.onNoteClick(absoluteLabel);
        }
      });
      
      melodyScaleDegreeEl.appendChild(degreePill);
    }

    // Melody vs Chord tension analysis
    const chordNotes = currentChordData.notes;
    if (absoluteLabel && chordNotes && chordNotes.length > 0) {
      const t = analyzeMelodyTension(absoluteLabel, chordNotes, currentChordData.root);
      tensionEl.style.background = `${t.color}15`;
      tensionEl.style.color = t.color;
      tensionEl.style.border = `1px solid ${t.color}44`;
      tensionTitleEl.textContent = t.label;
      tensionDescEl.textContent = t.description;
    } else {
      tensionEl.style.background = "rgba(255, 255, 255, 0.02)";
      tensionEl.style.color = "#64748b";
      tensionEl.style.border = "1px solid rgba(255, 255, 255, 0.05)";
      tensionTitleEl.textContent = "—";
      tensionDescEl.textContent = "No active melody";
    }
  }
  
  function updateChordNotesDisplay() {
    const { notes, chordDegrees, root, key, chordObj } = currentChordData;
    const chordColor = root && key ? getScaleDegreeColor(root, key.scale) : null;
    
    // Clear existing pills
    chordList.innerHTML = "";
    chordDegreesPillsList.innerHTML = "";
    
    // Check if it's a rest or no chord
    const isRest = chordObj?.isRest || !notes?.length;
    
    if (isRest) {
      // Show empty gray pills for rest
      const numPills = 3; // Show 3 empty pills
      for (let i = 0; i < numPills; i++) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = "";
        pill.style.background = "rgba(107, 114, 128, 0.12)";
        pill.style.borderColor = "rgba(107, 114, 128, 0.4)";
        pill.style.color = "#6b7280";
        pill.style.cursor = "default";
        chordList.appendChild(pill);
      }
      // Also show empty pills for scale degrees
      for (let i = 0; i < numPills; i++) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = "";
        pill.style.background = "rgba(107, 114, 128, 0.12)";
        pill.style.borderColor = "rgba(107, 114, 128, 0.4)";
        pill.style.color = "#6b7280";
        pill.style.cursor = "default";
        chordDegreesPillsList.appendChild(pill);
      }
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
      if (chordObj?.isRest || !notes?.length) {
        // Show "Chord: Rest" for rests or empty chords
        chordRootEl.textContent = "Chord: Rest";
        chordRootEl.style.visibility = "visible";
      } else if (chordObj && key) {
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

      // Update melody display to refresh tension analysis against new chord notes
      updateMelodyDisplay();

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
      updateMelodyDisplay(); // This will show empty gray pills
      chordRootEl.textContent = "";
      chordRootEl.style.visibility = "hidden";
      updateChordNotesDisplay();
      chordBorrowedEl.textContent = "";
      chordBorrowedEl.style.visibility = "hidden";
    },
    setRootPositionChecked(checked) {
      rootPositionToggle.checked = !!checked;
    },
  };
}

