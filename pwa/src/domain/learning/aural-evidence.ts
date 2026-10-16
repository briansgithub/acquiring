import type {
  AuralCell, AuralEvidenceApi, AuralExerciseEvidence, AuralProgress, AuralRecordOptions,
  BegunAuralExercise,
} from './evidence-contracts';

const DAY = 86_400_000;
const MAX_RECENT = 120, MAX_EXPOSURES = 512, RECENT_WINDOW = 8;
const FAMILIES = new Set(['dominant-return','plagal-return','predominant-cadence',
  'deceptive-return','relative-motion','secondary-dominant']);
const SKILLS = new Set(['guided','compare','identify','recall','complete','audiate','reproduce']);
const MICROPHONE_KINDS = new Set(['root','bass','scaleDegree','rootSequence']);
const KEYS = new Set(['C','G','F','D','Bb','A','Eb','E','Ab','B','Db','Gb']);
const LONG_MIN = -9223372036854775808n, LONG_MAX = 9223372036854775807n;

const knownFamily = (id:string):boolean =>
  FAMILIES.has(id) || /^p_[0-9a-f]{12}_[0-9]+_[0-9a-f]{32}$/.exec(id)?.[0] === id;
const clamp = (value:number, low:number, high:number):number => Math.min(high, Math.max(low, value));
function nativeInt(value:number):number {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new RangeError('Evidence counters and options must be native Int values.');
  }
  return value;
}
function timestamp(value:number):number {
  if (!Number.isSafeInteger(value)) throw new RangeError('Evidence milliseconds must be safe integers.');
  return value;
}
function seed(value:string):void {
  if (typeof value !== 'string' || value.length > 20 || !/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(value)) {
    throw new RangeError('Evidence seed must be canonical signed64-bit decimal text.');
  }
  const exact = BigInt(value);
  if (exact.toString() !== value || exact < LONG_MIN || exact > LONG_MAX) throw new RangeError('Evidence seed exceeds signed64-bit range.');
}
const count = (map:Readonly<Record<string,number>>, key:string):number =>
  Object.hasOwn(map, key) ? map[key]! : 0;

/** Typed native constructor defaults; does not normalize or infer learning evidence. */
export function createAuralCell(overrides:Partial<AuralCell> = {}):AuralCell {
  return {
    practice:0, practiceCorrect:0, independentAttempts:0, independentCorrect:0, transferCorrect:0,
    mastered:false, support:2, lastAt:0, dueAt:0, lastCorrect:null, streak:0,
    ...overrides, keys:[...(overrides.keys ?? [])], recentIndependent:[...(overrides.recentIndependent ?? [])],
    microphonePractice:{...overrides.microphonePractice}, microphoneIndependent:{...overrides.microphoneIndependent},
  };
}
export function createAuralProgress(overrides:Partial<AuralProgress> = {}):AuralProgress {
  return {version:1, attempts:0, ...overrides, cells:{...overrides.cells},
    recent:[...(overrides.recent ?? [])], exposures:[...(overrides.exposures ?? [])]};
}

function cleanCell(cell:AuralCell, skillId:string):AuralCell {
  const attempts = clamp(nativeInt(cell.independentAttempts), 0, 1_000_000);
  const correct = clamp(nativeInt(cell.independentCorrect), 0, attempts);
  const practice = clamp(nativeInt(cell.practice), 0, 1_000_000);
  const practiceCorrect = clamp(nativeInt(cell.practiceCorrect), 0, practice);
  const cleaned:AuralCell = {...cell, practice, practiceCorrect, independentAttempts:attempts,
    independentCorrect:correct, transferCorrect:clamp(nativeInt(cell.transferCorrect), 0, correct),
    keys:[...new Set(cell.keys.filter(key => KEYS.has(key)))].slice(0, Math.min(correct, KEYS.size)),
    lastAt:Math.max(0, timestamp(cell.lastAt)), dueAt:Math.max(0, timestamp(cell.dueAt)),
    streak:clamp(nativeInt(cell.streak), 0, correct),
    recentIndependent:cell.recentIndependent.slice(Math.max(0,cell.recentIndependent.length - Math.min(attempts,RECENT_WINDOW))),
    microphonePractice:Object.fromEntries(Object.entries(cell.microphonePractice)
      .filter(([kind]) => MICROPHONE_KINDS.has(kind)).map(([kind, value]) => [kind, clamp(nativeInt(value), 0, practice)])),
    microphoneIndependent:Object.fromEntries(Object.entries(cell.microphoneIndependent)
      .filter(([kind]) => MICROPHONE_KINDS.has(kind)).map(([kind, value]) => [kind, clamp(nativeInt(value), 0, correct)])),
  };
  const recent = cleaned.recentIndependent;
  const accuracy = recent.length === 0 ? 0 : recent.filter(Boolean).length / recent.length;
  const mastered = correct >= 6 && recent.length >= 6 && accuracy >= 0.8 &&
    cleaned.keys.length >= 3 && cleaned.transferCorrect >= 2 &&
    (skillId !== 'reproduce' || [...MICROPHONE_KINDS].every(kind => count(cleaned.microphoneIndependent, kind) > 0));
  return {...cleaned, mastered, support:practiceCorrect < 2 ? 2 : practiceCorrect < 4 ? 1 : 0};
}

