import type {JsonValue} from '../../contracts';

/** Canonical signed64-bit decimal text. Evidence copies it without Number conversion. */
export type AuralSeed=string;
export interface AuralCell {
  readonly practice:number;readonly practiceCorrect:number;
  readonly independentAttempts:number;readonly independentCorrect:number;readonly transferCorrect:number;
  readonly keys:readonly string[];readonly mastered:boolean;readonly support:number;
  readonly lastAt:number;readonly dueAt:number;readonly lastCorrect:boolean|null;readonly streak:number;
  readonly recentIndependent:readonly boolean[];
  readonly microphonePractice:Readonly<Record<string,number>>;
  readonly microphoneIndependent:Readonly<Record<string,number>>;
}
export interface AuralExposure {readonly fingerprint:string;readonly id:string;readonly at:number}
export interface AuralAttemptRecord {
  readonly id:string;readonly familyId:string;readonly skillId:string;readonly correct:boolean;
  readonly independent:boolean;readonly technicalUncertainty:boolean;readonly at:number;readonly seed:AuralSeed;
  readonly generatorVersion:string;readonly fingerprint:string;readonly key:string;readonly variantId:string;
  readonly support:number;readonly transfer:boolean;readonly assistance:readonly string[];
  readonly plays:number;readonly attempt:number;readonly microphoneKind:string|null;
  readonly requestedVariantId:string|null;readonly instrumentOverride:string|null;
  readonly octaveShift:number;readonly corpus:JsonValue|null;
}
export interface AuralProgress {
  readonly version:number;readonly cells:Readonly<Record<string,AuralCell>>;readonly attempts:number;
  readonly recent:readonly AuralAttemptRecord[];readonly exposures:readonly AuralExposure[];
}
export interface AuralEvidenceTarget {
  readonly microphoneKind:string|null;readonly variantId:string|null;
  readonly instrumentOverride:string|null;readonly octaveShift:number;
}
export interface AuralEvidenceProvenance {readonly target:AuralEvidenceTarget;readonly corpus:JsonValue|null}
/** Projection consumed by evidence; richer generator metadata is preserved by begin. */
export interface AuralExerciseEvidence {
  readonly id:string;readonly familyId:string;readonly variantId:string;readonly skillId:string;
  readonly generatorVersion:string;readonly keyTonic:string;readonly fingerprint:string;readonly responseType:string;
  readonly support:number;readonly transfer:boolean;readonly seed:AuralSeed;
  readonly answer:{readonly degrees:readonly string[];readonly optionId:string|null};
  readonly microphoneTask:{readonly kind:string}|null;readonly provenance:AuralEvidenceProvenance;
  readonly previouslyExposed?:boolean;readonly exposureRegistered?:boolean;
}
export type BegunAuralExercise<T extends AuralExerciseEvidence>=Omit<T,'previouslyExposed'|'exposureRegistered'>&{
  readonly previouslyExposed:boolean;readonly exposureRegistered:boolean;
};
export interface AuralRecordOptions {
  readonly now:number;readonly assistance?:readonly string[];readonly plays?:number;readonly attempt?:number;
  readonly technicalUncertainty?:boolean;
}
/** Typed native-domain reducers, not a decoder for arbitrary saved-session JSON. */
export interface AuralEvidenceApi {
  createAuralProgress(overrides?:Partial<AuralProgress>):AuralProgress;
  createAuralCell(overrides?:Partial<AuralCell>):AuralCell;
  auralCell(progress:AuralProgress,familyId:string,skillId:string):AuralCell;
  normalizeAuralProgress(progress:AuralProgress):AuralProgress;
  beginAuralExercise<T extends AuralExerciseEvidence>(progress:AuralProgress,exercise:T,now:number):{
    readonly progress:AuralProgress;readonly exercise:BegunAuralExercise<T>;
  };
  evaluateAuralExercise(exercise:AuralExerciseEvidence,response:readonly string[]):boolean;
  recordAuralAttempt(progress:AuralProgress,exercise:AuralExerciseEvidence,correct:boolean,options:AuralRecordOptions):AuralProgress;
}
