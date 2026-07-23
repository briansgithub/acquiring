import { AudioEngine } from "./audio/engine.js";
import { createLoadingSplash } from "./components/loadingSplash.js";
import { renderControls, CONTROL_DEFAULTS } from "./components/controls.js";
import { makeCollapsible } from "./components/collapsiblePane.js";
import { renderChordRing } from "./components/chordRing.js";
import { renderQuizFreqPanel } from "./components/quiz/quizFreqPanel.js";
import { renderNoteIndicator } from "./components/noteIndicator.js";
import { renderTimeline } from "./components/timeline.js";
import { renderSongSelector } from "./components/songSelector.js";
import { renderQuizMode } from "./components/quiz/quizMode.js";
import { createQuizAudio } from "./components/quiz/quizAudio.js";
import { fetchCorpusStats, buildSongEntries, poolStats, buildFrequencyProfile, pickFrequencyBiased, entryRootDegree } from "./components/quiz/quizPool.js";
import { QuizSession } from "./lib/quizSession.js";
import { romanNumeralToHtml } from "./lib/romanNumeralCanvas.js";
import { chordInterpreter, getSongLength, parseKey, sdToToneJSNoteName } from "./lib/music.js";
import { normalizeToneNotes } from "./lib/chordVoicing.js";
import { getChordSymbol } from "./lib/jsonToSymbol.js";
import {
  arpOffsetTicks,
  arpStepMs,
  ARP_HIGHLIGHT_MAX_CYCLES,
  isArpeggiationActive as arpActive,
  sliderIndexToCyclesPerBeat,
  TICKS_PER_BEAT,
} from "./lib/timing.js";

const Tone = window.Tone;

let progressTrackingChordId = null;
let progressTrackingMelodyId = null;
let lastVisualTicks = -1;


const ringPane = document.getElementById("ring-pane");
const indicatorPane = document.getElementById("indicator-pane");
const timelinePane = document.getElementById("timeline-pane");
const selectorPane = document.getElementById("selector-pane");

const engine = new AudioEngine();
const loadingSplash = createLoadingSplash();

// State variables
let useRomanNumerals = true; // Track label mode (roman numerals vs letter labels)
let currentKey = null; // Store current key for event recalculation
let forceRootPosition = false;
let isArpeggiated = CONTROL_DEFAULTS.arpeggiated;
let arpeggiationSlider = CONTROL_DEFAULTS.arpeggiationSlider;
let arpFixedSpeed = CONTROL_DEFAULTS.arpFixedSpeed;
let arpUnlockFromTempo = CONTROL_DEFAULTS.arpUnlockFromTempo;
let quizClozeActive = false;
let quizClozeMode = "chord";
let quizClozeMaskedBeat = null;
let quizClozeCorrectChord = null;
let quizClozeStats = { correct: 0, total: 0 };
let quizMuteGapChord = false;
let statsDrawerOpen = false;
let freqPanel = null;
let quizClozeBtn = null;
let quizRootClozeBtn = null;
let quizMuteGapToggle = null;
let loopStartTick = null;
let loopEndTick = null;
let loopRestartInProgress = false;
let loopEnabled = true;
let lastProgressTick = -1;

function getArpeggioBpm() {
  return arpUnlockFromTempo ? originalBpm : currentBpm;
}

function getArpeggioOffsetTicks(noteCount) {
  let offsetTicks = arpOffsetTicks(getCyclesPerBeat(), noteCount, arpFixedSpeed);
  if (arpUnlockFromTempo && originalBpm > 0 && currentBpm !== originalBpm) {
    offsetTicks = Math.max(1, Math.round(offsetTicks * currentBpm / originalBpm));
  }
  return offsetTicks;
}

function getCyclesPerBeat() {
  return sliderIndexToCyclesPerBeat(arpeggiationSlider);
}

function isArpeggiationActive() {
  return arpActive(isArpeggiated);
}

function getArpeggioStepMs(noteCount) {
  return arpStepMs(getCyclesPerBeat(), noteCount, getArpeggioBpm(), arpFixedSpeed);
}

function shouldHighlightArpeggioNote() {
  return isArpeggiationActive() && getCyclesPerBeat() <= ARP_HIGHLIGHT_MAX_CYCLES;
}

function highlightArpeggioNote(note, noteCount) {
  if (!shouldHighlightArpeggioNote()) return;
  noteIndicator.highlightNote(note, getArpeggioStepMs(noteCount));
}

function previewChordWithSettings(notes, arpeggiate = false) {
  const playbackNotes = normalizeToneNotes(notes || []);
  const useArp = arpeggiate && isArpeggiationActive() && playbackNotes.length > 1;
  const noteCount = playbackNotes.length;
  engine.previewChord(
    playbackNotes,
    "4n",
    useArp,
    useArp ? getArpeggioStepMs(noteCount) : 100,
    useArp ? (note) => highlightArpeggioNote(note, noteCount) : null
  );
}

function interpretChord(chord, key) {
  return chordInterpreter(chord, key, { forceRootPosition });
}

function activeSectionKeyAtBeat(keys, beat, fallbackKey = currentKey) {
  if (!Array.isArray(keys) || !keys.length) return fallbackKey;
  let chosen = keys[0];
  for (const k of keys) {
    if ((k?.beat ?? 1) <= beat) chosen = k;
    else break;
  }
  if (!chosen) return fallbackKey;
  const tonic = String(chosen.tonic || fallbackKey?.tonic || "C")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/♮/g, "");
  return { tonic, scale: chosen.scale || fallbackKey?.scale || "major" };
}

let lastSyncedKeyString = null;

function syncDisplayedKeyAtBeat(beat) {
  const activeKey = activeSectionKeyAtBeat(currentSectionKeys, beat, currentKey);
  if (!activeKey) return currentKey;
  noteIndicator.setKey(activeKey);
  chordRing.setKey(activeKey);
  
  const activeKeyStr = `${activeKey.tonic}-${activeKey.scale}`;
  if (lastSyncedKeyString !== null && lastSyncedKeyString !== activeKeyStr) {
    if (typeof chordRing.setKeyFilter === "function") {
      const keyLabel = `${activeKey.tonic} ${activeKey.scale.charAt(0).toUpperCase() + activeKey.scale.slice(1)}`;
      chordRing.setKeyFilter(keyLabel);
    }
  }
  lastSyncedKeyString = activeKeyStr;
  
  return activeKey;
}

async function handleRootPositionChange(enabled) {
  forceRootPosition = enabled;
  await updatePlaybackSettings();
}

// Handler function for play/pause
async function handlePlayPause(shouldPlay) {
  if (isLoading) {
    console.warn("Cannot toggle playback while loading...");
    return;
  }
  if (!currentSong || songLength <= 0) {
    if (shouldPlay) console.warn("No song loaded — use Load in Song Selector");
    return;
  }
  if (shouldPlay) {
    // If a chord was manually previewed, revert to current chord at playback position
    if (isManualChordPreview) {
      const currentTicks = Tone.Transport.ticks;
      const currentChordInfo = findCurrentChordAtTick(currentTicks);
      if (currentChordInfo) {
        noteIndicator.updateChord(
          currentChordInfo.notes,
          currentChordInfo.root,
          currentChordInfo.degrees,
          currentChordInfo.borrowed,
          currentChordInfo.key || currentKey,
          currentChordInfo.chord
        );
        updateChordRingDisplay(currentChordInfo.chord, currentTicks);
      } else {
        noteIndicator.reset();
        chordRing.update(null);
      }
      isManualChordPreview = false;
    }
    
    // Check if song has ended and needs to be restarted
    // If parts are empty (song ended and stop() was called) or transport is at/past the end
    // Use Ticks for reliable end-of-song check
    const totalTicks = lastReleaseTick > 0 ? lastReleaseTick : songLength * 192;
    const wasPaused = Tone.Transport.state === "paused";
    
    if (engine.parts.length === 0 || Tone.Transport.ticks >= totalTicks) {
      console.log("Restarting song from beginning...");
      // Reset transport position and reschedule parts with current tempo
      // Release all notes first to prevent stuck notes
      engine.releaseAllNotes();
      engine.stop();
      currentSecondsPerBeat = 60 / currentBpm;
      const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
      const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);
      currentMelodyEvents = melodyEvents;
      currentChordEvents = chordEvents;
      lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);
      await engine.setupTransport(currentBpm);
      engine.scheduleMelody(melodyEvents);
      engine.scheduleChords(chordEvents);
      controls.updateProgress(0);
      syncDisplayedKeyAtBeat(1);
      chordRing.update(null, null, null);
      noteIndicator.reset();
      timeline.updateProgress(0);
      setupProgressTracking();
    } else if (wasPaused && engine.parts.length > 0) {
      // Parts were canceled during pause, reschedule from current position
      const currentTicks = Tone.Transport.ticks;
      engine.rescheduleParts(currentMelodyEvents, currentChordEvents);
      // Restore position after rescheduling
      Tone.Transport.ticks = currentTicks;
    }
    // Ensure tick tracking is registered even if the section was loaded through a path
    // that skipped setupProgressTracking (cache/state restore edge cases).
    setupProgressTracking();
    await engine.play();
  } else {
    engine.pause();
  }
  controls.setPlayState(shouldPlay);
}

const chordRing = renderChordRing(ringPane, {
  isChordMasked: (chord) => {
    return quizClozeActive && chord && Number(quizClozeMaskedBeat) === Number(chord.beat);
  },
  findProgressionPreviousChord: (chord) => {
    if (!quizClozeActive || !chord) return undefined;
    const beat = chord.beat === 0 ? 1 : chord.beat;
    return findChordBeforeTick((beat - 1) * 192);
  },
  getForceRootPosition: () => forceRootPosition,
  getArpeggiated: () => isArpeggiationActive(),
  onChordClick: (chordData, arpeggiate = false) => {
    isManualChordPreview = true;
    previewChordWithSettings(chordData.notes, arpeggiate);
    noteIndicator.updateChord(chordData.notes, chordData.root, chordData.chordDegrees, chordData.borrowed, currentKey, chordData.chord);
  },
  onNotePlay: (note) => {
    engine.startPreviewNote(note);
  },
  onNoteRelease: () => {
    engine.stopPreviewNote();
  },
  onDroneVolumeChange: (volume) => {
    engine.setDroneVolume(volume);
  },
  labelMode: useRomanNumerals,
  onPhraseClick: ({ firstBeat }) => {
    if (!Number.isFinite(firstBeat)) return;
    jumpToPhraseMeasure(firstBeat);
  },
  onLabelModeChange: (useRoman) => {
    useRomanNumerals = useRoman;
    noteIndicator.setLabelMode(useRomanNumerals);
    if (currentKey) {
      chordRing.setLabelMode(useRomanNumerals, currentKey);
      // Redraw chord ring
      if (currentRawChords) {
        chordRing.setSongData(currentRawChords, currentKey);
        const currentTicks = Tone.Transport.ticks;
        const currentChordInfo = findCurrentChordAtTick(currentTicks);
        if (currentChordInfo) {
          updateChordRingDisplay(currentChordInfo.chord, currentTicks);
        }
      }
    }
  },
  onColorSchemeChange: (scheme) => {
    timeline.setColorScheme(scheme);
  }
});
// Setup stats drawer inside ringPane
ringPane.style.position = "relative";
const statsDrawer = document.createElement("div");
statsDrawer.id = "ring-stats-drawer";
statsDrawer.style.cssText = "position: absolute; bottom: 0; left: 0; right: 0; height: 60%; background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(8px); border-top: 1px solid var(--divider); display: none; flex-direction: column; z-index: 100; border-radius: 0 0 12px 12px; padding: 12px; box-sizing: border-box; overflow-y: auto;";
ringPane.appendChild(statsDrawer);

