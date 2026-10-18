import {generateAuralBuiltinExercise} from './aural-generator';
import type {AuralBuiltinCurrentProjection,AuralRestoredBuiltinExercise,AuralBuiltinCurrentApi} from './builtin-current-contracts';
import type {AuralExampleSettings} from './session-contracts';

function object(value:unknown):void {
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new TypeError('Expected an already typed builtin-current object');
}
function text(value:unknown):asserts value is string {
 if(typeof value!=='string'||value.length>65536)throw new RangeError('Expected typed text within65536 UTF16 units');
}
function settingsSnapshot(value:AuralExampleSettings|null):AuralExampleSettings|null {
 if(value===null)return null;
 object(value);
 const {popularity,variety,favorites,distinguishInversions,flatList,analysis,modeFilter,groupingPriority,sortOrder}=value;
 for(const flag of [popularity,variety,favorites,distinguishInversions,flatList])if(typeof flag!=='boolean')throw new TypeError('Expected typed settings booleans');
 for(const label of [analysis,modeFilter,groupingPriority,sortOrder])text(label);
 return Object.freeze({popularity,variety,favorites,distinguishInversions,flatList,analysis,modeFilter,groupingPriority,sortOrder});
}

/** Regeneration projection only: complete native JSON eligibility belongs to a future caller. */
export function restoreAuralBuiltinCurrent(old:AuralBuiltinCurrentProjection):AuralRestoredBuiltinExercise {
 object(old);
 const {seed,generatorVersion,provenance}=old;
 object(provenance);
 const {target,corpus,exampleSettings,fallbackReason}=provenance;
 if(corpus!==null)throw new RangeError('Corpus current restoration is outside the builtin projection');
 text(generatorVersion);
 const settings=settingsSnapshot(exampleSettings);
 if(fallbackReason!==null)text(fallbackReason);
 // The unchanged generator snapshots and validates known target fields, seed and pattern gate.
 const regenerated=generateAuralBuiltinExercise(target,seed);
 if(generatorVersion!==regenerated.generatorVersion)throw new RangeError('Saved current generator version does not match');
 return Object.freeze({...regenerated,previouslyExposed:true,exposureRegistered:true,
  provenance:Object.freeze({...regenerated.provenance,exampleSettings:settings,fallbackReason})});
}
export const auralBuiltinCurrentApi:AuralBuiltinCurrentApi=Object.freeze({restoreAuralBuiltinCurrent});
