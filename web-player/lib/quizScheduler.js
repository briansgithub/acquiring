const STORAGE_KEY = "sr_quiz_state_v1";

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function nowMs() {
  return Date.now();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pickWeighted(items, weightFn) {
  const entries = items
    .map((item) => ({ item, weight: Math.max(0.0001, Number(weightFn(item)) || 0) }))
    .filter((entry) => entry.weight > 0);
  if (!entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let target = Math.random() * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target <= 0) return entry.item;
  }
  return entries[entries.length - 1].item;
}

function chordKey(chord) {
  if (!chord) return "unknown";
  const quality = chord.type || 5;
  const inv = chord.inversion || 0;
  const borrowed = Array.isArray(chord.borrowed) ? "custom" : (chord.borrowed || "none");
  const applied = chord.applied || 0;
  return `r${chord.root}|t${quality}|i${inv}|b${borrowed}|a${applied}`;
}

function defaultCardState() {
  return {
    ease: 2.4,
    intervalDays: 0,
    dueAt: 0,
    reps: 0,
    lapses: 0,
    correct: 0,
    wrong: 0,
    lastSeenAt: 0,
    lastAskedAt: 0,
  };
}

function updateSm2(state, quality) {
  const q = clamp(Math.round(quality), 0, 5);
  const next = { ...state };
  if (q < 3) {
    next.reps = 0;
    next.intervalDays = 1;
    next.lapses += 1;
  } else {
    next.reps += 1;
    if (next.reps === 1) next.intervalDays = 1;
    else if (next.reps === 2) next.intervalDays = 3;
    else next.intervalDays = Math.max(1, Math.round(next.intervalDays * next.ease));
    next.ease = clamp(next.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), 1.3, 3.0);
  }
  next.dueAt = nowMs() + next.intervalDays * 24 * 60 * 60 * 1000;
  return next;
}

export class QuizScheduler {
  constructor() {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    this.state = safeParse(raw, { cards: {} });
    if (!this.state || typeof this.state !== "object") this.state = { cards: {} };
    if (!this.state.cards || typeof this.state.cards !== "object") this.state.cards = {};
  }

  save() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn("localStorage.setItem failed:", e);
    }
  }

  ensureCard(id) {
    if (!this.state.cards[id]) this.state.cards[id] = defaultCardState();
    return this.state.cards[id];
  }

  computeChordStats(chords, symbols) {
    const counts = new Map();
    const transitions = new Map();
    const total = chords.length || 1;
    for (let i = 0; i < chords.length; i++) {
      const symbol = symbols[i];
      counts.set(symbol, (counts.get(symbol) || 0) + 1);
      if (i > 0) {
        const pair = `${symbols[i - 1]}=>${symbol}`;
        transitions.set(pair, (transitions.get(pair) || 0) + 1);
      }
    }
    return { counts, transitions, total };
  }

  nextCard(candidates, stats, lastSymbol = null) {
    const now = nowMs();
    const pick = pickWeighted(candidates, (candidate) => {
      const id = chordKey(candidate.chord);
      const card = this.ensureCard(id);
      const corpusFreq = (stats.counts.get(candidate.symbol) || 0) / stats.total;
      const overdue = card.dueAt === 0 ? 1.6 : clamp((now - card.dueAt) / (24 * 60 * 60 * 1000) + 1, 0.2, 2.2);
      const weak = 1 + ((card.wrong + 1) / (card.correct + 1)) * 0.8;
      const novelty = card.reps === 0 ? 1.3 : 1;
      const transitionBoost = lastSymbol
        ? 1 + ((stats.transitions.get(`${lastSymbol}=>${candidate.symbol}`) || 0) / Math.max(1, stats.total)) * 3
        : 1;
      const antiRepeat = candidate.symbol === lastSymbol ? 0.2 : 1;
      return Math.log(1 + corpusFreq * 100) * overdue * weak * novelty * transitionBoost * antiRepeat;
    });
    if (!pick) return null;
    const card = this.ensureCard(chordKey(pick.chord));
    card.lastAskedAt = now;
    this.save();
    return pick;
  }

  grade(chord, correct, qualityOverride = null) {
    const id = chordKey(chord);
    const prev = this.ensureCard(id);
    if (correct) prev.correct += 1;
    else prev.wrong += 1;
    prev.lastSeenAt = nowMs();
    const quality = qualityOverride != null ? qualityOverride : (correct ? 4 : 1);
    this.state.cards[id] = updateSm2(prev, quality);
    this.save();
    return this.state.cards[id];
  }
}
