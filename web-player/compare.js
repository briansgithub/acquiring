/**
 * Side-by-side progression compare page (A/B tabs, shared transport).
 */
import { chordInterpreter } from "./lib/music.js";
import { getChordSymbol } from "./lib/jsonToSymbol.js";
import { AudioEngine } from "./audio/engine.js";

const TICKS_PER_BEAT = 192;

function parseRef(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^([^:]+):([^@]+)(?:@([\d.]+))?$/);
  if (!m) return { slug: raw, sectionType: null, seekBeat: 1 };
  return {
    slug: decodeURIComponent(m[1]),
    sectionType: decodeURIComponent(m[2]),
    seekBeat: m[3] ? Number(m[3]) : 1,
  };
}

function esc(s) {
  return String(s ?? "");
}

async function fetchSongBundle(ref) {
  const libRes = await fetch(`/api/library/song?slug=${encodeURIComponent(ref.slug)}`);
  const lib = await libRes.json();
  if (!libRes.ok) throw new Error(lib.error || "library fetch failed");
  const song = lib.song || {};
  if (!song.cacheKey) {
    await fetch(`/api/library/load?slug=${encodeURIComponent(ref.slug)}`, { method: "POST" });
  }
  const loadRes = await fetch(`/api/library/song?slug=${encodeURIComponent(ref.slug)}`);
  const loaded = await loadRes.json();
  const cacheKey = loaded.song?.cacheKey;
  if (!cacheKey) throw new Error("song not playable");
  const entryRes = await fetch(`/api/songs/entry?key=${encodeURIComponent(cacheKey)}`);
  const entry = await entryRes.json();
  if (!entryRes.ok) throw new Error(entry.error || "entry failed");
  let section = entry.sections?.[0];
  if (ref.sectionType) {
    section = entry.sections?.find((s) => s.sectionName === ref.sectionType) || section;
  }
  if (!section?.relPath) throw new Error("no section");
  const dataRes = await fetch(`/api/song?file=${encodeURIComponent(section.relPath)}`);
  const data = await dataRes.json();
  if (!dataRes.ok) throw new Error("section json failed");
  return { song: loaded.song, section, data, ref };
}

function activeKeyAtBeat(keys, beat, fallback) {
  if (!keys?.length) return fallback;
  let chosen = keys[0];
  for (const k of keys) {
    if ((k.beat ?? 1) <= beat) chosen = k;
    else break;
  }
  return {
    tonic: String(chosen.tonic || fallback.tonic).replace(/♭/g, "b").replace(/♯/g, "#"),
    scale: chosen.scale || fallback.scale,
  };
}

function progressionSummary(data) {
  const keys = data.metadata?.keys || [];
  const fallback = keys[0] || { tonic: "C", scale: "major" };
  const chords = (data.chords || []).filter((c) => !c.isRest).sort((a, b) => a.beat - b.beat);
  return chords.map((c) => {
    const beat = c.beat === 0 ? 1 : c.beat;
    const key = activeKeyAtBeat(keys, beat, fallback);
    return getChordSymbol(c, key);
  }).join(" → ");
}

function highlightMatch(timelineEl, hlEl, data, seekBeat, durationBeats = 4) {
  const keys = data.metadata?.keys || [];
  const endBeat = (data.metadata?.endBeat || 64);
  const start = seekBeat ?? 1;
  const left = ((start - 1) / endBeat) * 100;
  const width = (durationBeats / endBeat) * 100;
  hlEl.style.left = `${Math.max(0, left)}%`;
  hlEl.style.width = `${Math.min(100 - left, width)}%`;
  hlEl.hidden = false;
}

class PanePlayer {
  constructor(id) {
    this.id = id;
    this.engine = new AudioEngine();
    this.bundle = null;
  }

  async load(ref) {
    this.bundle = await fetchSongBundle(ref);
    const { data, section, song } = this.bundle;
    document.getElementById(`title-${this.id}`).textContent =
      `${song.title || ref.slug} — ${section.sectionName}`;
    document.getElementById(`meta-${this.id}`).textContent =
      `${song.artist || ""} · beat ${ref.seekBeat ?? 1}`;
    document.getElementById(`prog-${this.id}`).textContent = progressionSummary(data);
    highlightMatch(
      document.getElementById(`tl-${this.id}`),
      document.getElementById(`hl-${this.id}`),
      data,
      ref.seekBeat,
    );
    return this.bundle;
  }

  async play() {
    if (!this.bundle) return;
    const { data, ref } = this.bundle;
    const keys = data.metadata?.keys || [];
    const fallback = keys[0] || { tonic: "C", scale: "major" };
    const bpm = data.metadata?.tempos?.[0]?.bpm ?? 120;
    const events = [];
    for (const chord of data.chords || []) {
      if (chord.isRest) continue;
      const beat = chord.beat === 0 ? 1 : chord.beat;
      const key = activeKeyAtBeat(keys, beat, fallback);
      const interpreted = chordInterpreter(chord, key);
      const startTick = (beat - 1) * TICKS_PER_BEAT;
      const endTick = startTick + chord.duration * TICKS_PER_BEAT;
      events.push({
        time: `${startTick}i`,
        type: "attack",
        notes: interpreted.notes,
        duration: (endTick - startTick) / TICKS_PER_BEAT,
      });
    }
    this.engine.cancelAllParts();
    this.engine.stop();
    await this.engine.setupTransport(bpm);
    this.engine.scheduleChords(events);
    const seekBeat = ref.seekBeat ?? 1;
    const tick = (seekBeat - 1) * TICKS_PER_BEAT;
    window.Tone.Transport.ticks = tick;
    await this.engine.play();
  }

  stop() {
    this.engine.stop();
  }
}

const params = new URLSearchParams(window.location.search);
const refA = parseRef(params.get("a"));
const refB = parseRef(params.get("b"));
const paneA = new PanePlayer("a");
const paneB = new PanePlayer("b");
let activePane = null;

const listEl = document.getElementById("compare-pair-list");
if (refA || refB) {
  listEl.innerHTML = [
    refA ? `<li>A: ${esc(refA.slug)} / ${esc(refA.sectionType || "?")}</li>` : "",
    refB ? `<li>B: ${esc(refB.slug)} / ${esc(refB.sectionType || "?")}</li>` : "",
  ].join("");
}

async function loadBoth() {
  const tasks = [];
  if (refA) tasks.push(paneA.load(refA).catch((e) => { document.getElementById("meta-a").textContent = e.message; }));
  if (refB) tasks.push(paneB.load(refB).catch((e) => { document.getElementById("meta-b").textContent = e.message; }));
  await Promise.all(tasks);
}

document.getElementById("play-a")?.addEventListener("click", async () => {
  activePane?.stop();
  activePane = paneA;
  document.getElementById("pane-a").classList.add("compare-active");
  document.getElementById("pane-b").classList.remove("compare-active");
  await window.Tone.start();
  await paneA.play();
});
document.getElementById("play-b")?.addEventListener("click", async () => {
  activePane?.stop();
  activePane = paneB;
  document.getElementById("pane-b").classList.add("compare-active");
  document.getElementById("pane-a").classList.remove("compare-active");
  await window.Tone.start();
  await paneB.play();
});
document.getElementById("load-a")?.addEventListener("click", () => refA && paneA.load(refA));
document.getElementById("load-b")?.addEventListener("click", () => refB && paneB.load(refB));

loadBoth();