export function normalizeAuralProgress(progress:AuralProgress):AuralProgress {
  if (progress.version !== 1) return createAuralProgress();
  const cells = Object.fromEntries(Object.entries(progress.cells).filter(([key]) => {
    const colon = key.indexOf(':');
    return colon >= 0 && knownFamily(key.slice(0, colon)) && SKILLS.has(key.slice(colon + 1));
  }).map(([key, value]) => [key, cleanCell(value, key.slice(key.indexOf(':') + 1))]));
  const exposures = progress.exposures.filter(value => value.fingerprint.length >= 1 &&
    value.fingerprint.length <= 200 && value.id.length >= 1 && value.id.length <= 200 &&
    timestamp(value.at) >= 0).slice(-MAX_EXPOSURES);
  const recent = progress.recent.filter(value => knownFamily(value.familyId) && SKILLS.has(value.skillId) &&
    KEYS.has(value.key) && value.id.length >= 1 && value.id.length <= 200 &&
    value.support >= 0 && value.support <= 2 &&
    (value.microphoneKind === null || MICROPHONE_KINDS.has(value.microphoneKind))).slice(-MAX_RECENT).map(value => {
    seed(value.seed);
    return {...value, corpus:structuredClone(value.corpus), at:Math.max(0, timestamp(value.at)), generatorVersion:value.generatorVersion.slice(0,40),
      fingerprint:value.fingerprint.slice(0,200), variantId:value.variantId.slice(0,100),
      assistance:value.assistance.slice(0,20).map(help => help.slice(0,80)),
      plays:clamp(nativeInt(value.plays),0,1000), attempt:clamp(nativeInt(value.attempt),0,1000)};
  });
  return {...progress, cells, attempts:clamp(nativeInt(progress.attempts), 0, 1_000_000), exposures, recent};
}

export function auralCell(progress:AuralProgress, familyId:string, skillId:string):AuralCell {
  return cleanCell(progress.cells[familyId + ':' + skillId] ?? createAuralCell(), skillId);
}

export function beginAuralExercise<T extends AuralExerciseEvidence>(
  progress:AuralProgress, exercise:T, now:number,
):{readonly progress:AuralProgress; readonly exercise:BegunAuralExercise<T>} {
  timestamp(now);
  seed(exercise.seed);
  const p = normalizeAuralProgress(progress);
  const snapshot = structuredClone(exercise);
  return {
    progress:{...p, exposures:[...p.exposures, {fingerprint:exercise.fingerprint, id:exercise.id, at:now}].slice(-MAX_EXPOSURES)},
    exercise:{...snapshot, previouslyExposed:p.exposures.some(value => value.fingerprint === exercise.fingerprint),
      exposureRegistered:true},
  };
}

export function evaluateAuralExercise(exercise:AuralExerciseEvidence, response:readonly string[]):boolean {
  if (exercise.responseType === 'choice') return response.length === 1 && response[0] === exercise.answer.optionId;
  if (exercise.responseType === 'sequence') return response.length === exercise.answer.degrees.length &&
    response.every((degree, index) => degree === exercise.answer.degrees[index]);
  return false;
}

