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

const LABELS = ["root", "3rd", "5th", "7th", "9th", "11th", "13th"];

export const singCallResponse = {
  id: "singCall",
  label: "Call & Response",
  render(el, ctx) {
    const base = requireSong(el, ctx);
    if (!base) return {};
    const { songCtx, pool } = base;
    let target = null;
    let toneIdx = 1;

    el.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-prompt" id="sc-prompt">Sing the requested chord tone.</div>
        ${keyQuizTransportHtml("sc", QUIZ_TOOLTIPS.repeatChord)}
        <div class="quiz-row">
          <button type="button" id="sc-sing" title="${QUIZ_TOOLTIPS.singTone}">Sing</button>
        </div>
        <div id="sc-meter"></div>
        <div id="sc-status" class="quiz-status"></div>
        <div id="sc-feedback"></div>
      </div>
    `;

    const promptEl = el.querySelector("#sc-prompt");
    const statusEl = el.querySelector("#sc-status");
    const feedbackEl = el.querySelector("#sc-feedback");
    const meterEl = el.querySelector("#sc-meter");
    const diffEl = mountDifficultyAfter(promptEl, { type: "pitch", id: "sc-diff" });

    function pickToneIndex() {
      const len = target?.rootNotes?.length || 0;
      if (len <= 1) return 0;
      return 1 + Math.floor(Math.random() * (len - 1));
    }

    function playChord() {
      if (!target) return;
      ctx.audio.playChord(target.notes);
    }

    function nextQuestion() {
      feedbackEl.innerHTML = "";
      statusEl.textContent = "";
      target = ctx.session.pickEntry(pool);
      if (!target?.rootNotes?.length) return;
      toneIdx = pickToneIndex();
      const label = LABELS[toneIdx] || `tone ${toneIdx + 1}`;
      quizNotify(ctx, { symbols: [target.symbol] });
      promptEl.textContent = `Hear the chord, then sing the ${label}. Tonicize for key context, then Repeat.`;
    }

    wireKeyQuizTransport(el, "sc", {
      onTonicize: () => tonicizeKey(songCtx, ctx.audio),
      onRepeat: playChord,
      onNext: nextQuestion,
    });
    el.querySelector("#sc-sing").addEventListener("click", async () => {
      const note = target?.rootNotes?.[toneIdx];
      if (!note) return;
      const threshold = DIFFICULTY_TO_CENTS[diffEl.value] || 30;
      try {
        const result = await micGrade({
          targetNote: note,
          thresholdCents: threshold,
          statusEl,
          meterEl,
        });
        if (result.error) {
          statusEl.textContent = result.error;
          return;
        }
        const quality = sm2Quality(result.cents, threshold);
        quizRecord(ctx, "singCall", result.pass, {
          chord: target.chord,
          symbol: target.symbol,
          quality,
        });
        feedback(
          feedbackEl,
          result.pass,
          result.pass
            ? `Pass: ${Math.round(result.cents)}¢ off`
            : `Miss: ${Math.round(result.cents)}¢ off`,
        );
      } catch (err) {
        statusEl.textContent = err?.message || "Mic error";
      }
    });

    promptEl.textContent = "Press Next for a chord. Use Tonicize for key context, Repeat to hear it.";
    return { destroy: () => ctx.audio.cancel() };
  },
};
