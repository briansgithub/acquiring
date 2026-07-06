import {
  mountDifficultyAfter,
  micGrade,
  sm2Quality,
  DIFFICULTY_TO_CENTS,
  requireSong,
  feedback,
  tonicizeKey,
  QUIZ_TOOLTIPS,
  quizNotify,
  quizRecord,
} from "./modeUtils.js";

const LABELS = ["root", "3rd", "5th", "7th"];

export const singArpeggio = {
  id: "singArpeggio",
  label: "Sing Arpeggio",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;
    let target = null;
    let toneIdx = 0;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="sa-prompt">Sing the arpeggio tones in order.</div>
        <div class="quiz-row quiz-transport-row">
          <button type="button" id="sa-tonicize" title="${QUIZ_TOOLTIPS.tonicize}">Tonicize</button>
          <button type="button" id="sa-repeat-chord" title="${QUIZ_TOOLTIPS.repeatArpeggioChord}">Repeat chord</button>
          <button type="button" id="sa-repeat-tone" title="${QUIZ_TOOLTIPS.repeatArpeggioTone}">Repeat tone</button>
          <button type="button" id="sa-next" title="${QUIZ_TOOLTIPS.next}">Next</button>
          <button type="button" id="sa-sing" title="${QUIZ_TOOLTIPS.singTone}">Sing</button>
        </div>
        <div id="sa-meter"></div>
        <div id="sa-status" class="quiz-status"></div>
        <div id="sa-results"></div>
      </div>
    `;

    const promptEl = el.querySelector("#sa-prompt");
    const statusEl = el.querySelector("#sa-status");
    const resultsEl = el.querySelector("#sa-results");
    const meterEl = el.querySelector("#sa-meter");
    const diffEl = mountDifficultyAfter(promptEl, { type: "pitch", id: "sa-diff" });

    function playChord() {
      if (!target) return;
      ctx.audio.playChord(target.notes);
    }

    function playTone() {
      const note = target?.rootNotes?.[toneIdx];
      if (note) ctx.audio.playChord([note], 700);
    }

    function updatePrompt() {
      const label = LABELS[toneIdx] || `tone ${toneIdx + 1}`;
      promptEl.textContent = `Sing the ${label} (${toneIdx + 1}/${target.rootNotes.length})`;
    }

    function nextQuestion() {
      resultsEl.innerHTML = "";
      statusEl.textContent = "";
      toneIdx = 0;
      target = ctx.session.pickEntry(pool);
      if (!target?.rootNotes?.length) return;
      quizNotify(ctx, { symbols: [target.symbol] });
      updatePrompt();
      promptEl.textContent += " Tonicize for key context; Repeat chord or tone as needed.";
    }

    el.querySelector("#sa-tonicize").addEventListener("click", () => tonicizeKey(songCtx, ctx.audio));
    el.querySelector("#sa-repeat-chord").addEventListener("click", playChord);
    el.querySelector("#sa-repeat-tone").addEventListener("click", playTone);
    el.querySelector("#sa-next").addEventListener("click", nextQuestion);
    el.querySelector("#sa-sing").addEventListener("click", async () => {
      if (!target?.rootNotes?.[toneIdx]) return;
      const threshold = DIFFICULTY_TO_CENTS[diffEl.value] || 30;
      const note = target.rootNotes[toneIdx];
      const label = LABELS[toneIdx] || `tone ${toneIdx + 1}`;
      try {
        const result = await micGrade({
          targetNote: note,
          thresholdCents: threshold,
          statusEl,
          meterEl,
          durationMs: 1600,
        });
        const row = document.createElement("div");
        row.className = "quiz-status";
        if (result.error) {
          row.textContent = `${label}: ${result.error}`;
          resultsEl.appendChild(row);
          return;
        }
        row.textContent = `${label}: ${result.pass ? "✓" : "✗"} ${Math.round(result.cents)}¢`;
        resultsEl.appendChild(row);
        toneIdx += 1;
        if (toneIdx >= target.rootNotes.length) {
          const rows = [...resultsEl.querySelectorAll(".quiz-status")];
          const pass = rows.every((r) => r.textContent.includes("✓"));
          const avgCents = 20;
          const quality = pass ? 4 : 2;
          quizRecord(ctx, "singArpeggio", pass, {
            chord: target.chord,
            symbol: target.symbol,
            quality,
          });
          feedback(resultsEl, pass, pass ? "Arpeggio complete!" : "Some tones missed.");
        } else {
          updatePrompt();
        }
      } catch (err) {
        statusEl.textContent = err?.message || "Mic error";
      }
    });

    promptEl.textContent = "Press Next for a chord. Tonicize for key context; Repeat chord or tone as needed.";
    return { destroy: () => ctx.audio.cancel() };
  },
};
