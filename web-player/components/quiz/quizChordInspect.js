import { findPoolEntry } from "./quizPool.js";

export const PITCH_PREF_KEY = "sr_quiz_show_pitch";
export const ARPEGGIO_PREF_KEY = "sr_quiz_arpeggio";
export const SHOW_NOTES_PREF_KEY = "sr_quiz_show_notes";
const CHORD_HOLD_PREF_KEY = "sr_quiz_chord_hold";
const ARP_SPEED_PREF_KEY = "sr_quiz_arp_speed";
const PLAYBACK_MS_MIN = 150;
const PLAYBACK_MS_MAX = 3000;
const ARP_SPEED_DEFAULT = 400;
const CHORD_HOLD_DEFAULT = 1200;
const PLAYBACK_MS_STEP = 50;

function clampPlaybackMs(n, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(PLAYBACK_MS_MAX, Math.max(PLAYBACK_MS_MIN, n));
}

function savedChordHold() {
  const n = Number(sessionStorage.getItem(CHORD_HOLD_PREF_KEY));
  if (Number.isFinite(n)) return clampPlaybackMs(n, CHORD_HOLD_DEFAULT);
  return CHORD_HOLD_DEFAULT;
}

function savedArpSpeed() {
  const n = Number(sessionStorage.getItem(ARP_SPEED_PREF_KEY));
  if (Number.isFinite(n)) return clampPlaybackMs(n, ARP_SPEED_DEFAULT);
  return ARP_SPEED_DEFAULT;
}

export function getShowPitchPref() {
  return sessionStorage.getItem(PITCH_PREF_KEY) === "1";
}

export function setShowPitchPref(on) {
  sessionStorage.setItem(PITCH_PREF_KEY, on ? "1" : "0");
}

export function getArpeggioPref() {
  return sessionStorage.getItem(ARPEGGIO_PREF_KEY) === "1";
}

export function setArpeggioPref(on) {
  sessionStorage.setItem(ARPEGGIO_PREF_KEY, on ? "1" : "0");
  document.dispatchEvent(new CustomEvent("sr-quiz-arp-pref"));
}

export function getShowNotesPref() {
  return sessionStorage.getItem(SHOW_NOTES_PREF_KEY) === "1";
}

export function setShowNotesPref(on) {
  sessionStorage.setItem(SHOW_NOTES_PREF_KEY, on ? "1" : "0");
  document.dispatchEvent(new CustomEvent("sr-quiz-notes-pref"));
}

export function entryTones(entry, songCtx) {
  if (!entry) return { notes: [], degrees: [] };
  const data = songCtx?.interpret?.(entry.chord, entry.key);
  const notes = data?.notes?.length ? data.notes : entry.notes || [];
  let degrees = data?.chordDegrees?.length ? data.chordDegrees : entry.degrees || [];
  if (degrees.length < notes.length) {
    degrees = [
      ...degrees,
      ...notes.slice(degrees.length).map((_, i) => String((degrees.length || 1) + i)),
    ];
  }
  return { notes, degrees: degrees.slice(0, notes.length) };
}

export function formatDegreeLabel(degree, note, showPitch) {
  const d = degree != null && degree !== "" ? String(degree) : "?";
  if (showPitch && note) return `${d} · ${note}`;
  return d;
}

/** @param {number|null|'all'} activeIndex — index playing, 'all' block chord, null idle */
export function noteTableHtml(notes, degrees, showPitch, activeIndex = null) {
  if (!notes?.length) return "<span class='quiz-note-empty'>No tones</span>";

  function cellClass(i) {
    if (activeIndex === "all") return "quiz-note-cell-active";
    if (activeIndex === i) return "quiz-note-cell-active";
    return "quiz-note-cell-idle";
  }

  const idxCells = notes
    .map((_, i) => `<span class="quiz-note-cell quiz-note-cell-idx ${cellClass(i)}">${i + 1}</span>`)
    .join("");
  const degCells = notes
    .map((note, i) => {
      const deg = formatDegreeLabel(degrees[i], note, false);
      return `<span class="quiz-note-cell quiz-note-cell-deg ${cellClass(i)}">${deg}</span>`;
    })
    .join("");
  const colTpl = `14px repeat(${notes.length}, minmax(24px, 1fr))`;

  return `<div class="quiz-note-table">
    <div class="quiz-note-table-row quiz-note-idx-row" style="grid-template-columns:${colTpl}">
      <span class="quiz-note-row-label">#</span>${idxCells}
    </div>
    <div class="quiz-note-table-row quiz-note-deg-row" style="grid-template-columns:${colTpl}">
      <span class="quiz-note-row-label">°</span>${degCells}
    </div>
    ${showPitch
      ? `<div class="quiz-note-table-row quiz-note-pitch-row" style="grid-template-columns:${colTpl}">
        <span class="quiz-note-row-label">Pitch</span>
        ${notes
          .map((note, i) => `<span class="quiz-note-cell quiz-note-cell-pitch ${cellClass(i)}">${note}</span>`)
          .join("")}
      </div>`
      : ""}
  </div>`;
}

