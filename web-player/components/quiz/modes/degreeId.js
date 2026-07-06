import {
  chordIdentityKey,
  songDiatonicDistractors,
  songPoolDistractors,
  songTransitionDistractors,
} from "../quizPool.js";
import { mountChordDrillTools } from "../quizChordInspect.js";
import {
  renderChoices,
  feedback,
  shuffle,
  requireSong,
  mountDifficultyAfter,
  keyQuizTransportHtml,
  wireKeyQuizTransport,
  tonicizeKey,
  QUIZ_TOOLTIPS,
  quizNotify,
  quizRecord,
  cueQuestionAudio,
} from "./modeUtils.js";

function priorSymbol(pool, target) {
  const id = chordIdentityKey(target.chord);
  const idx = pool.findIndex((e) => chordIdentityKey(e.chord) === id);
  return idx > 0 ? pool[idx - 1].symbol : null;
}

function buildDistractors(difficulty, scale, target, pool) {
  if (difficulty === "easy") {
    return songDiatonicDistractors(pool, scale, target.symbol, 2);
  }
  if (difficulty === "hard") {
    const from = priorSymbol(pool, target);
    return songTransitionDistractors(pool, from, target.symbol, 3);
  }
  return songPoolDistractors(pool, target.symbol, 3);
}

export const degreeId = {
  id: "mode-degree",
  label: "Degree ID",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    let answered = false;
    let target = null;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="di-prompt">Identify the chord.</div>
        ${keyQuizTransportHtml("di", QUIZ_TOOLTIPS.repeatChord, "Repeat", { chordTools: true })}
        <div id="di-choices" class="quiz-choices"></div>
        <div id="di-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#di-prompt");
    const choicesEl = el.querySelector("#di-choices");
    const feedbackEl = el.querySelector("#di-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "di-diff" });
    const chordTools = mountChordDrillTools(el, "di", ctx, base, () => target);
    const scale = () => base.songCtx.scale || base.songCtx.key?.scale || "major";

    function showQuestion() {
      answered = false;
      feedbackEl.innerHTML = "";
      chordTools.clearPanels();
      const pool = base.pool;
      target = ctx.session.pickEntry(pool);
      if (!target) return;
      quizNotify(ctx, { symbols: [target.symbol] });

      const wrong = buildDistractors(diffEl.value, scale(), target, pool);
      const symbols = shuffle([target.symbol, ...wrong]);

      promptEl.textContent =
        "What Roman numeral chord did you hear? Tonicize or Repeat (honors Arpeggio checkbox).";

      renderChoices(
        choicesEl,
        symbols.map((s) => ({ label: ctx.romanHtml(s), symbol: s })),
        (choice, btn) => {
          if (answered) return;
          answered = true;
          const correct = choice.symbol === target.symbol;
          btn.classList.add(correct ? "quiz-correct" : "quiz-wrong");
          quizRecord(ctx, "mode-degree", correct, {
            chord: target.chord,
            symbol: target.symbol,
            quality: correct ? 4 : 1,
          });
          feedback(
            feedbackEl,
            correct,
            correct ? `Correct: ${target.symbol}` : `Answer: ${target.symbol}`,
          );
        },
        { html: true },
      );
      chordTools.wireChoices(choicesEl, symbols);
      chordTools.syncDisplay(target);
      cueQuestionAudio(() => chordTools.playEntry(target));
    }

    wireKeyQuizTransport(el, "di", {
      onTonicize: () => tonicizeKey(base.songCtx, ctx.audio),
      onRepeat: () => chordTools.playEntry(target),
      onNext: showQuestion,
    });
    promptEl.textContent =
      "Press Start for the first question. Use Tonicize, Repeat, or Arpeggio — tools stay active after answering.";

    return { destroy: () => ctx.audio.cancel() };
  },
};
