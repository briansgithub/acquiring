

import { getScaleDegreeColor } from "../lib/scales.js";
import { getChordSymbol } from "../lib/jsonToSymbol.js";

export function renderTimeline(container, options = {}) {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let currentChords = [];
    let currentKey = { tonic: "C", scale: "major" };
    let songLengthBeats = 1;
    let currentProgressRatio = 0;

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const logicalWidth = rect.width;
        const logicalHeight = rect.height;
        
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
        if (canvas.width === 0 || canvas.height === 0) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!currentChords.length) return;

        const pixelsPerBeat = canvas.width / songLengthBeats;
        const blockHeight = canvas.height * 0.8;
        const y = (canvas.height - blockHeight) / 2;

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
        const progressX = currentProgressRatio * canvas.width;

        ctx.beginPath();
        ctx.moveTo(progressX, 0);
        ctx.lineTo(progressX, canvas.height);
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

    // Interaction
    canvas.addEventListener("click", e => {
        if (!songLengthBeats) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));

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

        updateProgress(ratio) {
            currentProgressRatio = ratio;
            draw();
        }
    };
}
