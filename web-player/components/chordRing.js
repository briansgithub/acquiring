
import { SCALE_DEGREE_COLORS, ROMAN_NUMERALS_MAJOR, ROMAN_NUMERALS_MINOR, getScaleDegreeColor } from "../lib/scales.js";
import { getChordSymbol } from "../lib/jsonToSymbol.js";
import { rootToDiatonicTriad } from "../lib/music.js";

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

  let currentGroupedChords = {}; // Map of root (1-7) -> Array of {symbol, chordObj}

  // Layout Constants
  const NODE_RADIUS = 30; // Radius of individual nodes
  const CENTER_RING_RADIUS = 80; // Radius of the labeling ring
  const DIATONIC_RING_RADIUS = 150; // Radius where diatonic chords sit
  const VARIANT_SPACING = 70; // Spacing between concentric rings

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
    const diatonicLabels = (currentKey.scale === 'minor') ? ROMAN_NUMERALS_MINOR : ROMAN_NUMERALS_MAJOR;
    const expectedDiatonicLabel = diatonicLabels[degree - 1];

    const chords = currentGroupedChords[degree] || [];

    // Sort logic? Diatonic first?
    // Actually, we want to separate Exact Diatonic Match vs Variants.
    const exactDiatonic = chords.find(c => c.symbol === expectedDiatonicLabel);
    const variants = chords.filter(c => c.symbol !== expectedDiatonicLabel);

    // 1. Draw Diatonic Slot (Inner Ring)
    const diatonicDist = DIATONIC_RING_RADIUS * zoom;
    const nodeRadius = NODE_RADIUS * zoom;

    const dx = centerX + diatonicDist * Math.cos(angle);
    const dy = centerY + diatonicDist * Math.sin(angle);
    const color = getScaleDegreeColor(degree, currentKey.scale);

    if (exactDiatonic) {
      const isActive = activeChordSymbol === exactDiatonic.symbol;
      drawNode(dx, dy, nodeRadius, color, exactDiatonic.symbol, 1.0, isActive);
    } else {
      // Placeholder
      drawNode(dx, dy, nodeRadius, color, expectedDiatonicLabel, 0.3, false);
    }

    // 2. Draw Variants (Outer Rings)
    variants.forEach((v, idx) => {
      const dist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * (idx + 1)) * zoom;
      const vx = centerX + dist * Math.cos(angle);
      const vy = centerY + dist * Math.sin(angle);
      const isActive = activeChordSymbol === v.symbol;
      drawNode(vx, vy, nodeRadius, color, v.symbol, 0.9, isActive);
    });
  }

  function drawNode(x, y, r, color, label, opacity, isActive = false) {
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
    ctx.strokeStyle = isActive ? "#ffffff" : "#fff";
    ctx.lineWidth = isActive ? 4 * zoom : 2 * zoom;
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
    ctx.font = `\${fontSize}px "Times New Roman", Times, serif`;
    ctx.fillText(label, x, y);
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

    const diatonicLabels = (currentKey.scale === 'minor') ? ROMAN_NUMERALS_MINOR : ROMAN_NUMERALS_MAJOR;

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
    if (options.onChordClick) options.onChordClick(triadData.notes);
  }

  function playChord(chordObj) {
    // Can we use the raw chord object to generate notes?
    // music.js chordInterpreter does exactly that.
    // We need to import it or rely on helper.
    // But we passed onChordClick which expects NOTE NAMES array?

    // Let's use the same `rootToDiatonicTriad` but with modification if possible?
    // `jsonToSymbol` gets the symbol, but `music.js` generates notes.
    // `music.js` currently only exports `chordInterpreter` which calls `rootToDiatonicTriad`.
    // It doesn't seem to support Extensions (7ths) yet fully?
    // "Do this for triads only right now" - Requirements.

    // If it's a variant (borrowed), `rootToDiatonicTriad` accepts `borrowed` param!
    const borrowed = chordObj.borrowed || null;
    const triadData = rootToDiatonicTriad(chordObj.root, currentKey, 3, borrowed);
    if (options.onChordClick) options.onChordClick(triadData.notes);
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

    setSongData(chords, key) {
      currentKey = key;
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
          const uniqueKey = `${r}-${sym}`; // Dedupe by Root+Symbol

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
