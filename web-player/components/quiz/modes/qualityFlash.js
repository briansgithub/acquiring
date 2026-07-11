import {
  pickWeightedQualityEntry,
  uniqueSongQualities,
  qualityLabelFromSymbol,
} from "../quizPool.js";
import { mountChordDrillTools } from "../quizChordInspect.js";
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
  cueQuestionAudio,
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
    let answered = false;
    let answeredCorrectFirstTry = false;
    let current = null;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="qf-prompt">Identify the chord quality from this section.</div>
        ${keyQuizTransportHtml("qf", QUIZ_TOOLTIPS.repeatQuality, "Repeat", { chordTools: true })}
        <div id="qf-choices" class="quiz-choices"></div>
        <div id="qf-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#qf-prompt");
    const choicesEl = el.querySelector("#qf-choices");
    const feedbackEl = el.querySelector("#qf-feedback");
    const diffEl = mountDifficultyAfter(promptEl, { id: "qf-diff" });
    const chordTools = mountChordDrillTools(el, "qf", ctx, base, () => current);

    function playCurrent() {
      if (current) chordTools.playEntry(current);
    }

    function showQuestion() {
      answered = false;
      answeredCorrectFirstTry = false;
      feedbackEl.innerHTML = "";
      chordTools.clearPanels();
      const difficulty = diffEl.value;
      const pool = base.pool;
      current = pickWeightedQualityEntry(pool);
      if (!current) return;

      const answerLabel = current.qualityLabel || qualityLabelFromSymbol(current.symbol);
      const labels = choiceLabels(pool, difficulty);
      quizNotify(ctx, { symbols: [current.symbol] });
      promptEl.innerHTML = `What quality is <span class="quiz-chord-sym" data-quiz-symbol="${current.symbol}">${ctx.romanHtml(current.symbol)}</span>?`;

      renderChoices(
        choicesEl,
        mcChoices(answerLabel, labels, choiceCount(difficulty)),
        (label, btn) => {
          if (answered) {
            if (answeredCorrectFirstTry && label === answerLabel) {
              el.querySelector("#qf-next")?.click();
            }
            return;
          }
          answered = true;
          const correct = label === answerLabel;
          if (correct) {
            answeredCorrectFirstTry = true;
          }
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
      chordTools.wireStaticChords(promptEl);
      chordTools.syncDisplay(current);

      if (ctx.timeline && current.chord?.beat != null) {
        ctx.timeline.highlightBeatRange?.(
          current.chord.beat,
          current.chord.beat + (current.chord.duration || 1),
          'rgba(34, 211, 238, 0.2)'
        );
      }

      cueQuestionAudio(playCurrent);
    }

    wireKeyQuizTransport(el, "qf", { getSongCtx: () => base.songCtx,
      onTonicize: () => tonicizeKey(base.songCtx, ctx.audio),
      onRepeat: playCurrent,
      onNext: showQuestion,
    });
    promptEl.textContent =
      "Press Start for the first chord. Arpeggio / Show notes work on the target chord after answering too.";

    return { destroy: () => {
      ctx.audio.cancel();
      ctx.timeline?.highlightBeatRange?.(null, null);
    } };
  },
};
