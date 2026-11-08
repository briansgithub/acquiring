import {PersistentRootTargets} from './persistent-root-target';
import type {RootGaugeState} from './RootPitchGauge';
/** Opt-in persistent root/melody monitoring. Native header "Pitch monitoring". Policy A is singing-dock auto-listen, not this button. */
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
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
  capture: {readonly isReady:boolean};
  section: ExtractedSection | null;
  sessionKey: string;
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
  const [rootGauge,setRootGauge]=useState<RootGaugeState|null>(null);
  const rootModel=useMemo(()=>input.section?new PersistentRootTargets(input.section):null,[input.section]);
  const rootAtBeat=input.rootOnly?rootModel?.atBeat(input.beat,input.majorLocked)??null:null;
  // Keep the polling clock stable while the beat advances within the same root.
  const rootTarget=useMemo(()=>rootAtBeat,[rootAtBeat?.sourceMidi,rootAtBeat?.label]);
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

  useLayoutEffect(()=>{
    // Native remember(sessionKey) + LaunchedEffect(isSimpleMode): neither direction auto-resumes.
    controller.cancel();controller.clearError();setMonitoring(false);clear();setLive(null);setRootGauge(null);
    sampledCents.current=null;lastSampleAt.current=null;
  },[controller,input.sessionKey,input.rootOnly]);
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
    if(input.rootOnly&&rootTarget)controller.updateTarget(effectiveTargetMidi(rootTarget,input.transpose,input.octaveOffset));
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
      if(input.rootOnly){
        if(controller.selection?.kind!=='simple-root'||!rootTarget){setRootGauge(null);sampledCents.current=null;lastSampleAt.current=null;return;}
        if(!input.capture.isReady){setRootGauge(null);return;}
        const targetMidi=effectiveTargetMidi(rootTarget,input.transpose,input.octaveOffset);
        const result=retargetPitchResult(captured,targetMidi);
        const sampled=advanceSampledMelodyCents({sampledCents:sampledCents.current,lastSampleAtMs:lastSampleAt.current,nowMs:Date.now(),estimateCents:result.kind==='estimate'?result.centsError:null});
        sampledCents.current=sampled.sampledCents;lastSampleAt.current=sampled.lastSampleAtMs;
        setRootGauge({label:rootTarget.label,targetMidi,result,sampledCents:sampled.sampledCents});
        return; // Root display never feeds melody run scores.
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
      setScores(new Map());
    }
  }, [accumulator, active, controller, enabled, input.octaveOffset, input.transpose, monitoring, source,input.rootOnly,rootTarget]);

  useEffect(()=>{
    // Retire the UI/controller latch synchronously on true departure as well as
    // revoking the coordinator lease. No interval or delayed capture can resume it.
    const hide=()=>cancel();
    window.addEventListener('pagehide',hide);
    return()=>window.removeEventListener('pagehide',hide);
  },[controller,accumulator]);

  function toggle(): void {
    if (monitoring) { cancel(); return; }
    if(input.rootOnly){
      controller.activate({kind:'simple-root'},rootTarget?effectiveTargetMidi(rootTarget,input.transpose,input.octaveOffset):null,true);
      setRootGauge(null);setMonitoring(true);return;
    }
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
    setMonitoring(false);setRootGauge(null);setLive(null);
    clear();
  }

  return {scores, live, rootGauge:monitoring&&source.ownsMicrophone&&input.capture.isReady&&rootTarget&&rootGauge?.targetMidi===effectiveTargetMidi(rootTarget,input.transpose,input.octaveOffset)?rootGauge:null, monitoring: monitoring && controller.phase !== PersistentPitchPhase.IDLE, toggle, clear, cancel};
}