const statsCtx = {
  getSongKey: () => loadedCacheKey || (currentSong ? currentSong.artist + "_" + currentSong.title : null),
  getSectionStats: () => {
    if (!currentRawChords) return null;
    const entries = buildQuizSongContext()?.entries || [];
    return poolStats(entries);
  },
  get session() { return quizSession; },
  romanHtml: romanNumeralToHtml,
  chordRing: chordRing,
};

freqPanel = renderQuizFreqPanel(statsDrawer, statsCtx);

// Get button and panel references from chordRing API
quizClozeBtn = chordRing.getQuizClozeBtn();
quizRootClozeBtn = chordRing.getQuizRootClozeBtn();
quizMuteGapToggle = chordRing.getQuizMuteGapToggle();
const statsBtn = chordRing.getStatsBtn();
const quizClozeNextBtn = chordRing.getQuizClozeNextBtn();

if (quizClozeBtn) {
  quizClozeBtn.addEventListener("click", () => {
    handleToggleCloze("chord");
  });
}

if (quizRootClozeBtn) {
  quizRootClozeBtn.addEventListener("click", () => {
    handleToggleCloze("root");
  });
}

quizMuteGapToggle?.addEventListener("change", () => {
  quizMuteGapChord = quizMuteGapToggle.checked;
  if (quizClozeActive) {
    updatePlaybackSettings().catch((err) =>
      console.error("Failed to update gap mute setting:", err),
    );
  }
});

if (quizClozeNextBtn) {
  quizClozeNextBtn.addEventListener("click", () => {
    nextClozeQuestion();
  });
}

statsBtn.addEventListener("click", () => {
  statsDrawerOpen = !statsDrawerOpen;
  if (statsDrawerOpen) {
    statsDrawer.style.display = "flex";
    statsBtn.style.background = "rgba(34, 211, 238, 0.2)";
    statsBtn.style.borderColor = "#22d3ee";
    statsBtn.style.color = "#22d3ee";
    freqPanel.refresh();
  } else {
    statsDrawer.style.display = "none";
    statsBtn.style.background = "#1e293b";
    statsBtn.style.borderColor = "#334155";
    statsBtn.style.color = "#94a3b8";
  }
});

const noteIndicator = renderNoteIndicator(indicatorPane, {
  isChordMasked: (chord) => {
    return quizClozeActive && chord && Number(quizClozeMaskedBeat) === Number(chord.beat);
  },
  isRootOnlyDisplay: () => isRootClozePlayback(),
  labelMode: useRomanNumerals,
  onNoteClick: (note, { isChord = false } = {}) => {
    let duration = "4n";
    let durationMs = undefined;
    if (document.getElementById("app").classList.contains("quiz-mode")) {
      durationMs = getArpeggioStepMs(3);
      duration = (durationMs / 1000) + "s";
    }
    if (isChord) {
      const ms = engine.previewNote(note, duration);
      noteIndicator.highlightNote(note, durationMs || ms);
      return;
    }
    engine.previewMelodyNote(note, duration);
  },
  onRootPositionChange: handleRootPositionChange,
  onArpeggiateToggle: (enabled) => {
    isArpeggiated = enabled;
    updatePlaybackSettings();
  },
  onArpeggiateSliderChange: (sliderIndex) => {
    arpeggiationSlider = sliderIndex;
    if (arpDebounceTimer) clearTimeout(arpDebounceTimer);
    arpDebounceTimer = setTimeout(() => {
      updatePlaybackSettings();
    }, 150);
  },
  onArpFixedSpeedChange: (enabled) => {
    arpFixedSpeed = enabled;
    updatePlaybackSettings();
  },
  onArpUnlockFromTempoChange: (enabled) => {
    arpUnlockFromTempo = enabled;
    updatePlaybackSettings();
  },
  onMelodyVolumeChange: (volume) => engine.setMelodyVolume(volume),
  onChordVolumeChange: (volume) => engine.setChordVolume(volume),
  key: currentKey
});

const controls = renderControls({
  topContainer: indicatorPane.querySelector("#now-playing-controls"),
  tempoContainer: indicatorPane.querySelector("#now-playing-tempo"),
  footerContainer: indicatorPane.querySelector("#now-playing-footer"),
  playbackContainer: ringPane.querySelector("#ring-playback-controls"),
}, {
  onPlayPause: handlePlayPause,
  onRestart: async () => {
    await restartSectionFromBeginning({ autoPlay: false });
  },
  onSectionChange: handleSectionChange,
  onTempoChange: (tempo) => {
    currentBpm = tempo;
    currentSecondsPerBeat = 60 / tempo;
    engine.setTempo(tempo);
    if (isArpeggiationActive() && arpUnlockFromTempo) {
      if (tempoDebounceTimer) clearTimeout(tempoDebounceTimer);
      tempoDebounceTimer = setTimeout(() => {
        updatePlaybackSettings();
      }, 250);
    }
  },
  onResetDefaults: () => {
    isArpeggiated = CONTROL_DEFAULTS.arpeggiated;
    arpeggiationSlider = CONTROL_DEFAULTS.arpeggiationSlider;
    arpFixedSpeed = CONTROL_DEFAULTS.arpFixedSpeed;
    arpUnlockFromTempo = CONTROL_DEFAULTS.arpUnlockFromTempo;
    forceRootPosition = false;
    noteIndicator.setRootPositionChecked(false);
    noteIndicator.resetArpToDefaults();
    noteIndicator.resetVolumesToDefaults();
    controls.resetSlidersToDefaults();
    engine.setMelodyVolume(CONTROL_DEFAULTS.melodyVolume);
    engine.setChordVolume(CONTROL_DEFAULTS.chordVolume);
    currentBpm = originalBpm;
    currentSecondsPerBeat = 60 / originalBpm;
    engine.setTempo(currentBpm);
    
    loopStartTick = null;
    loopEndTick = null;
    loopEnabled = true;
    controls.setLoopChecked(true);
    updateTimelineLoopPoints();
    
    updatePlaybackSettings();
  },
  onToggleCloze: () => handleToggleCloze(),
  onToggleLoop: (checked) => {
    loopEnabled = checked;
    updateTimelineLoopPoints();
  },
});

const melodyVolumeSlider = document.getElementById("melody-volume");
const chordVolumeSlider = document.getElementById("chord-volume");
if (melodyVolumeSlider) {
  engine.setMelodyVolume(Number(melodyVolumeSlider.value));
}
if (chordVolumeSlider) {
  engine.setChordVolume(Number(chordVolumeSlider.value));
}

const timeline = renderTimeline(timelinePane, {
  getArpeggiated: () => isArpeggiationActive(),
  onSeek: handleSeek,
  onChordClick: (chord, arpeggiate = false) => {
    if (!currentKey) return;
    isManualChordPreview = true;
    const chordBeat = chord.beat === 0 ? 1 : chord.beat;
    const activeKey = activeSectionKeyAtBeat(currentSectionKeys, chordBeat, currentKey);
    const chordData = interpretChord(chord, activeKey);
    if (chordData && chordData.notes && chordData.notes.length > 0) {
      previewChordWithSettings(chordData.notes, arpeggiate);
      noteIndicator.updateChord(chordData.notes, chord.root, chordData.chordDegrees, chord.borrowed, activeKey, chord);
    }
  }
});



