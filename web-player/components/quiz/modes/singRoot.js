import {
  mountDifficultyAfter,
  micGrade,
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
} from "./modeUtils.js";

export const singRoot = {
  id: "singRoot",
  label: "Sing Root",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;
    let target = null;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="sr-prompt">Sing the chord root.</div>
        ${keyQuizTransportHtml("sr", QUIZ_TOOLTIPS.repeatChord)}
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

    function playTarget() {
      if (!target) return;
      ctx.audio.playChord(target.notes);
    }

    function nextQuestion() {
      feedbackEl.innerHTML = "";
      statusEl.textContent = "";
      target = ctx.session.pickEntry(pool);
      if (!target?.rootNotes?.[0]) return;
      quizNotify(ctx, { symbols: [target.symbol] });
      promptEl.textContent = `Sing the root of ${target.symbol}. Tonicize for key context, then Repeat.`;
    }

    wireKeyQuizTransport(el, "sr", {
      onTonicize: () => tonicizeKey(songCtx, ctx.audio),
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
      } catch (err) {
        statusEl.textContent = err?.message || "Mic error";
      }
    });

    promptEl.textContent = "Press Next for a chord. Use Tonicize for key context, Repeat to hear it.";
    return { destroy: () => ctx.audio.cancel() };
  },
};
