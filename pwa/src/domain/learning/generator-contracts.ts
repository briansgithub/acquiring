import type {Waveform} from '../../audio/synth';
import type {AuralSeed,AuralEvidenceTarget,AuralExerciseEvidence} from './evidence-contracts';

export type AuralBuiltinFamilyId='dominant-return'|'plagal-return'|'predominant-cadence'|'deceptive-return'|'relative-motion'|'secondary-dominant';
export type AuralBuiltinSkillId='guided'|'compare'|'identify'|'recall'|'complete'|'audiate'|'reproduce';
export type AuralMicrophoneKind='root'|'bass'|'scaleDegree'|'rootSequence';
export interface AuralBuiltinTarget extends AuralEvidenceTarget {
  readonly familyId:AuralBuiltinFamilyId;readonly skillId:AuralBuiltinSkillId;
  readonly support:0|1|2;readonly transfer:boolean;readonly reason:string;
  readonly microphoneKind:AuralMicrophoneKind|null;readonly variantId:string|null;
  readonly instrumentOverride:Waveform|null;readonly octaveShift:0|1;readonly pattern:null;
}
export interface AuralBuiltinEvent {
  readonly notes:readonly number[];readonly rootMidi:number;readonly bassMidi:number;
  readonly degree:string;readonly functionLabel:string;readonly beats:number;
}
export interface AuralBuiltinOption {readonly id:string;readonly label:string;readonly degrees:readonly string[]}
export interface AuralBuiltinMicrophoneTask {
  readonly kind:AuralMicrophoneKind;readonly label:string;readonly eventIndices:readonly number[];
  readonly targetMidis:readonly number[];readonly scaleDegree:number|null;
}
export interface AuralBuiltinProvenance {
  readonly generatorVersion:string;readonly seed:AuralSeed;readonly target:AuralBuiltinTarget;
  readonly variantId:string;readonly keyTonic:string;readonly tempo:number;
  readonly instrument:Waveform|'sine'|'triangle'|'soft';readonly inversions:readonly number[];
  readonly register:number;readonly spreads:readonly boolean[];readonly contextDegrees:readonly string[];
  readonly corpus:null;readonly exampleSettings:null;readonly fallbackReason:null;
}
export interface AuralBuiltinExercise extends AuralExerciseEvidence {
  readonly familyId:AuralBuiltinFamilyId;readonly skillId:AuralBuiltinSkillId;readonly support:0|1|2;
  readonly tempo:number;readonly instrument:Waveform|'sine'|'triangle'|'soft';
  readonly events:readonly AuralBuiltinEvent[];readonly context:readonly AuralBuiltinEvent[];
  readonly fullDegrees:readonly string[];readonly gapIndex:number|null;
  readonly options:readonly AuralBuiltinOption[];
  readonly answer:{readonly degrees:readonly string[];readonly optionId:string|null;readonly targetMidis:readonly number[]};
  readonly microphoneTask:AuralBuiltinMicrophoneTask|null;readonly prompt:string;
  readonly referenceRequired:boolean;readonly guidance:string;readonly provenance:AuralBuiltinProvenance;
  readonly previouslyExposed:false;readonly exposureRegistered:false;
}
/** Built-in generation only; native AuralCurriculum.generate168-231 at frozen801cf798.
 * Exclude scheduler/selectTarget/unlocks, nonnull patterns, corpus adapters, savedsession repair,
 * audio/UI and existing assessment/evidence changes. No ambient clock/Math.random/mutable global RNG.
 * Seed is canonical signed64 decimal text including exact extrema, parsed as BigInt, never Number.
 * Port Kotlin2.2.10 Random(Long)/XorWow/nextInt/rejection/nextDouble/shuffle with exact draw order.
 * JVM UTF16 hashCode, wrapped Int, unsigned unpadded hex and native nested-list text are authoritative.
 * Retain random variant/instrument draws when overrides replace them; preserve short-circuit draws.
 * Reuse accepted interpret/NOTE_TO_PC/SCALE_INTERVALS, no theory orDSP rewrite.
 * Validate/snapshot known target fields once beforegeneration; reject invalid family/skill/support,
 * unknown familyvariant/mic/waveform override, octave outside0..1 andnonnullpattern. Maxreason1024,
 * no inputmutation, return independent deeplyfrozen values. No generated collections beyondnative:
 * events/context<=4,options<=4,microphone targets<=4. Browser finite/resource validation is explicit.
 * Actualtransfer = support===0 &&requestedtransfer; provenance.target uses actualtransfer and reason=''.
 * All rich fields survive existing generic beginAuralExercise<T>; no evidenceAPI changes required.
 */
export interface AuralBuiltinGeneratorApi {
  /** Native defaults support2,transferfalse,reason='',mic/variant/instrument null,octave0,patternnull. */
  createAuralBuiltinTarget(familyId:string,skillId:string,options?:Partial<Omit<AuralBuiltinTarget,'familyId'|'skillId'|'pattern'>>):AuralBuiltinTarget;
  generateAuralBuiltinExercise(target:AuralBuiltinTarget,seed:AuralSeed):AuralBuiltinExercise;
}