const songSelector = renderSongSelector(selectorPane, {
  isSongLoaded: (cacheKey) => !!cacheKey && cacheKey === loadedCacheKey,
  onSongPageOpen: () => {
    clearPlayerState();
    loadedCacheKey = null;
  },
  onLoadStart: () => {
    clearPlayerState();
    loadedCacheKey = null;
    loadingSplash.show();
  },
  onLoad: async ({ cacheKey }) => {
    try {
      let idx = library.findIndex((s) => s.artist === cacheKey);
      if (idx < 0) {
        const res = await fetch(`/api/songs/entry?key=${encodeURIComponent(cacheKey)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const entry = await res.json();
        library.push(entry);
        idx = library.length - 1;
      }
      loadedCacheKey = cacheKey;
      handleSongChange(String(idx));
    } catch (err) {
      console.error("Selector load failed:", err);
      loadingSplash.hide();
    }
  },
});

const selectorCollapsible = makeCollapsible(selectorPane, {
  collapseClass: "selector",
  label: "Songs",
  expandedWidth: 310,
});
let selectorExpandedBeforeQuiz = true;

// Add keyboard support for spacebar, a, b, and c keys
document.addEventListener("keydown", (event) => {
  const isInput = event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA";
  if (isInput) return;

  if (event.code === "Space") {
    event.preventDefault();
    const isPlaying = Tone.Transport.state === "started";
    handlePlayPause(!isPlaying);
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "a") {
    event.preventDefault();
    const currentTicks = Tone.Transport.ticks;
    loopStartTick = currentTicks;
    if (loopEndTick !== null && loopStartTick >= loopEndTick) {
      loopEndTick = null;
    }
    updateTimelineLoopPoints();
    console.log(`Loop start point set to tick ${loopStartTick}`);
  } else if (key === "b") {
    event.preventDefault();
    const currentTicks = Tone.Transport.ticks;
    if (loopStartTick === null) {
      loopStartTick = 0;
    }
    if (currentTicks <= loopStartTick) {
      console.warn("Cannot set end loop point B before or at start loop point A.");
    } else {
      loopEndTick = currentTicks;
      updateTimelineLoopPoints();
      console.log(`Loop end point set to tick ${loopEndTick}`);
    }
  } else if (key === "c") {
    event.preventDefault();
    loopStartTick = null;
    loopEndTick = null;
    updateTimelineLoopPoints();
    console.log("Loop points cleared.");
  }
});

let library = [];
let currentSongIdx = 0;
let currentSong = null;
let currentSectionIdx = 0;
let songLength = 0;
let lastReleaseTick = 0;
let currentSecondsPerBeat = 0;
let currentMelodyEvents = [];
let currentChordEvents = [];
let currentBpm = 120;
let originalBpm = 120; // Store the original tempo from the loaded section
let currentRawNotes = []; // Store raw note data for tempo recalculation
let currentRawChords = []; // Store raw chord data for tempo recalculation
let currentSectionKeys = [];
let isLoading = false;
let arpDebounceTimer = null;
let tempoDebounceTimer = null;
let isManualChordPreview = false; // Track when chord is manually clicked
let sectionLoopInProgress = false;

let loadedCacheKey = null;
let quizMode = null;

function buildQuizSongContext() {
  if (!currentRawChords?.length || !currentKey) return null;
  const entries = buildSongEntries(currentRawChords, currentSectionKeys, currentKey, interpretChord);
  return {
    key: currentKey,
    scale: currentKey.scale,
    entries,
    interpret: interpretChord,
  };
}

function getLoadedSongTitle() {
  const song = library[resolveSongIndex(currentSongIdx)];
  if (!song || !currentRawChords?.length) return null;
  const artist = song.artist ? `${song.artist} — ` : "";
  return `${artist}${song.title || "Unknown"}`;
}

function getLoadedSectionName() {
  const song = library[resolveSongIndex(currentSongIdx)];
  if (!song || !currentRawChords?.length) return null;
  const section = song.sections?.[currentSectionIdx];
  return section?.name || (song.sections?.length > 1 ? `Section ${currentSectionIdx + 1}` : null);
}

function getLoadedSongLabel() {
  const title = getLoadedSongTitle();
  if (!title) return null;
  const section = getLoadedSectionName();
  return section ? `${title} — ${section}` : title;
}

function clearPlayerState() {
  engine.releaseAllNotes();
  engine.cancelAllParts();
  engine.stop();
  currentSong = null;
  songLength = 0;
  lastReleaseTick = 0;
  currentRawNotes = [];
  currentRawChords = [];
  currentSectionKeys = [];
  currentMelodyEvents = [];
  currentChordEvents = [];
  currentKey = null;
  isManualChordPreview = false;
  controls.setPlaybackVisible(false);
  controls.resetPlayState();
  controls.setSections([]);
  noteIndicator.reset();
  noteIndicator.setKey(null);
  chordRing.setSongData([], null);
  chordRing.update(null, null, null);
  chordRing.updateTransitions([], []);
  ringPane?.classList.add("disabled");
  timeline.setSongData([], null, 0);
  timeline.setSongInfo(null, null);
  timeline.updateProgress(0);
  
  loopStartTick = null;
  loopEndTick = null;
  updateTimelineLoopPoints();
  
  progressTrackingChordId = null;
  progressTrackingMelodyId = null;
  lastVisualTicks = -1;
  
  quizMode?.refresh();
}

function updateTimelineLoopPoints() {
  const totalTicks = songLength * 192;
  
  if (loopEnabled) {
    const startRatio = loopStartTick !== null ? loopStartTick / totalTicks : null;
    const endRatio = loopEndTick !== null ? loopEndTick / totalTicks : null;
    timeline.setLoopPoints(startRatio, endRatio);
  } else {
    timeline.setLoopPoints(null, null);
  }

  // Sync native Tone.Transport loop settings
  const ToneObj = window.Tone;
  if (ToneObj && ToneObj.Transport) {
    if (loopEnabled && loopStartTick !== null && loopEndTick !== null && !quizClozeActive) {
      const newStart = ToneObj.Time(loopStartTick + "i").toSeconds();
      const newEnd = ToneObj.Time(loopEndTick + "i").toSeconds();
      // Safe update order: ensure loopStart <= loopEnd at all times
      ToneObj.Transport.loopStart = 0;
      ToneObj.Transport.loopEnd = newEnd;
      ToneObj.Transport.loopStart = newStart;
      ToneObj.Transport.loop = true;
    } else {
      ToneObj.Transport.loop = false;
    }
  }
}

function resetIdleState() {
  currentSongIdx = 0;
  loadedCacheKey = null;
  currentSectionIdx = 0;
  clearPlayerState();
}

function resolveSongIndex(preferredIndex = currentSongIdx) {
  if (!loadedCacheKey || !library.length) return preferredIndex;
  const idx = library.findIndex((s) => s.artist === loadedCacheKey);
  return idx >= 0 ? idx : preferredIndex;
}

function init() {
  // Playback library loads on demand via /api/songs/entry when user picks a song.
  const hadSong = !!currentSong;
  if (hadSong && loadedCacheKey) {
    const idx = resolveSongIndex(currentSongIdx);
    if (idx !== currentSongIdx) currentSongIdx = idx;
  }
  if (!hadSong) {
    resetIdleState();
  }
}

const quizPane = document.getElementById("quiz-pane");
const quizCollapsible = makeCollapsible(quizPane, {
  collapseClass: "quiz",
  label: "Quiz",
  expandedWidth: 290,
  startCollapsed: true,
});
const quizAudio = createQuizAudio();
const quizSession = new QuizSession();

init();



let corpusStats = null;

function getSectionStats() {
  const songCtx = buildQuizSongContext();
  if (!songCtx?.entries?.length) return null;
  return poolStats(songCtx.entries);
}

if (quizPane) {
  const quizContentEl = quizPane.querySelector(".pane-content") || quizPane;
  quizMode = renderQuizMode(quizContentEl, {
    getSongContext: buildQuizSongContext,
    getSongTitle: getLoadedSongTitle,
    getSectionName: getLoadedSectionName,
    getSongLabel: getLoadedSongLabel,
    getSongKey: () => loadedCacheKey || library[resolveSongIndex(currentSongIdx)]?.artist || null,
    getSectionStats,
    getSections: () => {
      const song = library[resolveSongIndex(currentSongIdx)];
      return song?.sections ?? [];
    },
    getSectionIndex: () => currentSectionIdx,
    setSectionIndex: (idx) => {
      loadSection(resolveSongIndex(currentSongIdx), idx).catch((err) =>
        console.error("Quiz section change failed:", err),
      );
    },
    getCorpus: async () => {
      if (!corpusStats) corpusStats = await fetchCorpusStats();
      return corpusStats;
    },
    audio: quizAudio,
    session: quizSession,
    romanHtml: romanNumeralToHtml,
    chordRing,
    timeline,
    getFrequencyProfile: () => {
      const songCtx = buildQuizSongContext();
      return songCtx?.entries ? buildFrequencyProfile(songCtx.entries) : null;
    },
    get isArpeggiated() { return isArpeggiated; },
    get arpeggiationSlider() { return arpeggiationSlider; },
    setArpeggiated: (enabled) => {
      isArpeggiated = enabled;
      updatePlaybackSettings();
      noteIndicator.setArpeggiated?.(enabled);
    },
    setArpSlider: (index) => {
      arpeggiationSlider = index;
      updatePlaybackSettings();
      noteIndicator.setArpeggiationSlider?.(index);
    },
    setTempo: (bpm) => {
      if (!Number.isFinite(bpm) || bpm < 20) return;
      currentBpm = bpm;
      currentSecondsPerBeat = 60 / bpm;
      engine.setTempo(bpm);
      controls.setTempo?.(bpm);
    },
  });
}

const appEl = document.getElementById("app");
const modePlayerBtn = document.getElementById("mode-player");
const modeQuizBtn = document.getElementById("mode-quiz");

function setAppMode(mode, { stopQuiz = true } = {}) {
  if (stopQuiz && quizClozeActive) {
    stopClozeQuiz();
  }

  const quiz = mode === "quiz";
  if (quiz) {
    selectorExpandedBeforeQuiz = !selectorCollapsible.isCollapsed();
    selectorCollapsible.setCollapsed(true);
  } else {
    selectorCollapsible.setCollapsed(!selectorExpandedBeforeQuiz);
  }
  appEl?.classList.toggle("quiz-mode", quiz);
  modePlayerBtn?.classList.toggle("active", !quiz);
  modeQuizBtn?.classList.toggle("active", quiz);
  if (quiz) {
    if (!corpusStats) {
      fetchCorpusStats().then((stats) => {
        corpusStats = stats;
      });
    }
    // Initialize frequency overlay on ring
    const profile = buildQuizSongContext()?.entries
      ? buildFrequencyProfile(buildQuizSongContext().entries)
      : null;
    if (profile && typeof chordRing.setFrequencyOverlay === 'function') {
      chordRing.setFrequencyOverlay(profile.symbolCounts);
    }
    // Force ring and timeline relayout after CSS grid change
    requestAnimationFrame(() => {
      if (typeof chordRing.setKey === 'function' && currentKey) {
        chordRing.setSongData(currentRawChords, currentKey);
      }
      if (typeof timeline.forceRelayout === 'function') {
        timeline.forceRelayout();
      }
    });
    quizMode?.refresh();
  } else {
    // Clear quiz overlays when returning to player mode
    if (typeof chordRing.clearQuizOverlays === 'function') {
      chordRing.clearQuizOverlays();
    }
    if (typeof timeline.clearQuizOverlays === 'function') {
      timeline.clearQuizOverlays();
    }
    // Force relayout after CSS grid change back to player
    requestAnimationFrame(() => {
      if (typeof chordRing.setKey === 'function' && currentKey) {
        chordRing.setSongData(currentRawChords, currentKey);
      }
      if (typeof timeline.forceRelayout === 'function') {
        timeline.forceRelayout();
      }
    });
  }
}

modePlayerBtn?.addEventListener("click", () => setAppMode("player"));
modeQuizBtn?.addEventListener("click", () => setAppMode("quiz"));

async function loadSection(songIndex, sectionIndex) {
  if (isLoading) return;
  isLoading = true;
  loadingSplash.show();

  loopStartTick = null;
  loopEndTick = null;
  updateTimelineLoopPoints();

  try {
    engine.cancelAllParts();
    engine.releaseAllNotes();
    setTimeout(() => {
      engine.releaseAllNotes();
    }, 5);
    engine.stop();
    setTimeout(() => {
      engine.releaseAllNotes();
    }, 10);

    songIndex = resolveSongIndex(songIndex);
    const song = library[songIndex];
    if (!song) {
      console.warn("No song at index", songIndex);
      return;
    }
    const section = song?.sections?.[sectionIndex];
    if (!section) {
      console.warn("No section at index", sectionIndex, "for song", song);
      controls.setSections([]);
      return;
    }

    const data = await fetch(`/api/song?file=${encodeURIComponent(section.relPath)}`).then(async (r) => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status} ${text}`);
      }
      return r.json();
    });
    currentSong = data;
    currentSongIdx = songIndex;
    currentSectionIdx = sectionIndex;
    loadedCacheKey = song.artist;

    currentSectionKeys = Array.isArray(data.metadata?.keys)
      ? [...data.metadata.keys].sort((a, b) => (a?.beat ?? 1) - (b?.beat ?? 1))
      : [];
    const key = parseKey(data.metadata);
    currentKey = key;
    const bpm = data.metadata?.tempos?.[0]?.bpm ?? 120;
    originalBpm = bpm;
    currentBpm = bpm;
    currentSecondsPerBeat = 60 / bpm;
    songLength = getSongLength(data.metadata) || 1;

    const notesArray = Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(data.notes?.melody1)
        ? data.notes.melody1
        : [];

    // Store raw data for tempo recalculation
    currentRawNotes = notesArray;
    currentRawChords = data.chords || [];

    const melodyEvents = createMelodyEvents(notesArray, key, currentSectionKeys);
    const chordEvents = createChordEvents(currentRawChords, key, currentSectionKeys);

    // Calculate actual section length in BEATS from raw data
    // (metadata length is often just an estimate or in bars)
    const allEventEnds = [
      ...notesArray.map((n) => (n.beat === 0 ? 1 : n.beat) + n.duration),
      ...currentRawChords.map((c) => (c.beat === 0 ? 1 : c.beat) + c.duration),
    ];
    if (allEventEnds.length > 0) {
      const actualSectionLength = Math.max(...allEventEnds);
      songLength = actualSectionLength;
    }
    // If no events, keep songLength from metadata (ensure it's treated as beats)

    // Store events for potential restart
    currentMelodyEvents = melodyEvents;
    currentChordEvents = chordEvents;
    lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);

    console.log("Scheduling events for new section...");
    // Ensure transport is fully stopped and reset before scheduling new events
    // This prevents events from firing immediately when switching songs during playback
    engine.stop();
    await engine.setupTransport(bpm);
    // Double-check transport is stopped and reset before scheduling
    // This is critical when switching songs during playback
    const Tone = window.Tone;
    // Force stop transport and reset position/ticks to ensure clean state
    if (Tone.Transport.state !== "stopped") {
      Tone.Transport.stop();
    }
    Tone.Transport.position = 0;
    Tone.Transport.ticks = 0;
    // Ensure transport remains stopped (song should be paused until play is pressed)
    engine.scheduleMelody(melodyEvents);
    engine.scheduleChords(chordEvents);
    
    // Initialize lastSyncedKeyString to the section's base key so we don't immediately trigger a dropdown change on play
    if (currentSectionKeys && currentSectionKeys.length > 0) {
       const fk = currentSectionKeys[0] || { tonic: "C", scale: "major" };
       lastSyncedKeyString = `${fk.tonic}-${fk.scale}`;
    } else {
       lastSyncedKeyString = "C-major";
    }

    controls.setSections(song.sections);
    const sectionSelect = document.getElementById("section-select");
    if (sectionSelect) sectionSelect.value = sectionIndex;

    noteIndicator.setKey(key);
    chordRing.setKey(key);
    // Update tempo slider to match loaded section's tempo (100% = original tempo)
    controls.setTempo(bpm, originalBpm);
    // Reset progress to 0 for both controls and timeline
    controls.updateProgress(0);
    timeline.updateProgress(0);
    // Ensure play state is reset (paused) - song should be paused until play is pressed
    controls.resetPlayState();
    chordRing.setSongData(currentRawChords, currentKey);
    chordRing.update(null, null, null);
    timeline.setSongData(currentRawChords, currentKey, songLength, data.metadata);
    timeline.setSongInfo(song.title, song.artist, song.url || data.metadata?.url);
    timeline.forceRelayout();
    requestAnimationFrame(() => timeline.forceRelayout());
    noteIndicator.reset();
    
    // Compute all chord transitions for the entire section
    const transitionData = computeChordTransitions(currentRawChords, currentKey, currentSectionKeys, currentKey);
    chordRing.updateTransitions(
      transitionData.full,
      transitionData.rootOnly,
      transitionData.fullLongestPhrases,
      transitionData.rootLongestPhrases,
      transitionData.fullPhraseFirstBeats,
      transitionData.rootPhraseFirstBeats,
      transitionData.fullTransitionFirstBeats,
      transitionData.rootTransitionFirstBeats,
      transitionData.fullAllSubstringCounts,
      transitionData.rootAllSubstringCounts,
      transitionData.fullAllSubstringFirstBeats,
      transitionData.rootAllSubstringFirstBeats,
      transitionData.perKey,
      transitionData.keyLabels
    );

    // Update indicator immediately with the first chord if it starts at beat 0 or 1
    // This fixes the issue where the first chord plays but indicator doesn't show until second chord
    if (currentRawChords && currentRawChords.length > 0) {
      const firstChord = currentRawChords.find(c => !c.isRest);
      if (firstChord && (firstChord.beat === 0 || firstChord.beat === 1)) {
        const firstChordBeat = firstChord.beat === 0 ? 1 : firstChord.beat;
        const activeKey = activeSectionKeyAtBeat(currentSectionKeys, firstChordBeat, currentKey);
        const chordData = interpretChord(firstChord, activeKey);
        noteIndicator.updateChord(
          chordData.notes,
          firstChord.root,
          chordData.chordDegrees,
          firstChord.borrowed,
          activeKey,
          firstChord
        );
        updateChordRingDisplay(firstChord, (firstChordBeat - 1) * 192);
      }
    }

    setupProgressTracking();
    controls.setPlaybackVisible(true);
    quizMode?.refresh({ remount: true });
    if (typeof statsDrawerOpen !== "undefined" && statsDrawerOpen) {
      freqPanel?.refresh();
    }
    console.log("Section loaded successfully.");
    ringPane?.classList.remove("disabled");
  } catch (err) {
    console.error("Error during playback setup in loadSection:", err);
  } finally {
    isLoading = false;
    loadingSplash.hide();
  }
}

