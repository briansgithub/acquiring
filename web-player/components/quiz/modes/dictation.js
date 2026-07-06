import { pickWeightedProgressionRun } from "../quizPool.js";
import { feedback, requireSong, mountDifficultyAfter, keyQuizTransportHtml, wireKeyQuizTransport, tonicizeKey, QUIZ_TOOLTIPS, quizNotify, quizRecord } from "./modeUtils.js";
function runBounds(difficulty) {
  if (difficulty === "easy") return { min: 3, max: 3 };
  if (difficulty === "hard") return { min: 6, max: 8 };
  return { min: 4, max: 5 };
}

export const dictation = {
  id: "mode-dictation",
  label: "Dictation",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;
    let run = null;
    let graded = false;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="dt-prompt">Transcribe the progression.</div>
        ${keyQuizTransportHtml("dt", QUIZ_TOOLTIPS.repeatProgression)}
        <div id="dt-slots" class="quiz-dictation-slots"></div>
        <div class="quiz-row"><button type="button" id="dt-submit" title="Check your transcription against the answer">Submit</button></div>
        <div id="dt-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#dt-prompt");
    const slotsEl = el.querySelector("#dt-slots");
    const feedbackEl = el.querySelector("#dt-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "dt-diff" });
    const uniqueSymbols = [...new Set(pool.map((e) => e.symbol))];

    function playRun() {
      if (!run) return;
      ctx.audio.playSequence(
        run.map((e) => e.notes),
        850,
      );
    }

    function renderSlots() {
      const difficulty = diffEl.value;
      const hintFirst = difficulty === "easy";
      slotsEl.innerHTML = "";
      run.forEach((entry, i) => {
        const row = document.createElement("div");
        row.className = "quiz-dictation-slot";
        row.innerHTML = `<span class="quiz-slot-label">#${i + 1}</span>`;
        const sel = document.createElement("select");
        sel.className = "select quiz-select";
        sel.dataset.idx = String(i);
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "—";
        sel.appendChild(blank);
        for (const sym of uniqueSymbols) {
          const opt = document.createElement("option");
          opt.value = sym;
          opt.textContent = sym;
          sel.appendChild(opt);
        }
        if (hintFirst && i === 0) {
          sel.value = entry.symbol;
          sel.disabled = true;
          row.classList.add("quiz-slot-hint");
        }
        row.appendChild(sel);
        slotsEl.appendChild(row);
      });
    }

    function showQuestion() {
      graded = false;
      feedbackEl.innerHTML = "";
      const { min, max } = runBounds(diffEl.value);
      run = pickWeightedProgressionRun(pool, min, max);
      if (!run) {
        promptEl.textContent = "Section too short for dictation.";
        slotsEl.innerHTML = "";
        return;
      }
      quizNotify(ctx, { symbols: run.map((e) => e.symbol) });
      const hint = diffEl.value === "easy" ? " (first chord shown)" : "";
      promptEl.textContent = `Transcribe ${run.length} chords${hint}. Tonicize for key context, then Repeat.`;
      renderSlots();
    }

    wireKeyQuizTransport(el, "dt", {
      onTonicize: () => tonicizeKey(songCtx, ctx.audio),
      onRepeat: playRun,
      onNext: showQuestion,
    });
    el.querySelector("#dt-submit").addEventListener("click", () => {
      if (!run || graded) return;
      const picks = [...slotsEl.querySelectorAll("select")].map((s) => s.value);
      if (picks.some((p) => !p)) {
        feedback(feedbackEl, false, "Fill every slot before submitting.");
        return;
      }
      graded = true;
      let correctCount = 0;
      const marks = run.map((entry, i) => {
        const ok = picks[i] === entry.symbol;
        if (ok) correctCount += 1;
        return `#${i + 1}: ${ok ? "✓" : `✗ (${entry.symbol})`}`;
      });
      const allCorrect = correctCount === run.length;
      const songKey = ctx.getSongKey?.();
      quizRecord(ctx, "mode-dictation", allCorrect, {
        chord: run[run.length - 1].chord,
        quality: allCorrect ? 4 : 1,
      });
      if (songKey) {
        run.forEach((entry, i) => {
          ctx.session.recordSymbolAnswer(songKey, entry.symbol, picks[i] === entry.symbol);
        });
      }
      feedback(feedbackEl, allCorrect, marks.join(" · "));
      [...slotsEl.querySelectorAll("select")].forEach((sel, i) => {
        sel.disabled = true;
        sel.classList.add(picks[i] === run[i].symbol ? "quiz-slot-ok" : "quiz-slot-bad");
      });
    });

    promptEl.textContent = "Press Next for a progression. Use Tonicize for key context, Repeat to hear it.";
    return { destroy: () => ctx.audio.cancel() };
  },
};
