import type {AuralProgress,AuralSeed} from './evidence-contracts';
import type {AuralBuiltinTarget} from './generator-contracts';

/** Frozen Android801cf798 AuralCurriculum105-147: pure built-in curriculum only.
 * Reuse unchanged auralCell/normalizeAuralProgress, Kotlin2.2.10 RNG and target factory.
 * Unlock queries use cleaned cells WITHOUT progress.version reset; selector normalizes first.
 * Unknown family/skill, including pattern family IDs, returns false for unlock queries.
 * Snapshot only required known progress/cell fields once, no caller mutation or arbitrary extras.
 * Only six built-in families x seven skills affect selection. Recent/exposure history and corpus
 * are not selection inputs: do not inspect/clone them. No saved-JSON decoding or repair here.
 * Browser bounds: inspected cell.keys/recentIndependent arrays <=4096 each; known four mic
 * counters only. Reuse native Int/time validation in accepted cell cleaning. No ambient clock/RNG.
 * now is REQUIRED finite safe-integer milliseconds, negatives allowed; microphoneEnabled boolean.
 * Seed is canonical signed64 decimal text: XOR normalized attempts with BigInt, wrap signed64,
 * then pass exact decimal text to accepted KotlinRandom; never convert seed to Number.
 * Preserve family/skill/prerequisite declaration order, lane priority, stable due-time ties,
 * pending-versus-frontier selection, exact draws and all-four microphone shuffle before min.
 * Evidence prerequisite: independentCorrect>=2 and recent accuracy>=.6; guided practice threshold4.
 * Family prerequisites use identify; later skills require their immediate predecessor.
 * Due/weak include mastered cells. Selector normalizes attempts cap1_000_000 before lane/RNG.
 * Reproduce: first zero-practice mic in native order; otherwise shuffle all four then stable min
 * independent count. Unseen mic forces support>=1. Introduction reason precedes transfer reason.
 * Transfer requires support0, independentCorrect>=2 and (attempts%3===0 OR correct>=4/transfer<2).
 * Return fresh deeply frozen native target with exact reason/default overrides, octave0/patternnull.
 * Exclude pattern/corpus selection, session persistence/repair, generation changes, audio/UI,
 * evidence/assessment/RNG rewrites and all accepted fixture recaptures. <=24 NEW native cases.
 */
export interface AuralBuiltinSchedulerApi {
  auralFamilyUnlocked(progress:AuralProgress,familyId:string):boolean;
  auralSkillUnlocked(progress:AuralProgress,familyId:string,skillId:string):boolean;
  selectAuralBuiltinTarget(progress:AuralProgress,seed:AuralSeed,now:number,microphoneEnabled?:boolean):AuralBuiltinTarget;
}
