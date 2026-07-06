const CADENCE_DEGREES = [1, 4, 5, 1];

function blankChord(root) {
  return {
    root,
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
}

export function createQuizAudio() {
  let synth = null;
  let cancelSeq = null;
  let timers = [];

  function ensureSynth() {
    const Tone = window.Tone;
    if (!synth) {
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        volume: -5,
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.2 },
      }).toDestination();
    }
    return synth;
  }

  async function ensureAudio() {
    const Tone = window.Tone;
    if (Tone.context.state !== "running") await Tone.start();
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (cancelSeq) {
      cancelSeq();
      cancelSeq = null;
    }
  }

  function playChord(notes, ms = 1100) {
    if (!notes?.length) return;
    ensureAudio();
    const Tone = window.Tone;
    const s = ensureSynth();
    const now = Tone.now();
    s.triggerAttackRelease(notes, ms / 1000, now);
  }

  function playArpeggio(notes, { msPerNote = 400, sustainRatio = 0.85, onNote, onDone } = {}) {
    if (!notes?.length) return { cancel: clearTimers };
    clearTimers();
    let cancelled = false;
    cancelSeq = () => {
      cancelled = true;
    };

    const run = async () => {
      await ensureAudio();
      if (cancelled) return;
      const Tone = window.Tone;
      const s = ensureSynth();
      notes.forEach((note, i) => {
        const t = setTimeout(() => {
          if (cancelled) return;
          onNote?.(i, note);
          s.triggerAttackRelease(note, (msPerNote * sustainRatio) / 1000, Tone.now());
          if (i === notes.length - 1 && onDone) {
            const doneT = setTimeout(() => {
              if (!cancelled) onDone();
            }, msPerNote * 0.5);
            timers.push(doneT);
          }
        }, i * msPerNote);
        timers.push(t);
      });
    };
    run().catch(() => {});

    return { cancel: clearTimers };
  }

  function playSequence(steps, msPerStep = 850) {
    clearTimers();
    let cancelled = false;
    cancelSeq = () => { cancelled = true; };

    ensureAudio();
    const Tone = window.Tone;
    const s = ensureSynth();

    steps.forEach((notes, i) => {
      const t = setTimeout(() => {
        if (cancelled || !notes) return;
        const now = Tone.now();
        s.triggerAttackRelease(notes, (msPerStep * 0.85) / 1000, now);
      }, i * msPerStep);
      timers.push(t);
    });

    return { cancel: () => { cancelled = true; clearTimers(); } };
  }

  function playCadence(key, interpret, msPerStep = 750) {
    const steps = CADENCE_DEGREES.map((d) => {
      const data = interpret(blankChord(d), key);
      return data?.notes || [];
    });
    return playSequence(steps, msPerStep);
  }

  function playCadenceThen(key, interpret, targetSteps, gapMs = 500, msPerStep = 850) {
    clearTimers();
    playCadence(key, interpret, msPerStep);
    const cadenceMs = CADENCE_DEGREES.length * msPerStep + gapMs;
    const t = setTimeout(() => playSequence(targetSteps, msPerStep), cadenceMs);
    timers.push(t);
    return { cancel: clearTimers };
  }

  return { playChord, playArpeggio, playSequence, playCadence, playCadenceThen, cancel: clearTimers };
}
