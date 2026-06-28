
import { 
  SCALE_DEGREE_COLORS, 
  ROMAN_NUMERALS_MAJOR, 
  ROMAN_NUMERALS_MINOR,
  ROMAN_NUMERALS_DORIAN,
  ROMAN_NUMERALS_PHRYGIAN,
  ROMAN_NUMERALS_LYDIAN,
  ROMAN_NUMERALS_MIXOLYDIAN,
  ROMAN_NUMERALS_LOCRIAN,
  getScaleDegreeColor 
} from "../lib/scales.js";
import { getChordSymbol, getChordLetterName } from "../lib/jsonToSymbol.js";
import { rootToDiatonicTriad, getNoteLabel, chordInterpreter } from "../lib/music.js";

export function renderChordRing(container, options = {}) {
  // Create wrapper for canvas and overlay controls
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  container.appendChild(wrapper);
  
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
  
  // Arpeggiate checkbox
  const arpLabel = document.createElement("label");
  arpLabel.style.cssText = "display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:#ffffff;font-size:12px;white-space:nowrap;";
  const arpCheckbox = document.createElement("input");
  arpCheckbox.type = "checkbox";
  arpCheckbox.id = "arpeggiate-toggle-ring";
  arpCheckbox.checked = false; // Off by default
  arpCheckbox.style.cssText = "cursor:pointer;";
  const arpSpan = document.createElement("span");
  arpSpan.textContent = "Arpeggiate";
  arpLabel.appendChild(arpCheckbox);
  arpLabel.appendChild(arpSpan);
  overlay.appendChild(arpLabel);
  
  wrapper.appendChild(overlay);
  
  const romanNumeralToggle = romanCheckbox;

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
  
  wrapper.appendChild(transitionTableOverlay);

  const transitionTable = document.createElement("table");
  transitionTable.style.width = "100%";
  transitionTable.style.borderCollapse = "collapse";
  transitionTable.style.fontSize = "11px";
  transitionTable.style.color = "#e5e7eb";
  
  const tableHeader = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const header1 = document.createElement("th");
  header1.textContent = "Transition";
  header1.style.textAlign = "left";
  header1.style.padding = "4px 8px";
  header1.style.borderBottom = "1px solid rgba(255, 255, 255, 0.2)";
  header1.style.color = "#cbd5e1";
  header1.style.fontWeight = "600";
  const header2 = document.createElement("th");
  header2.textContent = "Count";
  header2.style.textAlign = "right";
  header2.style.padding = "4px 8px";
  header2.style.borderBottom = "1px solid rgba(255, 255, 255, 0.2)";
  header2.style.color = "#cbd5e1";
  header2.style.fontWeight = "600";
  headerRow.appendChild(header1);
  headerRow.appendChild(header2);
  tableHeader.appendChild(headerRow);
  transitionTable.appendChild(tableHeader);
  
  const tableBody = document.createElement("tbody");
  transitionTable.appendChild(tableBody);
  transitionTableOverlay.appendChild(transitionTable);

  // Add checkbox below table for root-only view
  const rootOnlyCheckboxContainer = document.createElement("div");
  rootOnlyCheckboxContainer.style.marginTop = "8px";
  rootOnlyCheckboxContainer.style.paddingTop = "8px";
  rootOnlyCheckboxContainer.style.borderTop = "1px solid rgba(255, 255, 255, 0.2)";
  
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
  transitionTableOverlay.appendChild(rootOnlyCheckboxContainer);

  // Checkbox change handler
  rootOnlyCheckbox.addEventListener("change", (e) => {
    showRootOnlyView = e.target.checked;
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

  // External Data
  let currentKey = { tonic: "C", scale: "major" };
  let useRomanNumerals = options.labelMode !== false; // Default to true (roman numerals)
  let transitionCounts = new Map(); // Store full transition counts
  let rootOnlyTransitionCounts = new Map(); // Store root-only transition counts
  let showRootOnlyView = false; // Toggle for root-only view
  
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

  function resize() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    draw();
  }
  window.addEventListener("resize", resize);

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
    const color = getScaleDegreeColor(degree, currentKey.scale);

    if (exactDiatonic) {
      const isActive = activeChord && chordsMatch(activeChord, exactDiatonic.chord);
      let subLabel = null;
      const chord = exactDiatonic.chord;
      if (chord && chord.borrowed !== undefined && chord.borrowed !== null && chord.borrowed !== "") {
        // If borrowed is an array (custom scale), show "(borrowed)"
        // Otherwise show the mode name
        const borrowed = chord.borrowed;
        if (Array.isArray(borrowed) && borrowed.length > 0) {
          subLabel = "(borrowed)";
        } else if (typeof borrowed === 'string' && borrowed.length > 0) {
          subLabel = `(${borrowed})`;
        }
      }
      const displayLabel = useRomanNumerals ? exactDiatonic.symbol : getChordLetterName(chord, currentKey);
      drawNode(dx, dy, nodeRadius, color, displayLabel, 1.0, isActive, false, subLabel);
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
      const isActive = activeChord && chordsMatch(activeChord, v.chord);

      let subLabel = null;
      const chord = v.chord;
      if (chord && chord.borrowed !== undefined && chord.borrowed !== null && chord.borrowed !== "") {
        // If borrowed is an array (custom scale), show "(borrowed)"
        // Otherwise show the mode name
        const borrowed = chord.borrowed;
        if (Array.isArray(borrowed) && borrowed.length > 0) {
          subLabel = "(borrowed)";
        } else if (typeof borrowed === 'string' && borrowed.length > 0) {
          subLabel = `(${borrowed})`;
        }
      }

      const displayLabel = useRomanNumerals ? v.symbol : getChordLetterName(v.chord, currentKey);
      drawNode(vx, vy, nodeRadius, color, displayLabel, 0.9, isActive, false, subLabel);
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

    if (isActive) {
      ctx.shadowBlur = 30 * zoom;
      ctx.shadowColor = "#ffffff"; // Bright glow
    } else if (opacity > 0.8) {
      ctx.shadowBlur = 10 * zoom;
      ctx.shadowColor = color;
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

    // Text
    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity + 0.4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isActive ? "#000" : "#000"; // Can change text color if needed, but black is readable on these cols
    // Scale text with node size
    const fontSize = isActive ? Math.max(16, 22 * zoom) : Math.max(12, 16 * zoom);
    ctx.font = `bold ${fontSize}px "Times New Roman", Times, serif`;

    if (subLabel) {
      // Draw label higher
      ctx.fillText(label, x, y - (fontSize * 0.4));
      // Draw subLabel lower
      const subFontSize = fontSize * 0.7;
      ctx.font = `italic ${subFontSize}px "Times New Roman", Times, serif`;
      ctx.fillText(subLabel, x, y + (fontSize * 0.5));
    } else {
      ctx.fillText(label, x, y);
    }
    ctx.restore();
  }

  function drawCenterRing(cx, cy, r, key) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff40";
    ctx.lineWidth = 2 * zoom;
    ctx.stroke();

    // Center Label (white text)
    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.max(14, 18 * zoom)}px "Times New Roman", Times, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${key.tonic} ${key.scale}`, cx, cy);
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
        const isActive = activeChord && chordsMatch(activeChord, v.chord);
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
        const isActive = activeChord && chordsMatch(activeChord, exactDiatonic.chord);
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
      }, arpCheckbox.checked);
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
      }, arpCheckbox.checked);
    }
  }


  // --- UPDATE DATA ---

  function updateTransitionTable() {
    const tbody = transitionTable.querySelector("tbody");
    tbody.innerHTML = "";

    // Use root-only view if checkbox is checked, otherwise use full transitions
    const countsToDisplay = showRootOnlyView ? rootOnlyTransitionCounts : transitionCounts;

    if (countsToDisplay.size === 0) {
      transitionTableOverlay.style.display = "none";
      return;
    }

    transitionTableOverlay.style.display = "block";

    // Convert Map to array and sort by count (highest to lowest)
    const sortedTransitions = Array.from(countsToDisplay.entries())
      .sort((a, b) => b[1] - a[1]);

    sortedTransitions.forEach(([transition, count]) => {
      const row = document.createElement("tr");
      row.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";
      
      const cell1 = document.createElement("td");
      cell1.textContent = transition;
      cell1.style.padding = "4px 8px";
      cell1.style.fontFamily = '"Times New Roman", Times, serif';
      
      const cell2 = document.createElement("td");
      cell2.textContent = count;
      cell2.style.textAlign = "right";
      cell2.style.padding = "4px 8px";
      cell2.style.fontWeight = "600";
      cell2.style.color = "#22d3ee";
      
      row.appendChild(cell1);
      row.appendChild(cell2);
      tbody.appendChild(row);
    });
  }

  return {
    update(chord) {
      if (!chord) {
        activeChordSymbol = null;
        activeChord = null;
      } else {
        // Store both symbol and chord object for accurate matching
        activeChordSymbol = getChordSymbol(chord, currentKey);
        activeChord = chord;
      }
      draw();
    },

    updateTransitions(transitions, rootOnlyTransitions) {
      transitionCounts = transitions || new Map();
      rootOnlyTransitionCounts = rootOnlyTransitions || new Map();
      updateTransitionTable();
    },

    setLabelMode(useRoman, key) {
      useRomanNumerals = useRoman;
      romanNumeralToggle.checked = useRoman;
      if (key) {
        currentKey = key;
      }
      // Recalculate active chord symbol if needed
      if (activeChordSymbol !== null) {
        // activeChordSymbol is already set, just redraw
      }
      draw();
    },

    setSongData(chords, key) {
      if (key) {
        currentKey = key;
      }
      currentGroupedChords = {};

      // Initialize Groups
      for (let i = 1; i <= 7; i++) currentGroupedChords[i] = [];

      if (chords && Array.isArray(chords)) {
        const seen = new Set();
        chords.forEach(c => {
          if (c.isRest) return;
          const r = c.root;
          if (r < 1 || r > 7) return; // Ignore chromatic roots for now if not scale degrees

          const sym = getChordSymbol(c, key);
          // Include borrowed in unique key to preserve borrowed chords even if symbol is same
          const borrowedKey = c.borrowed ? (Array.isArray(c.borrowed) ? 'borrowed' : String(c.borrowed)) : '';
          const uniqueKey = `${r}-${sym}-${borrowedKey}`; // Dedupe by Root+Symbol+Borrowed

          if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            currentGroupedChords[r].push({
              symbol: sym,
              chord: c
            });
          }
        });
      }
      draw();
    }
  };
}
