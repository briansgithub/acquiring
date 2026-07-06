/**
 * Build quiz pool entries from loaded section state.
 */
import { chordInterpreter } from "../../lib/music.js";
import { normalizeToneNotes } from "../../lib/chordVoicing.js";
import { getChordSymbol } from "../../lib/jsonToSymbol.js";

let corpusMemo = null;
let corpusPromise = null;

export async function fetchCorpusStats() {
  if (corpusMemo) return corpusMemo;
  if (!corpusPromise) {
    corpusPromise = fetch("/api/quiz/corpus-stats")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  corpusMemo = await corpusPromise;
  return corpusMemo;
}

const DIATONIC = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
};

export function buildPool(songCtx) {
  if (!songCtx?.entries?.length) return [];
  return songCtx.entries;
}

export function poolTransitions(pool) {
  const out = [];
  for (let i = 1; i < pool.length; i++) out.push([pool[i - 1], pool[i]]);
  return out;
}

export function progressionRuns(pool, minLen = 3, maxLen = 8) {
  if (pool.length < minLen) return null;
  const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
  const capped = Math.min(len, pool.length);
  const start = Math.floor(Math.random() * (pool.length - capped + 1));
  return pool.slice(start, start + capped);
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickWeighted(items, weightFn) {
  if (!items.length) return null;
  const total = items.reduce((s, item) => s + Math.max(0.0001, weightFn(item)), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(0.0001, weightFn(item));
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function chordIdentityKey(chord) {
  if (!chord) return "unknown";
  const quality = chord.type || 5;
  const inv = chord.inversion || 0;
  const borrowed = Array.isArray(chord.borrowed) ? "custom" : chord.borrowed || "none";
  const applied = chord.applied || 0;
  return `r${chord.root}|t${quality}|i${inv}|b${borrowed}|a${applied}`;
}

export function qualityLabelFromSymbol(symbol) {
  if (!symbol) return "Major";
  if (symbol.includes("ø")) return "Half-diminished 7th";
  if (symbol.includes("°") || symbol.includes("dim")) return "Diminished";
  if (symbol.includes("aug") || symbol.includes("+")) return "Augmented";
  if (/maj7/i.test(symbol)) return "Major 7th";
  if (/min7/i.test(symbol)) return "Minor 7th";
  if (/\d/.test(symbol) && symbol.includes("7")) return "Dominant 7th";
  const lead = symbol.replace(/[^A-Za-z°ø]/g, "").charAt(0);
  if (lead && lead === lead.toLowerCase()) return "Minor";
  return "Major";
}

export function qualityLabelForChord(chord, symbol) {
  return qualityLabelFromSymbol(symbol);
}

export function statsToChordRows(stats) {
  const total = stats?.total || 1;
  return [...(stats?.counts?.entries() || [])]
    .map(([symbol, count]) => ({
      symbol,
      count,
      pct: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol));
}

export function statsToTransitionRows(stats) {
  const entries = [...(stats?.transitions?.entries() || [])];
  const transitionTotal = entries.reduce((sum, [, count]) => sum + count, 0) || 1;
  return entries
    .map(([key, count]) => {
      const [from, to] = key.split("=>");
      return { key, from, to, count, pct: Math.round((count / transitionTotal) * 1000) / 10 };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function pickWeightedTransition(pool) {
  const stats = poolStats(pool);
  const pairs = poolTransitions(pool);
  if (!pairs.length) return null;
  return pickWeighted(pairs, ([a, b]) => stats.transitions.get(`${a.symbol}=>${b.symbol}`) || 1);
}

export function pickWeightedProgressionRun(pool, minLen = 3, maxLen = 8) {
  if (pool.length < minLen) return null;
  const windows = [];
  const seqCounts = new Map();
  for (let len = minLen; len <= Math.min(maxLen, pool.length); len++) {
    for (let start = 0; start <= pool.length - len; start++) {
      const run = pool.slice(start, start + len);
      const seqKey = run.map((e) => e.symbol).join("|");
      seqCounts.set(seqKey, (seqCounts.get(seqKey) || 0) + 1);
      windows.push(run);
    }
  }
  const weighted = windows.map((run) => {
    const seqKey = run.map((e) => e.symbol).join("|");
    return { run, weight: seqCounts.get(seqKey) || 1 };
  });
  const picked = pickWeighted(weighted, (w) => w.weight);
  return picked?.run || null;
}

export function uniqueSongQualities(pool) {
  const stats = poolStats(pool);
  const seen = new Map();
  for (const entry of pool) {
    const id = chordIdentityKey(entry.chord);
    if (seen.has(id)) continue;
    seen.set(id, {
      ...entry,
      qualityLabel: qualityLabelFromSymbol(entry.symbol),
      weight: stats.counts.get(entry.symbol) || 1,
    });
  }
  return [...seen.values()];
}

export function pickWeightedQualityEntry(pool) {
  const unique = uniqueSongQualities(pool);
  if (!unique.length) return null;
  return pickWeighted(unique, (e) => e.weight);
}

function chordEntryForSymbol(corpus, scale, symbol) {
  return corpus?.scales?.[scale]?.chords?.find((c) => c.symbol === symbol) || null;
}

function weightedSymbolPick(candidates, n) {
  const picked = [];
  const pool = [...candidates];
  while (picked.length < n && pool.length) {
    const total = pool.reduce((s, c) => s + (c.count || 1), 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].count || 1;
      if (r <= 0) {
        picked.push(pool[i].symbol);
        pool.splice(i, 1);
        break;
      }
    }
  }
  return picked;
}

export function diatonicDistractors(scale, excludeSymbol, n = 3) {
  const fallback = (DIATONIC[scale] || DIATONIC.major).filter((s) => s !== excludeSymbol);
  return shuffle(fallback).slice(0, n);
}

export function songPoolSymbolCandidates(pool, excludeSymbol = null) {
  const stats = poolStats(pool);
  const seen = new Set();
  const out = [];
  for (const entry of pool) {
    if (!entry.symbol || entry.symbol === excludeSymbol || seen.has(entry.symbol)) continue;
    seen.add(entry.symbol);
    out.push({ symbol: entry.symbol, count: stats.counts.get(entry.symbol) || 1 });
  }
  return out;
}

export function songPoolDistractors(pool, excludeSymbol, n = 3) {
  const candidates = songPoolSymbolCandidates(pool, excludeSymbol);
  if (!candidates.length) return [];
  return weightedSymbolPick(candidates, Math.min(n, candidates.length));
}

export function songDiatonicDistractors(pool, scale, excludeSymbol, n = 3) {
  const diatonic = new Set(DIATONIC[scale] || DIATONIC.major);
  const fromSong = songPoolSymbolCandidates(pool, excludeSymbol).filter((c) =>
    diatonic.has(c.symbol),
  );
  if (fromSong.length >= n) return weightedSymbolPick(fromSong, n);
  const fallback = songPoolDistractors(pool, excludeSymbol, n);
  return [...new Set(fallback)].slice(0, n);
}

export function songTransitionDistractors(pool, fromSymbol, excludeSymbol, n = 3) {
  if (!fromSymbol) return songPoolDistractors(pool, excludeSymbol, n);
  const stats = poolStats(pool);
  const candidates = [];
  for (const [key, count] of stats.transitions) {
    const [from, to] = key.split("=>");
    if (from === fromSymbol && to !== excludeSymbol) {
      candidates.push({ symbol: to, count });
    }
  }
  if (candidates.length >= n) return weightedSymbolPick(candidates, n);
  return songPoolDistractors(pool, excludeSymbol, n);
}

export function transitionTargetDistractors(
  corpus,
  scale,
  fromSymbol,
  excludeSymbol,
  n = 3,
) {
  const fromChord = chordEntryForSymbol(corpus, scale, fromSymbol);
  const transitions = corpus?.scales?.[scale]?.transitions;
  if (!fromChord?.id || !transitions?.length) {
    return distractorSymbols(corpus, scale, excludeSymbol, n);
  }

  const idToSymbol = new Map(
    (corpus.scales[scale].chords || []).map((c) => [c.id, c.symbol]),
  );
  const candidates = transitions
    .filter((t) => t.from === fromChord.id)
    .map((t) => ({ symbol: idToSymbol.get(t.to), count: t.count }))
    .filter((c) => c.symbol && c.symbol !== excludeSymbol);

  if (candidates.length < n) {
    const extra = distractorSymbols(corpus, scale, excludeSymbol, n);
    return shuffle([...new Set([...weightedSymbolPick(candidates, n), ...extra])]).slice(0, n);
  }
  return weightedSymbolPick(candidates, n);
}

export function confusableDistractors(corpus, scale, answerSymbol, contextSymbols = [], n = 3) {
  const fromCtx = contextSymbols.find(Boolean);
  if (fromCtx) {
    return transitionTargetDistractors(corpus, scale, fromCtx, answerSymbol, n);
  }
  return distractorSymbols(corpus, scale, answerSymbol, n);
}

export function distractorSymbols(corpus, scale, excludeSymbol, n = 3) {
  const bucket = corpus?.scales?.[scale]?.chords;
  if (bucket?.length) {
    const candidates = bucket
      .filter((c) => c.symbol && c.symbol !== excludeSymbol)
      .slice(0, 12);
    const picked = [];
    const pool = [...candidates];
    while (picked.length < n && pool.length) {
      const total = pool.reduce((s, c) => s + c.count, 0);
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].count;
        if (r <= 0) {
          picked.push(pool[i].symbol);
          pool.splice(i, 1);
          break;
        }
      }
    }
    if (picked.length >= n) return picked.slice(0, n);
  }
  const fallback = (DIATONIC[scale] || DIATONIC.major).filter((s) => s !== excludeSymbol);
  return shuffle(fallback).slice(0, n);
}

export function findPoolEntry(pool, symbol) {
  if (!pool?.length || !symbol) return null;
  return pool.find((e) => e.symbol === symbol) ?? null;
}

export function buildSongEntries(rawChords, sectionKeys, fallbackKey, interpret) {
  if (!rawChords?.length || !fallbackKey) return [];

  const valid = rawChords.filter((c) => !c.isRest);
  return valid
    .map((chord) => {
      const beat = chord.beat === 0 ? 1 : chord.beat;
      const activeKey = activeKeyAtBeat(sectionKeys, beat, fallbackKey);
      const data = interpret(chord, activeKey);
      const rootData = chordInterpreter(chord, activeKey, { forceRootPosition: true });
      const symbol = getChordSymbol(chord, activeKey);
      const notes = normalizeToneNotes(data.notes || []);
      const rootNotes = normalizeToneNotes(rootData.notes || []);
      return {
        chord,
        key: activeKey,
        symbol,
        notes,
        rootNotes,
        degrees: rootData.chordDegrees || [],
      };
    })
    .filter((e) => e.notes.length);
}

function activeKeyAtBeat(keys, beat, fallbackKey) {
  if (!Array.isArray(keys) || !keys.length) return fallbackKey;
  let chosen = keys[0];
  for (const k of keys) {
    if ((k?.beat ?? 1) <= beat) chosen = k;
    else break;
  }
  const tonic = String(chosen.tonic || fallbackKey.tonic)
    .replace(/♭/g, "b")
    .replace(/♯/g, "#");
  return { tonic, scale: chosen.scale || fallbackKey.scale };
}

export function poolStats(pool) {
  const counts = new Map();
  const transitions = new Map();
  for (let i = 0; i < pool.length; i++) {
    counts.set(pool[i].symbol, (counts.get(pool[i].symbol) || 0) + 1);
    if (i > 0) {
      const k = `${pool[i - 1].symbol}=>${pool[i].symbol}`;
      transitions.set(k, (transitions.get(k) || 0) + 1);
    }
  }
  return { counts, transitions, total: pool.length || 1 };
}

export function buildFrequencyProfile(pool) {
  const { counts, transitions, total } = poolStats(pool);

  const maxSymbolCount = counts.size ? Math.max(...counts.values()) : 0;
  const maxTransitionCount = transitions.size ? Math.max(...transitions.values()) : 0;

  return {
    symbolCounts: counts,
    transitionCounts: transitions,
    totalChords: total,
    maxSymbolCount,
    maxTransitionCount,

    topSymbols(n = 5) {
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([sym]) => sym);
    },

    topTransitions(n = 5) {
      return [...transitions.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key]) => key);
    },

    symbolWeight(symbol) {
      return (counts.get(symbol) || 0) / total;
    },
  };
}

export function pickFrequencyBiased(pool, session, lastSymbol, profile) {
  const base = session.pickEntry(pool);
  if (!base || !profile || !lastSymbol) return base;

  // Score each candidate by transition frequency from lastSymbol
  const candidates = pool.filter((e) => e.symbol !== lastSymbol);
  if (!candidates.length) return base;

  const scored = candidates.map((entry) => {
    const tKey = `${lastSymbol}=>${entry.symbol}`;
    const tCount = profile.transitionCounts.get(tKey) || 0;
    const symWeight = profile.symbolWeight(entry.symbol);
    // Blend: base weight 1 + transition boost + symbol frequency
    return { entry, weight: 1 + tCount * 2 + symWeight };
  });

  return pickWeighted(scored, (s) => s.weight).entry;
}