async function restartSectionFromBeginning({ autoPlay = false, startTick = null } = {}) {
  if (!currentSong || songLength <= 0) return;
  engine.releaseAllNotes();
  engine.stop();
  currentSecondsPerBeat = 60 / currentBpm;
  const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
  const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);
  currentMelodyEvents = melodyEvents;
  currentChordEvents = chordEvents;
  lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);
  await engine.setupTransport(currentBpm);
  engine.scheduleMelody(melodyEvents);
  engine.scheduleChords(chordEvents);
  
  if (startTick !== null) {
    seekTransportToTick(startTick);
  } else {
    controls.updateProgress(0);
    timeline.updateProgress(0);
    syncDisplayedKeyAtBeat(1);
    lastProgressTick = -1;
    lastVisualTicks = -1;
    progressTrackingChordId = null;
    progressTrackingMelodyId = null;
  }
  
  chordRing.update(null, null, null);
  noteIndicator.reset();
  setupProgressTracking();
  
  if (startTick !== null) {
    syncChordDisplayAtTick(startTick, { force: true });
  }
  
  if (autoPlay) {
    await engine.play();
    if (startTick !== null) {
      seekTransportToTick(startTick);
      syncChordDisplayAtTick(startTick, { force: true });
    }
    controls.setPlayState(true);
  } else {
    controls.resetPlayState();
  }
}


function startVisualPlaybackLoop() {
  function tick() {
    requestAnimationFrame(tick);
    
    const ToneObj = window.Tone;
    if (!ToneObj || ToneObj.Transport.state !== "started" || !currentSong || songLength <= 0) {
      return;
    }
    
    const currentTicks = ToneObj.Transport.ticks;
    if (currentTicks === lastVisualTicks) {
      return;
    }
    lastVisualTicks = currentTicks;
    
    const totalTicks = songLength * 192;
    const ratio = totalTicks > 0 ? Math.min(1, currentTicks / totalTicks) : 0;
    const currentBeat = (currentTicks / 192) + 1;
    
    syncDisplayedKeyAtBeat(currentBeat);
    controls.updateProgress(ratio);
    timeline.updateProgress(ratio);
    
    // Update melody display (including rests) based on current position
    const currentMelodyInfo = findCurrentMelodyAtTick(currentTicks);
    const currentMelodyId = currentMelodyInfo ? 
      `${currentMelodyInfo.note?.beat || 'none'}-${currentMelodyInfo.note?.duration || 'none'}-${currentMelodyInfo.isRest || false}` : 
      'none';
    
    if (currentMelodyId !== progressTrackingMelodyId) {
      progressTrackingMelodyId = currentMelodyId;
      if (currentMelodyInfo) {
        if (currentMelodyInfo.isRest) {
          noteIndicator.updateMelody(null, null);
        } else {
          noteIndicator.updateMelody(currentMelodyInfo.absoluteLabel, currentMelodyInfo.relativeLabel);
        }
      } else {
        noteIndicator.updateMelody(null, null);
      }
    }
    
    // Update chord display (including rests) based on current position
    const currentChordInfo = findCurrentChordAtTick(currentTicks);
    const currentChordId = currentChordInfo ? 
      `${currentChordInfo.chord?.beat || 'none'}-${currentChordInfo.chord?.duration || 'none'}-${currentChordInfo.chord?.isRest || false}` : 
      'none';
    
    if (currentChordId !== progressTrackingChordId) {
      if (shouldSyncChordDisplayAtTick(currentTicks)) {
        progressTrackingChordId = currentChordId;
        syncChordDisplayAtTick(currentTicks);
      }
    }
  }
  requestAnimationFrame(tick);
}

// Start the loop immediately
startVisualPlaybackLoop();

function findChordBeforeTick(tickPosition) {
  if (!currentRawChords?.length) return null;
  const currentBeat = tickPosition / 192 + 1;
  let best = null;
  let bestStart = -Infinity;
  for (const chord of currentRawChords) {
    if (chord.isRest) continue;
    const start = chord.beat === 0 ? 1 : chord.beat;
    if (start < currentBeat && start > bestStart) {
      bestStart = start;
      best = chord;
    }
  }
  return best;
}

function updateChordRingDisplay(chord, tickPosition = null) {
  if (!chord || chord.isRest) {
    chordRing.update(null);
    return;
  }
  const useProgressionPrevious = quizClozeActive && tickPosition != null;
  chordRing.update(chord, {
    previousChord: useProgressionPrevious ? findChordBeforeTick(tickPosition) : undefined,
  });
}

function getClozeLoopDisplayBounds() {
  if (!quizClozeActive || loopStartTick == null || loopEndTick == null) return null;
  return {
    start: loopStartTick,
    end: loopEndTick,
  };
}

function shouldSyncChordDisplayAtTick(tick) {
  if (loopRestartInProgress) return false;
  const bounds = getClozeLoopDisplayBounds();
  if (!bounds) return true;
  const ok = tick >= bounds.start && tick < bounds.end;
  return ok;
}

