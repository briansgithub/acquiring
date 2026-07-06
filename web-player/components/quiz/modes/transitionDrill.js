import {
  pickWeightedTransition,
  songPoolDistractors,
  songTransitionDistractors,
} from "../quizPool.js";
import { mountChordDrillTools } from "../quizChordInspect.js";
import {
  renderChoices,
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

export const transitionDrill = {
  id: "mode-transition",
  label: "Transitions",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};

    let pair = null;
    let step = 0;
    let firstPick = null;
    let answered = false;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="td-prompt">Identify the chord transition.</div>
        ${keyQuizTransportHtml("td", QUIZ_TOOLTIPS.repeatTransition, "Repeat", { chordTools: true })}
        <div id="td-choices" class="quiz-choices"></div>
        <div id="td-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#td-prompt");
    const choicesEl = el.querySelector("#td-choices");
    const feedbackEl = el.querySelector("#td-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "td-diff" });
    const chordTools = mountChordDrillTools(el, "td", ctx, base, () =>
      pair ? (step === 0 ? pair[0] : pair[1]) : null,
    );

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
      const pool = base.pool;
      const idx = pool.findIndex((e) => e.chord === entry.chord);
      return idx > 0 ? pool[idx - 1].symbol : null;
    }

    function symbolChoices(answerSymbol, stepIndex) {
      const pool = base.pool;
      const n = choiceCount() - 1;
      let fromSymbol = null;
      if (difficulty() === "hard") {
        fromSymbol = stepIndex === 1 ? pair[0].symbol : priorInPool(pair[0]);
      }
      const d =
        difficulty() === "hard" && fromSymbol
          ? songTransitionDistractors(pool, fromSymbol, answerSymbol, n)
          : songPoolDistractors(pool, answerSymbol, n);
      return shuffle([answerSymbol, ...d]);
    }

    function spanRoman(symbol) {
      const span = document.createElement("span");
      span.className = "quiz-chord-sym";
      span.dataset.quizSymbol = symbol;
      span.innerHTML = ctx.romanHtml(symbol);
      return span;
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
      chordTools.wireStaticChords(feedbackEl);
    }

    function playPair() {
      if (!pair) return;
      const d = difficulty();
      const msPerStep = d === "easy" ? 1200 : 850;
      chordTools.playEntriesSequential(pair, msPerStep);
    }

    function renderStep() {
      choicesEl.innerHTML = "";
      promptEl.textContent = stepPrompt();
      const answer = step === 0 ? pair[0].symbol : pair[1].symbol;
      const symbols = symbolChoices(answer, step);

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
      chordTools.wireChoices(choicesEl, symbols);
      chordTools.syncDisplay(pair[step]);
    }

    function showQuestion() {
      answered = false;
      step = 0;
      firstPick = null;
      feedbackEl.innerHTML = "";
      chordTools.clearPanels();

      pair = pickWeightedTransition(base.pool);
      if (!pair) {
        promptEl.textContent = "Need at least 2 chords in the section.";
        choicesEl.innerHTML = "";
        return;
      }
      const transitionKey = `${pair[0].symbol}=>${pair[1].symbol}`;
      quizNotify(ctx, { transition: transitionKey });
      promptEl.textContent = `${stepPrompt()} Arpeggio checkbox applies to Repeat.`;
      renderStep();
      cueQuestionAudio(playPair);
    }

    wireKeyQuizTransport(el, "td", {
      onTonicize: () => tonicizeKey(base.songCtx, ctx.audio),
      onRepeat: playPair,
      onNext: showQuestion,
    });
    promptEl.textContent =
      "Press Start for the first question. Arpeggio targets the chord for the current step.";

    return { destroy: () => ctx.audio.cancel() };
  },
};
