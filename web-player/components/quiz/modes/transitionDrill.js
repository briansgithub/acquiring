import {
  pickWeightedTransition,
  distractorSymbols,
  transitionTargetDistractors,
} from "../quizPool.js";
import { renderChoices, shuffle, requireSong, mountDifficultyAfter, keyQuizTransportHtml, wireKeyQuizTransport, tonicizeKey, QUIZ_TOOLTIPS, quizNotify, quizRecord } from "./modeUtils.js";

export const transitionDrill = {
  id: "mode-transition",
  label: "Transitions",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;

    let pair = null;
    let step = 0;
    let firstPick = null;
    let answered = false;
    let corpus = null;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="td-prompt">Identify the chord transition.</div>
        ${keyQuizTransportHtml("td", QUIZ_TOOLTIPS.repeatTransition)}
        <div id="td-choices" class="quiz-choices"></div>
        <div id="td-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#td-prompt");
    const choicesEl = el.querySelector("#td-choices");
    const feedbackEl = el.querySelector("#td-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "td-diff" });
    const scale = () => songCtx.scale || songCtx.key?.scale || "major";

    function difficulty() {
      return diffEl.value;
    }

    function choiceCount() {
      return difficulty() === "easy" ? 3 : 4;
    }

    function stepPrompt() {
      if (difficulty() === "hard") return "Which chord did you hear?";
      return step === 0 ? "First chord?" : "Second chord?";
    }

    function priorInPool(entry) {
      const idx = pool.findIndex((e) => e.chord === entry.chord);
      return idx > 0 ? pool[idx - 1].symbol : null;
    }

    async function symbolChoices(answerSymbol, stepIndex) {
      if (!corpus) corpus = await ctx.getCorpus();
      const n = choiceCount() - 1;
      let fromSymbol = null;
      if (difficulty() === "hard") {
        fromSymbol = stepIndex === 1 ? pair[0].symbol : priorInPool(pair[0]);
      }
      const d =
        difficulty() === "hard" && fromSymbol
          ? transitionTargetDistractors(corpus, scale(), fromSymbol, answerSymbol, n)
          : distractorSymbols(corpus, scale(), answerSymbol, n);
      return shuffle([answerSymbol, ...d]);
    }

    function revealTransition(ok) {
      const from = pair[0].symbol;
      const to = pair[1].symbol;
      const div = document.createElement("div");
      div.className = `quiz-status${ok ? " quiz-feedback-ok" : " quiz-feedback-bad"}`;
      div.append(
        document.createTextNode(ok ? "Correct: " : "Answer: "),
        spanRoman(from),
        document.createTextNode(" → "),
        spanRoman(to),
      );
      feedbackEl.appendChild(div);
    }

    function spanRoman(symbol) {
      const span = document.createElement("span");
      span.innerHTML = ctx.romanHtml(symbol);
      return span;
    }

    function playPair() {
      if (!pair) return;
      const d = difficulty();
      const msPerStep = d === "easy" ? 1200 : 850;
      ctx.audio.playSequence([pair[0].notes, pair[1].notes], msPerStep);
    }

    async function renderStep() {
      choicesEl.innerHTML = "";
      promptEl.textContent = stepPrompt();
      const answer = step === 0 ? pair[0].symbol : pair[1].symbol;
      const symbols = await symbolChoices(answer, step);

      renderChoices(
        choicesEl,
        symbols.map((s) => ({ label: s, symbol: s })),
        (choice, btn) => {
          if (answered) return;
          const correct = choice.symbol === answer;
          btn.classList.add(correct ? "quiz-correct" : "quiz-wrong");

          if (step === 0) {
            firstPick = choice.symbol;
            step = 1;
            renderStep();
            return;
          }

          answered = true;
          const bothRight =
            firstPick === pair[0].symbol && choice.symbol === pair[1].symbol;
          const transitionKey = `${pair[0].symbol}=>${pair[1].symbol}`;
          quizRecord(ctx, "mode-transition", bothRight, {
            chord: pair[1].chord,
            symbol: pair[1].symbol,
            transition: transitionKey,
            quality: bothRight ? 4 : 1,
          });
          revealTransition(bothRight);
        },
        { html: true },
      );

      choicesEl.querySelectorAll(".quiz-choice-btn").forEach((btn, i) => {
        btn.innerHTML = ctx.romanHtml(symbols[i]);
      });
    }

    async function showQuestion() {
      answered = false;
      step = 0;
      firstPick = null;
      feedbackEl.innerHTML = "";

      pair = pickWeightedTransition(pool);
      if (!pair) {
        promptEl.textContent = "Need at least 2 chords in the section.";
        choicesEl.innerHTML = "";
        return;
      }
      const transitionKey = `${pair[0].symbol}=>${pair[1].symbol}`;
      quizNotify(ctx, { transition: transitionKey });
      corpus = await ctx.getCorpus();
      promptEl.textContent = `${stepPrompt()} Tonicize for key context, then Repeat.`;
      await renderStep();
    }

    wireKeyQuizTransport(el, "td", {
      onTonicize: () => tonicizeKey(songCtx, ctx.audio),
      onRepeat: playPair,
      onNext: showQuestion,
    });
    promptEl.textContent = "Press Next for a question. Use Tonicize for key context, Repeat for the transition.";

    return { destroy: () => ctx.audio.cancel() };
  },
};
