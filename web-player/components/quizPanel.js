import { QuizScheduler } from "../lib/quizScheduler.js";
import { capturePitchFrames, centsError, median } from "../lib/pitchDetection.js";

const DIFFICULTY_TO_CENTS = {
  easy: 50,
  normal: 30,
  hard: 15,
};

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function noteToFrequency(noteName) {
  const Tone = window.Tone;
  if (!Tone || !noteName) return null;
  return Tone.Frequency(noteName).toFrequency();
}

function bestOctaveError(observedHz, targetHz) {
  let best = Number.POSITIVE_INFINITY;
  for (let shift = -2; shift <= 2; shift++) {
    const shifted = targetHz * 2 ** shift;
    const err = Math.abs(centsError(observedHz, shifted));
    if (err < best) best = err;
  }
  return best;
}

export function renderQuizPanel(container, options = {}) {
  const scheduler = new QuizScheduler();
  let lastSymbol = null;
  let currentQuestion = null;

  container.innerHTML = `
    <div class="card quiz-card">
      <div class="label quiz-title">Ear Training Quiz (Prototype)</div>
      <div class="quiz-row">
        <button type="button" id="quiz-next-card-btn">Next Card</button>
        <button type="button" id="quiz-play-target-btn">Play Target</button>
      </div>
      <div id="quiz-card-prompt" class="quiz-prompt">Press "Next Card" to start.</div>
      <div id="quiz-choices" class="quiz-choices"></div>
      <hr class="indicator-section-divider" />
      <div class="quiz-row">
        <label for="quiz-difficulty" class="indicator-volume-label">Mic difficulty</label>
        <select id="quiz-difficulty" class="select quiz-select">
          <option value="easy">Easy (±50 cents)</option>
          <option value="normal" selected>Normal (±30 cents)</option>
          <option value="hard">Hard (±15 cents)</option>
        </select>
        <button type="button" id="quiz-sing-btn">Sing Target Tone</button>
      </div>
      <div id="quiz-mic-status" class="quiz-status">Waiting for card.</div>
    </div>
  `;

  const nextBtn = container.querySelector("#quiz-next-card-btn");
  const playBtn = container.querySelector("#quiz-play-target-btn");
  const singBtn = container.querySelector("#quiz-sing-btn");
  const promptEl = container.querySelector("#quiz-card-prompt");
  const choicesEl = container.querySelector("#quiz-choices");
  const statusEl = container.querySelector("#quiz-mic-status");
  const difficultyEl = container.querySelector("#quiz-difficulty");

  function buildQuestion() {
    const context = options.getQuizContext?.();
    if (!context?.pool?.length) {
      promptEl.textContent = "Load a section first.";
      currentQuestion = null;
      return;
    }
    const target = scheduler.nextCard(context.pool, context.stats, lastSymbol);
    if (!target) return;
    const wrongChoices = shuffle(context.pool.filter((c) => c.symbol !== target.symbol)).slice(0, 3);
    const choices = shuffle([target, ...wrongChoices]);
    currentQuestion = { target, choices };
    promptEl.textContent = "Identify the heard chord (frequency + weakness weighted).";
    choicesEl.innerHTML = "";
    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-choice-btn";
      btn.textContent = choice.symbol;
      btn.addEventListener("click", () => {
        const correct = choice.symbol === target.symbol;
        scheduler.grade(target.chord, correct, correct ? 4 : 1);
        btn.classList.add(correct ? "quiz-correct" : "quiz-wrong");
        if (!correct) {
          const reveal = document.createElement("div");
          reveal.className = "quiz-status";
          reveal.textContent = `Correct: ${target.symbol}`;
          choicesEl.appendChild(reveal);
        }
        lastSymbol = target.symbol;
      });
      choicesEl.appendChild(btn);
    }
    statusEl.textContent = `Target tone: ${target.targetDegree || "1"} relative to chord tonic.`;
  }

  async function singAndScore() {
    if (!currentQuestion?.target) {
      statusEl.textContent = "Generate a card first.";
      return;
    }
    const target = currentQuestion.target;
    const targetNote = target.targetNote || target.notes?.[0];
    const tonicNote = target.notes?.[0];
    if (!targetNote || !tonicNote) {
      statusEl.textContent = "No target note found for this card.";
      return;
    }

    const threshold = DIFFICULTY_TO_CENTS[difficultyEl.value] || 30;
    statusEl.textContent = "Listening... sing the requested chord tone.";
    singBtn.disabled = true;
    try {
      options.playQuizReference?.(tonicNote, targetNote);
      const frames = await capturePitchFrames(2400);
      if (!frames.length) {
        statusEl.textContent = "No stable pitch detected. Try again with a clear sustained tone.";
        return;
      }
      const observed = median(frames);
      const targetHz = noteToFrequency(targetNote);
      if (!observed || !targetHz) {
        statusEl.textContent = "Pitch analysis failed.";
        return;
      }
      const error = bestOctaveError(observed, targetHz);
      const pass = error <= threshold;
      const quality = pass ? (error < threshold * 0.45 ? 5 : 4) : (error < threshold * 1.8 ? 2 : 1);
      scheduler.grade(target.chord, pass, quality);
      statusEl.textContent = pass
        ? `Pass: ${Math.round(error)} cents off (<= ${threshold}).`
        : `Miss: ${Math.round(error)} cents off (> ${threshold}).`;
    } catch (err) {
      statusEl.textContent = `Mic error: ${err?.message || "unknown error"}`;
    } finally {
      singBtn.disabled = false;
    }
  }

  nextBtn.addEventListener("click", buildQuestion);
  playBtn.addEventListener("click", () => {
    if (!currentQuestion?.target) return;
    options.playQuizTarget?.(currentQuestion.target.notes);
  });
  singBtn.addEventListener("click", () => {
    singAndScore();
  });

  return {
    refresh() {
      if (!currentQuestion) return;
      const context = options.getQuizContext?.();
      if (!context?.pool?.length) {
        currentQuestion = null;
        promptEl.textContent = "Load a section first.";
      }
    },
  };
}
