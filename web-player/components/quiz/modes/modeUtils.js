import {
  capturePitchFrames,
  median,
  bestOctaveError,
  signedOctaveCents,
} from "../../../lib/pitchDetection.js";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const DIFFICULTY_TO_CENTS = {
  easy: 50,
  normal: 30,
  hard: 15,
};

export function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function semitoneToNote(semi, octave = 4) {
  const s = ((semi % 12) + 12) % 12;
  return `${NOTE_NAMES[s]}${octave}`;
}

export function midiToNotes(rootMidi, intervals) {
  return intervals.map((iv) => {
    const m = rootMidi + iv;
    return semitoneToNote(m % 12, Math.floor(m / 12));
  });
}

export function noteToFrequency(noteName) {
  const Tone = window.Tone;
  if (!Tone || !noteName) return null;
  return Tone.Frequency(noteName).toFrequency();
}

export function renderChoices(el, choices, onPick, { html = false } = {}) {
  el.innerHTML = "";
  for (const choice of choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-choice-btn";
    if (html) btn.innerHTML = choice.label;
    else btn.textContent = choice.label ?? choice;
    btn.addEventListener("click", () => onPick(choice, btn));
    el.appendChild(btn);
  }
}

export function feedback(el, ok, text) {
  const div = document.createElement("div");
  div.className = `quiz-status${ok ? " quiz-feedback-ok" : " quiz-feedback-bad"}`;
  div.textContent = text;
  el.appendChild(div);
}

const LISTENING_LABELS = { easy: "Easy", normal: "Normal", hard: "Hard" };
const PITCH_LABELS = {
  easy: "Easy (±50 cents)",
  normal: "Normal (±30 cents)",
  hard: "Hard (±15 cents)",
};

function difficultyRow(id, labelText, options, defaultValue = "normal") {
  const row = document.createElement("div");
  row.className = "quiz-row quiz-difficulty-row";
  const opts = options
    .map(
      (v) =>
        `<option value="${v}"${v === defaultValue ? " selected" : ""}>${LISTENING_LABELS[v] ?? PITCH_LABELS[v]}</option>`,
    )
    .join("");
  row.innerHTML = `
    <label for="${id}" class="indicator-volume-label">${labelText}</label>
    <select id="${id}" class="select quiz-select">${opts}</select>
  `;
  return row;
}

export function renderListeningDifficultySelect(
  parent,
  id = "quiz-listening-difficulty",
  { default: defaultValue = "normal" } = {},
) {
  const row = difficultyRow(id, "Difficulty", ["easy", "normal", "hard"], defaultValue);
  parent.appendChild(row);
  return row.querySelector(`#${id}`);
}

export function renderPitchToleranceSelect(parent, id = "quiz-pitch-tolerance") {
  const row = document.createElement("div");
  row.className = "quiz-row quiz-difficulty-row";
  row.innerHTML = `
    <label for="${id}" class="indicator-volume-label">Pitch tolerance</label>
    <select id="${id}" class="select quiz-select">
      <option value="easy">Easy (±50 cents)</option>
      <option value="normal" selected>Normal (±30 cents)</option>
      <option value="hard">Hard (±15 cents)</option>
    </select>
  `;
  parent.appendChild(row);
  return row.querySelector(`#${id}`);
}

/** @deprecated use renderPitchToleranceSelect */
export const renderDifficultySelect = renderPitchToleranceSelect;

export function renderDifficultyRow(parent, { type = "listening", id, default: defaultValue } = {}) {
  if (type === "pitch") return renderPitchToleranceSelect(parent, id);
  return renderListeningDifficultySelect(parent, id, { default: defaultValue });
}

export function mountDifficultyAfter(promptEl, opts = {}) {
  const id =
    opts.id || (opts.type === "pitch" ? "quiz-pitch-tolerance" : "quiz-listening-difficulty");
  const label = opts.type === "pitch" ? "Pitch tolerance" : "Difficulty";
  const labels = opts.type === "pitch" ? PITCH_LABELS : LISTENING_LABELS;
  const defaultValue = opts.default || "normal";
  const row = document.createElement("div");
  row.className = "quiz-row quiz-difficulty-row";
  row.innerHTML = `
    <label for="${id}" class="indicator-volume-label">${label}</label>
    <select id="${id}" class="select quiz-select">
      ${["easy", "normal", "hard"]
        .map(
          (v) =>
            `<option value="${v}"${v === defaultValue ? " selected" : ""}>${labels[v]}</option>`,
        )
        .join("")}
    </select>
  `;
  promptEl.insertAdjacentElement("afterend", row);
  return row.querySelector("select");
}

