import { pickWeightedProgressionRun, confusableDistractors } from "../quizPool.js";
import { renderChoices, feedback, shuffle, requireSong, mountDifficultyAfter, keyQuizTransportHtml, wireKeyQuizTransport, tonicizeKey, QUIZ_TOOLTIPS, quizNotify, quizRecord } from "./modeUtils.js";
function runBounds(difficulty) {
  if (difficulty === "hard") return { min: 5, max: 6 };
  if (difficulty === "easy") return { min: 4, max: 6 };
  return { min: 4, max: 6 };
}

function pickGapIndex(run, difficulty) {
  if (difficulty === "easy") return Math.random() < 0.5 ? 0 : run.length - 1;
  return Math.floor(Math.random() * run.length);
}

export const cloze = {
  id: "mode-cloze",
  label: "Cloze",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;
    let run = null;
    let gapIdx = 0;
    let answered = false;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="cz-prompt">Fill in the missing chord.</div>
        <div id="cz-sequence" class="quiz-cloze-sequence"></div>
        ${keyQuizTransportHtml("cz", QUIZ_TOOLTIPS.repeatCloze)}
        <div id="cz-choices" class="quiz-choices"></div>
        <div id="cz-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#cz-prompt");
    const seqEl = el.querySelector("#cz-sequence");
    const choicesEl = el.querySelector("#cz-choices");
    const feedbackEl = el.querySelector("#cz-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "cz-diff" });

    function playMuted() {
      if (!run) return;
      const steps = run.map((e, i) => (i === gapIdx ? null : e.notes));
      ctx.audio.playSequence(steps, 850);
    }

    function playFull() {
      if (!run) return;
      ctx.audio.playSequence(
        run.map((e) => e.notes),
        850,
      );
    }

    function renderSequence(reveal = false) {
      seqEl.innerHTML = run
        .map((e, i) => {
          if (i === gapIdx && !reveal) return "<span class='quiz-cloze-gap'>?</span>";
          return `<span class="quiz-cloze-sym">${e.symbol}</span>`;
        })
        .join(" → ");
    }

    async function showQuestion() {
      answered = false;
      feedbackEl.innerHTML = "";
      const difficulty = diffEl.value;
      const { min, max } = runBounds(difficulty);
      run = pickWeightedProgressionRun(pool, min, max);
      if (!run) {
        promptEl.textContent = "Section too short for cloze.";
        seqEl.innerHTML = "";
        choicesEl.innerHTML = "";
        return;
      }
      gapIdx = pickGapIndex(run, difficulty);
      const answer = run[gapIdx];
      quizNotify(ctx, { symbols: [answer.symbol] });
      renderSequence(false);
      const corpus = await ctx.getCorpus();
      const scale = songCtx.scale || songCtx.key?.scale || "major";
      const nWrong = difficulty === "easy" ? 2 : 3;
      const neighbors = [run[gapIdx - 1]?.symbol, run[gapIdx + 1]?.symbol].filter(Boolean);
      const wrong =
        difficulty === "hard"
          ? confusableDistractors(corpus, scale, answer.symbol, neighbors, nWrong)
          : confusableDistractors(corpus, scale, answer.symbol, [], nWrong);
      const symbols = shuffle([answer.symbol, ...wrong]);
      promptEl.textContent = "Fill in the missing chord. Tonicize for key context, then Repeat.";
      renderChoices(
        choicesEl,
        symbols.map((s) => ({ label: ctx.romanHtml(s), symbol: s })),
        (choice, btn) => {
          if (answered) return;
          answered = true;
          const correct = choice.symbol === answer.symbol;
          btn.classList.add(correct ? "quiz-correct" : "quiz-wrong");
          quizRecord(ctx, "mode-cloze", correct, {
            chord: answer.chord,
            symbol: answer.symbol,
            quality: correct ? 4 : 1,
          });
          renderSequence(true);
          feedback(feedbackEl, correct, correct ? "Correct!" : `Answer: ${answer.symbol}`);
          playFull();
        },
        { html: true },
      );
    }

    wireKeyQuizTransport(el, "cz", {
      onTonicize: () => tonicizeKey(songCtx, ctx.audio),
      onRepeat: playMuted,
      onNext: showQuestion,
    });
    promptEl.textContent = "Press Next for a question. Use Tonicize for key context, Repeat to hear the progression.";

    return { destroy: () => ctx.audio.cancel() };
  },
};
