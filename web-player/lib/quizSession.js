import { QuizScheduler } from "./quizScheduler.js";
import { poolStats } from "../components/quiz/quizPool.js";
import { QuizSymbolStats } from "./quizSymbolStats.js";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function defaultModeStats() {
  return { asked: 0, correct: 0, streak: 0, bestStreak: 0 };
}

function answerPayload(opts = {}) {
  if (opts.transition) return { transition: opts.transition };
  if (opts.symbols?.length) return { symbols: opts.symbols };
  if (opts.symbol) return { symbols: [opts.symbol] };
  return {};
}

export class QuizSession {
  constructor() {
    this.scheduler = new QuizScheduler();
    this.modes = loadSession();
    this.symbolStats = new QuizSymbolStats();
    this.lastSymbol = null;
    this.currentTarget = null;
  }

  statsFor(modeId) {
    const s = this.modes[modeId] || defaultModeStats();
    const accuracy = s.asked ? Math.round((s.correct / s.asked) * 100) : 0;
    return { ...s, accuracy };
  }

  notifyQuestion(songKey, payload = {}) {
    this.symbolStats.trackAsked(songKey, payload);
    if (payload.transition) {
      this.currentTarget = { type: "transition", key: payload.transition };
    } else if (payload.symbols?.length === 1) {
      this.currentTarget = { type: "symbol", key: payload.symbols[0] };
    } else {
      this.currentTarget = payload.symbols?.length
        ? { type: "symbols", keys: payload.symbols }
        : null;
    }
    this.symbolStats.setCurrentTarget(this.currentTarget);
  }

  record(modeId, correct, opts = {}, songKey = null) {
    const s = this.modes[modeId] || defaultModeStats();
    s.asked += 1;
    if (correct) {
      s.correct += 1;
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
    } else {
      s.streak = 0;
    }
    this.modes[modeId] = s;
    saveSession(this.modes);

    if (opts.chord) {
      this.scheduler.grade(opts.chord, correct, opts.quality ?? null);
    }
    if (opts.symbol) this.lastSymbol = opts.symbol;

    const payload = answerPayload(opts);
    if (songKey && (payload.symbols || payload.transition)) {
      this.symbolStats.trackAnswer(songKey, payload, correct);
    }

    return s;
  }

  recordSymbolAnswer(songKey, symbol, correct) {
    if (!songKey || !symbol) return;
    this.symbolStats.trackAnswer(songKey, { symbols: [symbol] }, correct);
  }

  pickEntry(pool) {
    if (!pool.length) return null;
    const stats = poolStats(pool);
    const candidates = pool.map((entry) => ({
      chord: entry.chord,
      symbol: entry.symbol,
      notes: entry.notes,
      rootNotes: entry.rootNotes,
      degrees: entry.degrees,
      key: entry.key,
      targetNote: entry.rootNotes?.[0],
      targetDegree: entry.degrees?.[0] || "1",
    }));
    return this.scheduler.nextCard(candidates, stats, this.lastSymbol);
  }

  mergedChordRows(songKey, sectionStats, romanHtml) {
    return this.symbolStats.mergedChordRows(songKey, sectionStats, romanHtml);
  }

  mergedTransitionRows(songKey, sectionStats) {
    return this.symbolStats.mergedTransitionRows(songKey, sectionStats);
  }
}