function syncChordDisplayAtTick(tickPosition, { force = false } = {}) {
  if (!force && !shouldSyncChordDisplayAtTick(tickPosition)) return;
  const chordInfo = findCurrentChordAtTick(tickPosition);
  if (!chordInfo?.chord) {
    chordRing.update(null);
    noteIndicator.reset();
    return;
  }
  const quizDisplay = chordQuizDisplayData(
    chordInfo.chord,
    chordInfo.key || currentKey,
    chordInfo.chordData || interpretChord(chordInfo.chord, chordInfo.key || currentKey),
  );
  noteIndicator.updateChord(
    quizDisplay.notes,
    chordInfo.root,
    quizDisplay.degrees,
    chordInfo.borrowed,
    chordInfo.key || currentKey,
    chordInfo.chord,
  );
  updateChordRingDisplay(chordInfo.chord, tickPosition);
}

function handleLoopPointRestart(time, reason) {
  if (loopStartTick == null || loopRestartInProgress) return;
  loopRestartInProgress = true;
  const playbackTick = loopStartTick;
  const wasStarted = Tone.Transport.state === "started";
  engine.releaseAllNotes(time);
  if (window.Tone?.Draw) window.Tone.Draw.cancel();
  if (wasStarted) Tone.Transport.pause();
  Tone.Transport.ticks = playbackTick;
  engine.rescheduleChordPart(currentChordEvents);
  syncChordDisplayAtTick(playbackTick, { force: true });
  const loopChordInfo = findCurrentChordAtTick(playbackTick);
  progressTrackingChordId = loopChordInfo
    ? `${loopChordInfo.chord?.beat || "none"}-${loopChordInfo.chord?.duration || "none"}-${loopChordInfo.chord?.isRest || false}`
    : "none";
  progressTrackingMelodyId = null;
  lastVisualTicks = -1;
  lastProgressTick = playbackTick;
  if (wasStarted) Tone.Transport.start();
  loopRestartInProgress = false;
}

function setupProgressTracking() {
  lastProgressTick = -1;
  engine.onTick((currentTicks, time) => {
    // songLength is in Beats.
    // Progress calculation based on TICKS (192 PPQ) to ensure stability during tempo changes.
    // Tone.Transport.seconds is unstable/approximated during aggressive tempo ramps.
    const totalTicks = songLength * 192;
    const progressTicks = lastReleaseTick > 0 ? lastReleaseTick : totalTicks;

    const prevTick = lastProgressTick;

    // Check loop points — manual end OR Tone.Transport.loop wrap (backward jump)
    if (
      loopEnabled &&
      loopStartTick !== null &&
      loopEndTick !== null
    ) {
      const crossedLoopEnd = prevTick >= 0 && prevTick < loopEndTick && currentTicks >= loopEndTick;
      const toneWrapped = prevTick >= loopEndTick - 96
        && currentTicks <= loopStartTick + 96
        && currentTicks < prevTick - 48;
      if (crossedLoopEnd || toneWrapped) {
        handleLoopPointRestart(time, crossedLoopEnd ? "manual" : "wrapped");
        return;
      }
    }

    lastProgressTick = currentTicks;

    // Loop to beginning when section ends
    if (
      lastReleaseTick > 0 &&
      currentTicks > lastReleaseTick &&
      Tone.Transport.state === "started" &&
      !sectionLoopInProgress
    ) {
      sectionLoopInProgress = true;
      const clozeRestartTick = quizClozeActive && loopStartTick != null
        ? loopStartTick
        : null;
      restartSectionFromBeginning({ autoPlay: true, startTick: clozeRestartTick }).finally(() => {
        sectionLoopInProgress = false;
      });
      return;
    }
  });
}

function handleSeek(ratio, time) {
  if (!currentSong || songLength <= 0) return;
  // Store current playback state
  const wasPlaying = Tone.Transport.state === "started";
  
  // Clear visual tracking cache to force updates on next animation frame
  progressTrackingChordId = null;
  progressTrackingMelodyId = null;
  lastVisualTicks = -1;
  
  // CRITICAL: Release all currently playing notes FIRST, before canceling parts
  // This ensures that any notes currently in their attack/sustain phase are stopped
  // This is especially important for arpeggiated chords which have many individual note events
  engine.releaseAllNotes(time);
  
  // Cancel all scheduled parts to prevent events from firing at wrong times
  engine.cancelAllParts();
  
  // Seek to new position
  const seconds = songLength * currentSecondsPerBeat * ratio;
  Tone.Transport.seconds = seconds;
  
  // Update note indicator with melody and chord at this position
  const currentTicks = Tone.Transport.ticks;
  const currentBeat = (currentTicks / 192) + 1;
  syncDisplayedKeyAtBeat(currentBeat);
  
  // Update melody display
  const currentMelodyInfo = findCurrentMelodyAtTick(currentTicks);
  if (currentMelodyInfo) {
    if (currentMelodyInfo.isRest) {
      noteIndicator.updateMelody(null, null);
    } else {
      noteIndicator.updateMelody(currentMelodyInfo.absoluteLabel, currentMelodyInfo.relativeLabel);
    }
  } else {
    noteIndicator.updateMelody(null, null);
  }
  
    // Update chord display
    const currentChordInfo = findCurrentChordAtTick(currentTicks);
    if (currentChordInfo) {
      syncChordDisplayAtTick(currentTicks, { force: true });
    } else {
      noteIndicator.reset();
      chordRing.update(null);
    }
  
  // Reschedule parts with current events so they're aligned with the new position
  if (currentMelodyEvents.length > 0 || currentChordEvents.length > 0) {
    engine.rescheduleParts(currentMelodyEvents, currentChordEvents);
  }
  
  // If we were playing, make sure transport is still started
  if (wasPlaying && Tone.Transport.state !== "started") {
    engine.play();
  }
  
  // Update both timeline and controls progress bars
  timeline.updateProgress(ratio);
  controls.updateProgress(ratio);
  // Reset manual preview flag when seeking
  isManualChordPreview = false;
}

function handleSongChange(songIdx) {
  if (quizClozeActive) {
    stopClozeQuiz({ restartPlayback: false });
  }
  try {
    const idx = Number(songIdx);
    const song = library[idx];
    if (!song?.sections?.length) {
      console.warn("Song has no sections:", song);
      controls.setSections([]);
      loadingSplash.hide();
      return;
    }
    controls.setSections(song.sections);
    loadSection(idx, 0).catch(err => console.error("LoadSection failed inside song change:", err));
  } catch (e) {
    console.error("HandleSongChange failed:", e);
  }
}

function handleSectionChange(idx) {
  const sectionIdx = Number(idx);
  const songIdx = resolveSongIndex(currentSongIdx);
  loadSection(songIdx, sectionIdx).catch(err => console.error("LoadSection failed inside section change:", err));
}

function getLastReleaseTick(melodyEvents, chordEvents) {
  let max = 0;
  for (const ev of [...melodyEvents, ...chordEvents]) {
    if (ev.type === "release") {
      max = Math.max(max, parseInt(ev.time, 10));
    }
  }
  return max;
}

function createMelodyEvents(notesArray, key, sectionKeys = currentSectionKeys) {
  const events = [];
  notesArray.forEach((note) => {
    if (note.isRest) return;
    const noteBeat = note.beat === 0 ? 1 : note.beat;
    const activeKey = activeSectionKeyAtBeat(sectionKeys, noteBeat, key);
    const absoluteLabel = sdToToneJSNoteName(note.sd, note.octave, activeKey, 4);
    const relativeLabel = note.sd;

    // Handle beat 0 by treating it as beat 1 (normalize to 1-based indexing)
    // XML format can have beat 0, but player expects 1-based beats
    const normalizedBeat = note.beat === 0 ? 1 : note.beat;
    const startTick = (normalizedBeat - 1) * 192;
    const endTick = startTick + (note.duration * 192);

    // Note On
    events.push({
      time: startTick + "i",
      type: "attack",
      name: absoluteLabel,
      onTrigger: () => noteIndicator.updateMelody(absoluteLabel, relativeLabel),
    });

    // Note Off
    events.push({
      time: endTick + "i",
      type: "release",
      name: absoluteLabel,
    });
  });
  return events;
}

function isRootClozePlayback() {
  return quizClozeActive && quizClozeMode === "root";
}

function chordTransportNotes(chord, activeKey, displayNotes) {
  if (!isRootClozePlayback()) return normalizeToneNotes(displayNotes);
  const rootData = chordInterpreter(chord, activeKey, { forceRootPosition: true });
  const notes = normalizeToneNotes(rootData.notes || []);
  return notes.slice(0, 1);
}

function chordQuizDisplayData(chord, activeKey, chordData) {
  if (!isRootClozePlayback()) {
    return {
      notes: chordData.notes || [],
      degrees: chordData.chordDegrees || [],
    };
  }
  const rootData = chordInterpreter(chord, activeKey, { forceRootPosition: true });
  return {
    notes: normalizeToneNotes(rootData.notes || []).slice(0, 1),
    degrees: (rootData.chordDegrees || []).slice(0, 1),
  };
}

function createChordEvents(chordsArray, key, sectionKeys = currentSectionKeys) {
  const events = [];
  chordsArray.forEach((chord) => {
    if (chord.isRest) return;

    // Check if this chord is masked in the integrated cloze quiz
    const isMasked = quizClozeActive && Number(quizClozeMaskedBeat) === Number(chord.beat);

    const chordBeat = chord.beat === 0 ? 1 : chord.beat;
    const activeKey = activeSectionKeyAtBeat(sectionKeys, chordBeat, key);
    const chordData = interpretChord(chord, activeKey);
    const displayChordNotes = chordData.notes || [];

    if (quizMuteGapChord && isMasked) return;

    const chordNotes = chordTransportNotes(chord, activeKey, displayChordNotes);
    if (!chordNotes.length) return;

    const quizDisplay = chordQuizDisplayData(chord, activeKey, chordData);

    // Handle beat 0 by treating it as beat 1 (normalize to 1-based indexing)
    // XML format can have beat 0, but player expects 1-based beats
    const normalizedBeat = chord.beat === 0 ? 1 : chord.beat;
    const startTick = (normalizedBeat - 1) * 192;
    const endTick = startTick + (chord.duration * 192);



    if (isArpeggiationActive() && chordNotes.length > 1) {
      const noteCount = chordNotes.length;
      const offsetTicks = getArpeggioOffsetTicks(noteCount);
      const ticksPerSecond = currentBpm * (TICKS_PER_BEAT / 60);

      let currentTick = Math.round(startTick);
      let noteIdx = 0;

      const MIN_NOTE_DURATION_TICKS = Math.max(1, Math.min(offsetTicks, 10));
      const stepMs = getArpeggioStepMs(noteCount);

      while (currentTick + MIN_NOTE_DURATION_TICKS < endTick) {
        const note = chordNotes[noteIdx % noteCount];
        const noteStart = currentTick;

        let noteEnd = currentTick + offsetTicks;
        if (noteEnd > endTick) noteEnd = endTick;

        if (noteEnd - noteStart < MIN_NOTE_DURATION_TICKS) {
          break;
        }

        const isFirstNote = (noteIdx === 0);
        const thisNote = note;

        const durationSeconds = (noteEnd - noteStart) / ticksPerSecond;

        const noteEvent = {
          time: Math.round(noteStart) + "i",
          type: "arpeggio",
          note: thisNote,
          duration: durationSeconds,
          name: chord.root,
          onTrigger: () => {
            if (isFirstNote) {
              syncChordDisplayAtTick(Math.round(startTick));
              isManualChordPreview = false;
            }
            if (shouldHighlightArpeggioNote()) {
              noteIndicator.highlightNote(thisNote, stepMs);
            }
          }
        };
        events.push(noteEvent);

        currentTick += offsetTicks;
        noteIdx++;
      }

    } else {
      events.push({
        time: Math.round(startTick) + "i",
        type: "attack",
        notes: chordNotes,
        name: chord.root,
        onTrigger: () => {
          syncChordDisplayAtTick(Math.round(startTick));
          isManualChordPreview = false;
        },
      });

      events.push({
        time: Math.round(endTick) + "i",
        type: "release",
        notes: chordNotes,
      });
    }
  });

  events.sort((a, b) => {
    const tickDiff = parseInt(a.time) - parseInt(b.time);
    if (tickDiff !== 0) return tickDiff;
    const typeOrder = { release: 0, arpeggio: 1, attack: 2 };
    return (typeOrder[a.type] ?? 1) - (typeOrder[b.type] ?? 1);
  });

  const releaseTicks = new Set(
    events.filter((e) => e.type === "release").map((e) => parseInt(e.time, 10))
  );
  for (const ev of events) {
    if (ev.type !== "attack") continue;
    const tick = parseInt(ev.time, 10);
    if (releaseTicks.has(tick)) {
      ev.time = `${tick + 1}i`;
    }
  }
  events.sort((a, b) => parseInt(a.time, 10) - parseInt(b.time, 10));

  return events;
}

