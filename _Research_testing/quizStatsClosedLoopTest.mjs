/**
 * Closed-loop stats verification for all 8 quiz modes.
 * Simulates notifyQuestion + quizRecord flows and asserts mode + symbol stats.
 */
import { QuizSession } from "../web-player/lib/quizSession.js";
import { poolStats } from "../web-player/components/quiz/quizPool.js";

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => {
    store[k] = v;
  },
  removeItem: (k) => {
    delete store[k];
  },
};

const mockChord = {
  root: 1,
  type: 5,
  inversion: 0,
  applied: 0,
  adds: [],
  omits: [],
  alterations: [],
  suspensions: [],
  borrowed: null,
  isRest: false,
};

const pool = [
  {
    symbol: "I",
    chord: mockChord,
    notes: ["C4", "E4", "G4"],
    rootNotes: ["C4"],
    degrees: ["1"],
    key: { tonic: "C", scale: "major" },
  },
  {
    symbol: "IV",
    chord: mockChord,
    notes: ["F4", "A4", "C5"],
    rootNotes: ["F4"],
    degrees: ["4"],
    key: { tonic: "C", scale: "major" },
  },
  {
    symbol: "V",
    chord: mockChord,
    notes: ["G4", "B4", "D5"],
    rootNotes: ["G4"],
    degrees: ["5"],
    key: { tonic: "C", scale: "major" },
  },
];

const SONG_KEY = "test-artist";
const sectionStats = poolStats(pool);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function chordRow(session, symbol) {
  return session.mergedChordRows(SONG_KEY, sectionStats, (s) => s).find((r) => r.symbol === symbol);
}

function transitionRow(session, key) {
  return session.mergedTransitionRows(SONG_KEY, sectionStats).find((r) => r.key === key);
}

function expectMode(session, modeId, { asked, correct, streak }) {
  const s = session.statsFor(modeId);
  assert(s.asked === asked, `${modeId} asked: got ${s.asked}, want ${asked}`);
  assert(s.correct === correct, `${modeId} correct: got ${s.correct}, want ${correct}`);
  assert(s.streak === streak, `${modeId} streak: got ${s.streak}, want ${streak}`);
}

function expectChordSess(session, symbol, asked, correct) {
  const row = chordRow(session, symbol);
  assert(row, `missing chord row for ${symbol}`);
  assert(
    row.sessionAsked === asked,
    `${symbol} sessionAsked: got ${row.sessionAsked}, want ${asked}`,
  );
  assert(
    row.sessionCorrect === correct,
    `${symbol} sessionCorrect: got ${row.sessionCorrect}, want ${correct}`,
  );
}

function expectTransitionSess(session, key, asked, correct) {
  const row = transitionRow(session, key);
  assert(row, `missing transition row for ${key}`);
  assert(
    row.sessionAsked === asked,
    `${key} sessionAsked: got ${row.sessionAsked}, want ${asked}`,
  );
  assert(
    row.sessionCorrect === correct,
    `${key} sessionCorrect: got ${row.sessionCorrect}, want ${correct}`,
  );
}

function simulateNotifyRecord(session, modeId, notifyPayload, recordOpts, correct = true) {
  session.notifyQuestion(SONG_KEY, notifyPayload);
  return session.record(modeId, correct, recordOpts, SONG_KEY);
}

const results = [];

function runCase(name, fn) {
  for (const k of Object.keys(store)) delete store[k];
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
  }
}

runCase("degreeId correct", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "mode-degree",
    { symbols: ["I"] },
    { chord: mockChord, symbol: "I", quality: 4 },
    true,
  );
  expectMode(session, "mode-degree", { asked: 1, correct: 1, streak: 1 });
  expectChordSess(session, "I", 1, 1);
});

runCase("qualityFlash correct", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "mode-quality",
    { symbols: ["IV"] },
    { chord: mockChord, symbol: "IV", quality: 4 },
    true,
  );
  expectMode(session, "mode-quality", { asked: 1, correct: 1, streak: 1 });
  expectChordSess(session, "IV", 1, 1);
});

runCase("transitionDrill correct", () => {
  const session = new QuizSession();
  const transitionKey = "I=>IV";
  simulateNotifyRecord(
    session,
    "mode-transition",
    { transition: transitionKey },
    { chord: mockChord, symbol: "IV", transition: transitionKey, quality: 4 },
    true,
  );
  expectMode(session, "mode-transition", { asked: 1, correct: 1, streak: 1 });
  expectTransitionSess(session, transitionKey, 1, 1);
});

runCase("cloze correct", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "mode-cloze",
    { symbols: ["V"] },
    { chord: mockChord, symbol: "V", quality: 4 },
    true,
  );
  expectMode(session, "mode-cloze", { asked: 1, correct: 1, streak: 1 });
  expectChordSess(session, "V", 1, 1);
});

