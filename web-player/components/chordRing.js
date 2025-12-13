export function renderChordRing(container) {
  const canvas = document.createElement("canvas");
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  function drawChord(notes, root, chordDegrees) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#22d3ee";
    ctx.textAlign = "center";
    
    // Draw root above
    if (root) {
      ctx.font = "18px Inter, sans-serif";
      ctx.textBaseline = "bottom";
      ctx.fillText(root.toString(), centerX, centerY - 30);
    }
    
    // Draw chord notes in the middle
    if (notes && notes.length > 0) {
      ctx.font = "20px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(notes.join("-"), centerX, centerY);
    } else {
      ctx.font = "20px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("Ready", centerX, centerY);
    }
    
    // Draw chord degrees below
    if (chordDegrees && chordDegrees.length > 0) {
      ctx.font = "16px Inter, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(chordDegrees.join("-"), centerX, centerY + 30);
    }
  }

  drawChord(null, null, null);

  return {
    update(notes, root, chordDegrees) {
      drawChord(notes, root, chordDegrees);
    },
  };
}

