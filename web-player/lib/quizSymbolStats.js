import { statsToChordRows, statsToTransitionRows } from "../components/quiz/quizPool.js";

const STORAGE_KEY = "sr_quiz_symbol_stats_v1";

function emptyBucket() {
  return { symbols: {}, transitions: {} };
}

function defaultPair() {
  return { asked: 0, correct: 0 };
}

function loadPersisted() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      global: raw.global || emptyBucket(),
      songs: raw.songs || {},
    };
  } catch {
    return { global: emptyBucket(), songs: {} };
  }
}

function savePersisted(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function bump(bucket, kind, key, field) {
  if (!key) return;
  const map = kind === "transition" ? bucket.transitions : bucket.symbols;
  if (!map[key]) map[key] = defaultPair();
  map[key][field] += 1;
}

function readPair(source, kind, key) {
  const map = kind === "transition" ? source.transitions : source.symbols;
  return map[key] || defaultPair();
}

export class QuizSymbolStats {
  constructor() {
    this.persisted = loadPersisted();
    this.session = emptyBucket();
    this.currentTarget = null;
  }

  trackAsked(songKey, payload = {}) {
    const { symbols = [], transition = null } = payload;
    for (const sym of symbols) {
      bump(this.session, "symbol", sym, "asked");
      if (songKey) bump(this.songBucket(songKey), "symbol", sym, "asked");
      bump(this.persisted.global, "symbol", sym, "asked");
    }
    if (transition) {
      bump(this.session, "transition", transition, "asked");
      if (songKey) bump(this.songBucket(songKey), "transition", transition, "asked");
      bump(this.persisted.global, "transition", transition, "asked");
    }
    savePersisted(this.persisted);
  }

  trackAnswer(songKey, payload = {}, correct) {
    const { symbols = [], transition = null } = payload;
    if (!correct) {
      savePersisted(this.persisted);
      return;
    }
    for (const sym of symbols) {
      bump(this.session, "symbol", sym, "correct");
      if (songKey) bump(this.songBucket(songKey), "symbol", sym, "correct");
      bump(this.persisted.global, "symbol", sym, "correct");
    }
    if (transition) {
      bump(this.session, "transition", transition, "correct");
      if (songKey) bump(this.songBucket(songKey), "transition", transition, "correct");
      bump(this.persisted.global, "transition", transition, "correct");
    }
    savePersisted(this.persisted);
  }

  setCurrentTarget(target) {
    this.currentTarget = target;
  }

  songBucket(songKey) {
    if (!this.persisted.songs[songKey]) {
      this.persisted.songs[songKey] = emptyBucket();
    }
    return this.persisted.songs[songKey];
  }

  mergedChordRows(songKey, sectionStats, romanHtml) {
    const expected = statsToChordRows(sectionStats);
    const song = songKey ? this.songBucket(songKey) : emptyBucket();
    const keys = new Set([
      ...expected.map((r) => r.symbol),
      ...Object.keys(this.session.symbols),
      ...Object.keys(song.symbols),
      ...Object.keys(this.persisted.global.symbols),
    ]);
    const bySymbol = new Map(expected.map((r) => [r.symbol, r]));
    return [...keys]
      .map((symbol) => {
        const exp = bySymbol.get(symbol) || { symbol, count: 0, pct: 0 };
        const sess = readPair(this.session, "symbol", symbol);
        const songP = readPair(song, "symbol", symbol);
        const glob = readPair(this.persisted.global, "symbol", symbol);
        return {
          symbol,
          labelHtml: romanHtml?.(symbol) ?? symbol,
          expectedCount: exp.count,
          expectedPct: exp.pct,
          sessionAsked: sess.asked,
          sessionCorrect: sess.correct,
          songAsked: songP.asked,
          songCorrect: songP.correct,
          globalAsked: glob.asked,
          globalCorrect: glob.correct,
        };
      })
      .sort((a, b) => b.expectedCount - a.expectedCount || a.symbol.localeCompare(b.symbol));
  }

  mergedTransitionRows(songKey, sectionStats) {
    const expected = statsToTransitionRows(sectionStats);
    const song = songKey ? this.songBucket(songKey) : emptyBucket();
    const keys = new Set([
      ...expected.map((r) => r.key),
      ...Object.keys(this.session.transitions),
      ...Object.keys(song.transitions),
      ...Object.keys(this.persisted.global.transitions),
    ]);
    const byKey = new Map(expected.map((r) => [r.key, r]));
    return [...keys]
      .map((key) => {
        const exp = byKey.get(key) || { key, from: key.split("=>")[0], to: key.split("=>")[1], count: 0, pct: 0 };
        const sess = readPair(this.session, "transition", key);
        const songP = readPair(song, "transition", key);
        const glob = readPair(this.persisted.global, "transition", key);
        return {
          key,
          from: exp.from,
          to: exp.to,
          expectedCount: exp.count,
          expectedPct: exp.pct,
          sessionAsked: sess.asked,
          sessionCorrect: sess.correct,
          songAsked: songP.asked,
          songCorrect: songP.correct,
          globalAsked: glob.asked,
          globalCorrect: glob.correct,
        };
      })
      .sort((a, b) => b.expectedCount - a.expectedCount || a.key.localeCompare(b.key));
  }
}
