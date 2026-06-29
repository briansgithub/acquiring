
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

  // Inject style rules for JSON sub-popup and trigger
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
  tooltip.style.transform = "translate(-50%, -100%) translateY(-10px)";
  wrapper.appendChild(tooltip);

  let isMouseOverTooltip = false;
  tooltip.addEventListener("mouseenter", () => {
    isMouseOverTooltip = true;
  });
  tooltip.addEventListener("mouseleave", () => {
    isMouseOverTooltip = false;
    updateHoverState();
  });

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
  let previousChord = null; // Track previously playing chord object

  // External Data
  let currentKey = { tonic: "C", scale: "major" };
  let useRomanNumerals = options.labelMode !== false; // Default to true (roman numerals)
  let transitionCounts = new Map(); // Store full transition counts
  let rootOnlyTransitionCounts = new Map(); // Store root-only transition counts
  let showRootOnlyView = false; // Toggle for root-only view
  let currentHoveredNode = null; // Declared here to avoid Temporal Dead Zone errors during initial resize/draw
  let hideTimeout = null;
  
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

  // Helper function to abbreviate mode/borrowed names (Option B)
  function getAbbreviatedSubLabel(borrowed) {
    if (borrowed === null || borrowed === undefined || borrowed === "") {
      return null;
    }
    if (Array.isArray(borrowed) && borrowed.length > 0) {
      return "(bor.)";
    }
    if (typeof borrowed === 'string' && borrowed.length > 0) {
      const mode = borrowed.toLowerCase().trim();
      if (mode.includes("mixolydian")) return "(mix.)";
      if (mode.includes("dorian")) return "(dor.)";
      if (mode.includes("phrygian")) return "(phr.)";
      if (mode.includes("lydian")) return "(lyd.)";
      if (mode.includes("locrian")) return "(loc.)";
      if (mode.includes("harmonic minor")) return "(h.min)";
      if (mode.includes("phrygian dominant")) return "(phr.dom)";
      if (mode.includes("major")) return "(maj.)";
      if (mode.includes("minor")) return "(min.)";
      if (mode.includes("borrowed")) return "(bor.)";
      return borrowed.length > 5 ? `(${borrowed.substring(0, 3)}.)` : `(${borrowed})`;
    }
    return null;
  }

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

    // Update tooltip position if visible
    if (typeof updateTooltipPosition === "function") {
      updateTooltipPosition();
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
      const isActive = isNodeActive(exactDiatonic);
      const chord = exactDiatonic.chord;
      const subLabel = getAbbreviatedSubLabel(chord ? chord.borrowed : null);
      let displayLabel = useRomanNumerals ? exactDiatonic.symbol : getChordLetterName(chord, currentKey);
      if (useRomanNumerals && typeof displayLabel === 'string') {
        displayLabel = displayLabel.replace(/\([a-z.]+\)$/i, "");
      }
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
      const isActive = isNodeActive(v);
      const chord = v.chord;
      const subLabel = getAbbreviatedSubLabel(chord ? chord.borrowed : null);

      let displayLabel = useRomanNumerals ? v.symbol : getChordLetterName(v.chord, currentKey);
      if (useRomanNumerals && typeof displayLabel === 'string') {
        displayLabel = displayLabel.replace(/\([a-z.]+\)$/i, "");
      }
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

    // Text - Option A (Dynamic Scaling) & Vertical Stacking inside the circle
    ctx.save();
    ctx.globalAlpha = 1.0; // Keep text fully opaque for maximum contrast
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Choose high-contrast text color based on background color luminance
    const getTextContrastColor = (hexColor) => {
      const hex = hexColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return luminance > 0.5 ? "#111827" : "#ffffff";
    };
    
    ctx.fillStyle = isPlaceholder ? "#ffffff" : getTextContrastColor(color);
    
    // Scale text with node size
    let labelFontSize = isActive ? Math.max(16, 22 * zoom) : Math.max(12, 16 * zoom);
    const maxTextWidth = effectiveRadius * 1.45; // Safe padding inside the circular boundary

    if (subLabel) {
      let subFontSize = labelFontSize * 0.75;
      
      const checkFit = () => {
        // Measure main label with current main font
        ctx.font = `bold ${labelFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        const mainWidth = ctx.measureText(label).width;
        
        // Measure subLabel with current sub font
        ctx.font = `500 ${subFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        const subWidth = ctx.measureText(subLabel).width;
        
        return mainWidth <= maxTextWidth && subWidth <= maxTextWidth;
      };
      
      while (!checkFit() && labelFontSize > 8) {
        labelFontSize -= 0.5;
        subFontSize = labelFontSize * 0.75;
      }
      
      // Draw main label higher
      ctx.font = `bold ${labelFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillText(label, x, y - (labelFontSize * 0.35));
      
      // Draw subLabel lower (using the same fill color for visual coherence)
      ctx.font = `500 ${subFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillText(subLabel, x, y + (labelFontSize * 0.55));
    } else {
      ctx.font = `bold ${labelFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      while (ctx.measureText(label).width > maxTextWidth && labelFontSize > 8) {
        labelFontSize -= 0.5;
        ctx.font = `bold ${labelFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      }
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

    // 1. Draw Key name (e.g. C major) - small bold text at top of center circle
    ctx.fillStyle = "#94a3b8";
    ctx.font = `bold ${Math.max(10, 12 * zoom)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${key.tonic} ${key.scale}`, cx, cy - 12 * zoom);

    // 2. Draw Chord Transition at bottom of center circle
    if (activeChord) {
      const currSymbol = activeChordSymbol || "";
      const currName = currSymbol.replace(/\([a-z.]+\)$/i, "");
      const currColor = getScaleDegreeColor(activeChord.root, key.scale) || "#ffffff";

      if (previousChord) {
        const prevSymbol = getChordSymbol(previousChord, key) || "";
        const prevName = prevSymbol.replace(/\([a-z.]+\)$/i, "");
        const prevColor = getScaleDegreeColor(previousChord.root, key.scale) || "#ffffff";

        // Setup font for measuring and drawing
        ctx.font = `bold ${Math.max(12, 16 * zoom)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        ctx.textBaseline = "middle";

        const wPrev = ctx.measureText(prevName).width;
        const wArrow = ctx.measureText(" → ").width;
        const wCurr = ctx.measureText(currName).width;
        const totalW = wPrev + wArrow + wCurr;
        const startX = cx - totalW / 2;
        const textY = cy + 12 * zoom;

        // Draw previous chord name in its color
        ctx.textAlign = "left";
        ctx.fillStyle = prevColor;
        ctx.fillText(prevName, startX, textY);

        // Draw arrow in white/light-gray
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(" → ", startX + wPrev, textY);

        // Draw current chord name in its color
        ctx.fillStyle = currColor;
        ctx.fillText(currName, startX + wPrev + wArrow, textY);
      } else {
        // No previous chord - draw current chord centered
        ctx.font = `bold ${Math.max(14, 18 * zoom)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = currColor;
        ctx.fillText(currName, cx, cy + 12 * zoom);
      }
    } else {
      // No active chord - draw placeholder
      ctx.font = `bold ${Math.max(14, 18 * zoom)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#64748b";
      ctx.fillText("—", cx, cy + 12 * zoom);
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
            degree: i, 
            color: getScaleDegreeColor(i, currentKey.scale),
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
            degree: i, 
            color: getScaleDegreeColor(i, currentKey.scale),
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

  function showTooltip(node) {
    let displayLabel = useRomanNumerals ? node.symbol : getChordLetterName(node.chord, currentKey);
    let alternateLabel = useRomanNumerals ? getChordLetterName(node.chord, currentKey) : node.symbol;
    
    // Strip trailing mixture tags (e.g. "(mix)") from Roman numerals for clean text display
    if (typeof displayLabel === 'string') {
      displayLabel = displayLabel.replace(/\([a-z.]+\)$/i, "");
    }
    if (typeof alternateLabel === 'string') {
      alternateLabel = alternateLabel.replace(/\([a-z.]+\)$/i, "");
    }
    
    const formattedJson = formatChordJson(node.chord);
    
    let contextHtml = `
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px; text-align: center;">
        <div><span style="color: #64748b;">Scale Degree:</span> <strong style="color: ${node.color};">${ROMAN_MAP[node.degree] || node.degree}</strong></div>
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
        <div style="font-size: 18px; font-weight: 800; color: #ffffff; line-height: 1.2;">${displayLabel}</div>
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
    
    tooltip.style.left = `${node.x}px`;
    tooltip.style.top = `${node.y}px`;
    tooltip.style.display = "block";
    
    // Trigger CSS fade in
    setTimeout(() => {
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translate(-50%, -100%) translateY(-10px)";
    }, 10);
  }

  function hideTooltip() {
    tooltip.style.opacity = "0";
    tooltip.style.transform = "translate(-50%, -100%) translateY(-2px)";
    // Hide display after transition completes
    setTimeout(() => {
      if (tooltip.style.opacity === "0") {
        tooltip.style.display = "none";
      }
    }, 120);
  }

  function updateTooltipPosition() {
    if (currentHoveredNode && tooltip.style.display !== "none") {
      const centerX = canvas.width / 2 + panX;
      const centerY = canvas.height / 2 + panY;
      const baseNodeRadius = NODE_RADIUS * zoom;
      const angle = (currentHoveredNode.degree - 1) * (2 * Math.PI / 7) - (Math.PI / 2);
      
      let dist = DIATONIC_RING_RADIUS * zoom;
      
      if (currentHoveredNode.isVariant) {
        dist = (DIATONIC_RING_RADIUS + VARIANT_SPACING * currentHoveredNode.variantIndex) * zoom;
      }
      
      const vx = centerX + dist * Math.cos(angle);
      const vy = centerY + dist * Math.sin(angle);
      
      tooltip.style.left = `${vx}px`;
      tooltip.style.top = `${vy}px`;
    }
  }

  function updateHoverState(mx, my) {
    let node = null;
    if (mx !== undefined && my !== undefined) {
      node = getNodeAt(mx, my);
    }
    
    if (node) {
      currentHoveredNode = node;
      clearTimeout(hideTimeout);
      showTooltip(node);
    } else {
      currentHoveredNode = null;
      // Delay hiding slightly to allow the mouse to move to the tooltip
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!currentHoveredNode && !isMouseOverTooltip) {
          hideTooltip();
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
      hideTooltip();
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
      if (!chord || chord.isRest) {
        activeChordSymbol = null;
        activeChord = null;
      } else {
        const sym = getChordSymbol(chord, currentKey);
        // If it's a new chord (different root or type), shift the current to previous!
        if (activeChord && !chordsMatch(activeChord, chord)) {
          previousChord = activeChord;
        }
        activeChordSymbol = sym;
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
      previousChord = null;
      activeChord = null;
      activeChordSymbol = null;
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
