import { describe, expect, it } from 'vitest';
import native from './fixtures/native-evidence.json';
import {
  auralCell, auralEvidenceApi, beginAuralExercise, createAuralCell, createAuralProgress,
  evaluateAuralExercise, normalizeAuralProgress, recordAuralAttempt,
} from './aural-evidence';
import type {
  AuralAttemptRecord, AuralCell, AuralExerciseEvidence, AuralExposure, AuralProgress,
} from './evidence-contracts';

interface ExerciseInput {
  id?:string;familyId?:string;skillId?:string;support?:number;transfer?:boolean;seed?:string;
  fingerprint?:string;requestedVariantId?:string|null;microphoneKind?:string|null;
  requestedMicrophoneKind?:string|null;responseType?:string;withCorpus?:boolean;
}
interface ProgressInput {
  version?:number;attempts?:number;cells?:Record<string,Partial<AuralCell>>;
  recent?:Partial<AuralAttemptRecord>[];exposures?:AuralExposure[];
}
interface Step {
  op:'begin'|'record'|'normalize'|'cell'|'evaluate';exercise?:ExerciseInput;now?:number;
  correct?:boolean;assistance?:string[];plays?:number;attempt?:number;technicalUncertainty?:boolean;response?:string[];
}
interface NativeCase {label:string;progress:ProgressInput;exercise:ExerciseInput;steps:Step[];expected:unknown[]}
function exercise(input:ExerciseInput = {}):AuralExerciseEvidence {
  return {
    id:input.id ?? 'exercise',familyId:input.familyId ?? 'dominant-return',variantId:'direct',
    skillId:input.skillId ?? 'compare',generatorVersion:'android-aural-1',keyTonic:'C',
    fingerprint:input.fingerprint ?? 'fingerprint',responseType:input.responseType ?? 'sequence',
    support:input.support ?? 0,transfer:input.transfer ?? false,seed:input.seed ?? '1',
    answer:{degrees:['V','I'],optionId:'option'},
    microphoneTask:input.microphoneKind == null ? null : {kind:input.microphoneKind},
    provenance:{target:{microphoneKind:input.requestedMicrophoneKind ?? null,
      variantId:input.requestedVariantId ?? null,instrumentOverride:'CLARINET',octaveShift:1},
      corpus:input.withCorpus ? native.corpusSample : null},
    previouslyExposed:false,exposureRegistered:false,
  };
}
function history(input:Partial<AuralAttemptRecord>):AuralAttemptRecord {
  return {
    id:'history',familyId:'dominant-return',skillId:'compare',correct:true,independent:true,
    technicalUncertainty:false,at:1,seed:'1',generatorVersion:'android-aural-1',fingerprint:'history',
    key:'C',variantId:'direct',support:0,transfer:false,assistance:[],plays:1,attempt:1,
    microphoneKind:null,requestedVariantId:null,instrumentOverride:null,octaveShift:0,corpus:null,...input,
  };
}
function progress(input:ProgressInput = {}):AuralProgress {
  return createAuralProgress({...input,cells:Object.fromEntries(Object.entries(input.cells ?? {})
    .map(([key,value]) => [key,createAuralCell(value)])),recent:(input.recent ?? []).map(history)});
}
function frozen<T>(value:T):T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

