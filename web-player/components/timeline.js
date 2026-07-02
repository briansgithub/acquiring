
import { getScaleDegreeColor } from "../lib/scales.js";
import { getChordSymbol, getChordLetterName, stripBorrowedTags, borrowedAbbrev } from "../lib/jsonToSymbol.js";
import {
    drawRomanNumeral,
    measureRomanNumeral,
    romanNumeralToHtml,
    romanNumeralInkExtents,
} from "../lib/romanNumeralCanvas.js";
import { getChordPronunciation, pronunciationDisplayHtml } from "../lib/romanNumeralSpeak.js";

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
    
    const songTitleRow = document.createElement("div");
    songTitleRow.className = "timeline-song-title-row";

    const songTitleEl = document.createElement("div");
    songTitleEl.className = "timeline-song-title";
    songTitleRow.appendChild(songTitleEl);
    container.appendChild(songTitleRow);

    // Create canvas wrapper that takes up available space
    const canvasWrapper = document.createElement("div");
    canvasWrapper.style.cssText = "flex: 1; position: relative; min-height: 0;";

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvasWrapper.appendChild(canvas);
    container.appendChild(canvasWrapper);
    const ctx = canvas.getContext("2d");
    
    let currentChords = [];
    let currentKey = { tonic: "C", scale: "major" };
    let songLengthBeats = 1;
    let currentProgressRatio = 0;
    let logicalWidth = 0;
    let logicalHeight = 0;
    let firstBeat = 1;
    let numBeats = 4; // Default to 4/4 time
    let currentSectionKeys = [];
    let currentPlaybackKey = null;
    
    // Hover state variables declared here to avoid Temporal Dead Zone errors during initial draw
    let currentHoveredChord = null;
    let hideTimeout = null;

    const AXIS_HEIGHT = 13;
    const BLOCK_HEIGHT_RATIO = 0.9; // shorter blocks to make vertical room for title row
    const CHORD_LABEL_PAD = { x: 7, y: 4 };
    const MIN_CHORD_FONT_SIZE = 8;
    const MIN_CHORD_TOP_GAP = 4;
    const CHORD_CENTER_DOWN_SCALE = 0.035; // tiny visual centering tweak
    const BORROWED_ROW_OFFSET = 0.3;
    const BORROWED_FONT_SCALE = 0.55;
    const BORROWED_FONT = `500 ${MIN_CHORD_FONT_SIZE}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

    function normalizeTonic(tonic) {
        return String(tonic || "C")
            .replace(/♭/g, "b")
            .replace(/♯/g, "#")
            .replace(/♮/g, "");
    }

    function activeSectionKeyAtBeat(beat) {
        if (!Array.isArray(currentSectionKeys) || currentSectionKeys.length === 0) return currentKey;
        let chosen = currentSectionKeys[0];
        for (const key of currentSectionKeys) {
            if ((key?.beat ?? 1) <= beat) chosen = key;
            else break;
        }
        return {
            tonic: normalizeTonic(chosen?.tonic || currentKey?.tonic || "C"),
            scale: chosen?.scale || currentKey?.scale || "major",
        };
    }

    function timelineRenderKey() {
        return currentPlaybackKey || currentKey;
    }

    function timelineLabelVerticalSpan(symbol, fontSize, borrowedLabel) {
        const ink = romanNumeralInkExtents(ctx, symbol, fontSize, 0);
        if (!borrowedLabel) {
            return {
                above: -ink.top,
                below: ink.bottom,
            };
        }
        const centerOffset = fontSize * BORROWED_ROW_OFFSET;
        const borrowedFontSize = fontSize * BORROWED_FONT_SCALE;
        ctx.font = BORROWED_FONT.replace(`${MIN_CHORD_FONT_SIZE}px`, `${borrowedFontSize}px`);
        const borrowedMetrics = ctx.measureText(borrowedLabel);
        const borrowedHalf = Math.max(
            borrowedMetrics.actualBoundingBoxAscent || borrowedFontSize * 0.55,
            borrowedMetrics.actualBoundingBoxDescent || borrowedFontSize * 0.45
        );
        const romanTop = -centerOffset + ink.top;
        const romanBottom = -centerOffset + ink.bottom;
        const borrowedTop = centerOffset - borrowedHalf;
        const borrowedBottom = centerOffset + borrowedHalf;
        return {
            above: -Math.min(romanTop, borrowedTop),
            below: Math.max(romanBottom, borrowedBottom),
        };
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
        const blockHeight = (logicalHeight - axisHeight) * BLOCK_HEIGHT_RATIO;
        const y = (logicalHeight - axisHeight - blockHeight) / 2;

        // Draw Chords
        currentChords.forEach(chord => {
            if (chord.isRest) return;

            const x = (chord.beat - firstBeat) * pixelsPerBeat;
            const w = chord.duration * pixelsPerBeat;
            const innerW = w - CHORD_LABEL_PAD.x * 2;
            const innerH = blockHeight - CHORD_LABEL_PAD.y * 2;

            const renderKey = timelineRenderKey();
            ctx.fillStyle = getScaleDegreeColor(chord.root, renderKey.scale) || "#888";
            ctx.fillRect(x, y, w, blockHeight);

            // Border
            ctx.strokeStyle = "#1a1a1a";
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, blockHeight);

            // Label
            if (innerW > 12 && innerH > 12) {
                const fullSymbol = getChordSymbol(chord, renderKey);
                const symbol = stripBorrowedTags(fullSymbol);
                const borrowedLabel = borrowedAbbrev(chord.borrowed);
                const fitLabel = (size) => {
                    const span = timelineLabelVerticalSpan(symbol, size, borrowedLabel);
                    const metricsWidth = measureRomanNumeral(ctx, symbol, size);
                    const verticalSafety = Math.max(2, size * 0.06);
                    const horizontalSafety = Math.max(1.5, size * 0.06);
                    return (
                        metricsWidth + horizontalSafety <= innerW &&
                        span.above + MIN_CHORD_TOP_GAP + span.below + verticalSafety <= innerH
                    );
                };
                // Maximize label size while preserving clip-safe margins.
                let low = MIN_CHORD_FONT_SIZE;
                let high = Math.min(innerH * 0.9, innerW * 0.58);
                let best = MIN_CHORD_FONT_SIZE;
                for (let i = 0; i < 12; i += 1) {
                    const mid = (low + high) / 2;
                    if (fitLabel(mid)) {
                        best = mid;
                        low = mid;
                    } else {
                        high = mid;
                    }
                }
                const fontSize = best;
                const labelFits = fitLabel(fontSize);

                if (labelFits) {
                    ctx.fillStyle = "#000";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.shadowBlur = 0;

                    const centerX = x + w / 2;
                    const centerY = y + blockHeight / 2;
                    const downShift = fontSize * CHORD_CENTER_DOWN_SCALE;

                    if (borrowedLabel) {
                        drawRomanNumeral(ctx, symbol, centerX, centerY - fontSize * BORROWED_ROW_OFFSET + downShift, fontSize);
                        const borrowedFontSize = fontSize * BORROWED_FONT_SCALE;
                        ctx.font = `500 ${borrowedFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
                        ctx.fillText(borrowedLabel, centerX, centerY + fontSize * BORROWED_ROW_OFFSET + downShift);
                    } else {
                        drawRomanNumeral(ctx, symbol, centerX, centerY + downShift, fontSize);
                    }
                }
            }
        });

        // Draw Beat Axis
        const axisY = y + blockHeight + 2; // Keep labels inside visible canvas bounds
        
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
        ctx.font = "9px sans-serif";
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
            ctx.fillText(beat.toString(), tickX, axisY + 4);
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
        const blockHeight = (logicalHeight - axisHeight) * BLOCK_HEIGHT_RATIO;
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
        const renderKey = timelineRenderKey();
        const displayLabel = stripBorrowedTags(getChordSymbol(node.chord, renderKey));
        const alternateLabel = getChordLetterName(node.chord, renderKey);
        const borrowedLabel = borrowedAbbrev(node.chord.borrowed);
        const pronunciationHtml = pronunciationDisplayHtml(getChordPronunciation(node.chord, renderKey));
        
        const formattedJson = formatChordJson(node.chord);
        const nodeColor = getScaleDegreeColor(node.chord.root, renderKey.scale) || "#888";
        
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
                <div class="chord-tooltip-roman chord-roman-line" style="font-size: 18px; font-weight: 800; color: #ffffff; line-height: 1.2;">${romanNumeralToHtml(displayLabel)}</div>
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
            const blockHeight = (logicalHeight - axisHeight) * BLOCK_HEIGHT_RATIO;
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

        if (options.onSeek) {
            options.onSeek(ratio);
        }

        const chord = findChordAtBeat(clickedBeat);
        if (chord && options.onChordClick) {
            options.onChordClick(chord, options.getArpeggiated?.() ?? false);
        }
    });

    return {
        setSongData(chords, key, lengthBeats, metadata = null) {
            currentChords = chords || [];
            currentKey = key;
            currentPlaybackKey = key || null;
            currentSectionKeys = Array.isArray(metadata?.keys)
                ? [...metadata.keys].sort((a, b) => (a?.beat ?? 1) - (b?.beat ?? 1))
                : [];
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

        setSongInfo(title, artist, hooktheoryUrl) {
            songTitleEl.innerHTML = "";
            if (title || artist) {
                const t = title || "Unknown Song";
                const a = stripSongFromArtist(t, artist) || artist || "Unknown Artist";
                const label = `${t} by ${a}`;

                if (hooktheoryUrl) {
                    const link = document.createElement("a");
                    link.href = hooktheoryUrl;
                    link.target = "_blank";
                    link.rel = "noopener";
                    link.textContent = label;
                    link.className = "timeline-song-title-link";
                    songTitleEl.appendChild(link);
                    songTitleRow.style.pointerEvents = "auto";
                } else {
                    songTitleEl.textContent = label;
                    songTitleRow.style.pointerEvents = "none";
                }

                songTitleRow.style.display = "flex";
            } else {
                songTitleRow.style.display = "none";
                songTitleRow.style.pointerEvents = "none";
            }
        },

        updateProgress(ratio) {
            currentProgressRatio = ratio;
            const approxBeat = firstBeat + ratio * songLengthBeats;
            currentPlaybackKey = activeSectionKeyAtBeat(approxBeat);
            draw();
        },
        forceRelayout() {
            resize();
        }
    };
}
