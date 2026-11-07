/** Opt-in persistent melody monitoring. Native header "Pitch monitoring". Policy A is singing-dock auto-listen, not this button. */
import {useEffect,useMemo,useRef,useState} from 'react';
import {
  BrowserMicrophoneCapture, MicrophonePitchCoordinator, MicrophonePitchOwner,
} from '../../audio/capture';
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

export function usePlaybackPitchPractice(input:{
  section: ExtractedSection | null;
  beat: number;
  rootOnly: boolean;
  majorLocked: boolean;
  transpose: number;
  octaveOffset: number;
}) {
  const capture = useMemo(() => new BrowserMicrophoneCapture(), []);
  const coordinator = useMemo(() => new MicrophonePitchCoordinator(capture), [capture]);
  const source = useMemo(() => coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT), [coordinator]);
  const controller = useMemo(() => new PersistentPlaybackPitchController(source), [source]);
  const accumulator = useMemo(() => new MelodyTimelinePitchScoreAccumulator(), []);
  const [scores, setScores] = useState<ReadonlyMap<number, MelodyRunScoreOutcome>>(() => new Map());
  const [monitoring, setMonitoring] = useState(false);
  const settle = useRef(new MelodyRunSettleDetector());
  const elapsed = useRef(0);
  const runId = useRef<number | null>(null);

  useEffect(() => () => { controller.cancel(); coordinator.release(); }, [controller, coordinator]);

  const melody = useMemo(
    () => input.section ? buildMelodyTimelineVisuals(preparePlaybackSection(input.section).melody, input.section, input.majorLocked) : [],
    [input.section, input.majorLocked],
  );
  const runs = useMemo(() => buildMelodyTimelinePitchRuns(melody), [melody]);
  const active = melodyTimelinePitchRunAtBeat(runs, input.beat);
  const enabled = monitoring && !input.rootOnly && controller.selection?.kind === 'melody'
    && controller.phase === PersistentPitchPhase.LISTENING && source.ownsMicrophone;

  useEffect(() => {
    if (input.rootOnly) { controller.cancel(); setMonitoring(false); setScores(new Map()); }
  }, [controller, input.rootOnly]);
  useEffect(() => {
    accumulator.clear();
    runId.current = null;
    setScores(new Map());
  }, [accumulator, input.section]);

  useEffect(() => {
    if (!enabled || !active) {
      finishCurrent();
      return;
    }
    if (runId.current !== active.id) {
      finishCurrent();
      accumulator.begin(active.id);
      settle.current = new MelodyRunSettleDetector();
      elapsed.current = 0;
      runId.current = active.id;
      setScores((map) => { const next = new Map(map); next.delete(active.id); return next; });
    }
    const targetMidi = active.sourceMidi == null ? 60 : effectiveTargetMidi({
      sourceMidi: active.sourceMidi, label: '', position: {kind: 'melody-current'},
    }, input.transpose, input.octaveOffset);
    controller.updateTarget(targetMidi);
    const id = window.setInterval(() => {
      const live = source.current;
      if (live.kind === 'error') {
        controller.fail(live.message);
        setMonitoring(false);
        finishCurrent();
        return;
      }
      const estimate = melodyTimelinePitchEstimate(
        controller.selection,
        resolvePersistentPitchTarget(controller.selection, null, [], {sourceMidi: active.sourceMidi ?? 60, label: ''}),
        retargetPitchResult(live, targetMidi),
      );
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
  }, [accumulator, active, controller, enabled, input.octaveOffset, input.transpose, source]);

  function toggle(): void {
    if (monitoring) { cancel(); return; }
    const midi = active?.sourceMidi ?? 60;
    controller.activate({kind: 'melody'}, effectiveTargetMidi({
      sourceMidi: midi, label: '', position: {kind: 'melody-current'},
    }, input.transpose, input.octaveOffset), true);
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

  return {scores, monitoring: monitoring && controller.phase !== PersistentPitchPhase.IDLE, toggle, clear, cancel};
}