describe('frozen native typed curriculum evidence', () => {
  it('matches60 independent Kotlin cases/80 steps with unchanged source authority and pure inputs', () => {
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(native.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(native.pureSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(native.cases).toHaveLength(60);
    expect(native.cases.reduce((total,value) => total + value.steps.length,0)).toBe(80);
    for (const value of native.cases as unknown as NativeCase[]) {
      let p = progress(value.progress), e = exercise(value.exercise);
      const outputs:unknown[] = [];
      for (const step of value.steps) {
        if (step.exercise) e = exercise(step.exercise);
        frozen(p); frozen(e);
        const before = JSON.stringify({p,e});
        let nextP = p, nextE = e;
        switch (step.op) {
          case 'normalize': nextP = normalizeAuralProgress(p); outputs.push(nextP); break;
          case 'cell': outputs.push(auralCell(p,'dominant-return','compare')); break;
          case 'begin': {
            const begun = beginAuralExercise(p,e,step.now!);
            nextP = begun.progress; nextE = begun.exercise; outputs.push(begun); break;
          }
          case 'evaluate': outputs.push(evaluateAuralExercise(e,step.response!)); break;
          case 'record':
            nextP = recordAuralAttempt(p,e,step.correct!,{now:step.now!,assistance:step.assistance,
              plays:step.plays,attempt:step.attempt,technicalUncertainty:step.technicalUncertainty});
            outputs.push(nextP); break;
        }
        expect(JSON.stringify({p,e}),value.label+' mutation').toBe(before);
        p = nextP; e = nextE;
      }
      expect(outputs,value.label).toEqual(value.expected);
    }
  });

  it('retains richer exercise/provenance metadata and complete unknown nested corpus JSON', () => {
    const corpus = frozen({external:{future:[null,true,0,1.25,'x',{nested:['unchanged']}],unknown:'retain'},
      '__proto__':null});
    const base = exercise();
    const rich = frozen({...base,events:[{notes:[60,64,67],future:true}],prompt:'retain',
      previouslyExposed:false as const,exposureRegistered:false as const,
      provenance:{...base.provenance,corpus,generatorVersion:'richer',target:{
        ...base.provenance.target,pattern:{id:'opaque-pattern',tokens:['unknown']}}}});
    const begun = beginAuralExercise(createAuralProgress(),rich,1234);
    expect(begun.exercise.events).toEqual(rich.events);
    expect(begun.exercise.provenance).toEqual(rich.provenance);
    expect(begun.exercise.exposureRegistered).toBe(true);
    const p = recordAuralAttempt(begun.progress,begun.exercise,true,{now:1235});
    expect(p.recent[0].corpus).toEqual(corpus);
    expect(normalizeAuralProgress(p).recent[0].corpus).toEqual(corpus);
    expect(rich.previouslyExposed).toBe(false);
    expect(rich.exposureRegistered).toBe(false);
  });


  it('snapshots opaque corpus at begin/record/normalize boundaries against legal later caller mutation', () => {
    const corpus = {unknown:{values:[1,2]},future:{label:'original'}};
    const base = exercise(), source = {...base,provenance:{...base.provenance,corpus}};
    const begun = beginAuralExercise(createAuralProgress(),source,0);
    const recorded = recordAuralAttempt(createAuralProgress(),source,true,{now:1});
    const imported = createAuralProgress({recent:[history({corpus})]});
    const normalized = normalizeAuralProgress(imported);
    corpus.unknown.values.push(3); corpus.future.label = 'changed';
    for (const saved of [begun.exercise.provenance.corpus,recorded.recent[0].corpus,normalized.recent[0].corpus]) {
      expect(saved).toEqual({unknown:{values:[1,2]},future:{label:'original'}});
      expect(saved).not.toBe(corpus);
    }
  });

  it('keeps requested mic kind nullable while grading the chosen kind and retaining technical retries', () => {
    const initial = progress({cells:{'dominant-return:reproduce':
      {practice:4,practiceCorrect:4,microphonePractice:{bass:1}}}});
    const begun = beginAuralExercise(initial,exercise({skillId:'reproduce',microphoneKind:'bass'}),1000);
    const uncertain = recordAuralAttempt(begun.progress,begun.exercise,false,{now:1001,technicalUncertainty:true});
    expect(uncertain.cells).toEqual(begun.progress.cells);
    expect(uncertain.attempts).toBe(0);
    const resolved = recordAuralAttempt(uncertain,begun.exercise,true,{now:1002});
    expect(auralCell(resolved,'dominant-return','reproduce').microphoneIndependent.bass).toBe(1);
    expect(resolved.recent.at(-1)).toMatchObject({independent:true,microphoneKind:null});
  });

  it('validates canonical signedLong seeds without Number conversion, including extrema and lost-precision pairs', () => {
    for (const exact of ['-9223372036854775808','9223372036854775807','9007199254740992','9007199254740993','0']) {
      const p = recordAuralAttempt(createAuralProgress(),exercise({seed:exact}),true,{now:0});
      expect(p.recent[0].seed).toBe(exact);
      expect(normalizeAuralProgress(p).recent[0].seed).toBe(exact);
    }
    for (const invalid of ['9223372036854775808','-9223372036854775809','01','+1','-0','1.0',' 1','1\n','',
      '1'.repeat(1000),1 as unknown as string]) {
      const ex = exercise({seed:invalid});
      expect(() => beginAuralExercise(createAuralProgress(),ex,0)).toThrow(RangeError);
      expect(() => recordAuralAttempt(createAuralProgress(),ex,true,{now:0})).toThrow(RangeError);
    }
  });

  it('rejects unsafe timestamp/review arithmetic and non-native option numbers before returning evidence', () => {
    const p = frozen(createAuralProgress()), ex = frozen(exercise());
    for (const now of [Number.MAX_SAFE_INTEGER+1,Number.NaN,Infinity,1.5]) {
      expect(() => beginAuralExercise(p,ex,now)).toThrow(RangeError);
      expect(() => recordAuralAttempt(p,ex,true,{now})).toThrow(RangeError);
    }
    expect(() => recordAuralAttempt(p,ex,true,{now:Number.MAX_SAFE_INTEGER})).toThrow(RangeError);
    expect(() => normalizeAuralProgress(progress({cells:{'dominant-return:compare':
      {lastAt:Number.MAX_SAFE_INTEGER+1}}}))).toThrow(RangeError);
    expect(() => recordAuralAttempt(p,ex,true,{now:0,plays:1.5})).toThrow(RangeError);
    expect(() => recordAuralAttempt(p,ex,true,{now:0,attempt:Infinity})).toThrow(RangeError);
    expect(p).toEqual(createAuralProgress());
  });

  it('rejects unknown exercises, recomputes flags, and does not renormalize freshly recorded counters', () => {
    expect(() => recordAuralAttempt(createAuralProgress(),exercise({familyId:'bad'}),true,{now:0})).toThrow(RangeError);
    const p = recordAuralAttempt(createAuralProgress({attempts:1_000_000}),exercise(),true,{now:0});
    expect(p.attempts).toBe(1_000_001);
    expect(normalizeAuralProgress(p).attempts).toBe(1_000_000);
    expect(auralCell(progress({cells:{'dominant-return:compare':{mastered:true,support:0}}}),
      'dominant-return','compare')).toMatchObject({mastered:false,support:2});
    expect(auralEvidenceApi.recordAuralAttempt).toBe(recordAuralAttempt);
  });

  it('constructs native defaults without normalizing counters and does not alias mutable containers', () => {
    const keys = ['C'], recentIndependent = [true], microphonePractice = {root:1};
    const cell = createAuralCell({practice:-8,keys,recentIndependent,microphonePractice});
    keys.push('G'); recentIndependent.push(false); microphonePractice.root = 99;
    expect(cell).toMatchObject({practice:-8,practiceCorrect:0,support:2,keys:['C'],recentIndependent:[true],
      microphonePractice:{root:1},microphoneIndependent:{},lastCorrect:null});
    const cells = {'dominant-return:compare':cell};
    const p = createAuralProgress({version:99,cells});
    cells['dominant-return:compare'] = createAuralCell();
    expect(p.cells['dominant-return:compare'].practice).toBe(-8);
    expect(normalizeAuralProgress(p)).toEqual(createAuralProgress());
  });
});