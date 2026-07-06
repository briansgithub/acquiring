import {
  distractorSymbols,
  diatonicDistractors,
  transitionTargetDistractors,
} from "../quizPool.js";
import { renderChoices, feedback, shuffle, requireSong, mountDifficultyAfter, keyQuizTransportHtml, wireKeyQuizTransport, tonicizeKey, QUIZ_TOOLTIPS, quizNotify, quizRecord } from "./modeUtils.js";

function priorSymbol(pool, target) {
  const idx = pool.findIndex((e) => e.chord === target.chord);
  return idx > 0 ? pool[idx - 1].symbol : null;
}

async function buildDistractors(difficulty, corpus, scale, target, pool) {
  if (difficulty === "easy") {
    return diatonicDistractors(scale, target.symbol, 2);
  }
  if (difficulty === "hard") {
    const from = priorSymbol(pool, target);
    return transitionTargetDistractors(corpus, scale, from, target.symbol, 3);
  }
  return distractorSymbols(corpus, scale, target.symbol, 3);
}

export const degreeId = {
  id: "mode-degree",
  label: "Degree ID",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;
    let answered = false;
    let target = null;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="di-prompt">Identify the chord.</div>
        ${keyQuizTransportHtml("di", QUIZ_TOOLTIPS.repeatChord)}
        <div id="di-choices" class="quiz-choices"></div>
        <div id="di-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#di-prompt");
    const choicesEl = el.querySelector("#di-choices");
    const feedbackEl = el.querySelector("#di-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "di-diff" });
    const scale = () => songCtx.scale || songCtx.key?.scale || "major";

    async function showQuestion() {
      answered = false;
      feedbackEl.innerHTML = "";
      target = ctx.session.pickEntry(pool);
      if (!target) return;
      quizNotify(ctx, { symbols: [target.symbol] });

      const corpus = await ctx.getCorpus();
      const wrong = await buildDistractors(diffEl.value, corpus, scale(), target, pool);
      const symbols = shuffle([target.symbol, ...wrong]);

      promptEl.textContent = "What Roman numeral chord did you hear? Tonicize for key context, then Repeat.";

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
    }

    wireKeyQuizTransport(el, "di", {
      onTonicize: () => tonicizeKey(songCtx, ctx.audio),
      onRepeat: () => {
        if (target) ctx.audio.playChord(target.notes);
      },
      onNext: showQuestion,
    });
    promptEl.textContent = "Press Next for a question. Use Tonicize for key context, Repeat for the chord.";

    return { destroy: () => ctx.audio.cancel() };
  },
};