/** Only unfamiliar first-pass performance grows mastery. Time is supplied by the caller. */
export function recordAuralAttempt(progress:AuralProgress, exercise:AuralExerciseEvidence,
  correct:boolean, options:AuralRecordOptions):AuralProgress {
  if (!knownFamily(exercise.familyId) || !SKILLS.has(exercise.skillId)) throw new RangeError('Unknown curriculum exercise');
  const {now, assistance = [], plays = 1, attempt = 1, technicalUncertainty = false} = options;
  timestamp(now); seed(exercise.seed); nativeInt(plays); nativeInt(attempt);
  nativeInt(exercise.support); nativeInt(exercise.provenance.target.octaveShift);
  const p = normalizeAuralProgress(progress), old = auralCell(p, exercise.familyId, exercise.skillId);
  const alreadyGraded = p.recent.some(value => value.id === exercise.id && !value.technicalUncertainty);
  const exposed = exercise.exposureRegistered ? exercise.previouslyExposed ?? false
    : p.exposures.some(value => value.fingerprint === exercise.fingerprint);
  const microphoneKind = exercise.microphoneTask?.kind ?? null;
  const microphoneReady = exercise.skillId !== 'reproduce' ||
    microphoneKind !== null && count(old.microphonePractice, microphoneKind) > 0;
  const independent = !technicalUncertainty && exercise.provenance.target.variantId === null &&
    exercise.skillId !== 'guided' && exercise.support === 0 && assistance.length === 0 &&
    plays === 1 && attempt === 1 && !exposed && !alreadyGraded && microphoneReady;
  let updated = old;
  if (!technicalUncertainty && independent) {
    const streak = correct ? old.streak + 1 : 0;
    const interval = correct ? Math.min(30, 2 ** Math.min(5, streak - 1)) * DAY : DAY / 25;
    const dueAt = timestamp(now + interval);
    updated = cleanCell({...old, independentAttempts:old.independentAttempts + 1,
      independentCorrect:old.independentCorrect + (correct ? 1 : 0),
      transferCorrect:old.transferCorrect + (correct && exercise.transfer ? 1 : 0),
      keys:correct ? [...new Set([...old.keys, exercise.keyTonic])] : old.keys,
      lastCorrect:correct, lastAt:now, dueAt, streak,
      recentIndependent:[...old.recentIndependent, correct].slice(-RECENT_WINDOW),
      microphoneIndependent:correct && microphoneKind !== null
        ? {...old.microphoneIndependent, [microphoneKind]:1 + count(old.microphoneIndependent,microphoneKind)}
        : old.microphoneIndependent,
    }, exercise.skillId);
  } else if (!technicalUncertainty) {
    const success = correct && !alreadyGraded && attempt === 1;
    updated = cleanCell({...old, practice:old.practice + 1,
      practiceCorrect:old.practiceCorrect + (success ? 1 : 0),
      microphonePractice:success && microphoneKind !== null
        ? {...old.microphonePractice,[microphoneKind]:1 + count(old.microphonePractice,microphoneKind)}
        : old.microphonePractice,
    }, exercise.skillId);
  }
  const exposures = !exercise.exposureRegistered && !p.exposures.some(value => value.fingerprint === exercise.fingerprint)
    ? [...p.exposures,{fingerprint:exercise.fingerprint,id:exercise.id,at:now}].slice(-MAX_EXPOSURES) : p.exposures;
  const target = exercise.provenance.target;
  const record = {id:exercise.id, familyId:exercise.familyId, skillId:exercise.skillId, correct, independent,
    technicalUncertainty, at:now, seed:exercise.seed, generatorVersion:exercise.generatorVersion,
    fingerprint:exercise.fingerprint, key:exercise.keyTonic, variantId:exercise.variantId, support:exercise.support,
    transfer:exercise.transfer, assistance:[...assistance], plays, attempt, microphoneKind:target.microphoneKind,
    requestedVariantId:target.variantId, instrumentOverride:target.instrumentOverride,
    octaveShift:target.octaveShift, corpus:structuredClone(exercise.provenance.corpus)};
  return {...p, cells:technicalUncertainty ? p.cells : {...p.cells,[exercise.familyId + ':' + exercise.skillId]:updated},
    attempts:p.attempts + (technicalUncertainty ? 0 : 1), recent:[...p.recent,record].slice(-MAX_RECENT), exposures};
}

/** Compile-time agreement with the root-owned frozen contract. */
export const auralEvidenceApi:AuralEvidenceApi = {
  createAuralProgress, createAuralCell, auralCell, normalizeAuralProgress, beginAuralExercise,
  evaluateAuralExercise, recordAuralAttempt,
};
