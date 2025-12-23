

import { getScaleDegreeColor } from "../lib/scales.js";
import { getChordSymbol } from "../lib/jsonToSymbol.js";

export function renderTimeline(container, options = {}) {
    // Set container to flex column layout
    container.style.display = "flex";
    container.style.flexDirection = "column";
    
    // Create canvas wrapper that takes up available space
    const canvasWrapper = document.createElement("div");
    canvasWrapper.style.cssText = "flex: 1; position: relative; min-height: 0;";
    
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvasWrapper.appendChild(canvas);
    container.appendChild(canvasWrapper);
    const ctx = canvas.getContext("2d");
    
    // Create checkbox container at the bottom
    const checkboxContainer = document.createElement("div");
    checkboxContainer.style.cssText = "display: flex; align-items: center; gap: 12px; padding: 0px 12px; border-top: 1px solid var(--divider, #1f2937); flex-shrink: 0;";
    
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
    
    // Create URL link element
    const urlLink = document.createElement("a");
    urlLink.href = "#";
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";
    urlLink.style.cssText = "font-size: 12px; color: #00AAFF; text-decoration: underline; opacity: 0.7; transition: opacity 0.2s;";
    urlLink.style.display = "none"; // Hidden by default, shown when URL is set
    urlLink.addEventListener("mouseenter", () => {
        urlLink.style.opacity = "1";
    });
    urlLink.addEventListener("mouseleave", () => {
        urlLink.style.opacity = "0.7";
    });
    checkboxContainer.appendChild(urlLink);
    
    container.appendChild(checkboxContainer);

    let currentChords = [];
    let currentKey = { tonic: "C", scale: "major" };
    let songLengthBeats = 1;
    let currentProgressRatio = 0;
    let logicalWidth = 0;
    let logicalHeight = 0;

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
        const blockHeight = logicalHeight * 0.8;
        const y = (logicalHeight - blockHeight) / 2;

        // Draw Chords
        currentChords.forEach(chord => {
            if (chord.isRest) return;

            const x = (chord.beat - 1) * pixelsPerBeat;
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
                ctx.font = `bold ${fontSize}px 'Times New Roman', serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "rgba(255,255,255,0.5)"; // Light shadow for contrast on dark blocks? Or no shadow?
                ctx.shadowBlur = 0; // Removing shadow for clean look with black text

                const symbol = getChordSymbol(chord, currentKey);
                // Hide if text fits? Simply clip or verify width.
                const metrics = ctx.measureText(symbol);
                if (metrics.width < w - 4) {
                    if (chord.borrowed) {
                        // Draw symbol higher
                        ctx.fillText(symbol, x + w / 2, y + blockHeight / 2 - fontSize * 0.3);
                        // Draw borrowed text lower (smaller)
                        const borrowedFontSize = fontSize * 0.5;
                        ctx.font = `italic ${borrowedFontSize}px 'Times New Roman', serif`;
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

    // Interaction
    canvas.addEventListener("click", e => {
        if (!songLengthBeats) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));

        // Calculate the beat position from the click
        const clickedBeat = ratio * songLengthBeats + 1;
        
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
        setSongData(chords, key, lengthBeats) {
            currentChords = chords || [];
            currentKey = key;
            songLengthBeats = lengthBeats || 1;
            draw();
        },

        setSongUrl(url) {
            if (url) {
                urlLink.href = url;
                urlLink.textContent = url;
                urlLink.style.display = "block";
            } else {
                urlLink.style.display = "none";
            }
        },

        updateProgress(ratio) {
            currentProgressRatio = ratio;
            draw();
        }
    };
}