export function mcChoices(correct, pool, count) {
  const wrong = shuffle(pool.filter((item) => item !== correct));
  return shuffle([correct, ...wrong.slice(0, count - 1)]);
}

export function createPitchMeter(meterEl, targetNote) {
  const targetHz = noteToFrequency(targetNote);
  if (meterEl) {
    meterEl.className = "quiz-pitch-meter";
    meterEl.innerHTML = `
      <div class="quiz-pitch-track"><div class="quiz-pitch-needle"></div></div>
      <div class="quiz-pitch-labels"><span>-50</span><span>0</span><span>+50</span></div>
    `;
  }
  const needle = meterEl?.querySelector(".quiz-pitch-needle");

  function update(hz) {
    if (!needle || !targetHz) return;
    const cents = signedOctaveCents(hz, targetHz);
    if (!Number.isFinite(cents)) return;
    const clamped = Math.max(-50, Math.min(50, cents));
    const pct = 50 + (clamped / 50) * 50;
    needle.style.left = `${pct}%`;
  }

  return { update };
}

export async function micGrade({
  targetNote,
  thresholdCents,
  statusEl,
  meterEl,
  durationMs = 2400,
}) {
  const meter = createPitchMeter(meterEl, targetNote);
  if (statusEl) statusEl.textContent = "Listening… sing the target tone.";
  const frames = await capturePitchFrames(durationMs, (hz) => meter.update(hz));
  if (!frames.length) {
    return { pass: false, cents: Number.NaN, error: "No stable pitch detected." };
  }
  const observed = median(frames);
  const targetHz = noteToFrequency(targetNote);
  if (!observed || !targetHz) {
    return { pass: false, cents: Number.NaN, error: "Pitch analysis failed." };
  }
  const cents = bestOctaveError(observed, targetHz);
  const pass = cents <= thresholdCents;
  return { pass, cents, observed };
}

export function sm2Quality(cents, threshold) {
  if (cents <= threshold) return cents < threshold * 0.45 ? 5 : 4;
  return cents < threshold * 1.8 ? 2 : 1;
}

export function requireSong(el, ctx) {
  const songCtx = ctx.getSongContext();
  const pool = songCtx?.entries || [];
  if (!pool.length) {
    el.innerHTML = `<div class="quiz-card"><div class="quiz-prompt">Load a song first.</div></div>`;
    return null;
  }
  return { songCtx, pool };
}

export const QUIZ_TOOLTIPS = {
  tonicize: "Play I–IV–V–I in the song's key to orient your ear to the tonal center",
  next: "Load a new question without playing audio",
  repeatChord: "Replay the target chord for this question (no key cadence)",
  repeatTransition: "Replay the transition chords for this question (no key cadence)",
  repeatProgression: "Replay the question chords in sequence (no key cadence)",
  repeatCloze: "Replay the progression with the missing chord silent (no key cadence)",
  repeatQuality: "Replay the isolated chord for this question",
  repeatArpeggioChord: "Replay the full target chord (no key cadence)",
  repeatArpeggioTone: "Replay the current arpeggio tone to sing",
  singRoot: "Capture your sung root with the microphone and grade pitch accuracy",
  singTone: "Capture your sung tone with the microphone and grade pitch accuracy",
};

export function keyQuizTransportHtml(prefix, repeatTitle, repeatLabel = "Repeat") {
  const { tonicize, next } = QUIZ_TOOLTIPS;
  return `
    <div class="quiz-row quiz-transport-row">
      <button type="button" id="${prefix}-tonicize" title="${tonicize}">Tonicize</button>
      <button type="button" id="${prefix}-repeat" title="${repeatTitle}">${repeatLabel}</button>
      <button type="button" id="${prefix}-next" title="${next}">Next</button>
    </div>`;
}

export function wireKeyQuizTransport(root, prefix, { onTonicize, onRepeat, onNext }) {
  root.querySelector(`#${prefix}-tonicize`)?.addEventListener("click", onTonicize);
  root.querySelector(`#${prefix}-repeat`)?.addEventListener("click", onRepeat);
  root.querySelector(`#${prefix}-next`)?.addEventListener("click", onNext);
}

export function tonicizeKey(songCtx, audio) {
  audio.playCadence(songCtx.key, songCtx.interpret);
}

export function quizNotify(ctx, payload) {
  const songKey = ctx.getSongKey?.();
  if (songKey) ctx.session.notifyQuestion(songKey, payload);
  ctx.onStatsChange?.();
}

export function quizRecord(ctx, modeId, correct, opts = {}) {
  const songKey = ctx.getSongKey?.();
  const result = ctx.session.record(modeId, correct, opts, songKey);
  ctx.onStatsChange?.();
  return result;
}
