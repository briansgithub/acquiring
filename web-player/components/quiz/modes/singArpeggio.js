import { mountChordDrillTools, chordToolsExtrasHtml } from "../quizChordInspect.js";
import {
  mountDifficultyAfter,
  micGrade,
  sm2Quality,
  DIFFICULTY_TO_CENTS,
  requireSong,
  feedback,
  tonicizeKey,
  activateQuizTransport,
  QUIZ_TOOLTIPS,
  quizNotify,
  quizRecord,
  cueQuestionAudio,
} from "./modeUtils.js";

const LABELS = ["root", "3rd", "5th", "7th"];

export const singArpeggio = {
  id: "singArpeggio",
  label: "Sing Arpeggio",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    let target = null;
    let toneIdx = 0;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="sa-prompt">Sing the arpeggio tones in order.</div>
        ${chordToolsExtrasHtml("sa")}
        <div class="quiz-row quiz-transport-start" data-transport="sa">
          <button type="button" id="sa-start" class="quiz-start-btn" title="${QUIZ_TOOLTIPS.start}">Start</button>
        </div>
        <div class="quiz-row quiz-transport-row is-pending" data-transport="sa">
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
    const chordTools = mountChordDrillTools(el, "sa", ctx, base, () => target);

    function playChord() {
      if (target) chordTools.playEntry(target);
    }

    function playTone() {
      if (!target) return;
      chordTools.playToneAt(target, toneIdx);
    }

    function renderPrompt() {
      const label = LABELS[toneIdx] || `tone ${toneIdx + 1}`;
      promptEl.innerHTML = `Sing the ${label} (${toneIdx + 1}/${target.rootNotes.length}) — <span class="quiz-chord-sym" data-quiz-symbol="${target.symbol}">${ctx.romanHtml(target.symbol)}</span>`;
      chordTools.wireStaticChords(promptEl);
      chordTools.syncDisplay(target);
    }

    function nextQuestion() {
      resultsEl.innerHTML = "";
      statusEl.textContent = "";
      toneIdx = 0;
      chordTools.clearPanels();
      target = ctx.session.pickEntry(base.pool);
      if (!target?.rootNotes?.length) return;
      quizNotify(ctx, { symbols: [target.symbol] });
      renderPrompt();
      cueQuestionAudio(playChord);
    }

    el.querySelector("#sa-start").addEventListener("click", () => {
      activateQuizTransport(el, "sa");
      nextQuestion();
    });
    el.querySelector("#sa-tonicize").addEventListener("click", () => tonicizeKey(base.songCtx, ctx.audio));
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
          renderPrompt();
        }
      } catch (err) {
        statusEl.textContent = err?.message || "Mic error";
      }
    });

    promptEl.textContent = "Press Start for the first chord. Tonicize for key context; Repeat chord or tone as needed.";
    return { destroy: () => ctx.audio.cancel() };
  },
};