/** @deprecated use noteTableHtml */
export function noteListHtml(notes, degrees, showPitch, activeIndex = null) {
  return noteTableHtml(notes, degrees, showPitch, activeIndex);
}

export function chordToolsExtrasHtml(prefix) {
  return `
    <div class="quiz-chord-tools-extras" data-chord-tools="${prefix}">
      <div class="quiz-row quiz-chord-tools-row">
        <label class="quiz-chord-toggle" title="Play every chord one note at a time">
          <input type="checkbox" id="${prefix}-arp-mode" /> Arpeggio
        </label>
        <label class="quiz-chord-toggle" title="Show scale degrees for the current chord">
          <input type="checkbox" id="${prefix}-show-notes" /> Show notes
        </label>
        <label class="quiz-chord-toggle" title="Include absolute pitch in degree labels">
          <input type="checkbox" id="${prefix}-show-pitch" /> Note names
        </label>
        <label class="quiz-speed-label quiz-speed-hold" for="${prefix}-chord-hold" title="How long block chords are held">
          Chord hold
          <input type="range" id="${prefix}-chord-hold" class="quiz-speed-slider" min="${PLAYBACK_MS_MIN}" max="${PLAYBACK_MS_MAX}" step="${PLAYBACK_MS_STEP}" value="${CHORD_HOLD_DEFAULT}" />
          <span id="${prefix}-chord-hold-val" class="quiz-speed-val">${CHORD_HOLD_DEFAULT}ms</span>
        </label>
        <label class="quiz-speed-label quiz-speed-arp" for="${prefix}-arp-speed" title="Milliseconds per note when arpeggio is on">
          Arp note
          <input type="range" id="${prefix}-arp-speed" class="quiz-speed-slider" min="${PLAYBACK_MS_MIN}" max="${PLAYBACK_MS_MAX}" step="${PLAYBACK_MS_STEP}" value="${ARP_SPEED_DEFAULT}" />
          <span id="${prefix}-arp-speed-val" class="quiz-speed-val">${ARP_SPEED_DEFAULT}ms</span>
        </label>
      </div>
      <div id="${prefix}-note-panel" class="quiz-note-panel is-collapsed"></div>
    </div>`;
}

function setPanelOpen(panel, open) {
  if (!panel) return;
  panel.classList.toggle("is-collapsed", !open);
}

function renderPanel(panel, entry, songCtx, activeIndex) {
  if (!panel || !entry) return;
  const { notes, degrees } = entryTones(entry, songCtx);
  const sym = entry.symbol || "";
  panel.innerHTML = `<div class="quiz-note-panel-title">${sym}</div>${noteTableHtml(notes, degrees, getShowPitchPref(), activeIndex)}`;
}

