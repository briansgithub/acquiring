import type {AuralSeed} from './evidence-contracts';
import type {AuralBuiltinExercise,AuralBuiltinProvenance,AuralBuiltinTarget} from './generator-contracts';
import type {AuralExampleSettings} from './session-contracts';

/** Projection of an ALREADY TYPED old native builtin exercise, never raw saved JSON.
 * Native AuralSession125..138 validates the complete old AuralExercise via serialization
 * BEFORE this regeneration step. A future JSON eligibility seam must enforce that gate.
 */
export interface AuralBuiltinCurrentProjection {
 readonly seed:AuralSeed;
 readonly generatorVersion:string;
 readonly provenance:{
  readonly target:AuralBuiltinTarget;readonly corpus:null;
  readonly exampleSettings:AuralExampleSettings|null;readonly fallbackReason:string|null;
 };
}
export type AuralRestoredBuiltinExercise=Omit<AuralBuiltinExercise,'previouslyExposed'|'exposureRegistered'|'provenance'> & {
 readonly previouslyExposed:true;readonly exposureRegistered:true;
 readonly provenance:Omit<AuralBuiltinProvenance,'exampleSettings'|'fallbackReason'> & {
  readonly exampleSettings:AuralExampleSettings|null;readonly fallbackReason:string|null;
 };
};
export interface AuralBuiltinCurrentApi {
 restoreAuralBuiltinCurrent(old:AuralBuiltinCurrentProjection):AuralRestoredBuiltinExercise;
}
/** Pure typed projection only: snapshot known top seed/version/provenance and known
 * provenance fields once, before work. Snapshot/validate target through the unchanged
 * accepted builtin generator. Snapshot nine typed settings fields and nullable fallback;
 * strings<=65536 UTF16 (target reason retains1024). Native booleans/strings, no invented
 * enum restrictions or defaults at this already-typed boundary. Return deep-frozen aliases
 * independent of caller objects. Reject nonnull corpus/pattern defensively, never flatten
 * them into builtin examples. No hooks/time/ambient RNG/clock or evidence/progress writes.
 * Regenerate using old.provenance.target and TOP old.seed (canonical signedLong string,
 * exact BigInt range); compare TOP old.generatorVersion AFTER generation. Copy both flags
 * true and replace only provenance.exampleSettings/fallbackReason. Ignore old answers/id/
 * events/etc and old provenance.seed/version, exactly as native AFTER typed eligibility.
 * Errors throw; absent current, warning precedence and preserving raw recovery belong to
 * future callers. Never cast repairAuralSessionEnvelope(...).deferred.current into this
 * input or activate arbitrary saved JSON. No encoder/storage/session actions/UI/audio.
 * <=14NEW independent full native restored-output cases: actual Kotlin2.2.10 serialization
 * plugin+compiler/runtime, unchanged native shapes/theory/generator and125..138 expression.
 * Reuse producer tooling, no old fixture/RNG/builtin recapture. Cover settings/fallback,
 * top-vs-provenance identity, ignored old rich data, flags/support/transfer/overrides/mic,
 * exactLong extrema/>2^53 neighbors/version and generation failure. Browser-only getter/
 * alias/freeze/resource/unsupported-domain tests; native pattern/corpus support excluded.
 */