runCase("dictation all correct (per-symbol answers)", () => {
  const session = new QuizSession();
  const run = pool;
  session.notifyQuestion(SONG_KEY, { symbols: run.map((e) => e.symbol) });
  session.record("mode-dictation", true, { chord: run[run.length - 1].chord, quality: 4 }, SONG_KEY);
  for (const entry of run) {
    session.recordSymbolAnswer(SONG_KEY, entry.symbol, true);
  }
  expectMode(session, "mode-dictation", { asked: 1, correct: 1, streak: 1 });
  for (const entry of run) {
    expectChordSess(session, entry.symbol, 1, 1);
  }
});

runCase("dictation partial correct", () => {
  const session = new QuizSession();
  const run = pool;
  session.notifyQuestion(SONG_KEY, { symbols: run.map((e) => e.symbol) });
  session.record("mode-dictation", false, { chord: run[run.length - 1].chord, quality: 1 }, SONG_KEY);
  session.recordSymbolAnswer(SONG_KEY, "I", false);
  session.recordSymbolAnswer(SONG_KEY, "IV", true);
  session.recordSymbolAnswer(SONG_KEY, "V", true);
  expectMode(session, "mode-dictation", { asked: 1, correct: 0, streak: 0 });
  expectChordSess(session, "I", 1, 0);
  expectChordSess(session, "IV", 1, 1);
  expectChordSess(session, "V", 1, 1);
});

runCase("singRoot correct", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "singRoot",
    { symbols: ["I"] },
    { chord: mockChord, symbol: "I", quality: 4 },
    true,
  );
  expectMode(session, "singRoot", { asked: 1, correct: 1, streak: 1 });
  expectChordSess(session, "I", 1, 1);
});

runCase("singCall correct", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "singCall",
    { symbols: ["IV"] },
    { chord: mockChord, symbol: "IV", quality: 4 },
    true,
  );
  expectMode(session, "singCall", { asked: 1, correct: 1, streak: 1 });
  expectChordSess(session, "IV", 1, 1);
});

runCase("singArpeggio correct", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "singArpeggio",
    { symbols: ["V"] },
    { chord: mockChord, symbol: "V", quality: 4 },
    true,
  );
  expectMode(session, "singArpeggio", { asked: 1, correct: 1, streak: 1 });
  expectChordSess(session, "V", 1, 1);
});

runCase("record without notify heals asked on correct", () => {
  const session = new QuizSession();
  session.record("mode-degree", true, { chord: mockChord, symbol: "I", quality: 4 }, SONG_KEY);
  expectChordSess(session, "I", 1, 1);
  expectMode(session, "mode-degree", { asked: 1, correct: 1, streak: 1 });
});

runCase("notify alone does not update stats or highlight", () => {
  const session = new QuizSession();
  session.notifyQuestion(SONG_KEY, { symbols: ["I"] });
  assert(session.symbolStats.lastUpdated === null, "no highlight before answer");
  expectChordSess(session, "I", 0, 0);
});

runCase("lastUpdated tracks symbol on answer", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "mode-degree",
    { symbols: ["IV"] },
    { chord: mockChord, symbol: "IV", quality: 4 },
    true,
  );
  assert(session.symbolStats.lastUpdated?.kind === "symbol", "kind symbol");
  assert(session.symbolStats.lastUpdated?.key === "IV", "key IV");
});

runCase("lastUpdated tracks transition on answer", () => {
  const session = new QuizSession();
  const transitionKey = "I=>V";
  simulateNotifyRecord(
    session,
    "mode-transition",
    { transition: transitionKey },
    { chord: mockChord, symbol: "V", transition: transitionKey, quality: 4 },
    true,
  );
  assert(session.symbolStats.lastUpdated?.kind === "transition", "kind transition");
  assert(session.symbolStats.lastUpdated?.key === transitionKey, "transition key");
});

runCase("wrong answer keeps asked without correct", () => {
  const session = new QuizSession();
  simulateNotifyRecord(
    session,
    "mode-degree",
    { symbols: ["I"] },
    { chord: mockChord, symbol: "I", quality: 1 },
    false,
  );
  expectMode(session, "mode-degree", { asked: 1, correct: 0, streak: 0 });
  expectChordSess(session, "I", 1, 0);
  assert(session.symbolStats.lastUpdated?.key === "I", "wrong answer still highlights row");
});

runCase("wrong answer highlights without correct bump", () => {
  const session = new QuizSession();
  session.notifyQuestion(SONG_KEY, { symbols: ["IV"] });
  session.record("mode-degree", false, { chord: mockChord, symbol: "IV", quality: 1 }, SONG_KEY);
  assert(session.symbolStats.lastUpdated?.key === "IV", "highlight on wrong submit");
  const row = chordRow(session, "IV");
  assert(row.sessionCorrect === 0, "correct still 0");
});

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
if (failed.length) {
  process.exitCode = 1;
}
