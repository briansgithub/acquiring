/** Opt-in persistent melody monitoring. Native header "Pitch monitoring". Policy A is singing-dock auto-listen, not this button. */
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ExclusivePitchSource} from '../../audio/capture';
import type {ExtractedSection} from '../../contracts';
import {preparePlaybackSection} from './section-model';
import {buildMelodyTimelineVisuals} from './timeline-layout';
import {
  MelodyTimelinePitchScoreAccumulator, MELODY_PITCH_SCORE_SAMPLE_MS, buildMelodyTimelinePitchRuns,
  liveMeasuredCentsError, melodyTimelinePitchRunAtBeat, type MelodyRunScoreOutcome,
} from './melody-timeline-score';
import {MelodyRunSettleDetector} from './melody-run-settle';
import {
  PersistentPitchPhase, PersistentPlaybackPitchController, effectiveTargetMidi,
  melodyTimelinePitchEstimate, resolvePersistentPitchTarget, retargetPitchResult,
} from './persistent-pitch';
import {
  advanceSampledMelodyCents, liveMelodyPitchFromCapture, type LiveMelodyPitch,
} from './timeline-live-pitch';

export function usePlaybackPitchPractice(input:{
  source: ExclusivePitchSource;
  section: ExtractedSection | null;
  beat: number;
  rootOnly: boolean;
  majorLocked: boolean;
  transpose: number;
  octaveOffset: number;
}) {
  const source = input.source;
  const controller = useMemo(() => new PersistentPlaybackPitchController(source), [source]);
  const accumulator = useMemo(() => new MelodyTimelinePitchScoreAccumulator(), []);
  const [scores, setScores] = useState<ReadonlyMap<number, MelodyRunScoreOutcome>>(() => new Map());
  const [monitoring, setMonitoring] = useState(false);
  const [live, setLive] = useState<LiveMelodyPitch | null>(null);
  const settle = useRef(new MelodyRunSettleDetector());
  const elapsed = useRef(0);
  const runId = useRef<number | null>(null);
  const sampledCents = useRef<number | null>(null);
  const lastSampleAt = useRef<number | null>(null);

  useEffect(() => () => { controller.cancel(); }, [controller]);

  const melody = useMemo(
    () => input.section ? buildMelodyTimelineVisuals(preparePlaybackSection(input.section).melody, input.section, input.majorLocked) : [],
    [input.section, input.majorLocked],
  );
  const runs = useMemo(() => buildMelodyTimelinePitchRuns(melody), [melody]);
  const active = melodyTimelinePitchRunAtBeat(runs, input.beat);
  const enabled = monitoring && !input.rootOnly && controller.selection?.kind === 'melody'
    && controller.phase === PersistentPitchPhase.LISTENING;

  useEffect(() => {
    if (input.rootOnly) { controller.cancel(); setMonitoring(false); setScores(new Map()); setLive(null); }
  }, [controller, input.rootOnly]);
  useEffect(() => {
    if (monitoring) return;
    sampledCents.current = null;
    lastSampleAt.current = null;
    setLive(null);
  }, [monitoring]);
  useEffect(() => {
    accumulator.clear();
    runId.current = null;
    setScores(new Map());
  }, [accumulator, input.section]);

  useEffect(() => {
    if (!enabled || !active) finishCurrent();
    if (!monitoring) return;
    if (enabled && active && runId.current !== active.id) {
      finishCurrent();
      accumulator.begin(active.id);
      settle.current = new MelodyRunSettleDetector();
      elapsed.current = 0;
      runId.current = active.id;
      setScores((map) => { const next = new Map(map); next.delete(active.id); return next; });
    }
    if (enabled && active) {
      const targetMidi = active.sourceMidi == null ? 60 : effectiveTargetMidi({
        sourceMidi: active.sourceMidi, label: '', position: {kind: 'melody-current'},
      }, input.transpose, input.octaveOffset);
      controller.updateTarget(targetMidi);
    }
    const id = window.setInterval(() => {
      if (!source.ownsMicrophone) {
        controller.onOwnershipChanged(false);
        setMonitoring(false);
        discardCurrent();
        setLive(null);
        return;
      }
      const captured = source.current;
      if (captured.kind === 'error') {
        controller.fail(captured.message);
        setMonitoring(false);
        discardCurrent();
        setLive(null);
        return;
      }
      const midi = active?.sourceMidi ?? 60;
      const targetMidi = effectiveTargetMidi({
        sourceMidi: midi, label: '', position: {kind: 'melody-current'},
      }, input.transpose, input.octaveOffset);
      const estimate = melodyTimelinePitchEstimate(
        controller.selection,
        resolvePersistentPitchTarget(controller.selection, null, [], {sourceMidi: midi, label: ''}),
        captured.kind === 'estimate' ? retargetPitchResult(captured, targetMidi) : captured,
      );
      const sampled = advanceSampledMelodyCents({
        sampledCents: sampledCents.current, lastSampleAtMs: lastSampleAt.current,
        nowMs: Date.now(), estimateCents: estimate?.centsError ?? null,
      });
      sampledCents.current = sampled.sampledCents;
      lastSampleAt.current = sampled.lastSampleAtMs;
      const nextLive = liveMelodyPitchFromCapture(estimate, sampled.sampledCents);
      setLive((prev) => prev && prev.hasEstimate === nextLive.hasEstimate
        && prev.cents === nextLive.cents && prev.sampledCents === nextLive.sampledCents ? prev : nextLive);
      if (!enabled || !active) return;
      const cents = liveMeasuredCentsError(estimate);
      if (settle.current.observe(elapsed.current, cents) && cents != null) accumulator.add(active.id, cents);
      elapsed.current += MELODY_PITCH_SCORE_SAMPLE_MS;
    }, MELODY_PITCH_SCORE_SAMPLE_MS);
    return () => window.clearInterval(id);

    function finishCurrent() {
      if (runId.current == null) { accumulator.clear(); return; }
      const outcome = accumulator.finish(runId.current);
      runId.current = null;
      if (outcome) setScores((map) => new Map(map).set(outcome.runId, outcome));
      else accumulator.clear();
    }
    function discardCurrent() {
      accumulator.clear();
      runId.current = null;
    }
  }, [accumulator, active, controller, enabled, input.octaveOffset, input.transpose, monitoring, source]);

  function toggle(): void {
    if (monitoring) { cancel(); return; }
    const midi = active?.sourceMidi ?? 60;
    controller.activate({kind: 'melody'}, effectiveTargetMidi({
      sourceMidi: midi, label: '', position: {kind: 'melody-current'},
    }, input.transpose, input.octaveOffset), true);
    setLive(liveMelodyPitchFromCapture(null, null));
    setMonitoring(true);
  }

  function clear(): void {
    accumulator.clear();
    setScores(new Map());
    runId.current = null;
  }

  function cancel(): void {
    controller.cancel();
    setMonitoring(false);
    clear();
  }

  return {scores, live, monitoring: monitoring && controller.phase !== PersistentPitchPhase.IDLE, toggle, clear, cancel};
}
