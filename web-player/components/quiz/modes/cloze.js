import { pickWeightedProgressionRun, songPoolDistractors, songTransitionDistractors } from "../quizPool.js";
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
    let run = null;
    let gapIdx = 0;
    let answered = false;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="cz-prompt">Fill in the missing chord.</div>
        <div id="cz-sequence" class="quiz-cloze-sequence"></div>
        ${keyQuizTransportHtml("cz", QUIZ_TOOLTIPS.repeatCloze, "Repeat", { chordTools: true })}
        <div id="cz-choices" class="quiz-choices"></div>
        <div id="cz-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#cz-prompt");
    const seqEl = el.querySelector("#cz-sequence");
    const choicesEl = el.querySelector("#cz-choices");
    const feedbackEl = el.querySelector("#cz-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "cz-diff" });
    const chordTools = mountChordDrillTools(el, "cz", ctx, base, () =>
      run?.[gapIdx] ?? null,
    );

    function playMuted() {
      if (!run) return;
      let i = 0;
      const gap = Math.max(200, Math.round(chordTools.chordHoldMs() * 0.35));
      const step = () => {
        if (i >= run.length) return;
        if (i === gapIdx) {
          i += 1;
          setTimeout(step, gap);
          return;
        }
        const entry = run[i++];
        chordTools.playEntry(entry, () => setTimeout(step, gap));
      };
      step();
    }

    function playFull() {
      if (!run) return;
      const gap = Math.max(200, Math.round(chordTools.chordHoldMs() * 0.35));
      chordTools.playEntriesSequential(run, gap);
    }

    function renderSequence(reveal = false) {
      seqEl.innerHTML = run
        .map((e, i) => {
          if (i === gapIdx && !reveal) return "<span class='quiz-cloze-gap'>?</span>";
          return `<span class="quiz-cloze-sym quiz-chord-sym" data-quiz-symbol="${e.symbol}">${ctx.romanHtml(e.symbol)}</span>`;
        })
        .join(" → ");
      chordTools.wireStaticChords(seqEl);
    }

    function showQuestion() {
      answered = false;
      feedbackEl.innerHTML = "";
      chordTools.clearPanels();
      const difficulty = diffEl.value;
      const { min, max } = runBounds(difficulty);
      const pool = base.pool;
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
      const nWrong = difficulty === "easy" ? 2 : 3;
      const fromSymbol = run[gapIdx - 1]?.symbol || run[gapIdx + 1]?.symbol || null;
      const wrong =
        difficulty === "hard" && fromSymbol
          ? songTransitionDistractors(pool, fromSymbol, answer.symbol, nWrong)
          : songPoolDistractors(pool, answer.symbol, nWrong);
      const symbols = shuffle([answer.symbol, ...wrong]);
      promptEl.textContent =
        "Fill in the missing chord. Arpeggio / Show notes target the gap chord.";
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
      chordTools.wireChoices(choicesEl, symbols);
      chordTools.syncDisplay(answer);
      cueQuestionAudio(playMuted);
    }

    wireKeyQuizTransport(el, "cz", {
      onTonicize: () => tonicizeKey(base.songCtx, ctx.audio),
      onRepeat: playMuted,
      onNext: showQuestion,
    });
    promptEl.textContent =
      "Press Start for the first question. Right-click any chord symbol for arpeggio / notes.";

    return { destroy: () => ctx.audio.cancel() };
  },
};
