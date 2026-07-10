
import { 
  SCALE_DEGREE_COLORS, 
  ROMAN_NUMERALS_MAJOR, 
  ROMAN_NUMERALS_MINOR,
  ROMAN_NUMERALS_DORIAN,
  ROMAN_NUMERALS_PHRYGIAN,
  ROMAN_NUMERALS_LYDIAN,
  ROMAN_NUMERALS_MIXOLYDIAN,
  ROMAN_NUMERALS_LOCRIAN,
  getScaleDegreeColor,
  getHooktheoryColor,
  getBoomwhackerColor,
  createStripedPattern
} from "../lib/scales.js";
import { getChordSymbol, getChordLetterName, stripBorrowedTags, borrowedAbbrev } from "../lib/jsonToSymbol.js";
import { rootToDiatonicTriad, getNoteLabel, chordInterpreter } from "../lib/music.js";
import { drawRomanNumeral, measureRomanNumeral, romanNumeralToHtml } from "../lib/romanNumeralCanvas.js";
import { getChordPronunciation, pronunciationDisplayHtml } from "../lib/romanNumeralSpeak.js";

export function renderChordRing(container, options = {}) {
  const header = document.createElement("div");
  header.className = "pane-panel-head ring-panel-head";
  header.innerHTML = `
    <div class="ring-head-row">
      <div id="ring-playback-controls" class="ring-playback-controls" hidden></div>
      <h2 class="pane-panel-title ring-panel-title">Chord Ring</h2>
      <div class="ring-color-scheme-toggle-wrap">
        <button class="ring-color-scheme-toggle" id="ring-color-scheme-toggle" title="Color Scheme" aria-expanded="false">
          <span class="ring-color-scheme-toggle-label">🎨</span>
          <span class="ring-color-scheme-toggle-arrow">▾</span>
        </button>
        <div id="ring-color-scheme-panel" class="ring-color-scheme-panel" hidden>
          <div class="ring-color-scheme-panel-inner">
            <select id="ring-color-scheme-select" class="ring-color-scheme-select">
              <option value="diatonic">Diatonic Function</option>
              <option value="hooktheory">Hooktheory Relative Major</option>
              <option value="boomwhacker">Boomwhacker 12-Tone</option>
            </select>
            <div id="ring-color-scheme-desc" class="ring-color-scheme-desc"></div>
          </div>
        </div>
      </div>
    </div>
    <div id="chord-ring-key-wrap" style="display:flex; flex-direction:column; align-items:center; gap:6px;">
      <div id="chord-ring-key" class="chord-ring-key">—</div>
      <div id="chord-ring-key-actions" class="chord-ring-key-actions" style="display:flex; gap:6px;">
        <button id="ring-tonic-btn" class="chord-ring-tonic-btn">Tonic</button>
        <button id="ring-ionian-btn" class="chord-ring-tonic-btn">Ionian</button>
      </div>
    </div>
  `;
  container.appendChild(header);

  const keyIndicatorEl = header.querySelector("#chord-ring-key");
  const tonicBtn = header.querySelector("#ring-tonic-btn");
  const ionianBtn = header.querySelector("#ring-ionian-btn");

  function getRelativeIonianDegree(scale) {
    switch (scale) {
      case "major": case "ionian": return 1;
      case "dorian": return "b7";
      case "phrygian": return "b6";
      case "lydian": return 5;
      case "mixolydian": return 4;
      case "minor": case "aeolian": case "harmonicMinor": return 3;
      case "locrian": return "b2";
      case "phrygianDominant": return "b6";
      default: return 1;
    }
  }

  function handleNoteButton(btn, getNoteFn) {
    const playNote = (e) => {
      e.preventDefault();
      if (!currentKey || !options.onNotePlay) return;
      const note = getNoteFn();
      if (note) {
        options.onNotePlay(note);
        btn.classList.add("is-active");
      }
    };
    const releaseNote = (e) => {
      e.preventDefault();
      if (options.onNoteRelease) options.onNoteRelease();
      btn.classList.remove("is-active");
    };
    btn.addEventListener("mousedown", playNote);
    btn.addEventListener("touchstart", playNote, { passive: false });
    
    window.addEventListener("mouseup", (e) => {
      if (btn.classList.contains("is-active")) releaseNote(e);
    });
    window.addEventListener("touchend", (e) => {
      if (btn.classList.contains("is-active")) releaseNote(e);
    });
  }

  handleNoteButton(tonicBtn, () => {
    return getNoteLabel(1, currentKey) + "4";
  });

  handleNoteButton(ionianBtn, () => {
    const degree = getRelativeIonianDegree(currentKey.scale);
    return getNoteLabel(degree, currentKey) + "4";
  });

  function updateKeyDisplay(key) {
    if (!keyIndicatorEl) return;
    if (key?.tonic && key?.scale) {
      const scaleName = key.scale.charAt(0).toUpperCase() + key.scale.slice(1);
      keyIndicatorEl.textContent = `${key.tonic} ${scaleName}`;
    } else {
      keyIndicatorEl.textContent = "—";
    }
  }

  const wrapper = document.createElement("div");
  wrapper.className = "ring-canvas-wrap";
  
  const canvas = document.createElement("canvas");
  wrapper.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  
  // Create overlay div for checkboxes at bottom
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.bottom = "10px";
  overlay.style.left = "50%";
  overlay.style.transform = "translateX(-50%)"; // Center horizontally
  overlay.style.pointerEvents = "auto";
  overlay.style.zIndex = "10";
  overlay.style.textAlign = "center";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.gap = "8px";
  overlay.style.alignItems = "center";
  
  // Roman numerals checkbox
  const romanLabel = document.createElement("label");
  romanLabel.style.cssText = "display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#ffffff;font-size:12px;white-space:nowrap;";
  const romanCheckbox = document.createElement("input");
  romanCheckbox.type = "checkbox";
  romanCheckbox.id = "roman-numeral-toggle-ring";
  romanCheckbox.checked = true;
  romanCheckbox.style.cssText = "cursor:pointer;";
  const romanSpan = document.createElement("span");
  romanSpan.textContent = "Roman Numerals";
  romanLabel.appendChild(romanCheckbox);
  romanLabel.appendChild(romanSpan);
  overlay.appendChild(romanLabel);
  
  wrapper.appendChild(overlay);
  
  container.appendChild(wrapper);
  
  const romanNumeralToggle = romanCheckbox;

  let currentColorScheme = options.colorScheme || "diatonic";

  const colorSchemePanel = header.querySelector("#ring-color-scheme-panel");
  const colorSchemeToggleBtn = header.querySelector("#ring-color-scheme-toggle");
  const colorSchemeToggleArrow = header.querySelector(".ring-color-scheme-toggle-arrow");
  const colorSchemeSelect = header.querySelector("#ring-color-scheme-select");
  const colorSchemeDesc = header.querySelector("#ring-color-scheme-desc");

  const getDescription = (scheme) => {
    if (scheme === "diatonic") return "Colors chords by their diatonic scale degree in the current key.";
    if (scheme === "hooktheory") return "Colors by degree relative to the Relative Major (Ionian Mode).";
    if (scheme === "boomwhacker") return "12-tone array coloring by half-step distance from the Relative Major root.";
    return "";
  };

  colorSchemeSelect.value = currentColorScheme;
  colorSchemeDesc.textContent = getDescription(currentColorScheme);

  let colorPanelOpen = false;
  colorSchemeToggleBtn.addEventListener("click", () => {
    colorPanelOpen = !colorPanelOpen;
    colorSchemePanel.hidden = !colorPanelOpen;
    colorSchemeToggleBtn.setAttribute("aria-expanded", String(colorPanelOpen));
    colorSchemeToggleArrow.textContent = colorPanelOpen ? "▴" : "▾";
  });

  colorSchemeSelect.addEventListener("change", (e) => {
    const val = e.target.value;
    currentColorScheme = val;
    colorSchemeDesc.textContent = getDescription(val);
    if (options.onColorSchemeChange) options.onColorSchemeChange(val);
    draw();
  });


  // Create transition table overlay at upper right
  const transitionTableOverlay = document.createElement("div");
  transitionTableOverlay.id = "transition-table-overlay";
  transitionTableOverlay.style.position = "absolute";
  transitionTableOverlay.style.top = "10px";
  transitionTableOverlay.style.right = "10px";
  transitionTableOverlay.style.pointerEvents = "auto";
  transitionTableOverlay.style.zIndex = "10";
  transitionTableOverlay.style.maxWidth = "300px";
  transitionTableOverlay.style.maxHeight = "400px";
  transitionTableOverlay.style.overflowY = "auto";
  transitionTableOverlay.style.background = "rgba(17, 24, 39, 0.95)";
  transitionTableOverlay.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  transitionTableOverlay.style.borderRadius = "8px";
  transitionTableOverlay.style.padding = "8px";
  transitionTableOverlay.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.4)";
  transitionTableOverlay.style.display = "none"; // Hidden by default until transitions exist
  
  const tableTitle = document.createElement("div");
  tableTitle.textContent = "Chord Transitions";
  tableTitle.style.fontSize = "12px";
  tableTitle.style.fontWeight = "600";
  tableTitle.style.color = "#cbd5e1";
  tableTitle.style.marginBottom = "6px";
  tableTitle.style.paddingBottom = "4px";
  tableTitle.style.borderBottom = "1px solid rgba(255, 255, 255, 0.2)";
  transitionTableOverlay.appendChild(tableTitle);

  // Key filter selector (hidden when only one key)
  const keyFilterWrap = document.createElement("div");
  keyFilterWrap.style.marginBottom = "6px";
  keyFilterWrap.style.display = "none";
  keyFilterWrap.style.alignItems = "center";
  keyFilterWrap.style.gap = "6px";
  
  const keyFilterSelect = document.createElement("select");
  keyFilterSelect.style.flex = "1";
  keyFilterSelect.style.background = "rgba(0, 0, 0, 0.5)";
  keyFilterSelect.style.color = "#fff";
  keyFilterSelect.style.border = "1px solid rgba(255, 255, 255, 0.3)";
  keyFilterSelect.style.borderRadius = "4px";
  keyFilterSelect.style.padding = "4px";
  keyFilterSelect.style.fontSize = "11px";
  keyFilterSelect.style.cursor = "pointer";
  
  const allKeysOpt = document.createElement("option");
  allKeysOpt.value = "__all__";
  allKeysOpt.textContent = "All Keys";
  keyFilterSelect.appendChild(allKeysOpt);
  
  const autoFilterWrap = document.createElement("label");
  autoFilterWrap.style.display = "flex";
  autoFilterWrap.style.alignItems = "center";
  autoFilterWrap.style.gap = "4px";
  autoFilterWrap.style.fontSize = "11px";
  autoFilterWrap.style.color = "#94a3b8";
  autoFilterWrap.style.cursor = "pointer";
  autoFilterWrap.title = "Automatically change the selected key filter as the song plays across key boundaries";

  const autoFilterCheckbox = document.createElement("input");
  autoFilterCheckbox.type = "checkbox";
  autoFilterCheckbox.checked = true; // Default to auto
  
  autoFilterWrap.appendChild(autoFilterCheckbox);
  autoFilterWrap.appendChild(document.createTextNode("Auto"));
  
  keyFilterWrap.appendChild(keyFilterSelect);
  keyFilterWrap.appendChild(autoFilterWrap);
  transitionTableOverlay.appendChild(keyFilterWrap);

  const transitionGroupsContainer = document.createElement("div");
  transitionGroupsContainer.className = "transition-groups";
  transitionTableOverlay.appendChild(transitionGroupsContainer);

  const rootOnlyCheckboxContainer = document.createElement("div");
  rootOnlyCheckboxContainer.style.marginTop = "8px";
  rootOnlyCheckboxContainer.style.paddingTop = "8px";
  rootOnlyCheckboxContainer.style.borderTop = "1px solid rgba(255, 255, 255, 0.2)";
  rootOnlyCheckboxContainer.style.display = "flex";
  rootOnlyCheckboxContainer.style.flexDirection = "column";
  rootOnlyCheckboxContainer.style.alignItems = "flex-start";
  rootOnlyCheckboxContainer.style.gap = "6px";

  const rootOnlyLabel = document.createElement("label");
  rootOnlyLabel.style.cssText = "display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#ffffff;font-size:11px;white-space:nowrap;";
  const rootOnlyCheckbox = document.createElement("input");
  rootOnlyCheckbox.type = "checkbox";
  rootOnlyCheckbox.id = "root-only-toggle";
  rootOnlyCheckbox.checked = false;
  rootOnlyCheckbox.style.cssText = "cursor:pointer;";
  const rootOnlySpan = document.createElement("span");
  rootOnlySpan.textContent = "Root Only";
  rootOnlyLabel.appendChild(rootOnlyCheckbox);
  rootOnlyLabel.appendChild(rootOnlySpan);
  rootOnlyCheckboxContainer.appendChild(rootOnlyLabel);

  const longestPhraseLabel = document.createElement("label");
  longestPhraseLabel.style.cssText = "display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#ffffff;font-size:11px;white-space:nowrap;";
  const longestPhraseCheckbox = document.createElement("input");
  longestPhraseCheckbox.type = "checkbox";
  longestPhraseCheckbox.id = "longest-phrase-toggle";
  longestPhraseCheckbox.checked = false;
  longestPhraseCheckbox.style.cssText = "cursor:pointer;";
  const longestPhraseSpan = document.createElement("span");
  longestPhraseSpan.textContent = "Longest Phrase";
  longestPhraseLabel.appendChild(longestPhraseCheckbox);
  longestPhraseLabel.appendChild(longestPhraseSpan);
  rootOnlyCheckboxContainer.appendChild(longestPhraseLabel);

  const redundantSubstringLabel = document.createElement("label");
  redundantSubstringLabel.style.cssText = "display:none;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#ffffff;font-size:11px;white-space:nowrap;";
  const redundantSubstringCheckbox = document.createElement("input");
  redundantSubstringCheckbox.type = "checkbox";
  redundantSubstringCheckbox.id = "redundant-substring-toggle";
  redundantSubstringCheckbox.checked = false;
  redundantSubstringCheckbox.style.cssText = "cursor:pointer;";
  const redundantSubstringSpan = document.createElement("span");
  redundantSubstringSpan.textContent = "Include redundant substrings";
  redundantSubstringLabel.appendChild(redundantSubstringCheckbox);
  redundantSubstringLabel.appendChild(redundantSubstringSpan);
  rootOnlyCheckboxContainer.appendChild(redundantSubstringLabel);
  transitionTableOverlay.appendChild(rootOnlyCheckboxContainer);

  wrapper.appendChild(transitionTableOverlay);

  if (!document.getElementById("chord-tooltip-styles")) {
    const styleTag = document.createElement("style");
    styleTag.id = "chord-tooltip-styles";
    styleTag.textContent = `
      .chord-tooltip-json-trigger {
        position: relative;
        font-size: 11px;
        font-family: ui-monospace, monospace;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 2px 6px;
        border-radius: 4px;
        cursor: help;
        color: #38bdf8;
        user-select: none;
        transition: background 0.2s, border-color 0.2s;
        margin-top: -2px;
      }
      .chord-tooltip-json-trigger:hover {
        background: rgba(56, 189, 248, 0.18);
        border-color: rgba(56, 189, 248, 0.4);
      }
      .chord-tooltip-json-popup {
        visibility: hidden;
        opacity: 0;
        position: absolute;
        top: 130%; /* Show strictly below the JSON text / main bubble */
        left: 50%;
        transform: translateX(-50%) translateY(8px);
        background: #090d16;
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 8px;
        padding: 10px 14px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        line-height: 1.4;
        color: #e2e8f0;
        white-space: pre;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.85);
        text-align: left;
        z-index: 200;
        pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
      }
      .chord-tooltip-json-trigger:hover .chord-tooltip-json-popup {
        visibility: visible;
        opacity: 1;
        transform: translateX(-50%) translateY(4px);
      }
      .json-key { color: #f43f5e; font-weight: 600; }
      .json-string { color: #10b981; }
      .json-number { color: #fbbf24; }
      .json-boolean { color: #3b82f6; }
      .json-null { color: #94a3b8; }
    `;
    document.head.appendChild(styleTag);
  }

  // Create the hover bubble tooltip
  const tooltip = document.createElement("div");
  tooltip.style.position = "absolute";
  tooltip.style.display = "none";
  tooltip.style.pointerEvents = "auto"; // Essential for hovering over JSON trigger inside bubble
  tooltip.style.background = "rgba(15, 23, 42, 0.96)"; // Sleek dark slate
  tooltip.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  tooltip.style.borderRadius = "12px";
  tooltip.style.padding = "10px 14px";
  tooltip.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)";
  tooltip.style.color = "#ffffff";
  tooltip.style.fontFamily = "system-ui, -apple-system, sans-serif";
  tooltip.style.fontSize = "13px";
  tooltip.style.zIndex = "100";
  tooltip.style.minWidth = "180px";
  tooltip.style.transition = "opacity 0.12s ease, transform 0.12s ease";
  tooltip.style.opacity = "0";
  tooltip.style.transform = "translate(-50%, -100%)";
  wrapper.appendChild(tooltip);

  const centerReadingTooltip = document.createElement("div");
  centerReadingTooltip.className = "center-reading-tooltip";
  centerReadingTooltip.style.cssText = `
    position: absolute;
    display: none;
    pointer-events: auto;
    background: rgba(15, 23, 42, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    color: #ffffff;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 11px;
    z-index: 101;
    min-width: 160px;
    max-width: 280px;
    transition: opacity 0.12s ease, transform 0.12s ease;
    opacity: 0;
    transform: translate(-50%, -100%);
  `;
  wrapper.appendChild(centerReadingTooltip);

  let isMouseOverTooltip = false;
  let isMouseOverCenterReading = false;
  let centerReadingHideTimeout = null;
  let currentHoveredCenterChord = null;
  let centerChordHitRegions = [];

  tooltip.addEventListener("mouseenter", () => {
    isMouseOverTooltip = true;
  });
  tooltip.addEventListener("mouseleave", () => {
    isMouseOverTooltip = false;
    updateHoverState();
  });

  centerReadingTooltip.addEventListener("mouseenter", () => {
    isMouseOverCenterReading = true;
    clearTimeout(centerReadingHideTimeout);
  });
  centerReadingTooltip.addEventListener("mouseleave", () => {
    isMouseOverCenterReading = false;
    updateHoverState();
  });

  // Checkbox change handler
  rootOnlyCheckbox.addEventListener("change", (e) => {
    showRootOnlyView = e.target.checked;
    updateTransitionTable();
  });
  longestPhraseCheckbox.addEventListener("change", (e) => {
    showLongestPhraseView = e.target.checked;
    if (!showLongestPhraseView) {
      includeRedundantSubstrings = false;
      redundantSubstringCheckbox.checked = false;
    }
    redundantSubstringLabel.style.display = showLongestPhraseView ? "inline-flex" : "none";
    updateTransitionTable();
  });
  redundantSubstringCheckbox.addEventListener("change", (e) => {
    includeRedundantSubstrings = e.target.checked;
    updateTransitionTable();
  });


  // Interaction State
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let activeChordSymbol = null; // Track currently playing chord symbol
  let activeChord = null; // Track currently playing chord object
  let previousChord = null; // Track previously playing chord object

  // External Data
  let currentKey = { tonic: "C", scale: "major" };
  let baseSectionKey = { tonic: "C", scale: "major" };
  let currentRawChords = []; // Store raw chords to build accurate symbol maps across multiple keys
  updateKeyDisplay(options.key ?? null);
  let useRomanNumerals = options.labelMode !== false; // Default to true (roman numerals)
  let transitionCounts = new Map(); // Store full transition counts
  let rootOnlyTransitionCounts = new Map(); // Store root-only transition counts
  let longestPhraseCounts = new Map(); // Store maximal repeated full-symbol phrases
  let rootOnlyLongestPhraseCounts = new Map(); // Store maximal repeated root phrases
  let phraseFirstBeats = new Map(); // Store phrase -> first start beat (full-symbol)
  let rootPhraseFirstBeats = new Map(); // Store phrase -> first start beat (root-only)
  let allSubstringCounts = new Map(); // Store all unique substring counts (full-symbol)
  let rootAllSubstringCounts = new Map(); // Store all unique substring counts (root-only)
  let allSubstringFirstBeats = new Map(); // Store substring -> first start beat (full-symbol)
  let rootAllSubstringFirstBeats = new Map(); // Store substring -> first start beat (root-only)
  let transitionFirstBeats = new Map(); // Store transition -> first start beat (full-symbol)
  let rootTransitionFirstBeats = new Map(); // Store transition -> first start beat (root-only)
  let showRootOnlyView = false; // Toggle for root-only view
  let showLongestPhraseView = false; // Toggle for phrase-view mode
  let includeRedundantSubstrings = false; // Toggle for all-substrings mode inside longest-phrase view
  let perKeyData = new Map(); // Per-key transition data
  let perKeyLabels = []; // Ordered key labels
  let selectedKeyFilter = "__all__"; // Active key filter
  let currentHoveredNode = null; // Declared here to avoid Temporal Dead Zone errors during initial resize/draw
  let hideTimeout = null;

  // Quiz overlay state
  let quizHighlightSymbols = null;
  let quizFlashSymbol = null;
  let quizFlashColor = null;
  let quizFlashTimer = null;
  let quizTransitionArc = null;
  let quizFreqOverlay = null;

  keyFilterSelect.addEventListener("change", (e) => {
    selectedKeyFilter = e.target.value;
    updateTransitionTable();
  });
  
  // Set initial checkbox state
  romanNumeralToggle.checked = useRomanNumerals;
  
  // Checkbox change handler
  romanNumeralToggle.addEventListener("change", (e) => {
    useRomanNumerals = e.target.checked;
    if (options.onLabelModeChange) {
      options.onLabelModeChange(useRomanNumerals);
    }
    draw();
  });

  let currentGroupedChords = {}; // Map of root (1-7) -> Array of {symbol, chordObj}

  // Layout Constants
  const NODE_RADIUS = 30; // Radius of individual nodes
  const CENTER_RING_RADIUS = 80; // Radius of the labeling ring
  const DIATONIC_RING_RADIUS = 150; // Radius where diatonic chords sit
  const VARIANT_SPACING = 70; // Spacing between concentric rings

  // Helper function to get roman numerals for a scale type
  function getRomanNumeralsForScale(scaleType) {
    if (scaleType === 'minor') {
      return ROMAN_NUMERALS_MINOR;
    } else if (scaleType === 'dorian') {
      return ROMAN_NUMERALS_DORIAN;
    } else if (scaleType === 'phrygian') {
      return ROMAN_NUMERALS_PHRYGIAN;
    } else if (scaleType === 'lydian') {
      return ROMAN_NUMERALS_LYDIAN;
    } else if (scaleType === 'mixolydian') {
      return ROMAN_NUMERALS_MIXOLYDIAN;
    } else if (scaleType === 'locrian') {
      return ROMAN_NUMERALS_LOCRIAN;
    } else {
      return ROMAN_NUMERALS_MAJOR; // Default to major
    }
  }

  // Helper function to normalize borrowed value for comparison
  function normalizeBorrowed(borrowed) {
    if (borrowed === null || borrowed === undefined || borrowed === "") {
      return null;
    }
    if (Array.isArray(borrowed)) {
      return JSON.stringify(borrowed); // Convert array to string for comparison
    }
    if (typeof borrowed === 'string') {
      return borrowed;
    }
    return null;
  }

  // Helper function to compare two chords for equality (including borrowed property)
  function chordsMatch(chord1, chord2) {
    if (!chord1 || !chord2) return false;
    if (chord1.root !== chord2.root) return false;
    if (chord1.type !== chord2.type) return false;
    if (chord1.inversion !== chord2.inversion) return false;
    if (chord1.applied !== chord2.applied) return false; // Include applied in comparison
    
    // Compare borrowed property - normalize first
    const borrowed1 = normalizeBorrowed(chord1.borrowed);
    const borrowed2 = normalizeBorrowed(chord2.borrowed);
    
    // Both are null (no borrowed)
    if (borrowed1 === null && borrowed2 === null) {
      return true;
    }
    
    // One is null, other is not - they don't match
    if (borrowed1 === null || borrowed2 === null) {
      return false;
    }
    
    // Both have borrowed values - compare them
    return borrowed1 === borrowed2;
  }

  function isNodeActive(entry) {
    return activeChordSymbol !== null && entry.symbol === activeChordSymbol;
  }

  function resolvePlacementDegreeFromNote(noteName, key, exactOnly = false) {
    if (!noteName || !key) return null;
    for (let degree = 1; degree <= 7; degree++) {
      if (getNoteLabel(degree, key) === noteName) return degree;
    }
    if (exactOnly) return null;
    const noteLetter = String(noteName)[0]?.toUpperCase();
    if (!noteLetter) return null;
    for (let degree = 1; degree <= 7; degree++) {
      const diatonic = getNoteLabel(degree, key);
      if (diatonic && diatonic[0]?.toUpperCase() === noteLetter) return degree;
    }
    return null;
  }

  function getChordPlacementDegree(chord, key) {
    const rootDegree = Number(chord?.root);
    if (!Number.isInteger(rootDegree) || rootDegree < 1 || rootDegree > 7) return null;
    const appliedDegree = Number(chord?.applied);
    if (!Number.isInteger(appliedDegree) || appliedDegree < 1 || appliedDegree > 7) {
      return rootDegree;
    }
    const targetTonic = getNoteLabel(rootDegree, key);
    if (!targetTonic) return rootDegree;
    const appliedKey = { tonic: targetTonic, scale: "major" };
    const appliedRootNote = getNoteLabel(appliedDegree, appliedKey);
    return resolvePlacementDegreeFromNote(appliedRootNote, key) ?? rootDegree;
  }

  function getCenterDisplayLabel(chord) {
    if (!chord) return "";
    return useRomanNumerals
      ? stripBorrowedTags(getChordSymbol(chord, currentKey) || "")
      : getChordLetterName(chord, currentKey);
  }

  function getVariantCountForDegree(degree) {
    const chords = currentGroupedChords[degree] || [];
    const diatonicLabels = getRomanNumeralsForScale(currentKey.scale);
    const expectedDiatonicLabel = diatonicLabels[degree - 1];
    return chords.filter((c) => {
      const isBorrowed = c.chord.borrowed && c.chord.borrowed !== "" && c.chord.borrowed !== null;
      return c.symbol !== expectedDiatonicLabel || isBorrowed;
    }).length;
  }

  function getLayoutRadius() {
    let maxVariantCount = 0;
    for (let i = 1; i <= 7; i++) {
      maxVariantCount = Math.max(maxVariantCount, getVariantCountForDegree(i));
    }
    const outerDist = DIATONIC_RING_RADIUS + VARIANT_SPACING * maxVariantCount;
    const nodePad = NODE_RADIUS * 1.3;
    return Math.max(outerDist + nodePad, CENTER_RING_RADIUS + nodePad);
  }

  function fitToView() {
    resize();
    if (canvas.width < 1 || canvas.height < 1) return;

    panX = 0;
    panY = 0;

    const layoutRadius = getLayoutRadius();
    const margin = 16;
    const availW = canvas.width - margin * 2;
    const availH = canvas.height - margin * 2;
    const fitZoom = Math.min(availW, availH) / (2 * layoutRadius);
    zoom = Math.max(0.1, Math.min(fitZoom, 5));
    draw();
  }

  function resize() {
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    if (w < 1 || h < 1) return;
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    draw();
  }
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrapper);
  }

  // Initial Resize
  resize();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Transform Context for Pan/Zoom is tricky with Canvas path hit testing using raw coordinates.
    // Instead, I'll calculate drawing coordinates relative to center + pan + zoom manually.

    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;

    // Draw Center Ring (Diatonic Reference)
    drawCenterRing(centerX, centerY, CENTER_RING_RADIUS * zoom, currentKey);

    // Draw Chords
    for (let i = 1; i <= 7; i++) {
      drawScaleDegreeNodes(i, centerX, centerY);
    }

    // Update tooltip position if visible
    if (typeof updateTooltipPosition === "function") {
      updateTooltipPosition();
    }
    if (typeof updateCenterReadingTooltipPosition === "function") {
      updateCenterReadingTooltipPosition();
    }

    // Draw quiz overlays on top of everything
    drawQuizOverlays(centerX, centerY);
  }

  // --- Quiz overlay rendering ---
  function getNodePositions(centerX, centerY) {
    const positions = [];
    const diatonicLabels = getRomanNumeralsForScale(currentKey.scale);
    for (let degree = 1; degree <= 7; degree++) {
      const angle = (degree - 1) * (2 * Math.PI / 7) - (Math.PI / 2);
      const chords = currentGroupedChords[degree] || [];
      const expectedDiatonicLabel = diatonicLabels[degree - 1];
      const exactDiatonic = chords.find(c =>
        c.symbol === expectedDiatonicLabel &&
        (!c.chord.borrowed || c.chord.borrowed === "" || c.chord.borrowed === null)
      );
      const variants = chords.filter(c => {
        const isBorrowed = c.chord.borrowed && c.chord.borrowed !== "" && c.chord.borrowed !== null;
        return c.symbol !== expectedDiatonicLabel || isBorrowed;
      });

      const diatonicDist = DIATONIC_RING_RADIUS * zoom;
      const nodeRadius = NODE_RADIUS * zoom;
      const dx = centerX + diatonicDist * Math.cos(angle);
      const dy = centerY + diatonicDist * Math.sin(angle);

      if (exactDiatonic) {
        positions.push({ symbol: exactDiatonic.symbol, x: dx, y: dy, r: nodeRadius, degree });
      } else {
        positions.push({ symbol: expectedDiatonicLabel, x: dx, y: dy, r: nodeRadius, degree, placeholder: true });
      }

      variants.forEach((v, idx) => {
        const dist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * (idx + 1)) * zoom;
        const vx = centerX + dist * Math.cos(angle);
        const vy = centerY + dist * Math.sin(angle);
        positions.push({ symbol: v.symbol, x: vx, y: vy, r: nodeRadius, degree });
      });
    }
    return positions;
  }

  function drawQuizOverlays(centerX, centerY) {
    const hasOverlay = quizHighlightSymbols || quizFlashSymbol || quizTransitionArc || quizFreqOverlay;
    if (!hasOverlay) return;

    const positions = getNodePositions(centerX, centerY);

    // 1. Dim non-highlighted nodes
    if (quizHighlightSymbols) {
      const highlightSet = new Set(quizHighlightSymbols);
      for (const pos of positions) {
        if (!highlightSet.has(pos.symbol)) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pos.r * 1.15, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // 2. Flash glow on correct/wrong
    if (quizFlashSymbol) {
      const node = positions.find(p => p.symbol === quizFlashSymbol);
      if (node) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = quizFlashColor || "rgba(34, 197, 94, 0.6)";
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. Transition arc between two nodes
    if (quizTransitionArc) {
      const fromNode = positions.find(p => p.symbol === quizTransitionArc.from);
      const toNode = positions.find(p => p.symbol === quizTransitionArc.to);
      if (fromNode && toNode) {
        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Control point perpendicular to midpoint, offset inward toward center
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const cpOffset = dist * 0.3;
        const cpX = midX + perpX * cpOffset;
        const cpY = midY + perpY * cpOffset;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.quadraticCurveTo(cpX, cpY, toNode.x, toNode.y);
        ctx.strokeStyle = "rgba(168, 85, 247, 0.7)";
        ctx.lineWidth = 2.5 * zoom;
        ctx.stroke();

        // Arrowhead at destination
        const t = 0.92;
        const ax = (1 - t) * (1 - t) * fromNode.x + 2 * (1 - t) * t * cpX + t * t * toNode.x;
        const ay = (1 - t) * (1 - t) * fromNode.y + 2 * (1 - t) * t * cpY + t * t * toNode.y;
        const arrowAngle = Math.atan2(toNode.y - ay, toNode.x - ax);
        const arrowLen = 10 * zoom;
        ctx.beginPath();
        ctx.moveTo(toNode.x, toNode.y);
        ctx.lineTo(toNode.x - arrowLen * Math.cos(arrowAngle - 0.4), toNode.y - arrowLen * Math.sin(arrowAngle - 0.4));
        ctx.moveTo(toNode.x, toNode.y);
        ctx.lineTo(toNode.x - arrowLen * Math.cos(arrowAngle + 0.4), toNode.y - arrowLen * Math.sin(arrowAngle + 0.4));
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. Frequency overlay rings
    if (quizFreqOverlay) {
      const counts = quizFreqOverlay;
      let maxCount = 0;
      for (const [, count] of counts) {
        if (count > maxCount) maxCount = count;
      }
      if (maxCount > 0) {
        for (const pos of positions) {
          const count = counts.get(pos.symbol);
          if (count && count > 0) {
            const ratio = count / maxCount;
            const strokeW = 1 + ratio * 4;
            ctx.save();
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, pos.r + 4 * zoom, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(250, 204, 21, ${0.3 + ratio * 0.5})`;
            ctx.lineWidth = strokeW * zoom;
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }
  }

  function registerCenterChordHit(chord, x, y, width, fontSize) {
    if (!chord || chord.isRest || width <= 0) return;
    const pad = 4 * zoom;
    const height = fontSize * 1.15;
    centerChordHitRegions.push({
      chord,
      x: x - pad,
      y: y - height / 2 - pad,
      w: width + pad * 2,
      h: height + pad * 2,
    });
  }

  function getColor(root, scaleType, borrowedScale = null) {
    if (currentColorScheme === "hooktheory") {
      const result = getHooktheoryColor(root, scaleType);
      if (result && result.isPattern) {
        return createStripedPattern(ctx, result.color1, result.color2, result.color1);
      }
      return result;
    } else if (currentColorScheme === "boomwhacker") {
      const result = getBoomwhackerColor(root, scaleType, borrowedScale);
      if (result && result.isPattern) {
        return createStripedPattern(ctx, result.color1, result.color2, result.hexColor);
      }
      return result;
    }
    return getScaleDegreeColor(root, scaleType);
  }

  function drawScaleDegreeNodes(degree, centerX, centerY) {
    // 1 at Top (-PI/2)
    const angle = (degree - 1) * (2 * Math.PI / 7) - (Math.PI / 2);

    // Get Diatonic Label for this key/degree
    const diatonicLabels = getRomanNumeralsForScale(currentKey.scale);
    const expectedDiatonicLabel = diatonicLabels[degree - 1];

    const chords = currentGroupedChords[degree] || [];

    // Separate Exact Diatonic Match vs Variants
    // For exactDiatonic, ONLY use non-borrowed chords (borrowed chords should always be variants)
    const exactDiatonic = chords.find(c => 
      c.symbol === expectedDiatonicLabel && 
      (!c.chord.borrowed || c.chord.borrowed === "" || c.chord.borrowed === null)
    );
    
    // Variants include: chords with different symbols OR borrowed chords (even if symbol matches)
    const variants = chords.filter(c => {
      const isBorrowed = c.chord.borrowed && c.chord.borrowed !== "" && c.chord.borrowed !== null;
      return c.symbol !== expectedDiatonicLabel || isBorrowed;
    });

    // 1. Draw Diatonic Slot (Inner Ring)
    const diatonicDist = DIATONIC_RING_RADIUS * zoom;
    const nodeRadius = NODE_RADIUS * zoom;

    const dx = centerX + diatonicDist * Math.cos(angle);
    const dy = centerY + diatonicDist * Math.sin(angle);
    const color = getColor(degree, currentKey.scale);

    if (exactDiatonic) {
      const isActive = isNodeActive(exactDiatonic);
      const chord = exactDiatonic.chord;
      const colorDegree = exactDiatonic.colorDegree ?? degree;
      const subLabel = borrowedAbbrev(chord?.borrowed);
      const displayLabel = useRomanNumerals
        ? (subLabel ? stripBorrowedTags(exactDiatonic.symbol) : exactDiatonic.symbol)
        : getChordLetterName(chord, currentKey);
      drawNode(dx, dy, nodeRadius, getColor(colorDegree, currentKey.scale, chord?.borrowed), displayLabel, 1.0, isActive, false, subLabel);
    } else {
      // Placeholder
      const placeholderLabel = useRomanNumerals ? expectedDiatonicLabel : getNoteLabel(degree, currentKey);
      drawNode(dx, dy, nodeRadius, color, placeholderLabel, 0.3, false, true);
    }

    // 2. Draw Variants (Outer Rings)
    variants.forEach((v, idx) => {
      const dist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * (idx + 1)) * zoom;
      const vx = centerX + dist * Math.cos(angle);
      const vy = centerY + dist * Math.sin(angle);
      const isActive = isNodeActive(v);
      const chord = v.chord;
      const colorDegree = v.colorDegree ?? degree;
      const subLabel = borrowedAbbrev(chord?.borrowed);
      const displayLabel = useRomanNumerals
        ? (subLabel ? stripBorrowedTags(v.symbol) : v.symbol)
        : getChordLetterName(v.chord, currentKey);
      drawNode(vx, vy, nodeRadius, getColor(colorDegree, currentKey.scale, chord?.borrowed), displayLabel, 0.9, isActive, false, subLabel);
    });
  }

  function drawNode(x, y, r, color, label, opacity, isActive = false, isPlaceholder = false, subLabel = null) {
    const effectiveRadius = isActive ? r * 1.3 : r;

    ctx.beginPath();
    ctx.arc(x, y, effectiveRadius, 0, Math.PI * 2);

    // Parse hex to rgba for opacity?
    // Or just setting globalAlpha works if we reset.
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;

    const hexColor = color?.hexColor || color || '#ffffff';

    if (isActive) {
      ctx.shadowBlur = 30 * zoom;
      ctx.shadowColor = "#ffffff"; // Bright glow
    } else if (opacity > 0.8) {
      ctx.shadowBlur = 10 * zoom;
      ctx.shadowColor = hexColor;
    }

    ctx.fill();
    ctx.restore();

    // Border
    ctx.save();
    ctx.globalAlpha = isActive ? 1.0 : Math.min(1, opacity + 0.2); // Border slightly more visible
    ctx.lineWidth = isActive ? 4 * zoom : 2 * zoom;

    if (isPlaceholder) {
      ctx.strokeStyle = "#000";
      ctx.setLineDash([5 * zoom, 3 * zoom]);
    } else {
      ctx.strokeStyle = isActive ? "#ffffff" : "#fff";
      ctx.setLineDash([]);
    }

    ctx.stroke();
    ctx.restore();

    // Text - Option A (Dynamic Scaling) & Vertical Stacking inside the circle
    ctx.save();
    ctx.globalAlpha = 1.0; // Keep text fully opaque for maximum contrast
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Choose high-contrast text color based on background color luminance
    const getTextContrastColor = (hexCol) => {
      const hex = hexCol.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return luminance > 0.5 ? "#111827" : "#ffffff";
    };
    
    ctx.fillStyle = isPlaceholder ? "#ffffff" : getTextContrastColor(hexColor);
    
    // Scale text with node size
    let labelFontSize = isActive ? Math.max(16, 22 * zoom) : Math.max(12, 16 * zoom);
    const maxTextWidth = effectiveRadius * 1.45; // Safe padding inside the circular boundary

    if (subLabel) {
      let subFontSize = labelFontSize * 0.75;
      
      const checkFit = () => {
        const mainWidth = measureRomanNumeral(ctx, label, labelFontSize);
        ctx.font = `500 ${subFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        const subWidth = ctx.measureText(subLabel).width;
        return mainWidth <= maxTextWidth && subWidth <= maxTextWidth;
      };
      
      while (!checkFit() && labelFontSize > 8) {
        labelFontSize -= 0.5;
        subFontSize = labelFontSize * 0.75;
      }
      
      drawRomanNumeral(ctx, label, x, y - (labelFontSize * 0.35), labelFontSize);
      
      ctx.font = `500 ${subFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(subLabel, x, y + (labelFontSize * 0.55));
    } else {
      while (measureRomanNumeral(ctx, label, labelFontSize) > maxTextWidth && labelFontSize > 8) {
        labelFontSize -= 0.5;
      }
      drawRomanNumeral(ctx, label, x, y, labelFontSize);
    }
    ctx.restore();
  }

  function drawCenterRing(cx, cy, r, key) {
    centerChordHitRegions = [];
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff40";
    ctx.lineWidth = 2 * zoom;
    ctx.stroke();

    // Draw Chord Transition in the center of the circle (vertically aligned to cy)
    if (activeChord) {
      const currSymbol = getCenterDisplayLabel(activeChord);
      const currColorObj = getColor(activeChord.root, key.scale, activeChord.borrowed) || "#ffffff";
      const currColor = currColorObj.hexColor || currColorObj;

      if (previousChord) {
        const prevSymbol = getCenterDisplayLabel(previousChord);
        const prevColorObj = getColor(previousChord.root, key.scale, previousChord.borrowed) || "#ffffff";
        const prevColor = prevColorObj.hexColor || prevColorObj;

        const line1TargetW = r * 1.35;
        const line2TargetW = r * 1.55;

        let line1Font = 24 * zoom;
        const line1Min = 12 * zoom;
        while (line1Font >= line1Min && measureRomanNumeral(ctx, prevSymbol, line1Font) > line1TargetW) {
          line1Font -= 1;
        }

        // Keep arrow truly fixed-size so it does not visually resize per chord.
        const line2CurrMax = 56 * zoom;
        const line2CurrMin = 18 * zoom;
        let line2CurrFont = line2CurrMax;

        const arrowBlockW = 32 * zoom;
        while (line2CurrFont >= line2CurrMin) {
          const wCurr = measureRomanNumeral(ctx, currSymbol, line2CurrFont);
          if (arrowBlockW + wCurr <= line2TargetW) break;
          line2CurrFont -= 1;
        }

        const topPadding = Math.max(10 * zoom, line1Font * 0.65);
        const y1 = cy - r + topPadding + line1Font * 0.5;
        const y2 = cy + Math.max(2 * zoom, line2CurrFont * 0.05);

        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        ctx.fillStyle = prevColor;
        const wPrev = measureRomanNumeral(ctx, prevSymbol, line1Font);
        drawRomanNumeral(ctx, prevSymbol, cx, y1, line1Font, { align: "center" });
        registerCenterChordHit(previousChord, cx - wPrev / 2, y1, wPrev, line1Font);

        const wCurr = measureRomanNumeral(ctx, currSymbol, line2CurrFont);
        const line2StartX = cx - line2TargetW / 2;

        ctx.textAlign = "left";
        ctx.fillStyle = "#cbd5e1";
        const arrowY = y2;
        const arrowStartX = line2StartX + 2 * zoom;
        const arrowEndX = arrowStartX + 18 * zoom;
        const arrowHeadSize = 7 * zoom;
        ctx.lineWidth = 3 * zoom;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(arrowStartX, arrowY);
        ctx.lineTo(arrowEndX, arrowY);
        ctx.strokeStyle = "#cbd5e1";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(arrowEndX, arrowY);
        ctx.lineTo(arrowEndX - arrowHeadSize, arrowY - arrowHeadSize * 0.86);
        ctx.lineTo(arrowEndX - arrowHeadSize, arrowY + arrowHeadSize * 0.86);
        ctx.closePath();
        ctx.fillStyle = "#cbd5e1";
        ctx.fill();

        const currStartX = line2StartX + arrowBlockW;
        ctx.fillStyle = currColor;
        drawRomanNumeral(ctx, currSymbol, currStartX, y2, line2CurrFont, { align: "left" });
        registerCenterChordHit(activeChord, currStartX, y2, wCurr, line2CurrFont);
      } else {
        const maxSingleFont = 48 * zoom;
        const minSingleFont = 18 * zoom;
        const targetW = r * 1.55;

        let fontSize = maxSingleFont;
        while (fontSize >= minSingleFont) {
          if (measureRomanNumeral(ctx, currSymbol, fontSize) <= targetW) break;
          fontSize -= 1;
        }

        ctx.textBaseline = "middle";
        ctx.fillStyle = currColor;
        const wSingle = measureRomanNumeral(ctx, currSymbol, fontSize);
        drawRomanNumeral(ctx, currSymbol, cx, cy, fontSize, { align: 'center' });
        registerCenterChordHit(activeChord, cx - wSingle / 2, cy, wSingle, fontSize);
      }
    } else {
      // No active chord - draw placeholder
      ctx.font = `bold ${Math.max(20, 28 * zoom)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#64748b";
      ctx.fillText("—", cx, cy);
    }
  }

  // --- INTERACTION ---

  function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  canvas.addEventListener("mousedown", e => {
    isDragging = true;
    const pos = getEventPos(e);
    lastMouseX = pos.x;
    lastMouseY = pos.y;

    // Check click FIRST. If we hit a node, we might want to prioritize that?
    // Or do we only fire click on mouseUP if no drag occurred?
    // Standard UI behavior: mouseDown starts drag guess. mouseUp confirms click if no drag.
    canvas.dataset.dragged = "false";
  });

  window.addEventListener("mousemove", e => {
    if (isDragging) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dx = x - lastMouseX;
      const dy = y - lastMouseY;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) canvas.dataset.dragged = "true";

      panX += dx;
      panY += dy;

      lastMouseX = x;
      lastMouseY = y;
      requestAnimationFrame(draw);
    }
  });

  window.addEventListener("mouseup", e => {
    if (isDragging) {
      if (canvas.dataset.dragged === "false") {
        // It was a click!
        const pos = getEventPos(e);
        checkClick(pos.x, pos.y);
      }
    }
    isDragging = false;
  });

  // --- HOVER INTERACTION FOR TOOLTIP BUBBLE ---
  const ROMAN_MAP = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII" };

  function getNodeAt(mx, my) {
    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;
    const baseNodeRadius = NODE_RADIUS * zoom;

    const diatonicLabels = getRomanNumeralsForScale(currentKey.scale);

    for (let i = 1; i <= 7; i++) {
      const angle = (i - 1) * (2 * Math.PI / 7) - (Math.PI / 2);
      const degreeChords = currentGroupedChords[i] || [];
      const expectedDiatonicLabel = diatonicLabels[i - 1];

      const exactDiatonic = degreeChords.find(c => 
        c.symbol === expectedDiatonicLabel && 
        (!c.chord.borrowed || c.chord.borrowed === "" || c.chord.borrowed === null)
      );
      
      const variants = degreeChords.filter(c => {
        const isBorrowed = c.chord.borrowed && c.chord.borrowed !== "" && c.chord.borrowed !== null;
        return c.symbol !== expectedDiatonicLabel || isBorrowed;
      });

      // Check Variants first (outer rings)
      for (let vIdx = 0; vIdx < variants.length; vIdx++) {
        const v = variants[vIdx];
        const vDist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * (vIdx + 1)) * zoom;
        const vx = centerX + vDist * Math.cos(angle);
        const vy = centerY + vDist * Math.sin(angle);
        
        const isActive = isNodeActive(v);
        const effectiveRadius = isActive ? baseNodeRadius * 1.3 : baseNodeRadius;

        if (Math.hypot(mx - vx, my - vy) <= effectiveRadius) {
          return { 
            type: 'chord', 
            chord: v.chord, 
            symbol: v.symbol, 
            x: vx, 
            y: vy, 
            radius: effectiveRadius,
            degree: i,
            placementDegree: i,
            colorDegree: v.colorDegree ?? i,
            color: getColor(v.colorDegree ?? i, currentKey.scale, v.chord?.borrowed),
            isVariant: true,
            variantIndex: vIdx + 1
          };
        }
      }

      // Check Diatonic
      const dDist = DIATONIC_RING_RADIUS * zoom;
      const dx = centerX + dDist * Math.cos(angle);
      const dy = centerY + dDist * Math.sin(angle);
      
      let effectiveRadius = baseNodeRadius;
      if (exactDiatonic) {
        const isActive = isNodeActive(exactDiatonic);
        effectiveRadius = isActive ? baseNodeRadius * 1.3 : baseNodeRadius;
      }

      if (Math.hypot(mx - dx, my - dy) <= effectiveRadius) {
        if (exactDiatonic) {
          return { 
            type: 'chord', 
            chord: exactDiatonic.chord, 
            symbol: exactDiatonic.symbol, 
            x: dx, 
            y: dy, 
            radius: effectiveRadius,
            degree: i,
            placementDegree: i,
            colorDegree: exactDiatonic.colorDegree ?? i,
            color: getColor(exactDiatonic.colorDegree ?? i, currentKey.scale, exactDiatonic.chord?.borrowed),
            isVariant: false
          };
        }
      }
    }
    return null;
  }

  function formatChordJson(chord) {
    // Create a new object with consistent key order
    const orderedChord = {
      root: chord.root !== undefined ? chord.root : null,
      type: chord.type !== undefined ? chord.type : null,
      inversion: chord.inversion !== undefined ? chord.inversion : 0,
      applied: chord.applied !== undefined ? chord.applied : 0,
      borrowed: chord.borrowed !== undefined ? chord.borrowed : null
    };

    // Include other properties if any (excluding functions)
    for (const key in chord) {
      if (!(key in orderedChord) && typeof chord[key] !== 'function') {
        orderedChord[key] = chord[key];
      }
    }

    let lines = [];
    lines.push('<span style="color: #64748b;">{</span>');
    
    for (const [key, value] of Object.entries(orderedChord)) {
      let valHtml = '';
      if (value === null) {
        valHtml = '<span class="json-null">null</span>';
      } else if (typeof value === 'string') {
        valHtml = `<span class="json-string">"${value}"</span>`;
      } else if (typeof value === 'number') {
        valHtml = `<span class="json-number">${value}</span>`;
      } else if (typeof value === 'boolean') {
        valHtml = `<span class="json-boolean">${value}</span>`;
      } else {
        valHtml = `<span class="json-string">${JSON.stringify(value)}</span>`;
      }
      
      lines.push(`  <span class="json-key">${key}</span><span style="color: #64748b;">:</span> ${valHtml}<span style="color: #64748b;">,</span>`);
    }
    
    // Remove trailing comma from last property line
    if (lines.length > 1) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/<span style="color: #64748b;">,<\/span>$/, '');
    }
    
    lines.push('<span style="color: #64748b;">}</span>');
    return lines.join('\n');
  }

  function getNodeEffectiveRadius(node) {
    const baseNodeRadius = NODE_RADIUS * zoom;
    const isActive = activeChordSymbol !== null && node.symbol === activeChordSymbol;
    return isActive ? baseNodeRadius * 1.3 : baseNodeRadius;
  }

  function positionTooltip(node) {
    if (!node) return;
    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;
    const placementDegree = node.placementDegree ?? node.degree;
    const angle = (placementDegree - 1) * (2 * Math.PI / 7) - (Math.PI / 2);
    let dist = DIATONIC_RING_RADIUS * zoom;
    if (node.isVariant) {
      dist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * node.variantIndex) * zoom;
    }
    const x = centerX + dist * Math.cos(angle);
    const y = centerY + dist * Math.sin(angle);
    const radius = getNodeEffectiveRadius(node);
    const anchorY = y - radius;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width > 0 ? rect.width / canvas.width : 1;
    const scaleY = canvas.height > 0 ? rect.height / canvas.height : 1;
    tooltip.style.left = `${x * scaleX}px`;
    tooltip.style.top = `${anchorY * scaleY}px`;
    tooltip.style.transform = "translate(-50%, -100%)";
  }

  function showTooltip(node) {
    const displayLabel = useRomanNumerals ? stripBorrowedTags(node.symbol) : getChordLetterName(node.chord, currentKey);
    const alternateLabel = useRomanNumerals ? getChordLetterName(node.chord, currentKey) : node.symbol;
    const borrowedLabel = borrowedAbbrev(node.chord.borrowed);
    const pronunciationHtml = pronunciationDisplayHtml(
      getChordPronunciation(node.chord, currentKey),
      { useRoman: useRomanNumerals }
    );
    
    const formattedJson = formatChordJson(node.chord);
    
    let contextHtml = `
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px; text-align: center;">
        <div><span style="color: #64748b;">Scale Degree:</span> <strong style="color: ${node.color};">${ROMAN_MAP[node.colorDegree || node.degree] || (node.colorDegree || node.degree)}</strong></div>
    `;
    
    if (node.chord.borrowed) {
      const borrowedText = Array.isArray(node.chord.borrowed) ? "Custom scale" : node.chord.borrowed;
      contextHtml += `<div><span style="color: #64748b;">Borrowed:</span> <span style="color: #fbbf24; font-weight: 600;">${borrowedText}</span></div>`;
    }
    if (node.chord.applied && node.chord.applied !== 0 && node.chord.applied !== "0") {
      contextHtml += `<div><span style="color: #64748b;">Applied:</span> <span style="color: #60a5fa; font-weight: 600;">Tonicizing ${ROMAN_MAP[node.chord.root] || node.chord.root}</span></div>`;
    }
    
    contextHtml += `</div>`;

    tooltip.innerHTML = `
      <div style="text-align: center; margin-bottom: 6px;">
        <div class="chord-tooltip-roman chord-roman-line" style="font-size: 18px; font-weight: 800; color: #ffffff; line-height: 1.2;">${useRomanNumerals ? romanNumeralToHtml(displayLabel) : displayLabel}</div>
        ${borrowedLabel ? `<div style="font-size: 11px; color: #94a3b8; font-weight: 500; margin-top: 2px;">${borrowedLabel}</div>` : ''}
        ${pronunciationHtml}
        <div style="font-size: 11px; color: #94a3b8; font-weight: 500; margin-top: 2px;">${alternateLabel}</div>
      </div>
      ${contextHtml}
      <div style="margin-top: 10px; display: flex; justify-content: center; width: 100%;">
        <div class="chord-tooltip-json-trigger">
          JSON
          <div class="chord-tooltip-json-popup">${formattedJson}</div>
        </div>
      </div>
    `;
    
    tooltip.style.display = "block";
    positionTooltip(node);
    
    // Trigger CSS fade in after layout so -100% height is correct
    requestAnimationFrame(() => {
      positionTooltip(node);
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translate(-50%, -100%)";
    });
  }

  function hideCenterReadingTooltip() {
    centerReadingTooltip.style.opacity = "0";
    centerReadingTooltip.style.transform = "translate(-50%, -100%) translateY(4px)";
    setTimeout(() => {
      if (centerReadingTooltip.style.opacity === "0") {
        centerReadingTooltip.style.display = "none";
      }
    }, 120);
  }

  function positionCenterReadingTooltip(region) {
    if (!region) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width > 0 ? rect.width / canvas.width : 1;
    const scaleY = canvas.height > 0 ? rect.height / canvas.height : 1;
    const anchorX = (region.x + region.w / 2) * scaleX;
    const anchorY = region.y * scaleY;
    centerReadingTooltip.style.left = `${anchorX}px`;
    centerReadingTooltip.style.top = `${anchorY}px`;
    centerReadingTooltip.style.transform = "translate(-50%, -100%)";
  }

  function showCenterReadingTooltip(chord, region) {
    const pronunciationHtml = pronunciationDisplayHtml(
      getChordPronunciation(chord, currentKey),
      { useRoman: useRomanNumerals }
    );
    if (!pronunciationHtml) return;

    centerReadingTooltip.innerHTML = pronunciationHtml;
    centerReadingTooltip.style.display = "block";
    positionCenterReadingTooltip(region);
    requestAnimationFrame(() => {
      positionCenterReadingTooltip(region);
      centerReadingTooltip.style.opacity = "1";
      centerReadingTooltip.style.transform = "translate(-50%, -100%)";
    });
  }

  function getCenterChordAt(mx, my) {
    for (const region of centerChordHitRegions) {
      if (mx >= region.x && mx <= region.x + region.w && my >= region.y && my <= region.y + region.h) {
        return region;
      }
    }
    return null;
  }

  function updateCenterReadingTooltipPosition() {
    if (!currentHoveredCenterChord) return;
    const region = centerChordHitRegions.find((r) => r.chord === currentHoveredCenterChord);
    if (region) positionCenterReadingTooltip(region);
  }

  function hideTooltip() {
    tooltip.style.opacity = "0";
    tooltip.style.transform = "translate(-50%, -100%) translateY(4px)";
    // Hide display after transition completes
    setTimeout(() => {
      if (tooltip.style.opacity === "0") {
        tooltip.style.display = "none";
      }
    }, 120);
  }

  function updateTooltipPosition() {
    if (currentHoveredNode && tooltip.style.display !== "none") {
      positionTooltip(currentHoveredNode);
    }
  }

  function updateHoverState(mx, my) {
    let node = null;
    let centerRegion = null;
    if (mx !== undefined && my !== undefined) {
      centerRegion = getCenterChordAt(mx, my);
      if (!centerRegion) node = getNodeAt(mx, my);
    }

    if (centerRegion) {
      currentHoveredNode = null;
      currentHoveredCenterChord = centerRegion.chord;
      clearTimeout(hideTimeout);
      clearTimeout(centerReadingHideTimeout);
      hideTooltip();
      showCenterReadingTooltip(centerRegion.chord, centerRegion);
      canvas.style.cursor = "help";
    } else if (node) {
      currentHoveredCenterChord = null;
      clearTimeout(centerReadingHideTimeout);
      hideCenterReadingTooltip();
      currentHoveredNode = node;
      clearTimeout(hideTimeout);
      showTooltip(node);
      canvas.style.cursor = "pointer";
    } else {
      canvas.style.cursor = isDragging ? "grabbing" : "default";
      currentHoveredNode = null;
      currentHoveredCenterChord = null;
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!currentHoveredNode && !isMouseOverTooltip) {
          hideTooltip();
        }
      }, 150);
      clearTimeout(centerReadingHideTimeout);
      centerReadingHideTimeout = setTimeout(() => {
        if (!currentHoveredCenterChord && !isMouseOverCenterReading) {
          hideCenterReadingTooltip();
        }
      }, 150);
    }
  }

  canvas.addEventListener("mousemove", e => {
    if (!isDragging) {
      const pos = getEventPos(e);
      updateHoverState(pos.x, pos.y);
    } else {
      clearTimeout(hideTimeout);
      clearTimeout(centerReadingHideTimeout);
      hideTooltip();
      hideCenterReadingTooltip();
    }
  });

  canvas.addEventListener("mouseleave", () => {
    updateHoverState();
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    zoom += -e.deltaY * zoomSpeed;
    zoom = Math.max(0.1, Math.min(zoom, 5));
    requestAnimationFrame(draw);
  });

  function checkClick(mx, my) {
    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;
    const baseNodeRadius = NODE_RADIUS * zoom;

    const diatonicLabels = getRomanNumeralsForScale(currentKey.scale);

    for (let i = 1; i <= 7; i++) {
      const angle = (i - 1) * (2 * Math.PI / 7) - (Math.PI / 2);
      const degreeChords = currentGroupedChords[i] || [];
      const expectedDiatonicLabel = diatonicLabels[i - 1];

      // Use the same logic as drawScaleDegreeNodes to separate exactDiatonic and variants
      const exactDiatonic = degreeChords.find(c => 
        c.symbol === expectedDiatonicLabel && 
        (!c.chord.borrowed || c.chord.borrowed === "" || c.chord.borrowed === null)
      );
      
      const variants = degreeChords.filter(c => {
        const isBorrowed = c.chord.borrowed && c.chord.borrowed !== "" && c.chord.borrowed !== null;
        return c.symbol !== expectedDiatonicLabel || isBorrowed;
      });

      // Check Variants first (they're on outer rings, so check them before inner ring to avoid conflicts)
      for (let vIdx = 0; vIdx < variants.length; vIdx++) {
        const v = variants[vIdx];
        const vDist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * (vIdx + 1)) * zoom;
        const vx = centerX + vDist * Math.cos(angle);
        const vy = centerY + vDist * Math.sin(angle);
        
        // Use effective radius (larger if active)
        const isActive = isNodeActive(v);
        const effectiveRadius = isActive ? baseNodeRadius * 1.3 : baseNodeRadius;

        if (Math.hypot(mx - vx, my - vy) <= effectiveRadius) {
          playChord(v.chord);
          return;
        }
      }

      // Check Diatonic/Placeholder Node (check after variants to avoid conflicts)
      const dDist = DIATONIC_RING_RADIUS * zoom;
      const dx = centerX + dDist * Math.cos(angle);
      const dy = centerY + dDist * Math.sin(angle);
      
      // Use effective radius (larger if active)
      let effectiveRadius = baseNodeRadius;
      if (exactDiatonic) {
        const isActive = isNodeActive(exactDiatonic);
        effectiveRadius = isActive ? baseNodeRadius * 1.3 : baseNodeRadius;
      }

      if (Math.hypot(mx - dx, my - dy) <= effectiveRadius) {
        // Clicked Inner Node
        if (exactDiatonic) {
          playChord(exactDiatonic.chord);
        } else {
          playDiatonicTriad(i);
        }
        return;
      }
    }
  }

  function playDiatonicTriad(degree) {
    // Logic for playing the placeholder triad
    const triadData = rootToDiatonicTriad(degree, currentKey, 3);
    if (options.onChordClick) {
      options.onChordClick({
        notes: triadData.notes,
        root: degree,
        chordDegrees: triadData.chordDegrees,
        borrowed: null
      }, options.getArpeggiated?.() ?? false);
    }
  }

  function playChord(chordObj) {
    const chordData = chordInterpreter(chordObj, currentKey, {
      forceRootPosition: options.getForceRootPosition?.() ?? false,
    });
    if (options.onChordClick) {
      options.onChordClick({
        notes: chordData.notes,
        root: chordObj.root,
        chordDegrees: chordData.chordDegrees,
        borrowed: chordObj.borrowed || null,
        chord: chordObj
      }, options.getArpeggiated?.() ?? false);
    }
  }


  // --- UPDATE DATA ---

  function appendTransitionLabel(parent, fromStr, toStr, fromColor, toColor, useRoman) {
    const wrap = document.createElement("span");
    wrap.className = useRoman ? "chord-tooltip-roman chord-roman-line transition-table-roman" : "";
    wrap.style.fontFamily = '"Times New Roman", Times, serif';

    const fromSpan = document.createElement("span");
    if (fromColor) fromSpan.style.color = fromColor;
    fromSpan.innerHTML = useRoman ? romanNumeralToHtml(fromStr) : fromStr;

    const arrowSpan = document.createElement("span");
    arrowSpan.textContent = " → ";
    arrowSpan.style.color = "#94a3b8";

    const toSpan = document.createElement("span");
    if (toColor) toSpan.style.color = toColor;
    toSpan.innerHTML = useRoman ? romanNumeralToHtml(toStr) : toStr;

    wrap.appendChild(fromSpan);
    wrap.appendChild(arrowSpan);
    wrap.appendChild(toSpan);
    parent.appendChild(wrap);
  }

  function updateTransitionTable() {
    transitionGroupsContainer.innerHTML = "";

    // Resolve which data set to use based on key filter
    let activeTransitions = transitionCounts;
    let activeRootTransitions = rootOnlyTransitionCounts;
    let activeLongestPhrases = longestPhraseCounts;
    let activeRootLongestPhrases = rootOnlyLongestPhraseCounts;
    let activePhraseFirstBeats = phraseFirstBeats;
    let activeRootPhraseFirstBeats = rootPhraseFirstBeats;
    let activeTransitionFirstBeats = transitionFirstBeats;
    let activeRootTransitionFirstBeats = rootTransitionFirstBeats;
    let activeAllSubstringCounts = allSubstringCounts;
    let activeRootAllSubstringCounts = rootAllSubstringCounts;
    let activeAllSubstringFirstBeats = allSubstringFirstBeats;
    let activeRootAllSubstringFirstBeats = rootAllSubstringFirstBeats;
    let colorKey = currentKey;

    if (selectedKeyFilter !== "__all__" && perKeyData.has(selectedKeyFilter)) {
      const kd = perKeyData.get(selectedKeyFilter);
      activeTransitions = kd.full || new Map();
      activeRootTransitions = kd.rootOnly || new Map();
      activeLongestPhrases = kd.fullLongestPhrases || new Map();
      activeRootLongestPhrases = kd.rootLongestPhrases || new Map();
      activePhraseFirstBeats = kd.fullPhraseFirstBeats || new Map();
      activeRootPhraseFirstBeats = kd.rootPhraseFirstBeats || new Map();
      activeTransitionFirstBeats = kd.fullTransitionFirstBeats || new Map();
      activeRootTransitionFirstBeats = kd.rootTransitionFirstBeats || new Map();
      activeAllSubstringCounts = kd.fullAllSubstringCounts || new Map();
      activeRootAllSubstringCounts = kd.rootAllSubstringCounts || new Map();
      activeAllSubstringFirstBeats = kd.fullAllSubstringFirstBeats || new Map();
      activeRootAllSubstringFirstBeats = kd.rootAllSubstringFirstBeats || new Map();
      if (kd.regionKey) colorKey = kd.regionKey;
    }

    const countsToDisplay = showLongestPhraseView
      ? (includeRedundantSubstrings
        ? (showRootOnlyView ? activeRootAllSubstringCounts : activeAllSubstringCounts)
        : (showRootOnlyView ? activeRootLongestPhrases : activeLongestPhrases))
      : (showRootOnlyView ? activeRootTransitions : activeTransitions);

    const hasAnyTransitionData = activeTransitions.size > 0 || activeRootTransitions.size > 0;
    if (countsToDisplay.size === 0 && !showLongestPhraseView) {
      transitionTableOverlay.style.display = "none";
      return;
    }
    if (countsToDisplay.size === 0 && showLongestPhraseView && !hasAnyTransitionData) {
      transitionTableOverlay.style.display = "none";
      return;
    }

    transitionTableOverlay.style.display = "block";

    const symbolToRoot = new Map();
    const symbolToLetter = new Map();
    const symbolToBorrowed = new Map();
    
    if (currentRawChords) {
      currentRawChords.forEach(c => {
        if (c.isRest) return;
        const colorDegree = Number(c.root);
        const sym = getChordSymbol(c, baseSectionKey);
        
        if (!symbolToRoot.has(sym)) symbolToRoot.set(sym, colorDegree);
        if (!symbolToBorrowed.has(sym)) symbolToBorrowed.set(sym, c.borrowed);
        if (!symbolToLetter.has(sym)) symbolToLetter.set(sym, getChordLetterName(c, baseSectionKey));
      });
    }

    const byCount = new Map();
    for (const [transition, count] of countsToDisplay.entries()) {
      if (!byCount.has(count)) byCount.set(count, []);
      byCount.get(count).push(transition);
    }

    const sortedCounts = Array.from(byCount.keys()).sort((a, b) => b - a);

    sortedCounts.forEach((count, groupIdx) => {
      const transitions = byCount.get(count).sort((a, b) => {
        const activeFirstBeats = showLongestPhraseView
          ? (includeRedundantSubstrings
            ? (showRootOnlyView ? activeRootAllSubstringFirstBeats : activeAllSubstringFirstBeats)
            : (showRootOnlyView ? activeRootPhraseFirstBeats : activePhraseFirstBeats))
          : (showRootOnlyView ? activeRootTransitionFirstBeats : activeTransitionFirstBeats);
        const aBeat = activeFirstBeats?.get(a);
        const bBeat = activeFirstBeats?.get(b);
        if (Number.isFinite(aBeat) && Number.isFinite(bBeat) && aBeat !== bBeat) {
          return aBeat - bBeat;
        }
        if (Number.isFinite(aBeat) && !Number.isFinite(bBeat)) return -1;
        if (!Number.isFinite(aBeat) && Number.isFinite(bBeat)) return 1;
        return a.localeCompare(b);
      });
      const details = document.createElement("details");
      details.className = "transition-group";
      details.open = true;

      const summary = document.createElement("summary");
      summary.className = "transition-group-summary";
      summary.innerHTML = `<span class="transition-group-count">×${count}</span><span style="margin-left:8px;color:#94a3b8;font-size:11px;">Count: ${transitions.length}</span>`;
      details.appendChild(summary);

      const list = document.createElement("div");
      list.className = "transition-group-list";

      for (const transition of transitions) {
        const row = document.createElement("div");
        row.className = "transition-group-row";

        const parts = transition.split(" → ");
        const activeFirstBeats = showLongestPhraseView
          ? (includeRedundantSubstrings
            ? (showRootOnlyView ? activeRootAllSubstringFirstBeats : activeAllSubstringFirstBeats)
            : (showRootOnlyView ? activeRootPhraseFirstBeats : activePhraseFirstBeats))
          : (showRootOnlyView ? activeRootTransitionFirstBeats : activeTransitionFirstBeats);
        const firstBeat = activeFirstBeats.get(transition);
        if (Number.isFinite(firstBeat) && typeof options.onPhraseClick === "function") {
          row.style.cursor = "pointer";
          row.title = "Jump to phrase start";
          row.addEventListener("click", () => {
            options.onPhraseClick({ phrase: transition, firstBeat, rootOnly: showRootOnlyView });
          });
        }

        if (parts.length >= 1) {
          if (showLongestPhraseView) {
            parts.forEach((part, index) => {
              const partSpan = document.createElement("span");
              let partColor = null;
              if (showRootOnlyView) {
                const root = parseInt(part, 10);
                if (root >= 1 && root <= 7) {
                  const partColorObj = getColor(root, colorKey.scale);
                  partColor = partColorObj?.hexColor || partColorObj;
                }
                partSpan.textContent = part;
              } else {
                const baseRoot = symbolToRoot.get(part);
                if (baseRoot) {
                  const borrowed = symbolToBorrowed.get(part);
                  const noteName = getNoteLabel(baseRoot, baseSectionKey);
                  const exactOnly = selectedKeyFilter === "__all__";
                  const activeDegree = resolvePlacementDegreeFromNote(noteName, colorKey, exactOnly);
                  
                  if (activeDegree) {
                    const partColorObj = getColor(activeDegree, colorKey.scale, borrowed);
                    partColor = partColorObj?.hexColor || partColorObj;
                  }
                }
                partSpan.innerHTML = useRomanNumerals
                  ? romanNumeralToHtml(stripBorrowedTags(part))
                  : (symbolToLetter.get(part) || stripBorrowedTags(part));
              }
              if (partColor) partSpan.style.color = partColor;
              row.appendChild(partSpan);
              if (index < parts.length - 1) {
                const arrow = document.createElement("span");
                arrow.textContent = " → ";
                arrow.style.color = "#94a3b8";
                row.appendChild(arrow);
              }
            });
          } else {
            const [fromStr, toStr] = parts;
            let fromColor = null;
            let toColor = null;
            if (showRootOnlyView) {
              const fromRoot = parseInt(fromStr, 10);
              const toRoot = parseInt(toStr, 10);
              if (fromRoot >= 1 && fromRoot <= 7) {
                const fc = getColor(fromRoot, colorKey.scale);
                fromColor = fc?.hexColor || fc;
              }
              if (toRoot >= 1 && toRoot <= 7) {
                const tc = getColor(toRoot, colorKey.scale);
                toColor = tc?.hexColor || tc;
              }
            } else {
              const exactOnly = selectedKeyFilter === "__all__";
              const fromBaseRoot = symbolToRoot.get(fromStr);
              if (fromBaseRoot) {
                const borrowed = symbolToBorrowed.get(fromStr);
                const noteName = getNoteLabel(fromBaseRoot, baseSectionKey);
                const activeDegree = resolvePlacementDegreeFromNote(noteName, colorKey, exactOnly);
                if (activeDegree) {
                  const partColorObj = getColor(activeDegree, colorKey.scale, borrowed);
                  fromColor = partColorObj?.hexColor || partColorObj;
                }
              }
              const toBaseRoot = symbolToRoot.get(toStr);
              if (toBaseRoot) {
                const borrowed = symbolToBorrowed.get(toStr);
                const noteName = getNoteLabel(toBaseRoot, baseSectionKey);
                const activeDegree = resolvePlacementDegreeFromNote(noteName, colorKey, exactOnly);
                if (activeDegree) {
                  const partColorObj = getColor(activeDegree, colorKey.scale, borrowed);
                  toColor = partColorObj?.hexColor || partColorObj;
                }
              }
            }
            const fromDisplay = showRootOnlyView
              ? fromStr
              : (useRomanNumerals ? stripBorrowedTags(fromStr) : (symbolToLetter.get(fromStr) || stripBorrowedTags(fromStr)));
            const toDisplay = showRootOnlyView
              ? toStr
              : (useRomanNumerals ? stripBorrowedTags(toStr) : (symbolToLetter.get(toStr) || stripBorrowedTags(toStr)));
            const useRomanDisplay = showRootOnlyView ? false : useRomanNumerals;
            appendTransitionLabel(row, fromDisplay, toDisplay, fromColor, toColor, useRomanDisplay);
          }
        } else {
          row.textContent = transition;
        }

        list.appendChild(row);
      }

      details.appendChild(list);
      transitionGroupsContainer.appendChild(details);
    });

    if (countsToDisplay.size === 0 && showLongestPhraseView) {
      const emptyState = document.createElement("div");
      emptyState.style.color = "#94a3b8";
      emptyState.style.fontSize = "11px";
      emptyState.style.padding = "4px 0";
      emptyState.textContent = "No repeated phrases";
      transitionGroupsContainer.appendChild(emptyState);
    }
  }

  return {
    highlightChoices(symbols) {
      quizHighlightSymbols = symbols && symbols.length > 0 ? symbols : null;
      draw();
    },

    flashCorrect(symbol) {
      if (quizFlashTimer) clearTimeout(quizFlashTimer);
      quizFlashSymbol = symbol;
      quizFlashColor = "rgba(34, 197, 94, 0.6)";
      draw();
      quizFlashTimer = setTimeout(() => {
        quizFlashSymbol = null;
        quizFlashColor = null;
        quizFlashTimer = null;
        draw();
      }, 1200);
    },

    flashWrong(symbol) {
      if (quizFlashTimer) clearTimeout(quizFlashTimer);
      quizFlashSymbol = symbol;
      quizFlashColor = "rgba(239, 68, 68, 0.6)";
      draw();
      quizFlashTimer = setTimeout(() => {
        quizFlashSymbol = null;
        quizFlashColor = null;
        quizFlashTimer = null;
        draw();
      }, 1200);
    },

    showTransitionArc(fromSymbol, toSymbol) {
      quizTransitionArc = fromSymbol && toSymbol ? { from: fromSymbol, to: toSymbol } : null;
      draw();
    },

    setFrequencyOverlay(symbolCountMap) {
      quizFreqOverlay = symbolCountMap instanceof Map && symbolCountMap.size > 0 ? symbolCountMap : null;
      draw();
    },

    clearQuizOverlays() {
      quizHighlightSymbols = null;
      quizFlashSymbol = null;
      quizFlashColor = null;
      if (quizFlashTimer) clearTimeout(quizFlashTimer);
      quizFlashTimer = null;
      quizTransitionArc = null;
      quizFreqOverlay = null;
      draw();
    },

    setKeyFilter(label) {
      if (!autoFilterCheckbox.checked) return;
      if (perKeyLabels && perKeyLabels.includes(label)) {
        if (selectedKeyFilter !== label) {
          selectedKeyFilter = label;
          keyFilterSelect.value = label;
          updateTransitionTable();
        }
      }
    },
    update(chord) {
      if (!chord || chord.isRest) {
        activeChordSymbol = null;
        activeChord = null;
        previousChord = null;
      } else {
        const sym = getChordSymbol(chord, currentKey);
        // If it's a new chord event, shift the current to previous!
        if (activeChord && activeChord !== chord) {
          previousChord = activeChord;
        }
        activeChordSymbol = sym;
        activeChord = chord;
      }
      draw();
    },

    updateTransitions(
      transitions,
      rootOnlyTransitions,
      phrases,
      rootOnlyPhrases,
      phraseStarts,
      rootPhraseStarts,
      transitionStarts,
      rootTransitionStarts,
      substringCounts,
      rootSubstringCounts,
      substringStarts,
      rootSubstringStarts,
      perKey,
      keyLabels
    ) {
      transitionCounts = transitions || new Map();
      rootOnlyTransitionCounts = rootOnlyTransitions || new Map();
      longestPhraseCounts = phrases || new Map();
      rootOnlyLongestPhraseCounts = rootOnlyPhrases || new Map();
      phraseFirstBeats = phraseStarts || new Map();
      rootPhraseFirstBeats = rootPhraseStarts || new Map();
      transitionFirstBeats = transitionStarts || new Map();
      rootTransitionFirstBeats = rootTransitionStarts || new Map();
      allSubstringCounts = substringCounts || new Map();
      rootAllSubstringCounts = rootSubstringCounts || new Map();
      allSubstringFirstBeats = substringStarts || new Map();
      rootAllSubstringFirstBeats = rootSubstringStarts || new Map();
      
      perKeyData = perKey || new Map();
      perKeyLabels = keyLabels || [];

      // Clear previous options except "All Keys"
      while (keyFilterSelect.options.length > 1) {
        keyFilterSelect.remove(1);
      }

      if (perKeyLabels && perKeyLabels.length > 1) {
        keyFilterWrap.style.display = "flex";
        perKeyLabels.forEach(label => {
          const opt = document.createElement("option");
          opt.value = label;
          opt.textContent = label;
          keyFilterSelect.appendChild(opt);
        });
        
        // Keep selection if it still exists, otherwise default to all
        if (!perKeyLabels.includes(selectedKeyFilter)) {
          selectedKeyFilter = "__all__";
        }
      } else {
        keyFilterWrap.style.display = "none";
        selectedKeyFilter = "__all__";
      }
      keyFilterSelect.value = selectedKeyFilter;

      updateTransitionTable();
    },

    setLabelMode(useRoman, key) {
      useRomanNumerals = useRoman;
      romanNumeralToggle.checked = useRoman;
      if (key) {
        currentKey = key;
      }
      draw();
      updateTransitionTable();
      if (currentHoveredNode) {
        showTooltip(currentHoveredNode);
      } else if (currentHoveredCenterChord) {
        const region = centerChordHitRegions.find((r) => r.chord === currentHoveredCenterChord);
        if (region) showCenterReadingTooltip(currentHoveredCenterChord, region);
      }
    },

    setSongData(chords, key) {
      previousChord = null;
      activeChord = null;
      activeChordSymbol = null;
      currentRawChords = chords || [];
      if (key) {
        currentKey = key;
        baseSectionKey = key;
        updateKeyDisplay(key);
      }
      currentGroupedChords = {};

      // Initialize Groups
      for (let i = 1; i <= 7; i++) currentGroupedChords[i] = [];

      if (chords && Array.isArray(chords)) {
        const seen = new Set();
        chords.forEach(c => {
          if (c.isRest) return;
          const colorDegree = Number(c.root);
          if (colorDegree < 1 || colorDegree > 7) return; // Ignore chromatic roots for now if not scale degrees

          const sym = getChordSymbol(c, key);
          const placementDegree = getChordPlacementDegree(c, key);
          if (!placementDegree || placementDegree < 1 || placementDegree > 7) return;
          // Include borrowed in unique key to preserve borrowed chords even if symbol is same
          const borrowedKey = c.borrowed ? (Array.isArray(c.borrowed) ? 'borrowed' : String(c.borrowed)) : '';
          const appliedKey = c.applied ? String(c.applied) : '';
          const uniqueKey = `${placementDegree}-${colorDegree}-${sym}-${borrowedKey}-${appliedKey}`; // Dedupe by placement+color+symbol+borrowed+applied

          if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            currentGroupedChords[placementDegree].push({
              symbol: sym,
              chord: c,
              placementDegree,
              colorDegree,
            });
          }
        });
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fitToView());
      });
    },

    setKey(key) {
      const prevKeySig = currentKey ? `${currentKey.tonic || "?"}-${currentKey.scale || "?"}` : "none";
      const nextSig = key
        ? `${key.tonic || "?"}-${key.scale || "?"}`
        : prevKeySig;
      if (key && nextSig === prevKeySig) {
        return;
      }
      if (key) {
        currentKey = key;
      }
      const keySig = `${currentKey?.tonic || "?"}-${currentKey?.scale || "?"}`;
      updateKeyDisplay(key);
      draw();
      if (keySig !== prevKeySig) {
        updateTransitionTable();
      }
    },
  };
}