// Helper function to find the current melody note at a given tick position
function findCurrentMelodyAtTick(tickPosition) {
  if (!currentRawNotes || !currentRawNotes.length || !currentKey) return null;
  
  // Convert tick position to beat (1 tick = 1/192 beat)
  const currentBeat = (tickPosition / 192) + 1;
  
  // Find the note that should be playing at this beat
  // A note is active if currentBeat is >= note.beat and < note.beat + note.duration
  // Normalize beat 0 to beat 1 for comparison
  for (const note of currentRawNotes) {
    const noteStartBeat = note.beat === 0 ? 1 : note.beat;
    const noteEndBeat = noteStartBeat + note.duration;
    
    if (currentBeat >= noteStartBeat && currentBeat < noteEndBeat) {
      // If it's a rest, return rest information
      if (note.isRest) {
        return {
          note,
          isRest: true,
          absoluteLabel: null,
          relativeLabel: null
        };
      }
      
      const activeKey = activeSectionKeyAtBeat(currentSectionKeys, currentBeat, currentKey);
      const absoluteLabel = sdToToneJSNoteName(note.sd, note.octave, activeKey, 4);
      const relativeLabel = note.sd;
      return {
        note,
        isRest: false,
        absoluteLabel,
        relativeLabel
      };
    }
  }
  
  return null;
}

// Compute all chord transitions from the chord array
function computeChordTransitions(chordsArray, key, sectionKeys = [], fallbackKey = null) {
  const transitions = new Map();
  const rootTransitions = new Map();
  const fullTransitionFirstBeats = new Map();
  const rootTransitionFirstBeats = new Map();
  const fullSequence = [];
  const rootSequence = [];
  
  const emptyResult = {
    full: transitions,
    rootOnly: rootTransitions,
    fullSequence,
    rootSequence,
    fullLongestPhrases: new Map(),
    rootLongestPhrases: new Map(),
    fullPhraseFirstBeats: new Map(),
    rootPhraseFirstBeats: new Map(),
    fullTransitionFirstBeats,
    rootTransitionFirstBeats,
    fullAllSubstringCounts: new Map(),
    rootAllSubstringCounts: new Map(),
    fullAllSubstringFirstBeats: new Map(),
    rootAllSubstringFirstBeats: new Map(),
    perKey: new Map(),
    keyLabels: [],
  };

  if (!chordsArray || !Array.isArray(chordsArray) || chordsArray.length === 0) {
    return emptyResult;
  }
  
  // Filter out rests and sort by beat
  const validChords = chordsArray
    .filter(c => !c.isRest)
    .sort((a, b) => a.beat - b.beat);
  
  if (validChords.length < 2) {
    for (const chord of validChords) {
      fullSequence.push(getChordSymbol(chord, key));
      rootSequence.push(String(chord.root));
    }
    return {
      full: transitions,
      rootOnly: rootTransitions,
      fullSequence,
      rootSequence,
      fullLongestPhrases: new Map(),
      rootLongestPhrases: new Map(),
      fullPhraseFirstBeats: new Map(),
      rootPhraseFirstBeats: new Map(),
      fullTransitionFirstBeats,
      rootTransitionFirstBeats,
      ...findAllSubstringsWithStarts(fullSequence, validChords, "full"),
      ...findAllSubstringsWithStarts(rootSequence, validChords, "root"),
      perKey: new Map(),
      keyLabels: [],
    }; // Need at least 2 chords for a transition
  }
  
  let lastChordSymbol = null;
  let lastRoot = null;
  
  for (const chord of validChords) {
    const currentChordSymbol = getChordSymbol(chord, key);
    const currentRoot = String(chord.root);
    fullSequence.push(currentChordSymbol);
    rootSequence.push(currentRoot);
    
    // Only count transitions between different chords
    if (lastChordSymbol !== null && lastChordSymbol !== currentChordSymbol) {
      const transitionKey = `${lastChordSymbol} → ${currentChordSymbol}`;
      transitions.set(transitionKey, (transitions.get(transitionKey) || 0) + 1);
      if (!fullTransitionFirstBeats.has(transitionKey)) {
        const beat = chord.beat === 0 ? 1 : chord.beat;
        fullTransitionFirstBeats.set(transitionKey, beat);
      }
    }
    
    // Count root-only transitions (only between different roots)
    if (lastRoot !== null && lastRoot !== currentRoot) {
      const rootTransitionKey = `${lastRoot} → ${currentRoot}`;
      rootTransitions.set(rootTransitionKey, (rootTransitions.get(rootTransitionKey) || 0) + 1);
      if (!rootTransitionFirstBeats.has(rootTransitionKey)) {
        const beat = chord.beat === 0 ? 1 : chord.beat;
        rootTransitionFirstBeats.set(rootTransitionKey, beat);
      }
    }
    
    lastChordSymbol = currentChordSymbol;
    lastRoot = currentRoot;
  }

  // --- Per-key partitioning ---
  const perKey = new Map();
  const keyLabels = [];
  const fk = fallbackKey || key;

  if (Array.isArray(sectionKeys) && sectionKeys.length > 0) {
    // Build ordered key regions: [{key, startBeat, endBeat}, ...]
    const sortedKeys = [...sectionKeys].sort((a, b) => (a?.beat ?? 1) - (b?.beat ?? 1));
    const regions = [];
    for (let i = 0; i < sortedKeys.length; i++) {
      const sk = sortedKeys[i];
      const tonic = String(sk.tonic || fk.tonic || "C").replace(/♭/g, "b").replace(/♯/g, "#").replace(/♮/g, "");
      const scale = sk.scale || fk.scale || "major";
      const startBeat = sk.beat ?? 1;
      const endBeat = (i + 1 < sortedKeys.length) ? (sortedKeys[i + 1].beat ?? Infinity) : Infinity;
      const label = `${tonic} ${scale.charAt(0).toUpperCase() + scale.slice(1)}`;
      regions.push({ key: { tonic, scale }, startBeat, endBeat, label });
    }

    // Only build per-key data if there are 2+ distinct key labels
    const uniqueLabels = [...new Set(regions.map(r => r.label))];
    if (uniqueLabels.length > 1) {
      for (const region of regions) {
        const regionChords = validChords.filter(c => {
          const beat = c.beat === 0 ? 1 : c.beat;
          return beat >= region.startBeat && beat < region.endBeat;
        });
        if (regionChords.length < 2) continue;

        const regionData = computeChordTransitions(regionChords, region.key);
        // Remove perKey/keyLabels from sub-result to avoid infinite nesting
        delete regionData.perKey;
        delete regionData.keyLabels;
        regionData.regionKey = region.key;

        // If this label already exists (same key in multiple non-contiguous regions),
        // we'd merge, but for simplicity we append a suffix
        let label = region.label;
        if (perKey.has(label)) {
          let suffix = 2;
          while (perKey.has(`${label} (${suffix})`)) suffix++;
          label = `${label} (${suffix})`;
        }
        perKey.set(label, regionData);
        keyLabels.push(label);
      }
    }
  }
  
  return {
    full: transitions,
    rootOnly: rootTransitions,
    fullSequence,
    rootSequence,
    ...findLongestRepeatedPhrasesWithStarts(fullSequence, validChords, "full"),
    ...findLongestRepeatedPhrasesWithStarts(rootSequence, validChords, "root"),
    fullTransitionFirstBeats,
    rootTransitionFirstBeats,
    ...findAllSubstringsWithStarts(fullSequence, validChords, "full"),
    ...findAllSubstringsWithStarts(rootSequence, validChords, "root"),
    perKey,
    keyLabels,
  };
}

function findLongestRepeatedPhrasesWithStarts(sequence, validChords, mode) {
  const emptyCounts = new Map();
  const emptyStarts = new Map();
  if (!Array.isArray(sequence) || sequence.length < 2 || !Array.isArray(validChords)) {
    return mode === "root"
      ? { rootLongestPhrases: emptyCounts, rootPhraseFirstBeats: emptyStarts }
      : { fullLongestPhrases: emptyCounts, fullPhraseFirstBeats: emptyStarts };
  }

  let selectedLength = 0;
  for (let phraseLength = sequence.length - 1; phraseLength >= 2; phraseLength--) {
    if (hasAnyRepeatedPhrase(sequence, phraseLength)) {
      selectedLength = phraseLength;
      break;
    }
  }
  if (selectedLength === 0) {
    selectedLength = sequence.length;
  }

  const bestCounts = new Map();
  const bestStarts = new Map();
  let start = 0;
  while (start < sequence.length) {
    const remaining = sequence.length - start;
    const phraseLength = Math.min(selectedLength, remaining);
    const phrase = sequence.slice(start, start + phraseLength).join(" → ");
    bestCounts.set(phrase, (bestCounts.get(phrase) || 0) + 1);
    if (!bestStarts.has(phrase)) {
      const phraseStartBeat = validChords[start]?.beat === 0 ? 1 : (validChords[start]?.beat ?? 1);
      bestStarts.set(phrase, phraseStartBeat);
    }
    start += phraseLength;
  }

  if (mode === "root") {
    return { rootLongestPhrases: bestCounts, rootPhraseFirstBeats: bestStarts };
  }
  return { fullLongestPhrases: bestCounts, fullPhraseFirstBeats: bestStarts };
}