export function mountChordDrillTools(root, prefix, ctx, base, getTargetEntry) {
  const scope = root.querySelector(`[data-chord-tools="${prefix}"]`) || root;
  const chordHoldEl = scope.querySelector(`#${prefix}-chord-hold`);
  const chordHoldValEl = scope.querySelector(`#${prefix}-chord-hold-val`);
  const speedEl = scope.querySelector(`#${prefix}-arp-speed`);
  const speedValEl = scope.querySelector(`#${prefix}-arp-speed-val`);
  const pitchEl = scope.querySelector(`#${prefix}-show-pitch`);
  const arpEl = scope.querySelector(`#${prefix}-arp-mode`);
  const holdLabel = scope.querySelector(".quiz-speed-hold");
  const arpLabel = scope.querySelector(".quiz-speed-arp");
  const showNotesEl = scope.querySelector(`#${prefix}-show-notes`);
  const notePanel = scope.querySelector(`#${prefix}-note-panel`);

  function syncSliderVisibility() {
    const arp = getArpeggioPref();
    holdLabel?.classList.toggle("is-hidden", arp);
    arpLabel?.classList.toggle("is-hidden", !arp);
  }

  if (chordHoldEl && chordHoldValEl) {
    chordHoldEl.value = String(savedChordHold());
    chordHoldValEl.textContent = `${chordHoldEl.value}ms`;
    chordHoldEl.addEventListener("input", () => {
      chordHoldValEl.textContent = `${chordHoldEl.value}ms`;
      sessionStorage.setItem(CHORD_HOLD_PREF_KEY, chordHoldEl.value);
    });
  }
  if (speedEl && speedValEl) {
    speedEl.value = String(savedArpSpeed());
    speedValEl.textContent = `${speedEl.value}ms`;
    speedEl.addEventListener("input", () => {
      speedValEl.textContent = `${speedEl.value}ms`;
      sessionStorage.setItem(ARP_SPEED_PREF_KEY, speedEl.value);
    });
  }
  if (pitchEl) {
    pitchEl.checked = getShowPitchPref();
    pitchEl.addEventListener("change", () => {
      setShowPitchPref(pitchEl.checked);
      document.dispatchEvent(new CustomEvent("sr-quiz-pitch-pref"));
      syncDisplay(getTargetEntry());
    });
  }
  if (arpEl) {
    arpEl.checked = getArpeggioPref();
    arpEl.addEventListener("change", () => {
      setArpeggioPref(arpEl.checked);
      syncSliderVisibility();
    });
  }
  if (showNotesEl) {
    showNotesEl.checked = getShowNotesPref();
    showNotesEl.addEventListener("change", () => {
      setShowNotesPref(showNotesEl.checked);
      syncDisplay(getTargetEntry());
    });
  }

  document.addEventListener("sr-quiz-arp-pref", () => {
    if (arpEl) arpEl.checked = getArpeggioPref();
    syncSliderVisibility();
  });
  document.addEventListener("sr-quiz-notes-pref", () => {
    if (showNotesEl) showNotesEl.checked = getShowNotesPref();
    syncDisplay(getTargetEntry());
  });

  syncSliderVisibility();

  function chordHoldMs() {
    return Number(chordHoldEl?.value) || savedChordHold();
  }

  function arpMsPerNote() {
    return Number(speedEl?.value) || savedArpSpeed();
  }

  function syncDisplay(entry, activeIndex = null) {
    if (!getShowNotesPref() || !entry) {
      setPanelOpen(notePanel, false);
      return;
    }
    renderPanel(notePanel, entry, base.songCtx, activeIndex);
    setPanelOpen(notePanel, true);
  }

  function playEntry(entry, onComplete) {
    if (!entry?.notes?.length && !entry?.chord) {
      onComplete?.();
      return;
    }
    const { notes } = entryTones(entry, base.songCtx);
    if (!notes.length) {
      onComplete?.();
      return;
    }

    const holdMs = chordHoldMs();
    const arpMs = arpMsPerNote();
    if (getShowNotesPref()) {
      syncDisplay(entry, getArpeggioPref() ? null : "all");
    }

    const done = () => {
      if (getShowNotesPref()) syncDisplay(entry, null);
      onComplete?.();
    };

    if (getArpeggioPref()) {
      ctx.audio.playArpeggio(notes, {
        msPerNote: arpMs,
        onNote: (i) => {
          if (getShowNotesPref()) syncDisplay(entry, i);
        },
        onDone: done,
      });
      return;
    }

    ctx.audio.playChord(notes, holdMs);
    setTimeout(done, holdMs);
  }

  function playToneAt(entry, toneIndex, onComplete) {
    if (!entry) {
      onComplete?.();
      return;
    }
    const { notes } = entryTones(entry, base.songCtx);
    const playNotes = entry.rootNotes?.length ? entry.rootNotes : notes;
    const note = playNotes[toneIndex];
    if (!note) {
      onComplete?.();
      return;
    }
    const holdMs = chordHoldMs();
    const highlightIdx = notes.indexOf(note);
    if (getShowNotesPref()) {
      syncDisplay(entry, highlightIdx >= 0 ? highlightIdx : toneIndex);
    }
    ctx.audio.playChord([note], holdMs);
    setTimeout(() => {
      if (getShowNotesPref()) syncDisplay(entry, null);
      onComplete?.();
    }, holdMs);
  }

  function playEntriesSequential(entries, gapMs, onComplete) {
    const list = entries.filter(Boolean);
    if (!list.length) {
      onComplete?.();
      return;
    }
    let idx = 0;
    const step = () => {
      if (idx >= list.length) {
        onComplete?.();
        return;
      }
      playEntry(list[idx++], () => setTimeout(step, gapMs));
    };
    step();
  }

  document.addEventListener("sr-quiz-pitch-pref", () => syncDisplay(getTargetEntry()));
  document.addEventListener("sr-quiz-notes-pref", () => syncDisplay(getTargetEntry()));

  return {
    playEntry,
    playToneAt,
    playEntriesSequential,
    syncDisplay,
    chordHoldMs,
    arpMsPerNote,
    resolveSymbol: (symbol) => findPoolEntry(base.pool, symbol),
    tagChordElement(el, symbol) {
      if (!el || !symbol) return;
      el.classList.add("quiz-chord-sym");
      el.dataset.quizSymbol = symbol;
      el.title = "Right-click: play chord / show notes";
    },
    wireChoices(choicesEl, symbols) {
      if (!choicesEl) return;
      choicesEl.querySelectorAll(".quiz-choice-btn").forEach((btn, i) => {
        const sym = symbols[i];
        if (sym) this.tagChordElement(btn, sym);
      });
      bindChordContext(choicesEl, ctx, base, { playEntry, syncDisplay, notePanel });
    },
    wireStaticChords(container) {
      bindChordContext(container, ctx, base, { playEntry, syncDisplay, notePanel });
    },
    clearPanels() {
      setPanelOpen(notePanel, false);
      if (getShowNotesPref()) syncDisplay(getTargetEntry(), null);
    },
  };
}

