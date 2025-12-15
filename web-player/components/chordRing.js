
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
import { rootToDiatonicTriad, getNoteLabel } from "../lib/music.js";

export function renderChordRing(container, options = {}) {
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");


  // Interaction State
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let activeChordSymbol = null; // Track currently playing chord

  // External Data
  let currentKey = { tonic: "C", scale: "major" };
  let useRomanNumerals = options.labelMode !== false; // Default to true (roman numerals)

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
    // For exactDiatonic, prioritize non-borrowed chords (borrowed chords should be variants)
    const exactDiatonic = chords.find(c => 
      c.symbol === expectedDiatonicLabel && 
      (!c.chord.borrowed || c.chord.borrowed === "" || c.chord.borrowed === null)
    ) || chords.find(c => c.symbol === expectedDiatonicLabel); // Fallback to any match if no non-borrowed found
    
    const variants = chords.filter(c => 
      c.symbol !== expectedDiatonicLabel || 
      (c.chord.borrowed && c.chord.borrowed !== "" && c.chord.borrowed !== null)
    );

    // 1. Draw Diatonic Slot (Inner Ring)
    const diatonicDist = DIATONIC_RING_RADIUS * zoom;
    const nodeRadius = NODE_RADIUS * zoom;

    const dx = centerX + diatonicDist * Math.cos(angle);
    const dy = centerY + diatonicDist * Math.sin(angle);
    const color = getScaleDegreeColor(degree, currentKey.scale);

    if (exactDiatonic) {
      const isActive = activeChordSymbol === exactDiatonic.symbol;
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
      const isActive = activeChordSymbol === v.symbol;

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
    ctx.font = `${fontSize}px "Times New Roman", Times, serif`;

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

    // Center Label
    ctx.fillStyle = "#000";
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
    const nodeRadius = NODE_RADIUS * zoom;

    const diatonicLabels = getRomanNumeralsForScale(currentKey.scale);

    for (let i = 1; i <= 7; i++) {
      const angle = (i - 1) * (2 * Math.PI / 7) - (Math.PI / 2);
      const degreeChords = currentGroupedChords[i] || [];
      const expectedDiatonicLabel = diatonicLabels[i - 1];

      const exactDiatonic = degreeChords.find(c => c.symbol === expectedDiatonicLabel);
      const variants = degreeChords.filter(c => c.symbol !== expectedDiatonicLabel);

      // Check Diatonic/Placeholder Node
      const dDist = DIATONIC_RING_RADIUS * zoom;
      const dx = centerX + dDist * Math.cos(angle);
      const dy = centerY + dDist * Math.sin(angle);

      if (Math.hypot(mx - dx, my - dy) <= nodeRadius) {
        // Clicked Inner Node
        if (exactDiatonic) {
          playChord(exactDiatonic.chord);
        } else {
          playDiatonicTriad(i);
        }
        return;
      }

      // Check Variants
      for (let vIdx = 0; vIdx < variants.length; vIdx++) {
        const v = variants[vIdx];
        const vDist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * (vIdx + 1)) * zoom;
        const vx = centerX + vDist * Math.cos(angle);
        const vy = centerY + vDist * Math.sin(angle);

        if (Math.hypot(mx - vx, my - vy) <= nodeRadius) {
          playChord(v.chord);
          return;
        }
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
      });
    }
  }

  function playChord(chordObj) {
    // Use chordInterpreter from music.js which handles chord types (including 7th chords) and inversions
    const borrowed = chordObj.borrowed || null;
    const chordType = chordObj.type || 5; // Default to triad if type not specified
    const inversion = chordObj.inversion || 0; // Default to root position if inversion not specified
    const chordData = rootToDiatonicTriad(chordObj.root, currentKey, 3, borrowed, chordType, inversion);
    if (options.onChordClick) {
      options.onChordClick({
        notes: chordData.notes,
        root: chordObj.root,
        chordDegrees: chordData.chordDegrees,
        borrowed: borrowed,
        chord: chordObj
      });
    }
  }


  // --- UPDATE DATA ---

  return {
    update(chord) {
      if (!chord) {
        activeChordSymbol = null;
      } else {
        // Calculate symbol for the active chord
        activeChordSymbol = getChordSymbol(chord, currentKey);
      }
      draw();
    },

    setLabelMode(useRoman, key) {
      useRomanNumerals = useRoman;
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
