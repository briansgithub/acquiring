import {
  pickWeightedQualityEntry,
  uniqueSongQualities,
  qualityLabelFromSymbol,
} from "../quizPool.js";
import {
  renderChoices,
  feedback,
  mountDifficultyAfter,
  mcChoices,
  QUIZ_TOOLTIPS,
  keyQuizTransportHtml,
  wireKeyQuizTransport,
  tonicizeKey,
  requireSong,
  quizNotify,
  quizRecord,
} from "./modeUtils.js";

const BASE_LABELS = ["Major", "Minor", "Diminished", "Augmented"];
const SEVENTH_LABELS = ["Dominant 7th", "Major 7th", "Minor 7th", "Half-diminished 7th"];

function choiceLabels(pool, difficulty) {
  const labels = new Set(BASE_LABELS);
  if (difficulty === "hard") {
    for (const entry of uniqueSongQualities(pool)) {
      if (SEVENTH_LABELS.includes(entry.qualityLabel)) labels.add(entry.qualityLabel);
    }
    for (const l of SEVENTH_LABELS) labels.add(l);
  }
  return [...labels];
}

function choiceCount(difficulty) {
  return difficulty === "easy" ? 3 : 4;
}

export const qualityFlash = {
  id: "mode-quality",
  label: "Quality",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;
    let answered = false;
    let current = null;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="qf-prompt">Identify the chord quality from this section.</div>
        ${keyQuizTransportHtml("qf", QUIZ_TOOLTIPS.repeatQuality, "Repeat")}
        <div id="qf-choices" class="quiz-choices"></div>
        <div id="qf-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#qf-prompt");
    const choicesEl = el.querySelector("#qf-choices");
    const feedbackEl = el.querySelector("#qf-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "qf-diff" });

    function playCurrent() {
      if (current?.notes) ctx.audio.playChord(current.notes);
    }

    function showQuestion() {
      answered = false;
      feedbackEl.innerHTML = "";
      const difficulty = diffEl.value;
      current = pickWeightedQualityEntry(pool);
      if (!current) return;

      const answerLabel = current.qualityLabel || qualityLabelFromSymbol(current.symbol);
      const labels = choiceLabels(pool, difficulty);
      quizNotify(ctx, { symbols: [current.symbol] });
      promptEl.textContent = `What quality is this ${current.symbol} chord? Tonicize for key context, then Repeat.`;

      renderChoices(
        choicesEl,
        mcChoices(answerLabel, labels, choiceCount(difficulty)),
        (label, btn) => {
          if (answered) return;
          answered = true;
          const correct = label === answerLabel;
          btn.classList.add(correct ? "quiz-correct" : "quiz-wrong");
          quizRecord(ctx, "mode-quality", correct, {
            chord: current.chord,
            symbol: current.symbol,
            quality: correct ? 4 : 1,
          });
          feedback(
            feedbackEl,
            correct,
            correct ? `Correct: ${answerLabel}` : `Answer: ${answerLabel}`,
          );
        },
      );
    }

    wireKeyQuizTransport(el, "qf", {
      onTonicize: () => tonicizeKey(songCtx, ctx.audio),
      onRepeat: playCurrent,
      onNext: showQuestion,
    });
    promptEl.textContent =
      "Press Next for a chord from this section. Use Tonicize for key context, Repeat to hear it.";

    return { destroy: () => ctx.audio.cancel() };
  },
};
