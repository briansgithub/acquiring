import { normalizeToneNotes, noteToMidi } from "../lib/chordVoicing.js";
import { getScaleDegreeColor, NOTE_NAME_TO_INTEGER_NOTATION } from "../lib/scales.js";
import { getChordSymbol, getChordLetterName, stripBorrowedTags, borrowedAbbrev } from "../lib/jsonToSymbol.js";
import { romanNumeralToHtml } from "../lib/romanNumeralCanvas.js";
import { verifyScaleDegrees } from "../lib/scaleDegreeVerifier.js";
import { CONTROL_DEFAULTS } from "./controls.js";
import { ARP_SLIDER_MAX, ARP_SLIDER_MIN, formatArpCyclesLabel } from "../lib/timing.js";
import { formatVolumePercent } from "../lib/volume.js";
import { rootToDiatonicTriad } from "../lib/music.js";

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

function analyzeMelodyTension(melodyNote, chordNotes, chordRootSd, key) {
  if (!melodyNote) {
    return { type: "rest", label: "—", description: "No active melody", color: "#6b7280" };
  }

  // If the chord is a rest, fall back to analyzing the melody against the tonic triad
  // for the current key signature (degree 1 in the active key).
  if (!chordNotes?.length) {
    if (key?.tonic && key?.scale) {
      const tonicTriad = rootToDiatonicTriad(1, key, 3);
      chordNotes = normalizeToneNotes(tonicTriad.notes);
      chordRootSd = 1;
    } else {
      return { type: "rest", label: "—", description: "No chord context", color: "#6b7280" };
    }
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
    <div id="now-playing-controls" class="now-playing-controls"></div>
    <div class="now-playing-body">
    <div class="indicator-stack">
      <div class="indicator-melody-section">
        <div class="indicator-volume-row melody-volume-row">
          <label for="melody-volume" class="indicator-volume-label">Melody Vol.:</label>
          <input type="range" id="melody-volume" min="0" max="100" value="${CONTROL_DEFAULTS.melodyVolume}" step="1" class="volume-slider indicator-volume-slider">
          <span id="melody-volume-label" class="indicator-volume-value">${formatVolumePercent(CONTROL_DEFAULTS.melodyVolume)}</span>
        </div>
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
        <div class="chord-header">
          <div class="label">Chord</div>
          <label for="root-position-toggle" class="chord-root-position-toggle">
            <input type="checkbox" id="root-position-toggle" />
            Root position
          </label>
          <div class="chord-root-slot">
            <div class="chord-root" id="chord-root"></div>
          </div>
        </div>
        <div class="notes-list notes-list--chord" id="chord-notes" style="min-height:32px;margin-top:2px;"></div>
        <div class="notes-list notes-list--chord" id="chord-degrees-pills" style="min-height:32px;margin-top:4px;"></div>
        <div class="indicator-volume-row">
          <label for="chord-volume" class="indicator-volume-label">Chord Vol.:</label>
          <input type="range" id="chord-volume" min="0" max="100" value="${CONTROL_DEFAULTS.chordVolume}" step="1" class="volume-slider indicator-volume-slider">
          <span id="chord-volume-label" class="indicator-volume-value">${formatVolumePercent(CONTROL_DEFAULTS.chordVolume)}</span>
        </div>
        <div class="chord-arpeggio-controls">
          <div class="chord-arpeggio-toggles" id="arp-toggles">
            <label for="arpeggiate-toggle" class="indicator-option-toggle chord-arpeggio-toggle"
              title="Play chord tones one at a time in sequence instead of all at once.">
              <input type="checkbox" id="arpeggiate-toggle" />
              Arpeggiate chords
            </label>
            <label for="arp-fixed-speed-toggle" class="indicator-option-toggle chord-arpeggio-toggle arp-fixed-speed-toggle" id="arp-fixed-speed-label"
              title="Same interval between arp notes for every chord. Off: cycles/beat is divided across all chord tones, so larger chords arpeggiate faster.">
              <input type="checkbox" id="arp-fixed-speed-toggle"${CONTROL_DEFAULTS.arpFixedSpeed ? " checked" : ""} />
              Fixed speed
            </label>
            <label for="arp-unlock-tempo-toggle" class="indicator-option-toggle chord-arpeggio-toggle arp-unlock-tempo-toggle" id="arp-unlock-tempo-label"
              title="Keep arpeggio timing at the song's original BPM when the tempo slider changes. Off: arp speed follows the tempo slider.">
              <input type="checkbox" id="arp-unlock-tempo-toggle"${CONTROL_DEFAULTS.arpUnlockFromTempo ? " checked" : ""} />
              Unlock from tempo
            </label>
          </div>
          <div class="arp-speed-row" id="arp-speed-row">
            <label for="arp-speed" class="arp-speed-label">Arp cycles/beat:</label>
            <input type="range" id="arp-speed" min="${ARP_SLIDER_MIN}" max="${ARP_SLIDER_MAX}" value="${CONTROL_DEFAULTS.arpeggiationSlider}" step="1" class="volume-slider arp-speed-slider">
            <span id="arp-speed-label" class="arp-speed-value">${formatArpCyclesLabel(CONTROL_DEFAULTS.arpeggiationSlider)}</span>
          </div>
        </div>
        <div class="chord-borrowed" id="chord-borrowed" style="position:absolute;top:34px;right:10px;font-style:italic;color:#9ca3af;font-size:0.9em;visibility:hidden;"></div>
      </div>
      <div id="now-playing-tempo" class="now-playing-tempo"></div>
    </div>
    </div>
    <div id="now-playing-footer" class="now-playing-footer"></div>
  `;

  const melodyNoteLabelEl = container.querySelector("#melody-note-label");
  const melodyScaleDegreeEl = container.querySelector("#melody-scale-degree");
  const melodySection = container.querySelector("#melody-section");
  const melodyContentWrapper = container.querySelector("#melody-content-wrapper");
  const melodyCollapseToggle = container.querySelector("#melody-collapse-toggle");
  const tensionEl = container.querySelector("#tension-badge");
  const tensionTitleEl = container.querySelector("#tension-title");
  const tensionDescEl = container.querySelector("#tension-desc");
  const melodyVolumeSlider = container.querySelector("#melody-volume");
  const melodyVolumeLabel = container.querySelector("#melody-volume-label");
  const chordVolumeSlider = container.querySelector("#chord-volume");
  const chordVolumeLabel = container.querySelector("#chord-volume-label");
  const chordRootEl = container.querySelector("#chord-root");
  const chordList = container.querySelector("#chord-notes");
  const chordDegreesPillsList = container.querySelector("#chord-degrees-pills");
  const chordBorrowedEl = container.querySelector("#chord-borrowed");
  const rootPositionToggle = container.querySelector("#root-position-toggle");
  const arpToggle = container.querySelector("#arpeggiate-toggle");
  const arpSpeedSlider = container.querySelector("#arp-speed");
  const arpSpeedLabel = container.querySelector("#arp-speed-label");
  const arpSpeedRow = container.querySelector("#arp-speed-row");
  const arpFixedSpeedToggle = container.querySelector("#arp-fixed-speed-toggle");
  const arpFixedSpeedLabel = container.querySelector("#arp-fixed-speed-label");
  const arpUnlockTempoToggle = container.querySelector("#arp-unlock-tempo-toggle");
  const arpUnlockTempoLabel = container.querySelector("#arp-unlock-tempo-label");

  function setArpControlsEnabled(enabled) {
    arpSpeedRow.style.opacity = enabled ? "1" : "0.5";
    arpSpeedRow.style.pointerEvents = enabled ? "auto" : "none";
    arpFixedSpeedToggle.disabled = !enabled;
    arpFixedSpeedLabel.style.opacity = enabled ? "1" : "0.5";
    arpFixedSpeedLabel.style.pointerEvents = enabled ? "auto" : "none";
    arpUnlockTempoToggle.disabled = !enabled;
    arpUnlockTempoLabel.style.opacity = enabled ? "1" : "0.5";
    arpUnlockTempoLabel.style.pointerEvents = enabled ? "auto" : "none";
  }

  setArpControlsEnabled(arpToggle.checked);

  arpToggle.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    setArpControlsEnabled(isChecked);
    options.onArpeggiateToggle?.(isChecked);
  });

  arpFixedSpeedToggle.addEventListener("change", (e) => {
    options.onArpFixedSpeedChange?.(e.target.checked);
  });

  arpUnlockTempoToggle.addEventListener("change", (e) => {
    options.onArpUnlockFromTempoChange?.(e.target.checked);
  });

  arpSpeedSlider.addEventListener("input", (e) => {
    const sliderIndex = Number(e.target.value);
    arpSpeedLabel.textContent = formatArpCyclesLabel(sliderIndex);
    options.onArpeggiateSliderChange?.(sliderIndex);
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

  melodyCollapseToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setMelodyExpanded(melodySection.classList.contains("is-collapsed"));
  });

  melodySection.addEventListener("click", () => {
    if (melodySection.classList.contains("is-collapsed")) {
      setMelodyExpanded(true);
    }
  });

  setMelodyExpanded(false);

  rootPositionToggle.addEventListener("change", () => {
    options.onRootPositionChange?.(rootPositionToggle.checked);
  });

  melodyVolumeSlider.addEventListener("input", (e) => {
    const percent = Number(e.target.value);
    melodyVolumeLabel.textContent = formatVolumePercent(percent);
    options.onMelodyVolumeChange?.(percent);
  });

  chordVolumeSlider.addEventListener("input", (e) => {
    const percent = Number(e.target.value);
    chordVolumeLabel.textContent = formatVolumePercent(percent);
    options.onChordVolumeChange?.(percent);
  });

  let currentKey = options.key || null;
  let useRomanNumerals = options.labelMode !== false;

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
    if (absoluteLabel) {
      const t = analyzeMelodyTension(absoluteLabel, chordNotes, currentChordData.root, currentChordData.key || currentKey);
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

  function updateChordLabelDisplay() {
    const { notes, root, key, chordObj } = currentChordData;
    const effKey = key || currentKey;

    if (chordObj?.isRest || !notes?.length) {
      chordRootEl.textContent = "Chord: Rest";
      chordRootEl.style.visibility = "visible";
      return;
    }

    if (chordObj && effKey) {
      const symbol = useRomanNumerals
        ? stripBorrowedTags(getChordSymbol(chordObj, effKey))
        : getChordLetterName(chordObj, effKey);
      const labelHtml = useRomanNumerals ? romanNumeralToHtml(symbol) : symbol;
      chordRootEl.innerHTML = `Chord: <span class="chord-roman-line">${labelHtml}</span>`;
      chordRootEl.style.visibility = "visible";
      return;
    }

    if (root) {
      chordRootEl.textContent = `Chord: ${root.toString()}`;
      chordRootEl.style.visibility = "visible";
    } else {
      chordRootEl.textContent = "";
      chordRootEl.style.visibility = "hidden";
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

    if (activeHighlightMidi != null) {
      applyHighlightToMidi(activeHighlightMidi);
    }
  }

  let highlightClearTimer = null;
  let activeHighlightMidi = null;

  function applyHighlightToMidi(noteMidi) {
    const target = Array.from(chordList.querySelectorAll(".pill")).find(
      (p) => p.textContent && noteToMidi(p.textContent) === noteMidi
    );
    if (!target) return false;
    target.classList.add("highlighted");
    const noteIndex = Array.from(chordList.querySelectorAll(".pill")).indexOf(target);
    const degreePills = chordDegreesPillsList.querySelectorAll(".pill");
    if (degreePills[noteIndex]) {
      degreePills[noteIndex].classList.add("highlighted");
    }
    return true;
  }

  function clearNoteHighlight() {
    if (highlightClearTimer) {
      clearTimeout(highlightClearTimer);
      highlightClearTimer = null;
    }
    activeHighlightMidi = null;
    const allPills = [...chordList.querySelectorAll(".pill"), ...chordDegreesPillsList.querySelectorAll(".pill")];
    allPills.forEach((p) => p.classList.remove("highlighted"));
  }

  return {
    updateMelody(absoluteLabel, relativeLabel) {
      currentMelodyData = { absoluteLabel, relativeLabel };
      updateMelodyDisplay();
    },
    updateChord(notes, root, chordDegrees, borrowed, key, chordObj = null) {
      const displayNotes = notes?.length ? normalizeToneNotes(notes) : notes;
      // Store current chord data
      currentChordData = { notes: displayNotes, chordDegrees, root, borrowed, key, chordObj };
      
      if (key) {
        currentKey = key;
      }

      updateChordLabelDisplay();

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

      activeHighlightMidi = noteToMidi(note);
      applyHighlightToMidi(activeHighlightMidi);

      if (clearAfterMs != null && clearAfterMs > 0) {
        highlightClearTimer = setTimeout(clearNoteHighlight, clearAfterMs);
      }
    },
    clearNoteHighlight,
    setKey(key) {
      currentKey = key || null;
    },
    setLabelMode(useRoman) {
      useRomanNumerals = useRoman;
      updateChordLabelDisplay();
    },
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
    setMelodyVolume(percent) {
      melodyVolumeSlider.value = percent;
      melodyVolumeLabel.textContent = formatVolumePercent(percent);
    },
    setChordVolume(percent) {
      chordVolumeSlider.value = percent;
      chordVolumeLabel.textContent = formatVolumePercent(percent);
    },
    resetVolumesToDefaults() {
      const d = CONTROL_DEFAULTS;
      this.setMelodyVolume(d.melodyVolume);
      this.setChordVolume(d.chordVolume);
    },
    setRootPositionChecked(checked) {
      rootPositionToggle.checked = !!checked;
    },
    setArpeggiated(enabled) {
      arpToggle.checked = !!enabled;
      setArpControlsEnabled(arpToggle.checked);
    },
    setArpFixedSpeedChecked(checked) {
      arpFixedSpeedToggle.checked = !!checked;
    },
    setArpUnlockFromTempoChecked(checked) {
      arpUnlockTempoToggle.checked = !!checked;
    },
    setArpeggiationSlider(sliderIndex) {
      arpSpeedSlider.value = sliderIndex;
      arpSpeedLabel.textContent = formatArpCyclesLabel(sliderIndex);
    },
    resetArpToDefaults() {
      const d = CONTROL_DEFAULTS;
      this.setArpeggiated(d.arpeggiated);
      this.setArpeggiationSlider(d.arpeggiationSlider);
      this.setArpFixedSpeedChecked(d.arpFixedSpeed);
      this.setArpUnlockFromTempoChecked(d.arpUnlockFromTempo);
    },
  };
}

