import {
  chordIdentityKey,
  songDiatonicDistractors,
  songPoolDistractors,
  songTransitionDistractors,
  pickFrequencyBiased,
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

    let choicesCleanup = null;

    let answeredCorrectFirstTry = false;

    function handleChoice(symbol) {
      if (answered) {
        if (answeredCorrectFirstTry && symbol === target.symbol) {
          el.querySelector("#di-next")?.click();
        }
        return;
      }
      answered = true;
      const correct = symbol === target.symbol;
      if (correct) {
        answeredCorrectFirstTry = true;
      }

      // Highlight the button if it exists
      const btns = choicesEl.querySelectorAll(".quiz-choice-btn");
      btns.forEach(btn => {
        if (btn.textContent === symbol || (btn.dataset.quizSymbol === symbol)) {
          btn.classList.add(correct ? "quiz-correct" : "quiz-wrong");
        }
      });

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

      // Flash on the ring
      if (ctx.chordRing) {
        if (correct) {
          ctx.chordRing.flashCorrect?.(target.symbol);
        } else {
          ctx.chordRing.flashWrong?.(symbol);
          setTimeout(() => ctx.chordRing.flashCorrect?.(target.symbol), 400);
        }
        ctx.chordRing.highlightChoices?.(null); // clear dimming
      }
      // Clear timeline highlight
      ctx.timeline?.highlightBeatRange?.(null, null);
    }

    function showQuestion() {
      answered = false;
      answeredCorrectFirstTry = false;
      feedbackEl.innerHTML = "";
      chordTools.clearPanels();
      const pool = base.pool;
      target = pickFrequencyBiased(pool, ctx.session, ctx.session.lastSymbol, ctx.getFrequencyProfile?.(), diffEl.value);
      if (!target) return;
      quizNotify(ctx, { symbols: [target.symbol] });

      const wrong = buildDistractors(diffEl.value, scale(), target, pool);
      const symbols = shuffle([target.symbol, ...wrong]);

      promptEl.textContent =
        "What Roman numeral chord did you hear? Tap the Ring or choose below.";

      choicesCleanup?.();
      choicesCleanup = renderChoices(
        choicesEl,
        symbols.map((s) => ({ label: ctx.romanHtml(s), symbol: s })),
        (choice) => handleChoice(choice.symbol),
        { html: true },
      );

      // Highlight choices on the ring and allow click-to-answer
      if (ctx.chordRing) {
        ctx.chordRing.highlightChoices?.(symbols);
        ctx.chordRing.setChordSelectHandler?.((chord) => {
          const cid = (c) => `r${c.root}|t${c.type || 5}|i${c.inversion || 0}|b${c.borrowed || 'none'}|a${c.applied || 0}`;
          const isCorrect = cid(chord) === cid(target.chord);
          handleChoice(isCorrect ? target.symbol : "WRONG");
        });
      }

      // Highlight target beat range on timeline
      if (ctx.timeline && target.chord?.beat != null) {
        ctx.timeline.highlightBeatRange?.(
          target.chord.beat,
          target.chord.beat + (target.chord.duration || 1),
          'rgba(34, 211, 238, 0.2)',
        );
      }

      chordTools.wireChoices(choicesEl, symbols);
      chordTools.syncDisplay(target);
      cueQuestionAudio(() => chordTools.playEntry(target));
    }

    wireKeyQuizTransport(el, "di", { getSongCtx: () => base.songCtx,
      onTonicize: () => tonicizeKey(base.songCtx, ctx.audio),
      onRepeat: () => chordTools.playEntry(target),
      onNext: showQuestion,
    });
    promptEl.textContent =
      "Press Start for the first question. Use Tonicize, Repeat, or Arpeggio — tools stay active after answering.";

    return { destroy: () => {
      choicesCleanup?.();
      ctx.audio.cancel();
      ctx.chordRing?.highlightChoices?.(null);
      ctx.chordRing?.setChordSelectHandler?.(null);
      ctx.timeline?.highlightBeatRange?.(null, null);
    } };
  },
};