function hasAnyRepeatedPhrase(sequence, phraseLength) {
  if (!Array.isArray(sequence) || phraseLength < 2 || phraseLength > sequence.length) return false;
  const phraseCounts = new Map();
  const nonOverlappingCounts = new Map();
  const end = sequence.length - phraseLength;

  for (let start = 0; start <= end; start++) {
    const phrase = sequence.slice(start, start + phraseLength).join(" → ");
    if (!phraseCounts.has(phrase)) phraseCounts.set(phrase, []);
    phraseCounts.get(phrase).push(start);
  }

  for (const [phrase, starts] of phraseCounts.entries()) {
    let count = 0;
    let lastEnd = -1;
    for (const phraseStart of starts) {
      if (phraseStart >= lastEnd) {
        count += 1;
        lastEnd = phraseStart + phraseLength;
      }
    }
    nonOverlappingCounts.set(phrase, count);
    if (count >= 2) return true;
  }

  return false;
}

function findAllSubstringsWithStarts(sequence, validChords, mode) {
  const counts = new Map();
  const starts = new Map();
  if (!Array.isArray(sequence) || sequence.length < 1 || !Array.isArray(validChords)) {
    return mode === "root"
      ? { rootAllSubstringCounts: counts, rootAllSubstringFirstBeats: starts }
      : { fullAllSubstringCounts: counts, fullAllSubstringFirstBeats: starts };
  }

  for (let phraseLength = sequence.length; phraseLength >= 1; phraseLength--) {
    const end = sequence.length - phraseLength;
    for (let start = 0; start <= end; start++) {
      const phrase = sequence.slice(start, start + phraseLength).join(" → ");
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
      if (!starts.has(phrase)) {
        const phraseStartBeat = validChords[start]?.beat === 0 ? 1 : (validChords[start]?.beat ?? 1);
        starts.set(phrase, phraseStartBeat);
      }
    }
  }

  if (mode === "root") {
    return { rootAllSubstringCounts: counts, rootAllSubstringFirstBeats: starts };
  }
  return { fullAllSubstringCounts: counts, fullAllSubstringFirstBeats: starts };
}

function findRawChordIndexAtBeat(beat) {
  if (!currentRawChords?.length) return -1;
  const target = Number(beat === 0 ? 1 : beat);
  return currentRawChords.findIndex((c) => {
    if (c.isRest) return false;
    return Number(c.beat === 0 ? 1 : c.beat) === target;
  });
}

function computeClozeLoopPoints(maskedChord) {
  if (!maskedChord || !currentRawChords?.length) return false;

  const idx = findRawChordIndexAtBeat(maskedChord.beat);
  if (idx === -1) return false;

  let startChordIdx = -1;
  let chordsBefore = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (currentRawChords[i].isRest) continue;
    chordsBefore++;
    if (chordsBefore === 2) {
      startChordIdx = i;
      break;
    }
  }

  if (startChordIdx !== -1) {
    const startChord = currentRawChords[startChordIdx];
    const startBeat = startChord.beat === 0 ? 1 : startChord.beat;
    loopStartTick = (startBeat - 1) * 192;
  } else {
    loopStartTick = 0;
  }

  const endChord = currentRawChords[Math.min(currentRawChords.length - 1, idx + 1)];
  const endChordBeat = endChord.beat === 0 ? 1 : endChord.beat;
  loopEndTick = (endChordBeat - 1) * 192 + Math.round(endChord.duration * 192);

  const totalTicks = songLength * 192;
  const progressTicks = lastReleaseTick > 0 ? lastReleaseTick : totalTicks;
  if (loopEndTick > progressTicks - 24) loopEndTick = progressTicks - 24;

  if (loopEndTick <= loopStartTick) {
    loopStartTick = 0;
    loopEndTick = progressTicks - 24;
  }

  updateTimelineLoopPoints();
  return true;
}

function seekTransportToTick(tick) {
  const Tone = window.Tone;
  if (!Tone || tick == null) return;
  const totalTicks = songLength * 192;
  const ratio = totalTicks > 0 ? tick / totalTicks : 0;
  Tone.Transport.ticks = tick;
  syncDisplayedKeyAtBeat((tick / 192) + 1);
  controls.updateProgress(ratio);
  timeline.updateProgress(ratio);
  lastProgressTick = tick;
  lastVisualTicks = -1;
  progressTrackingChordId = null;
  progressTrackingMelodyId = null;
}

function getMeasureStartBeatForBeat(targetBeat, metadata) {
  const beat = Math.max(1, Math.floor(targetBeat));
  const meters = Array.isArray(metadata?.meters) ? metadata.meters
    .filter((m) => Number.isFinite(m?.beat) && Number.isFinite(m?.numBeats) && m.numBeats > 0)
    .sort((a, b) => a.beat - b.beat) : [];
  if (meters.length === 0) {
    return Math.floor((beat - 1) / 4) * 4 + 1;
  }

  let activeMeter = meters[0];
  for (const meter of meters) {
    if (meter.beat <= beat) {
      activeMeter = meter;
    } else {
      break;
    }
  }

  const meterStartBeat = activeMeter.beat || 1;
  const beatsPerMeasure = activeMeter.numBeats || 4;
  const offset = Math.max(0, beat - meterStartBeat);
  return meterStartBeat + Math.floor(offset / beatsPerMeasure) * beatsPerMeasure;
}

function jumpToPhraseMeasure(firstPhraseBeat) {
  if (!currentSong || songLength <= 0) return;
  const measureStartBeat = getMeasureStartBeatForBeat(firstPhraseBeat, currentSong?.metadata);
  const ratio = Math.max(0, Math.min(1, (measureStartBeat - 1) / songLength));
  handleSeek(ratio);
}

// Helper function to find the current chord at a given tick position
function findCurrentChordAtTick(tickPosition) {
  if (!currentRawChords || !currentRawChords.length || !currentKey) return null;
  
  // Convert tick position to beat (1 tick = 1/192 beat)
  const currentBeat = (tickPosition / 192) + 1;
  
  // Find the chord that should be playing at this beat
  // A chord is active if currentBeat is >= chord.beat and < chord.beat + chord.duration
  // Normalize beat 0 to beat 1 for comparison
  for (const chord of currentRawChords) {
    const chordStartBeat = chord.beat === 0 ? 1 : chord.beat;
    const chordEndBeat = chordStartBeat + chord.duration;
    
    if (currentBeat >= chordStartBeat && currentBeat < chordEndBeat) {
      // If it's a rest, return rest information
      if (chord.isRest) {
        return {
          chord,
          chordData: null,
          notes: null,
          root: null,
          degrees: null,
          borrowed: null,
          key: activeSectionKeyAtBeat(currentSectionKeys, currentBeat, currentKey),
        };
      }
      
      const activeKey = activeSectionKeyAtBeat(currentSectionKeys, currentBeat, currentKey);
      const chordData = interpretChord(chord, activeKey);
      const notes = chordData.notes || [];
      return {
        chord,
        chordData,
        notes,
        root: chord.root,
        degrees: chordData.chordDegrees,
        borrowed: chord.borrowed,
        key: activeKey,
      };
    }
  }
  
  return null;
}

function resumeMidChordPlayback(tickPosition, chordEvents, attackTime = null) {
  const chordInfo = findCurrentChordAtTick(tickPosition);
  if (!chordInfo?.notes?.length) return;

  const chord = chordInfo.chord;
  const normalizedBeat = chord.beat === 0 ? 1 : chord.beat;
  const chordStartTick = (normalizedBeat - 1) * 192;
  if (Math.round(tickPosition) < chordStartTick) return;

  const activeKey = chordInfo.key || activeSectionKeyAtBeat(
    currentSectionKeys,
    chord.beat === 0 ? 1 : chord.beat,
    currentKey,
  );
  const chordNotes = normalizeToneNotes(
    chordTransportNotes(chord, activeKey, chordInfo.notes),
  );
  const endTick = chordStartTick + chord.duration * 192;

  if (isArpeggiationActive() && chordNotes.length > 1) {
    const hasUpcomingArp = chordEvents.some(
      (e) =>
        e.type === "arpeggio" &&
        parseInt(e.time, 10) > tickPosition &&
        parseInt(e.time, 10) < endTick
    );
    if (hasUpcomingArp) {
      return;
    }
  }

  engine.resumeChordAttack(chordNotes, attackTime);
}

async function updatePlaybackSettings() {
  if (isLoading || !currentSong) return;

  const wasPlaying = Tone.Transport.state === "started";
  const currentTicks = Tone.Transport.ticks;

  // Stop engine to clear parts
  engine.stop();
  noteIndicator.reset();

  // Re-create events with new settings (arpeggiation)
  const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
  const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);

  currentMelodyEvents = melodyEvents;
  currentChordEvents = chordEvents;
  lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);

  await engine.setupTransport(currentBpm);
  engine.scheduleMelody(melodyEvents);
  engine.scheduleChords(chordEvents);

  // Reschedule progress tracking which gets cleared by setupTransport
  setupProgressTracking();

  // Restore position
  Tone.Transport.ticks = currentTicks;

  // Update note indicator immediately with current melody and chord (fixes display issue when tempo changes)
  // This is especially important for arpeggiated chords where the first note might not trigger immediately
  if (currentTicks > 0) {
    // Update melody display
    const currentMelodyInfo = findCurrentMelodyAtTick(currentTicks);
    if (currentMelodyInfo) {
      if (currentMelodyInfo.isRest) {
        noteIndicator.updateMelody(null, null);
      } else {
        noteIndicator.updateMelody(currentMelodyInfo.absoluteLabel, currentMelodyInfo.relativeLabel);
      }
    } else {
      noteIndicator.updateMelody(null, null);
    }
    
    // Update chord display
    const currentChordInfo = findCurrentChordAtTick(currentTicks);
    if (currentChordInfo) {
      syncChordDisplayAtTick(currentTicks, { force: true });
    }
  }

  if (wasPlaying) {
    await engine.play();
    resumeMidChordPlayback(currentTicks, chordEvents);
    controls.setPlayState(true);
  } else {
    controls.resetPlayState();
  }
}

// Integrated Cloze Quiz Helper Functions
function handleToggleCloze(mode = "chord") {
  if (quizClozeActive) {
    stopClozeQuiz();
  } else {
    startClozeQuiz(mode);
  }
}

