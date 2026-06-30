
import { getScaleDegreeColor } from "../lib/scales.js";
import { getChordSymbol, getChordLetterName } from "../lib/jsonToSymbol.js";

function stripSongFromArtist(title, artist) {
    const t = title?.trim();
    const a = artist?.trim();
    if (!a) return "";
    if (!t) return a;

    const lowerArtist = a.toLowerCase();
    const lowerTitle = t.toLowerCase();
    const idx = lowerArtist.indexOf(lowerTitle);
    if (idx === -1) return a;

    let cleaned = (a.slice(0, idx) + a.slice(idx + t.length))
        .replace(/^[\s\-–—|,]+|[\s\-–—|,]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();

    return cleaned || a;
}

export function renderTimeline(container, options = {}) {
    // Set container to flex column layout
    container.style.display = "flex";
    container.style.flexDirection = "column";
    
    // Create canvas wrapper that takes up available space
    const canvasWrapper = document.createElement("div");
    canvasWrapper.style.cssText = "flex: 1; position: relative; min-height: 0;";
    
    const songTitleRow = document.createElement("div");
    songTitleRow.className = "timeline-song-title-row";

    const songTitleEl = document.createElement("div");
    songTitleEl.className = "timeline-song-title";
    songTitleRow.appendChild(songTitleEl);
    canvasWrapper.appendChild(songTitleRow);

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvasWrapper.appendChild(canvas);
    container.appendChild(canvasWrapper);
    const ctx = canvas.getContext("2d");
    
    const footer = document.createElement("div");
    footer.className = "timeline-footer";

    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "timeline-footer-controls";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "timeline-play-chord-checkbox";
    checkbox.checked = true; // Checked by default
    checkbox.style.cssText = "cursor: pointer; width: 16px; height: 16px;";
    
    const label = document.createElement("label");
    label.htmlFor = "timeline-play-chord-checkbox";
    label.textContent = "Play chord tone on click";
    label.style.cssText = "cursor: pointer; font-size: 12px; color: var(--text, #e5e7eb); user-select: none;";
    
    const arpCheckbox = document.createElement("input");
    arpCheckbox.type = "checkbox";
    arpCheckbox.id = "timeline-arpeggiate-checkbox";
    arpCheckbox.checked = false; // Off by default
    arpCheckbox.disabled = false; // Will be updated based on play checkbox
    arpCheckbox.style.cssText = "cursor: pointer; width: 16px; height: 16px;";
    
    const arpLabel = document.createElement("label");
    arpLabel.htmlFor = "timeline-arpeggiate-checkbox";
    arpLabel.textContent = "Arpeggiate";
    arpLabel.style.cssText = "cursor: pointer; font-size: 12px; color: var(--text, #e5e7eb); user-select: none;";
    
    // Update arpeggiate checkbox state based on play checkbox
    function updateArpCheckboxState() {
        arpCheckbox.disabled = !checkbox.checked;
        if (!checkbox.checked) {
            arpCheckbox.checked = false;
        }
        // Update label color to show disabled state
        if (arpCheckbox.disabled) {
            arpLabel.style.color = "var(--muted, #9ca3af)";
            arpLabel.style.cursor = "not-allowed";
            arpCheckbox.style.cursor = "not-allowed";
        } else {
            arpLabel.style.color = "var(--text, #e5e7eb)";
            arpLabel.style.cursor = "pointer";
            arpCheckbox.style.cursor = "pointer";
        }
    }
    
    checkbox.addEventListener("change", updateArpCheckboxState);
    updateArpCheckboxState(); // Set initial state
    
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(label);
    checkboxContainer.appendChild(arpCheckbox);
    checkboxContainer.appendChild(arpLabel);

    footer.appendChild(checkboxContainer);
    container.appendChild(footer);

    let currentChords = [];
    let currentKey = { tonic: "C", scale: "major" };
    let songLengthBeats = 1;
    let currentProgressRatio = 0;
    let logicalWidth = 0;
    let logicalHeight = 0;
    let firstBeat = 1;
    let numBeats = 4; // Default to 4/4 time
    
    // Hover state variables declared here to avoid Temporal Dead Zone errors during initial draw
    let currentHoveredChord = null;
    let hideTimeout = null;

    const AXIS_HEIGHT = 18;

    function layoutMetrics() {
        if (logicalHeight === 0) return { measuresBottom: 0 };
        const blockHeight = (logicalHeight - AXIS_HEIGHT) * 0.8;
        const y = (logicalHeight - AXIS_HEIGHT - blockHeight) / 2;
        const axisY = y + blockHeight + 4;
        // Beat labels sit at axisY + 5 with 10px font
        const measuresBottom = axisY + 16;
        return { measuresBottom };
    }

    function updateSongTitlePosition() {
        if (logicalHeight === 0) return;
        const { measuresBottom } = layoutMetrics();
        songTitleRow.style.top = `${measuresBottom + 4}px`;
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const canvasRect = canvas.getBoundingClientRect();
        logicalWidth = canvasRect.width;
        logicalHeight = canvasRect.height;
        
        canvas.width = logicalWidth * dpr;
        canvas.height = logicalHeight * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.scale(dpr, dpr);
        updateSongTitlePosition();
        draw();
    }
    window.addEventListener("resize", resize);

    // Initial Resize
    setTimeout(resize, 0); // Defer slightly to ensure container has size

    function draw() {
        if (logicalWidth === 0 || logicalHeight === 0) return;

        ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        if (!currentChords.length) return;

        const pixelsPerBeat = logicalWidth / songLengthBeats;
        const axisHeight = AXIS_HEIGHT;
        const blockHeight = (logicalHeight - axisHeight) * 0.8;
        const y = (logicalHeight - axisHeight - blockHeight) / 2;

        // Draw Chords
        currentChords.forEach(chord => {
            if (chord.isRest) return;

            const x = (chord.beat - firstBeat) * pixelsPerBeat;
            const w = chord.duration * pixelsPerBeat;

            ctx.fillStyle = getScaleDegreeColor(chord.root, currentKey.scale) || "#888";
            ctx.fillRect(x, y, w, blockHeight);

            // Border
            ctx.strokeStyle = "#1a1a1a";
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, blockHeight);

            // Label
            if (w > 20) { // Only draw if wide enough
                // Scale font size based on block dimensions
                // Use the smaller dimension to ensure text fits, but prioritize height for readability
                const baseFontSize = Math.min(blockHeight * 0.6, w * 0.3);
                const fontSize = Math.max(16, baseFontSize); // Minimum 16px
                
                ctx.fillStyle = "#000";
                ctx.font = `bold ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "rgba(255,255,255,0.5)"; // Light shadow for contrast on dark blocks? Or no shadow?
                ctx.shadowBlur = 0; // Removing shadow for clean look with black text

                let symbol = getChordSymbol(chord, currentKey);
                if (typeof symbol === 'string') {
                    symbol = symbol.replace(/\([a-z.]+\)$/i, "");
                }
                // Hide if text fits? Simply clip or verify width.
                const metrics = ctx.measureText(symbol);
                if (metrics.width < w - 4) {
                    if (chord.borrowed) {
                        // Draw symbol higher
                        ctx.fillText(symbol, x + w / 2, y + blockHeight / 2 - fontSize * 0.3);
                        // Draw borrowed text lower (smaller)
                        const borrowedFontSize = fontSize * 0.55;
                        ctx.font = `500 ${borrowedFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
                        // If borrowed is an array (custom scale), show "(borrowed)"
                        // Otherwise show the mode name
                        const borrowedLabel = Array.isArray(chord.borrowed) ? "(borrowed)" : `(${chord.borrowed})`;
                        ctx.fillText(borrowedLabel, x + w / 2, y + blockHeight / 2 + fontSize * 0.3);
                    } else {
                        ctx.fillText(symbol, x + w / 2, y + blockHeight / 2);
                    }
                }
                ctx.shadowBlur = 0;
            }
        });

        // Draw Beat Axis
        const axisY = y + blockHeight + 4; // Position axis close below rectangles
        
        // Use numBeats as the interval for labels
        const beatInterval = numBeats;
        
        // Draw axis line (subtle)
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, axisY);
        ctx.lineTo(logicalWidth, axisY);
        ctx.stroke();
        
        // Draw tick marks and labels starting from firstBeat
        ctx.fillStyle = "#666";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        const lastBeat = firstBeat + songLengthBeats - 1;
        for (let beat = firstBeat; beat <= lastBeat; beat += beatInterval) {
            const beatOffset = beat - firstBeat;
            const tickX = beatOffset * pixelsPerBeat;
            
            // Draw tick mark (shorter)
            ctx.strokeStyle = "#555";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(tickX, axisY);
            ctx.lineTo(tickX, axisY + 3);
            ctx.stroke();
            
            // Draw beat number
            ctx.fillText(beat.toString(), tickX, axisY + 5);
        }
        
        // Draw minor ticks for beats between labels
        if (beatInterval > 1) {
            ctx.strokeStyle = "#444";
            ctx.lineWidth = 0.5;
            for (let beat = firstBeat; beat <= lastBeat; beat++) {
                if ((beat - firstBeat) % beatInterval !== 0) {
                    const beatOffset = beat - firstBeat;
                    const tickX = beatOffset * pixelsPerBeat;
                    ctx.beginPath();
                    ctx.moveTo(tickX, axisY);
                    ctx.lineTo(tickX, axisY + 2);
                    ctx.stroke();
                }
            }
        }

        // Draw Progress Indicator
        const progressX = currentProgressRatio * logicalWidth;

        ctx.beginPath();
        ctx.moveTo(progressX, 0);
        ctx.lineTo(progressX, logicalHeight);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.stroke();

        // Playhead Triangle
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(progressX - 5, 0);
        ctx.lineTo(progressX + 5, 0);
        ctx.lineTo(progressX, 8);
        ctx.fill();

        if (typeof updateTooltipPosition === "function") {
            updateTooltipPosition();
        }
    }

    // Helper function to find chord at a given beat position
    function findChordAtBeat(beat) {
        for (const chord of currentChords) {
            if (chord.isRest) continue;
            const chordStartBeat = chord.beat === 0 ? 1 : chord.beat;
            const chordEndBeat = chordStartBeat + chord.duration;
            if (beat >= chordStartBeat && beat < chordEndBeat) {
                return chord;
            }
        }
        return null;
    }

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
    tooltip.style.pointerEvents = "auto";
    tooltip.style.background = "rgba(15, 23, 42, 0.96)";
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
    tooltip.style.transform = "translate(-50%, 0) translateY(2px)";
    canvasWrapper.appendChild(tooltip);

    let isMouseOverTooltip = false;
    tooltip.addEventListener("mouseenter", () => {
        isMouseOverTooltip = true;
    });
    tooltip.addEventListener("mouseleave", () => {
        isMouseOverTooltip = false;
        updateHoverState();
    });

    const ROMAN_MAP = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII" };

    function getChordAtCoordinates(mx, my) {
        if (!currentChords.length || !songLengthBeats) return null;
        
        const pixelsPerBeat = logicalWidth / songLengthBeats;
        const axisHeight = 18;
        const blockHeight = (logicalHeight - axisHeight) * 0.8;
        const blockY = (logicalHeight - axisHeight - blockHeight) / 2;
        
        if (my < blockY || my > blockY + blockHeight) return null;
        
        for (const chord of currentChords) {
            if (chord.isRest) continue;
            
            const chordX = (chord.beat - firstBeat) * pixelsPerBeat;
            const chordW = chord.duration * pixelsPerBeat;
            
            if (mx >= chordX && mx < chordX + chordW) {
                return {
                    chord: chord,
                    x: chordX + chordW / 2,
                    y: blockY + blockHeight
                };
            }
        }
        return null;
    }

    function formatChordJson(chord) {
        const orderedChord = {
            root: chord.root !== undefined ? chord.root : null,
            type: chord.type !== undefined ? chord.type : null,
            inversion: chord.inversion !== undefined ? chord.inversion : 0,
            applied: chord.applied !== undefined ? chord.applied : 0,
            borrowed: chord.borrowed !== undefined ? chord.borrowed : null
        };

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
        
        if (lines.length > 1) {
            lines[lines.length - 1] = lines[lines.length - 1].replace(/<span style="color: #64748b;">,<\/span>$/, '');
        }
        
        lines.push('<span style="color: #64748b;">}</span>');
        return lines.join('\n');
    }

    function showTooltip(node) {
        let displayLabel = getChordSymbol(node.chord, currentKey);
        let alternateLabel = getChordLetterName(node.chord, currentKey);
        
        // Strip trailing mixture tags (e.g. "(mix)") from Roman numerals for clean text display
        if (typeof displayLabel === 'string') {
            displayLabel = displayLabel.replace(/\([a-z.]+\)$/i, "");
        }
        if (typeof alternateLabel === 'string') {
            alternateLabel = alternateLabel.replace(/\([a-z.]+\)$/i, "");
        }
        
        const formattedJson = formatChordJson(node.chord);
        const nodeColor = getScaleDegreeColor(node.chord.root, currentKey.scale) || "#888";
        
        let contextHtml = `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px; text-align: center;">
                <div><span style="color: #64748b;">Scale Degree:</span> <strong style="color: ${nodeColor};">${ROMAN_MAP[node.chord.root] || node.chord.root}</strong></div>
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
            tooltip.style.transform = "translate(-50%, 0) translateY(10px)";
        }, 10);
    }

    function hideTooltip() {
        tooltip.style.opacity = "0";
        tooltip.style.transform = "translate(-50%, 0) translateY(2px)";
        setTimeout(() => {
            if (tooltip.style.opacity === "0") {
                tooltip.style.display = "none";
            }
        }, 120);
    }

    function updateTooltipPosition() {
        if (currentHoveredChord && tooltip.style.display !== "none") {
            const pixelsPerBeat = logicalWidth / songLengthBeats;
            const axisHeight = 18;
            const blockHeight = (logicalHeight - axisHeight) * 0.8;
            const blockY = (logicalHeight - axisHeight - blockHeight) / 2;
            
            const chordX = (currentHoveredChord.beat - firstBeat) * pixelsPerBeat;
            const chordW = currentHoveredChord.duration * pixelsPerBeat;
            
            tooltip.style.left = `${chordX + chordW / 2}px`;
            tooltip.style.top = `${blockY + blockHeight}px`;
        }
    }

    function updateHoverState(mx, my) {
        let node = null;
        if (mx !== undefined && my !== undefined) {
            node = getChordAtCoordinates(mx, my);
        }
        
        if (node) {
            currentHoveredChord = node.chord;
            clearTimeout(hideTimeout);
            showTooltip(node);
        } else {
            currentHoveredChord = null;
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!currentHoveredChord && !isMouseOverTooltip) {
                    hideTooltip();
                }
            }, 150);
        }
    }

    canvas.addEventListener("mousemove", e => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        updateHoverState(mx, my);
    });

    canvas.addEventListener("mouseleave", () => {
        updateHoverState();
    });

    // Interaction
    canvas.addEventListener("click", e => {
        if (!songLengthBeats) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));

        // Calculate the beat position from the click (accounting for firstBeat offset)
        const clickedBeat = Math.floor(ratio * songLengthBeats) + firstBeat;
        
        // If checkbox is checked, find and play the chord
        if (checkbox.checked) {
            const chord = findChordAtBeat(clickedBeat);
            if (chord && options.onChordClick) {
                options.onChordClick(chord, arpCheckbox.checked);
            }
        }

        if (options.onSeek) {
            options.onSeek(ratio);
        }
    });

    return {
        setSongData(chords, key, lengthBeats, metadata = null) {
            currentChords = chords || [];
            currentKey = key;
            songLengthBeats = lengthBeats || 1;
            
            // Get firstBeat and numBeats from metadata.meters
            if (metadata?.meters && metadata.meters.length > 0) {
                const firstMeter = metadata.meters[0];
                firstBeat = firstMeter.beat || 1;
                numBeats = firstMeter.numBeats || 4;
            } else {
                firstBeat = 1;
                numBeats = 4; // Default to 4/4 time
            }
            
            draw();
        },

        setSongInfo(title, artist) {
            if (title || artist) {
                const t = title || "Unknown Song";
                const a = stripSongFromArtist(t, artist) || artist || "Unknown Artist";
                songTitleEl.textContent = `${t} by ${a}`;
                songTitleRow.style.display = "flex";
                updateSongTitlePosition();
            } else {
                songTitleEl.textContent = "";
                songTitleRow.style.display = "none";
            }
        },

        updateProgress(ratio) {
            currentProgressRatio = ratio;
            draw();
        }
    };
}
