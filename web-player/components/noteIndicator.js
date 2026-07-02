import { getScaleDegreeColor, NOTE_NAME_TO_INTEGER_NOTATION } from "../lib/scales.js";
import { getChordSymbol, stripBorrowedTags, borrowedAbbrev } from "../lib/jsonToSymbol.js";
import { romanNumeralToHtml } from "../lib/romanNumeralCanvas.js";
import { verifyScaleDegrees } from "../lib/scaleDegreeVerifier.js";
import { CONTROL_DEFAULTS, formatArpSpeedLabel } from "./controls.js";

const VERIFY_DEGREES = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("verifyDegrees") === "1";

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
    <h2 class="now-playing-title">Now Playing</h2>
    <div id="now-playing-key" class="now-playing-key">—</div>
    <div class="indicator-stack">
      <div class="indicator-melody-section">
        <div id="melody-section" class="card indicator-card indicator-card--melody is-collapsed">
          <div class="melody-section-header">
            <div class="label indicator-card-label melody-section-title">Melody</div>
            <button type="button" class="melody-collapse-toggle" id="melody-collapse-toggle" aria-expanded="false" aria-label="Expand melody"><span class="melody-collapse-caret">▼</span></button>
          </div>
          <div id="melody-content-wrapper" class="melody-content-wrapper" hidden>
            <div class="notes-list" id="melody-note-label"></div>
            <div class="notes-list" id="melody-scale-degree"></div>
            <div id="tension-badge" class="tension-badge">
              <div id="tension-title" class="tension-title">—</div>
              <div id="tension-desc" class="tension-desc">No active melody</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card indicator-card indicator-card--chord">
        <div>
          <div class="label">Chord</div>
          <label for="root-position-toggle" style="position:absolute;top:10px;right:10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#9ca3af;font-size:12px;">
            <input type="checkbox" id="root-position-toggle" style="cursor:pointer;" />
            Root position
          </label>
          <div class="chord-root" id="chord-root" style="min-height:24px;"></div>
        </div>
        <div class="notes-list notes-list--chord" id="chord-notes" style="min-height:32px;margin-top:2px;"></div>
        <div class="notes-list notes-list--chord" id="chord-degrees-pills" style="min-height:32px;margin-top:4px;"></div>
        <div class="chord-arpeggio-controls">
          <label for="arpeggiate-toggle" class="indicator-option-toggle chord-arpeggio-toggle">
            <input type="checkbox" id="arpeggiate-toggle" />
            Arpeggiate chords
          </label>
          <div class="arp-speed-row" id="arp-speed-row">
            <label for="arp-speed" class="arp-speed-label">Arp speed:</label>
            <input type="range" id="arp-speed" min="10" max="1000" value="100" step="10" class="volume-slider arp-speed-slider">
            <span id="arp-speed-label" class="arp-speed-value">100ms</span>
          </div>
        </div>
        <div class="chord-borrowed" id="chord-borrowed" style="position:absolute;top:34px;right:10px;font-style:italic;color:#9ca3af;font-size:0.9em;visibility:hidden;"></div>
      </div>
    </div>
  `;

  const melodyNoteLabelEl = container.querySelector("#melody-note-label");
  const melodyScaleDegreeEl = container.querySelector("#melody-scale-degree");
  const melodySection = container.querySelector("#melody-section");
  const melodyContentWrapper = container.querySelector("#melody-content-wrapper");
  const melodyCollapseToggle = container.querySelector("#melody-collapse-toggle");
  const tensionEl = container.querySelector("#tension-badge");
  const tensionTitleEl = container.querySelector("#tension-title");
  const tensionDescEl = container.querySelector("#tension-desc");
  const keyIndicatorEl = container.querySelector("#now-playing-key");
  const chordRootEl = container.querySelector("#chord-root");
  const chordList = container.querySelector("#chord-notes");
  const chordDegreesPillsList = container.querySelector("#chord-degrees-pills");
  const chordBorrowedEl = container.querySelector("#chord-borrowed");
  const rootPositionToggle = container.querySelector("#root-position-toggle");
  const arpToggle = container.querySelector("#arpeggiate-toggle");
  const arpSpeedSlider = container.querySelector("#arp-speed");
  const arpSpeedLabel = container.querySelector("#arp-speed-label");
  const arpSpeedRow = container.querySelector("#arp-speed-row");

  function setArpSpeedRowEnabled(enabled) {
    arpSpeedRow.style.opacity = enabled ? "1" : "0.5";
    arpSpeedRow.style.pointerEvents = enabled ? "auto" : "none";
  }

  setArpSpeedRowEnabled(arpToggle.checked);

  arpToggle.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    setArpSpeedRowEnabled(isChecked);
    options.onArpeggiateToggle?.(isChecked);
  });

  arpSpeedSlider.addEventListener("input", (e) => {
    const ms = Number(e.target.value);
    arpSpeedLabel.textContent = formatArpSpeedLabel(ms);
    options.onArpeggiateSpeedChange?.(ms);
  });

  function setMelodyExpanded(expanded) {
    melodySection.classList.toggle("is-collapsed", !expanded);
    melodyContentWrapper.hidden = !expanded;
    const caret = melodyCollapseToggle.querySelector(".melody-collapse-caret");
    if (caret) caret.textContent = expanded ? "▲" : "▼";
    melodyCollapseToggle.setAttribute("aria-expanded", String(expanded));
    melodyCollapseToggle.setAttribute("aria-label", expanded ? "Collapse melody" : "Expand melody");
    melodyCollapseToggle.title = expanded ? "Collapse melody" : "Expand melody";
  }

  melodyCollapseToggle.addEventListener("click", () => {
    setMelodyExpanded(melodySection.classList.contains("is-collapsed"));
  });

  setMelodyExpanded(false);

  rootPositionToggle.addEventListener("change", () => {
    options.onRootPositionChange?.(rootPositionToggle.checked);
  });
  
  let currentKey = options.key || null;
  updateKeyDisplay(currentKey);

  function updateKeyDisplay(key) {
    if (!keyIndicatorEl) return;
    if (key?.tonic && key?.scale) {
      const scaleName = key.scale.charAt(0).toUpperCase() + key.scale.slice(1);
      keyIndicatorEl.textContent = `${key.tonic} ${scaleName}`;
    } else {
      keyIndicatorEl.textContent = "—";
    }
  }
  
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
      const numPills = 4;
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
          options.onNoteClick(n, { isChord: true });
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
            options.onNoteClick(correspondingNote, { isChord: true });
          }
        });
        
        chordDegreesPillsList.appendChild(pill);
      });
    }
  }

  let highlightClearTimer = null;

  function clearNoteHighlight() {
    if (highlightClearTimer) {
      clearTimeout(highlightClearTimer);
      highlightClearTimer = null;
    }
    const allPills = [...chordList.querySelectorAll(".pill"), ...chordDegreesPillsList.querySelectorAll(".pill")];
    allPills.forEach((p) => p.classList.remove("highlighted"));
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
        updateKeyDisplay(key);
      }
      
      // Update chord symbol (always use roman numeral) with "Chord: " prefix
      if (chordObj?.isRest || !notes?.length) {
        // Show "Chord: Rest" for rests or empty chords
        chordRootEl.textContent = "Chord: Rest";
        chordRootEl.style.visibility = "visible";
      } else if (chordObj && key) {
        const symbol = stripBorrowedTags(getChordSymbol(chordObj, key));
        chordRootEl.innerHTML = `Chord: <span class="chord-roman-line">${romanNumeralToHtml(symbol)}</span>`;
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

      if (VERIFY_DEGREES && notes?.length && chordDegrees?.length && key) {
        const check = verifyScaleDegrees({ key, notes, chordDegrees });
        if (!check.ok) {
          console.warn("[scale-degree verify]", check.failures, { notes, chordDegrees, key, chordObj });
        }
      }

      // Update melody display to refresh tension analysis against new chord notes
      updateMelodyDisplay();

      // Update borrowed (fixed position, doesn't affect layout)
      const abbrev = borrowedAbbrev(borrowed);
      if (abbrev) {
        chordBorrowedEl.textContent = abbrev;
        chordBorrowedEl.style.visibility = "visible";
      } else if (borrowed) {
        chordBorrowedEl.textContent = Array.isArray(borrowed) ? "(bor)" : `(${borrowed})`;
        chordBorrowedEl.style.visibility = "visible";
      } else {
        chordBorrowedEl.textContent = "";
        chordBorrowedEl.style.visibility = "hidden";
      }
    },
    highlightNote(note, clearAfterMs = null) {
      clearNoteHighlight();

      const target = Array.from(chordList.querySelectorAll(".pill")).find((p) => p.textContent === note);
      if (target) {
        target.classList.add("highlighted");
        const noteIndex = Array.from(chordList.querySelectorAll(".pill")).indexOf(target);
        const degreePills = chordDegreesPillsList.querySelectorAll(".pill");
        if (degreePills[noteIndex]) {
          degreePills[noteIndex].classList.add("highlighted");
        }
      }

      if (clearAfterMs != null && clearAfterMs > 0) {
        highlightClearTimer = setTimeout(clearNoteHighlight, clearAfterMs);
      }
    },
    clearNoteHighlight,
    reset() {
      clearNoteHighlight();
      currentMelodyData = { absoluteLabel: null, relativeLabel: null };
      currentChordData = { notes: null, chordDegrees: null, root: null, borrowed: null, key: null, chordObj: null };
      updateMelodyDisplay();
      chordRootEl.textContent = "";
      chordRootEl.style.visibility = "hidden";
      updateChordNotesDisplay();
      chordBorrowedEl.textContent = "";
      chordBorrowedEl.style.visibility = "hidden";
    },
    setKey(key) {
      currentKey = key;
      updateKeyDisplay(key);
    },
    setRootPositionChecked(checked) {
      rootPositionToggle.checked = !!checked;
    },
    setArpeggiated(enabled) {
      arpToggle.checked = !!enabled;
      setArpSpeedRowEnabled(arpToggle.checked);
    },
    setArpeggiationSpeed(ms) {
      arpSpeedSlider.value = ms;
      arpSpeedLabel.textContent = formatArpSpeedLabel(ms);
    },
    resetArpToDefaults() {
      const d = CONTROL_DEFAULTS;
      this.setArpeggiated(d.arpeggiated);
      this.setArpeggiationSpeed(d.arpeggiationSpeed);
    },
  };
}

