import { mountChordDrillTools } from "../quizChordInspect.js";
import {
  mountDifficultyAfter,  micGrade,
  sm2Quality,
  DIFFICULTY_TO_CENTS,
  requireSong,
  feedback,
  keyQuizTransportHtml,
  wireKeyQuizTransport,
  tonicizeKey,
  QUIZ_TOOLTIPS,
  quizNotify,
  quizRecord,
  cueQuestionAudio,
} from "./modeUtils.js";

export const singRoot = {
  id: "singRoot",
  label: "Sing Root",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    let target = null;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="sr-prompt">Sing the chord root.</div>
        ${keyQuizTransportHtml("sr", QUIZ_TOOLTIPS.repeatChord, "Repeat", { chordTools: true })}
        <div class="quiz-row">
          <button type="button" id="sr-sing" title="${QUIZ_TOOLTIPS.singRoot}">Sing Root</button>
        </div>
        <div id="sr-meter"></div>
        <div id="sr-status" class="quiz-status"></div>
        <div id="sr-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#sr-prompt");
    const statusEl = el.querySelector("#sr-status");
    const feedbackEl = el.querySelector("#sr-feedback");
    const meterEl = el.querySelector("#sr-meter");
    const diffEl = mountDifficultyAfter(promptEl, { type: "pitch", id: "sr-diff" });
    const chordTools = mountChordDrillTools(el, "sr", ctx, base, () => target);

    function playTarget() {
      if (target) chordTools.playEntry(target);
    }

    function nextQuestion() {
      feedbackEl.innerHTML = "";
      statusEl.textContent = "";
      chordTools.clearPanels();
      target = ctx.session.pickEntry(base.pool);
      if (!target?.rootNotes?.[0]) return;
      quizNotify(ctx, { symbols: [target.symbol] });
      promptEl.innerHTML = `Sing the root of <span class="quiz-chord-sym" data-quiz-symbol="${target.symbol}">${ctx.romanHtml(target.symbol)}</span>.`;
      chordTools.wireStaticChords(promptEl);
      chordTools.syncDisplay(target);

      if (ctx.timeline && target.chord?.beat != null) {
        ctx.timeline.highlightBeatRange?.(
          target.chord.beat,
          target.chord.beat + (target.chord.duration || 1),
          'rgba(34, 211, 238, 0.2)'
        );
      }

      cueQuestionAudio(playTarget);
    }

    wireKeyQuizTransport(el, "sr", {
      onTonicize: () => tonicizeKey(base.songCtx, ctx.audio),
      onRepeat: playTarget,
      onNext: nextQuestion,
    });
    el.querySelector("#sr-sing").addEventListener("click", async () => {
      if (!target?.rootNotes?.[0]) return;
      const threshold = DIFFICULTY_TO_CENTS[diffEl.value] || 30;
      try {
        const result = await micGrade({
          targetNote: target.rootNotes[0],
          thresholdCents: threshold,
          statusEl,
          meterEl,
        });
        if (result.error) {
          statusEl.textContent = result.error;
          return;
        }
        const quality = sm2Quality(result.cents, threshold);
        quizRecord(ctx, "singRoot", result.pass, {
          chord: target.chord,
          symbol: target.symbol,
          quality,
        });
        feedback(
          feedbackEl,
          result.pass,
          result.pass
            ? `Pass: ${Math.round(result.cents)}¢ off`
            : `Miss: ${Math.round(result.cents)}¢ off (>${threshold}¢)`,
        );
        if (ctx.chordRing) {
          if (result.pass) {
            ctx.chordRing.flashCorrect?.(target.symbol);
          } else {
            ctx.chordRing.flashWrong?.(target.symbol);
          }
        }
      } catch (err) {
        statusEl.textContent = err?.message || "Mic error";
      }
    });

    promptEl.textContent = "Press Start for the first chord. Use Tonicize for key context, Repeat to hear it.";
    return { destroy: () => {
      ctx.audio.cancel();
      ctx.timeline?.highlightBeatRange?.(null, null);
    } };
  },
};
