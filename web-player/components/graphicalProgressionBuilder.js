/**
 * Graphical Progression Builder for Progression Matcher
 * Features:
 * - Diatonic Chord Palette (I, ii, iii, IV, V, vi, vii°)
 * - Active Progression Sequence Array (Equal-sized draggable blocks, left-justified)
 * - Drag-and-Drop Reordering with displacement animations
 * - Trash Can Target (Highlights red on drag-over, deletes chord on drop)
 * - Context Menu skeleton for right-clicking chords to refine properties
 */

const DIATONIC_CHORDS = [
  { degree: 1, symbol: "I", quality: "major" },
  { degree: 2, symbol: "ii", quality: "minor" },
  { degree: 3, symbol: "iii", quality: "minor" },
  { degree: 4, symbol: "IV", quality: "major" },
  { degree: 5, symbol: "V", quality: "major" },
  { degree: 6, symbol: "vi", quality: "minor" },
  { degree: 7, symbol: "vii°", quality: "diminished" },
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let nextChordId = 1;

export function renderGraphicalProgressionBuilder(container, options = {}) {
  const { onChange, initialChords = ["I", "V", "vi", "IV"] } = options;

  container.innerHTML = `
    <div class="gpb-wrap">
      <div class="gpb-section">
        <label class="sel-label">Diatonic Palette (Click to add)</label>
        <div class="gpb-palette">
          ${DIATONIC_CHORDS.map(
            (c) => `
            <button type="button" class="gpb-chord-card gpb-palette-card" data-degree="${c.degree}" data-symbol="${esc(c.symbol)}">
              <span class="gpb-chord-symbol">${esc(c.symbol)}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <div class="gpb-section">
        <div class="gpb-pattern-header">
          <label class="sel-label">Progression Sequence</label>
          <div id="gpb-trash" class="gpb-trash" title="Drag chord here to delete">
            <span class="gpb-trash-icon">🗑️</span>
            <span class="gpb-trash-label">Trash</span>
          </div>
        </div>
        <div id="gpb-pattern-track" class="gpb-pattern-track">
          <div class="gpb-empty-hint">Click palette chords to build progression</div>
        </div>
      </div>

      <!-- Right Click Context Menu (Property Skeleton) -->
      <div id="gpb-context-menu" class="gpb-context-menu" hidden>
        <div class="gpb-ctx-header">
          <span id="gpb-ctx-title" class="gpb-ctx-title">Chord Properties</span>
          <button type="button" id="gpb-ctx-close" class="gpb-ctx-close">&times;</button>
        </div>
        <div class="gpb-ctx-body">
          <div class="gpb-ctx-field">
            <label class="sel-label" for="gpb-ctx-inv">Inversion</label>
            <select id="gpb-ctx-inv" class="sel-select">
              <option value="0">Root Position</option>
              <option value="1">1st Inversion (6)</option>
              <option value="2">2nd Inversion (6/4)</option>
              <option value="3">3rd Inversion (4/2)</option>
            </select>
          </div>
          <div class="gpb-ctx-field">
            <label class="sel-label" for="gpb-ctx-type">Chord Type</label>
            <select id="gpb-ctx-type" class="sel-select">
              <option value="triad">Triad</option>
              <option value="7th">7th Chord</option>
              <option value="maj7">Maj7 Chord</option>
            </select>
          </div>
          <div class="gpb-ctx-field">
            <label class="sel-label" for="gpb-ctx-applied">Applied Target (Secondary)</label>
            <select id="gpb-ctx-applied" class="sel-select">
              <option value="0">None (Diatonic)</option>
              <option value="2">/ii</option>
              <option value="3">/iii</option>
              <option value="4">/IV</option>
              <option value="5">/V</option>
              <option value="6">/vi</option>
              <option value="7">/vii°</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  `;

  const paletteEl = container.querySelector(".gpb-palette");
  const patternTrackEl = container.querySelector("#gpb-pattern-track");
  const trashEl = container.querySelector("#gpb-trash");
  const contextMenuEl = container.querySelector("#gpb-context-menu");
  const ctxTitleEl = container.querySelector("#gpb-ctx-title");
  const ctxCloseEl = container.querySelector("#gpb-ctx-close");
  const ctxInvEl = container.querySelector("#gpb-ctx-inv");
  const ctxTypeEl = container.querySelector("#gpb-ctx-type");
  const ctxAppliedEl = container.querySelector("#gpb-ctx-applied");

  // State
  let sequence = []; // Array of chord objects: { id, degree, baseSymbol, symbol, inversion, type, applied }
  let activeRightClickChordId = null;
  let draggedChordId = null;

  // Initialize initial chords if provided
  if (Array.isArray(initialChords) && initialChords.length) {
    for (const sym of initialChords) {
      const match = DIATONIC_CHORDS.find((c) => c.symbol.toLowerCase() === sym.toLowerCase()) || DIATONIC_CHORDS[0];
      sequence.push(createChordObject(match.degree, match.symbol));
    }
  }

  function createChordObject(degree, symbol) {
    return {
      id: `chord-${nextChordId++}`,
      degree,
      baseSymbol: symbol,
      symbol,
      inversion: 0,
      type: "triad",
      applied: 0,
    };
  }

  function computeChordSymbol(chord) {
    let sym = chord.baseSymbol;
    if (chord.type === "7th") {
      sym += "7";
    } else if (chord.type === "maj7") {
      sym += "maj7";
    }

    if (chord.inversion === 1) sym += "6";
    else if (chord.inversion === 2) sym += "6/4";
    else if (chord.inversion === 3) sym += "4/2";

    if (chord.applied > 0) {
      const appTarget = DIATONIC_CHORDS.find((c) => c.degree === chord.applied)?.symbol || chord.applied;
      sym += `/${appTarget}`;
    }
    return sym;
  }

  function notifyChange() {
    onChange?.(getSequenceTokens());
  }

  function renderTrack() {
    patternTrackEl.innerHTML = "";
    if (sequence.length === 0) {
      patternTrackEl.innerHTML = `<div class="gpb-empty-hint">Click palette chords to build progression</div>`;
      return;
    }

    sequence.forEach((chord, idx) => {
      const block = document.createElement("div");
      block.className = "gpb-chord-card gpb-pattern-card";
      block.dataset.id = chord.id;
      block.dataset.index = idx;
      block.draggable = true;
      block.innerHTML = `
        <span class="gpb-chord-symbol">${esc(chord.symbol)}</span>
        <button type="button" class="gpb-card-remove" title="Remove">&times;</button>
      `;

      // Remove button listener
      block.querySelector(".gpb-card-remove")?.addEventListener("click", (e) => {
        e.stopPropagation();
        removeChord(chord.id);
      });

      // Right-click context menu listener
      block.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openContextMenu(chord, e.clientX, e.clientY);
      });

      // Drag & Drop reordering listeners
      block.addEventListener("dragstart", (e) => {
        draggedChordId = chord.id;
        block.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", chord.id);
      });

      block.addEventListener("dragend", () => {
        block.classList.remove("is-dragging");
        draggedChordId = null;
        trashEl.classList.remove("is-drag-over");
        container.querySelectorAll(".gpb-pattern-card").forEach((el) => {
          el.classList.remove("gpb-bump-right", "gpb-bump-left");
        });
      });

      block.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const currentIdx = sequence.findIndex((c) => c.id === draggedChordId);
        if (currentIdx !== -1 && currentIdx !== idx) {
          container.querySelectorAll(".gpb-pattern-card").forEach((el) => {
            const elIdx = Number(el.dataset.index);
            el.classList.remove("gpb-bump-right", "gpb-bump-left");
            if (currentIdx < idx && elIdx > currentIdx && elIdx <= idx) {
              el.classList.add("gpb-bump-left");
            } else if (currentIdx > idx && elIdx >= idx && elIdx < currentIdx) {
              el.classList.add("gpb-bump-right");
            }
          });
        }
      });

      block.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!draggedChordId) return;
        const fromIdx = sequence.findIndex((c) => c.id === draggedChordId);
        const toIdx = idx;
        if (fromIdx !== -1 && fromIdx !== toIdx) {
          reorderChord(fromIdx, toIdx);
        }
      });

      patternTrackEl.appendChild(block);
    });
  }

  function addChord(degree, symbol) {
    const chord = createChordObject(degree, symbol);
    sequence.push(chord);
    renderTrack();
    notifyChange();
  }

  function removeChord(id) {
    sequence = sequence.filter((c) => c.id !== id);
    if (activeRightClickChordId === id) closeContextMenu();
    renderTrack();
    notifyChange();
  }

  function reorderChord(fromIdx, toIdx) {
    const [moved] = sequence.splice(fromIdx, 1);
    sequence.splice(toIdx, 0, moved);
    renderTrack();
    notifyChange();
  }

  // Palette Click handler
  paletteEl.addEventListener("click", (e) => {
    const card = e.target.closest(".gpb-palette-card");
    if (!card) return;
    const degree = Number(card.dataset.degree);
    const symbol = card.dataset.symbol;
    addChord(degree, symbol);
  });

  // Trash target drag events
  trashEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    trashEl.classList.add("is-drag-over");
    e.dataTransfer.dropEffect = "move";
  });

  trashEl.addEventListener("dragleave", () => {
    trashEl.classList.remove("is-drag-over");
  });

  trashEl.addEventListener("drop", (e) => {
    e.preventDefault();
    trashEl.classList.remove("is-drag-over");
    if (draggedChordId) {
      removeChord(draggedChordId);
    }
  });

  // Context menu handling
  function openContextMenu(chord, x, y) {
    activeRightClickChordId = chord.id;
    ctxTitleEl.textContent = `Properties: ${chord.symbol}`;
    ctxInvEl.value = String(chord.inversion);
    ctxTypeEl.value = chord.type;
    ctxAppliedEl.value = String(chord.applied);

    contextMenuEl.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    contextMenuEl.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    contextMenuEl.hidden = false;
  }

  function closeContextMenu() {
    contextMenuEl.hidden = true;
    activeRightClickChordId = null;
  }

  ctxCloseEl.addEventListener("click", closeContextMenu);

  function syncContextValues() {
    if (!activeRightClickChordId) return;
    const chord = sequence.find((c) => c.id === activeRightClickChordId);
    if (!chord) return;

    chord.inversion = Number(ctxInvEl.value);
    chord.type = ctxTypeEl.value;
    chord.applied = Number(ctxAppliedEl.value);
    chord.symbol = computeChordSymbol(chord);

    ctxTitleEl.textContent = `Properties: ${chord.symbol}`;
    renderTrack();
    notifyChange();
  }

  ctxInvEl.addEventListener("change", syncContextValues);
  ctxTypeEl.addEventListener("change", syncContextValues);
  ctxAppliedEl.addEventListener("change", syncContextValues);

  document.addEventListener("click", (e) => {
    if (!contextMenuEl.hidden && !contextMenuEl.contains(e.target) && !e.target.closest(".gpb-pattern-card")) {
      closeContextMenu();
    }
  });

  function getSequenceTokens() {
    return sequence.map((c) => c.symbol);
  }

  renderTrack();

  return {
    getSequenceTokens,
    setSequence: (tokens) => {
      sequence = (tokens || []).map((t) => {
        const match = DIATONIC_CHORDS.find((c) => c.symbol.toLowerCase() === t.toLowerCase()) || { degree: 1, symbol: t };
        return createChordObject(match.degree, t);
      });
      renderTrack();
      notifyChange();
    },
    clear: () => {
      sequence = [];
      renderTrack();
      notifyChange();
    },
  };
}