function resetClozeButtonStyles() {
  if (quizClozeBtn) {
    quizClozeBtn.classList.remove("active");
    quizClozeBtn.textContent = "🎯 Start cloze quiz";
    quizClozeBtn.style.background = "#4f46e5";
    quizClozeBtn.style.borderColor = "#4338ca";
    quizClozeBtn.disabled = false;
    quizClozeBtn.style.opacity = "1";
  }
  if (quizRootClozeBtn) {
    quizRootClozeBtn.classList.remove("active");
    quizRootClozeBtn.textContent = "🎯 Start root cloze";
    quizRootClozeBtn.style.background = "#0891b2";
    quizRootClozeBtn.style.borderColor = "#0891b2";
    quizRootClozeBtn.disabled = false;
    quizRootClozeBtn.style.opacity = "1";
  }
}

function startClozeQuiz(mode = "chord") {
  const entries = buildQuizSongContext()?.entries;
  if (!entries || !entries.length) {
    alert("Please load a song section to play the quiz.");
    return;
  }
  
  quizClozeActive = true;
  quizClozeMode = mode;

  if (mode === "chord") {
    if (quizClozeBtn) {
      quizClozeBtn.classList.add("active");
      quizClozeBtn.textContent = "⏹ Stop cloze quiz";
      quizClozeBtn.style.background = "#dc2626";
      quizClozeBtn.style.borderColor = "#b91c1c";
    }
    if (quizRootClozeBtn) {
      quizRootClozeBtn.disabled = true;
      quizRootClozeBtn.style.opacity = "0.5";
    }
    chordRing.setDegreeAnswerMode?.(false);
  } else {
    if (quizRootClozeBtn) {
      quizRootClozeBtn.classList.add("active");
      quizRootClozeBtn.textContent = "⏹ Stop root cloze";
      quizRootClozeBtn.style.background = "#dc2626";
      quizRootClozeBtn.style.borderColor = "#b91c1c";
    }
    if (quizClozeBtn) {
      quizClozeBtn.disabled = true;
      quizClozeBtn.style.opacity = "0.5";
    }
    chordRing.setDegreeAnswerMode?.(true);
  }
  
  loopEnabled = true;
  controls.setLoopChecked(true);
  
  quizClozeStats = { correct: 0, total: 0 };
  updateQuizBarScore();
  
  const quizInfoContainer = chordRing.getQuizClozeInfo();
  if (quizInfoContainer) quizInfoContainer.style.display = "flex";
  
  nextClozeQuestion();
}

function stopClozeQuiz({ restartPlayback = true } = {}) {
  quizClozeActive = false;
  quizClozeMode = "chord";
  quizClozeMaskedBeat = null;
  quizClozeCorrectChord = null;

  resetClozeButtonStyles();
  
  timeline.setMaskedChords([]);
  chordRing.setChordSelectHandler(null);
  chordRing.setDegreeSelectHandler?.(null);
  chordRing.setDegreeAnswerMode?.(false);
  chordRing.clearQuizOverlays?.();
  
  const quizInfoContainer = chordRing.getQuizClozeInfo();
  if (quizInfoContainer) quizInfoContainer.style.display = "none";
  
  loopStartTick = null;
  loopEndTick = null;
  updateTimelineLoopPoints();
  
  if (restartPlayback) {
    restartSectionFromBeginning({ autoPlay: false });
  }
}

async function nextClozeQuestion() {
  const entries = buildQuizSongContext()?.entries;
  if (!entries || !entries.length) return;
  
  timeline.setMaskedChords([]);
  chordRing.update(null);
  
  const profile = buildFrequencyProfile(entries);
  const lastSymbol = quizSession.lastSymbol;
  const chosenEntry = pickFrequencyBiased(entries, quizSession, lastSymbol, profile, "normal");
  if (!chosenEntry) return;
  
  quizClozeMaskedBeat = chosenEntry.chord.beat;
  quizClozeCorrectChord = chosenEntry.chord;
  
  timeline.setMaskedChords([quizClozeMaskedBeat]);
  
  if (quizClozeMode === "root") {
    chordRing.setChordSelectHandler(null);
    chordRing.setDegreeAnswerMode?.(true);
    chordRing.highlightDegreeChoices?.(null);
    chordRing.setDegreeSelectHandler?.((degree) => {
      handleQuizRootDegreeGuess(degree);
    });
  } else {
    chordRing.setDegreeSelectHandler?.(null);
    chordRing.setDegreeAnswerMode?.(false);
    chordRing.setChordSelectHandler((guessChord) => {
      handleQuizClozeGuess(guessChord);
    });
  }
  
  // Set default loop points: 2 chord rectangles before and 1 after the masked chord
  if (!computeClozeLoopPoints(quizClozeCorrectChord)) {
    loopStartTick = 0;
    const totalTicks = songLength * 192;
    loopEndTick = (lastReleaseTick > 0 ? lastReleaseTick : totalTicks) - 24;
    updateTimelineLoopPoints();
  }
  
  const startTick = (loopEnabled && loopStartTick !== null)
    ? loopStartTick
    : null;
  await restartSectionFromBeginning({ autoPlay: true, startTick });
  
  const hintText = quizClozeMode === "root"
    ? "Identify the root scale degree (1–7) of the masked chord. Click a number on the Chord Ring."
    : "Identify the masked chord by clicking its symbol on the Chord Ring. Playback is looping.";
  updateQuizBarFeedback(hintText);
  
  const nextBtn = chordRing.getQuizClozeNextBtn();
  if (nextBtn) nextBtn.disabled = false;
}

function getMaskedClozeEntry() {
  const entries = buildQuizSongContext()?.entries;
  if (!entries?.length || !quizClozeCorrectChord) return null;
  return entries.find(
    (e) => Number(e.chord.beat) === Number(quizClozeCorrectChord.beat),
  ) ?? null;
}

function handleQuizRootDegreeGuess(guessDegree) {
  if (!quizClozeCorrectChord) return;

  const entry = getMaskedClozeEntry();
  const correctDegree = entry ? entryRootDegree(entry) : null;
  const correctSymbol = getChordSymbol(quizClozeCorrectChord, currentKey);
  const correct = correctDegree != null && Number(guessDegree) === Number(correctDegree);

  quizClozeStats.total++;

  if (correct) {
    quizClozeStats.correct++;
    chordRing.flashCorrectDegree?.(correctDegree);
    timeline.setMaskedChords([]);
    quizClozeMaskedBeat = null;

    const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
    const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);
    currentMelodyEvents = melodyEvents;
    currentChordEvents = chordEvents;
    engine.rescheduleParts(melodyEvents, chordEvents);

    const chordBeat = quizClozeCorrectChord.beat === 0 ? 1 : quizClozeCorrectChord.beat;
    const activeKey = activeSectionKeyAtBeat(currentSectionKeys, chordBeat, currentKey);
    const chordData = interpretChord(quizClozeCorrectChord, activeKey);
    const quizDisplay = chordQuizDisplayData(quizClozeCorrectChord, activeKey, chordData);
    previewChordWithSettings(quizDisplay.notes, false);

    noteIndicator.updateChord(
      quizDisplay.notes,
      quizClozeCorrectChord.root,
      quizDisplay.degrees,
      quizClozeCorrectChord.borrowed,
      activeKey,
      quizClozeCorrectChord,
    );
    chordRing.update(quizClozeCorrectChord);

    updateQuizBarFeedback(`🎉 Correct! Root is degree ${correctDegree} (from ${correctSymbol}).`);
    quizSession.record(correctSymbol, true);
  } else {
    chordRing.flashWrongDegree?.(guessDegree);
    setTimeout(() => {
      chordRing.flashCorrectDegree?.(correctDegree);
    }, 400);

    updateQuizBarFeedback(
      `❌ Incorrect. Root is degree ${correctDegree} (from ${correctSymbol}).`,
    );
    quizSession.record(correctSymbol, false);
  }

  updateQuizBarScore();
  chordRing.setDegreeSelectHandler?.(null);

  const nextBtn = chordRing.getQuizClozeNextBtn();
  if (nextBtn) nextBtn.disabled = false;
}

function handleQuizClozeGuess(guessChord) {
  if (!quizClozeCorrectChord) return;
  
  const cid = (c) => {
    if (!c) return "";
    const root = Number(c.root);
    const type = Number(c.type || 5);
    const inv = Number(c.inversion || 0);
    const borrowed = Array.isArray(c.borrowed) ? "custom" : (c.borrowed || "none");
    const applied = Number(c.applied || 0);
    return `r${root}|t${type}|i${inv}|b${borrowed}|a${applied}`;
  };
  const correct = cid(guessChord) === cid(quizClozeCorrectChord);
  const correctSymbol = getChordSymbol(quizClozeCorrectChord, currentKey);
  const guessSymbol = getChordSymbol(guessChord, currentKey);
  
  quizClozeStats.total++;
  
  if (correct) {
    quizClozeStats.correct++;
    chordRing.flashCorrect(correctSymbol);
    timeline.setMaskedChords([]);
    
    quizClozeMaskedBeat = null;
    
    const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
    const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);
    currentMelodyEvents = melodyEvents;
    currentChordEvents = chordEvents;
    engine.rescheduleParts(melodyEvents, chordEvents);
    
    const chordBeat = quizClozeCorrectChord.beat === 0 ? 1 : quizClozeCorrectChord.beat;
    const activeKey = activeSectionKeyAtBeat(currentSectionKeys, chordBeat, currentKey);
    const chordData = interpretChord(quizClozeCorrectChord, activeKey);
    previewChordWithSettings(chordData.notes, isArpeggiationActive());
    
    noteIndicator.updateChord(chordData.notes, quizClozeCorrectChord.root, chordData.chordDegrees, quizClozeCorrectChord.borrowed, activeKey, quizClozeCorrectChord);
    chordRing.update(quizClozeCorrectChord);
    
    updateQuizBarFeedback(`🎉 Correct! It is ${correctSymbol}.`);
    quizSession.record(correctSymbol, true);
  } else {
    chordRing.flashWrong(guessSymbol);
    setTimeout(() => {
      chordRing.flashCorrect(correctSymbol);
    }, 400);
    
    updateQuizBarFeedback(`❌ Incorrect. The answer is ${correctSymbol}.`);
    quizSession.record(correctSymbol, false);
  }
  
  updateQuizBarScore();
  chordRing.setChordSelectHandler(null);
  
  if (statsDrawerOpen && freqPanel) {
    freqPanel.refresh();
  }
  
  const nextBtn = chordRing.getQuizClozeNextBtn();
  if (nextBtn) nextBtn.disabled = false;
}

function updateQuizBarFeedback(text) {
  const feedbackEl = chordRing.getQuizClozeFeedback();
  if (feedbackEl) feedbackEl.textContent = text;
}

function updateQuizBarScore() {
  const scoreEl = chordRing.getQuizClozeScore();
  if (scoreEl) scoreEl.textContent = `${quizClozeStats.correct} / ${quizClozeStats.total}`;
}