function bindChordContext(container, ctx, base, player) {
  container.querySelectorAll("[data-quiz-symbol]").forEach((el) => {
    if (el.dataset.quizCtxBound) return;
    el.dataset.quizCtxBound = "1";
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const symbol = el.dataset.quizSymbol;
      if (!symbol) return;
      showChordContextMenu(e.clientX, e.clientY, symbol, ctx, base, player);
    });
  });
}

let menuEl = null;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement("div");
  menuEl.className = "quiz-chord-ctx-menu";
  menuEl.hidden = true;
  menuEl.innerHTML = `
    <button type="button" data-action="play">Play chord</button>
    <button type="button" data-action="notes">Toggle show notes</button>
    <button type="button" data-action="arp">Toggle arpeggio</button>
    <button type="button" data-action="toggle-pitch">Toggle note names</button>
  `;
  document.body.appendChild(menuEl);
  document.addEventListener("click", () => {
    menuEl.hidden = true;
  });
  document.addEventListener("scroll", () => {
    menuEl.hidden = true;
  }, true);
  return menuEl;
}

function showChordContextMenu(x, y, symbol, ctx, base, player) {
  const menu = ensureMenu();
  const entry = findPoolEntry(base.pool, symbol);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;

  for (const btn of menu.querySelectorAll("button")) {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      menu.hidden = true;
      const action = btn.dataset.action;
      if (action === "toggle-pitch") {
        setShowPitchPref(!getShowPitchPref());
        document.dispatchEvent(new CustomEvent("sr-quiz-pitch-pref"));
        return;
      }
      if (action === "arp") {
        setArpeggioPref(!getArpeggioPref());
        document.querySelectorAll("[id$='-arp-mode']").forEach((el) => {
          el.checked = getArpeggioPref();
        });
        return;
      }
      if (action === "notes") {
        setShowNotesPref(!getShowNotesPref());
        document.querySelectorAll("[id$='-show-notes']").forEach((el) => {
          el.checked = getShowNotesPref();
        });
        player.syncDisplay?.(entry, null);
        return;
      }
      if (!entry) return;
      if (action === "play") player.playEntry?.(entry);
    };
  }
}

export function mountWorkspaceChordMenu(workspaceEl, ctx) {
  workspaceEl.addEventListener("contextmenu", (e) => {
    const sym = e.target.closest("[data-quiz-symbol]");
    if (!sym || !workspaceEl.contains(sym)) return;
    e.preventDefault();
    const pool = ctx.getSongContext?.()?.entries ?? [];
    const base = {
      pool,
      get songCtx() {
        return ctx.getSongContext();
      },
    };
    const prefix = workspaceEl.querySelector("[data-chord-tools]")?.dataset.chordTools;
    const notePanel = prefix ? workspaceEl.querySelector(`#${prefix}-note-panel`) : null;
    const entry = findPoolEntry(pool, sym.dataset.quizSymbol);
    const player = {
      playEntry: (en) => {
        const tones = entryTones(en, base.songCtx);
        if (!tones.notes.length) return;
        const chordMs = savedChordHold();
        const arpMs = savedArpSpeed();
        const show = getShowNotesPref();
        if (show) {
          renderPanel(notePanel, en, base.songCtx, getArpeggioPref() ? null : "all");
          setPanelOpen(notePanel, true);
        }
        const finish = () => {
          if (show) renderPanel(notePanel, en, base.songCtx, null);
          else setPanelOpen(notePanel, false);
        };
        if (getArpeggioPref()) {
          ctx.audio.playArpeggio(tones.notes, {
            msPerNote: arpMs,
            onNote: (i) => {
              if (show) renderPanel(notePanel, en, base.songCtx, i);
            },
            onDone: finish,
          });
        } else {
          if (show) renderPanel(notePanel, en, base.songCtx, "all");
          ctx.audio.playChord(tones.notes, chordMs);
          setTimeout(finish, chordMs);
        }
      },
      syncDisplay: (en, idx) => {
        if (!getShowNotesPref() || !notePanel) return;
        if (!en) setPanelOpen(notePanel, false);
        else {
          renderPanel(notePanel, en, base.songCtx, idx);
          setPanelOpen(notePanel, true);
        }
      },
      notePanel,
    };
    showChordContextMenu(e.clientX, e.clientY, sym.dataset.quizSymbol, ctx, base, player);
  });
}
