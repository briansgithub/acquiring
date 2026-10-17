/** Built-in-only AuralCurriculum.generate at frozen801cf798, using Kotlin2.2.10 draws. */
import { Waveform } from '../../audio/synth/instruments';
import { interpret, NOTE_TO_PC, SCALE_INTERVALS } from '../music';
import type { KeyInfo } from '../music';
import type { AuralSeed } from './evidence-contracts';
import type {
  AuralBuiltinEvent, AuralBuiltinExercise, AuralBuiltinFamilyId, AuralBuiltinGeneratorApi,
  AuralBuiltinMicrophoneTask, AuralBuiltinOption, AuralBuiltinSkillId, AuralBuiltinTarget, AuralMicrophoneKind,
} from './generator-contracts';
import { KotlinRandom, jvmStringHash, kotlinListText, kotlinUIntHex } from './kotlin-random';

const VERSION = 'android-aural-1';
interface Variant { id:string; degrees:string[] }
interface Family { id:AuralBuiltinFamilyId; description:string; variants:Variant[] }
const variant = (id:string, ...degrees:string[]):Variant => ({id, degrees});
const FAMILIES:readonly Family[] = [
  {id:'dominant-return',description:'Hear dominant tension return to tonic.',variants:[variant('direct','V','I'),variant('departure','I','V','I')]},
  {id:'plagal-return',description:'Compare a gentler subdominant return with the dominant return.',variants:[variant('direct','IV','I'),variant('departure','I','IV','I')]},
  {id:'predominant-cadence',description:'Add a predominant before the familiar dominant–tonic fragment.',variants:[variant('supertonic','ii','V','I'),variant('subdominant','IV','V','I'),variant('departure','I','ii','V','I')]},
  {id:'deceptive-return',description:'Hear dominant arrive at relative minor instead of tonic.',variants:[variant('direct','V','vi'),variant('prepared','ii','V','vi'),variant('departure','I','V','vi')]},
  {id:'relative-motion',description:'Connect tonic and relative minor, then return through familiar functions.',variants:[variant('direct','I','vi'),variant('return','I','vi','IV','I'),variant('cadence','vi','ii','V','I')]},
  {id:'secondary-dominant',description:'Hear an altered chord intensify the approach to dominant.',variants:[variant('direct','V/V','V','I'),variant('departure','I','V/V','V','I')]},
];
const SKILLS:readonly AuralBuiltinSkillId[] = ['guided','compare','identify','recall','complete','audiate','reproduce'];
const MICROPHONES:readonly AuralMicrophoneKind[] = ['root','bass','scaleDegree','rootSequence'];
const DEGREES = ['I','ii','iii','IV','V','vi','vii°','V/V'];
const KEYS = ['C','G','F','D','Bb','A','Eb','E','Ab','B','Db','Gb'];
const INSTRUMENTS:readonly string[] = Object.values(Waveform);
type TargetOptions = Partial<Omit<AuralBuiltinTarget,'familyId'|'skillId'|'pattern'>>;

/** Called only with fresh, bounded plain output; never walks a caller's graph. */
function freeze<T>(value:T):T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function object(value:unknown):asserts value is Record<string,unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an aural target object');
}
function validated(raw:Record<string,unknown>):AuralBuiltinTarget {
  const {familyId,skillId,support,transfer,reason,microphoneKind,variantId,instrumentOverride,octaveShift,pattern} = raw;
  const family = FAMILIES.find(item => item.id === familyId);
  if (!family) throw new RangeError('Unknown harmonic family');
  if (!SKILLS.some(item => item === skillId)) throw new RangeError('Unknown aural skill');
  if (support !== 0 && support !== 1 && support !== 2) throw new RangeError('Support must be 0, 1, or 2');
  if (typeof transfer !== 'boolean') throw new TypeError('Transfer must be boolean');
  if (typeof reason !== 'string' || reason.length > 1024) throw new RangeError('Invalid aural target reason');
  if (microphoneKind !== null && !MICROPHONES.some(item => item === microphoneKind)) throw new RangeError('Unknown microphone task');
  if (variantId !== null && !family.variants.some(item => item.id === variantId)) throw new RangeError('Unknown progression in this family');
  if (instrumentOverride !== null && !INSTRUMENTS.some(item => item === instrumentOverride)) throw new RangeError('Unknown default instrument');
  if (octaveShift !== 0 && octaveShift !== 1) throw new RangeError('Unsupported quiz octave shift');
  if (pattern !== null) throw new RangeError('Pattern generation is outside the built-in generator');
  return freeze({familyId:family.id,skillId:skillId as AuralBuiltinSkillId,support,transfer,reason,
    microphoneKind:microphoneKind as AuralMicrophoneKind|null,variantId:variantId as string|null,
    instrumentOverride:instrumentOverride as Waveform|null,octaveShift,pattern:null});
}

export function createAuralBuiltinTarget(familyId:string, skillId:string, options:TargetOptions = {}):AuralBuiltinTarget {
  object(options);
  // Snapshot known fields exactly once; ignore arbitrary extra values/iterators.
  const {support=2,transfer=false,reason='',microphoneKind=null,variantId=null,instrumentOverride=null,octaveShift=0} = options;
  const pattern = (options as Record<string,unknown>).pattern;
  if (pattern !== undefined && pattern !== null) throw new RangeError('Pattern generation is outside the built-in generator');
  return validated({familyId,skillId,support,transfer,reason,microphoneKind,variantId,instrumentOverride,octaveShift,pattern:null});
}
function snapshotTarget(input:AuralBuiltinTarget):AuralBuiltinTarget {
  object(input);
  const {familyId,skillId,support,transfer,reason,microphoneKind,variantId,instrumentOverride,octaveShift,pattern} = input;
  return validated({familyId,skillId,support,transfer,reason,microphoneKind,variantId,instrumentOverride,octaveShift,pattern});
}
function equal(a:readonly string[], b:readonly string[]):boolean {
  return a.length === b.length && a.every((item,index) => item === b[index]);
}
function buildEvent(degree:string, key:KeyInfo, inversion=0, register=0, spread=false):AuralBuiltinEvent {
  if (!DEGREES.includes(degree)) throw new RangeError('Unknown harmonic degree');
  const chord = {root:degree === 'V/V' ? 5 : DEGREES.indexOf(degree)+1,type:5,inversion,
    ...(degree === 'V/V' ? {applied:5} : {})};
  const interpreted = interpret(chord, key);
  if (!interpreted.midi.length || interpreted.rootMidi === null) throw new Error('The theory engine could not realize this chord');
  const notes = interpreted.midi.map((midi,index) => midi + register*12 + (spread && index === interpreted.midi.length-1 ? 12 : 0)).sort((a,b) => a-b);
  const functionLabel = degree === 'V/V' ? 'secondary dominant' : degree === 'V' || degree === 'vii°' ? 'dominant'
    : degree === 'ii' || degree === 'IV' ? 'predominant' : 'tonic';
  return {notes,rootMidi:interpreted.rootMidi+register*12,bassMidi:notes[0],degree,functionLabel,beats:2};
}
function alternatives(degrees:readonly string[], familyId:AuralBuiltinFamilyId):string[][] {
  const choices = FAMILIES.flatMap(family => family.variants.map(item => [...item.degrees])).filter(item => item.length === degrees.length);
  for (let index=0; index<degrees.length; index++) {
    const choice = [...degrees];
    choice[index] = choice[index] === 'V/V' ? 'ii' : choice[index] === 'V' ? 'IV' : choice[index] === 'I' ? 'vi' : choice[index] === 'vi' ? 'I' : 'V';
    choices.push(choice);
  }
  return choices.filter((item,index) => !choices.slice(0,index).some(previous => equal(previous,item)))
    .filter(item => !equal(item,degrees) && (familyId === 'secondary-dominant' || !item.includes('V/V')));
}

export function generateAuralBuiltinExercise(input:AuralBuiltinTarget, seed:AuralSeed):AuralBuiltinExercise {
  const target = snapshotTarget(input);
  const family = FAMILIES.find(item => item.id === target.familyId)!;
  const rng = new KotlinRandom(seed);
  const support = target.support;
  const transfer = support === 0 && target.transfer;
  // Both original draws are retained even when explicit overrides replace them.
  const randomVariant = rng.choose(support === 2 ? family.variants.slice(0,1) : family.variants);
  const selected = target.variantId === null ? randomVariant : family.variants.find(item => item.id === target.variantId)!;
  const degrees = [...selected.degrees];
  const key:KeyInfo = {tonic:rng.choose(support === 2 ? KEYS.slice(0,3) : support === 1 ? KEYS.slice(0,6) : KEYS),scale:'major'};
  const tempo = rng.choose(support === 2 ? [66,72] : support === 1 ? [66,72,80] : transfer ? [60,84,96] : [66,72,80,88]);
  const generatedInstrument = rng.choose(support === 2 ? ['sine'] as const : support === 1 ? ['sine','triangle'] as const : ['sine','triangle','soft'] as const);
  const instrument = target.instrumentOverride ?? generatedInstrument;
  const register = (support === 2 ? 0 : rng.choose(support === 1 ? [0,0,1] : [-1,0,1])) + target.octaveShift;
  const inversions = degrees.map(() => support === 2 ? 0 : support === 1 ? rng.choose([0,0,1]) : rng.nextInt(3));
  const spreads = degrees.map(() => support === 0 && (transfer || rng.nextDouble() > .65));
  const events = degrees.map((degree,index) => buildEvent(degree,key,inversions[index],register,spreads[index]));
  const contextDegrees = support > 0 ? ['I'] : rng.choose(transfer ? [['I','IV','V','I'],['I','ii','V','I']] : [['I'],['I','V','I']]);
  const context = contextDegrees.map(degree => buildEvent(degree,key,0,register));
  const skill = target.skillId;
  const gapIndex = skill === 'audiate' ? events.length-1 : skill === 'complete' ? rng.nextInt(events.length) : null;
  const answerDegrees = gapIndex === null ? degrees : [degrees[gapIndex]];
  const responseType = skill === 'guided' ? 'guided' : skill === 'reproduce' ? 'microphone' : skill === 'compare' || skill === 'identify' ? 'choice' : 'sequence';
  let options:AuralBuiltinOption[] = [];
  if (responseType === 'choice') {
    const count = skill === 'compare' || support === 2 ? 1 : support === 1 ? 2 : 3;
    options = rng.shuffled([degrees,...rng.shuffled(alternatives(degrees,family.id)).slice(0,count)])
      .map((item,index) => ({id:'option-'+(index+1),label:item.join(' → '),degrees:item}));
  }
  let microphoneTask:AuralBuiltinMicrophoneTask|null = null;
  if (skill === 'reproduce') {
    const kind = target.microphoneKind ?? rng.choose(support === 2 ? ['root'] as const : MICROPHONES);
    const index = rng.nextInt(events.length);
    const indices = kind === 'rootSequence' ? events.map((_,i) => i) : [index];
    const scaleDegree = rng.choose([1,3,5]);
    const midis = kind === 'scaleDegree' ? [48+target.octaveShift*12+NOTE_TO_PC[key.tonic]+SCALE_INTERVALS.major[scaleDegree-1]]
      : indices.map(i => kind === 'bass' ? events[i].bassMidi : events[i].rootMidi);
    const label = kind === 'rootSequence' ? 'Sing the chord roots in order. Any comfortable octave is accepted.'
      : kind === 'scaleDegree' ? `Sing scale degree ${scaleDegree} in the established key. Any comfortable octave is accepted.`
      : `Sing the ${kind === 'bass' ? 'lowest sounding note (bass)' : 'chord root'} of chord ${index+1}. Any comfortable octave is accepted.`;
    microphoneTask = {kind,label,eventIndices:kind === 'scaleDegree' ? [] : indices,targetMidis:midis,scaleDegree:kind === 'scaleDegree' ? scaleDegree : null};
  }
  const answer = {degrees:answerDegrees,optionId:options.find(item => equal(item.degrees,degrees))?.id ?? null,targetMidis:microphoneTask?.targetMidis ?? []};
  const soundIdentity = instrument === Waveform.SINE ? 'sine' : instrument === Waveform.TRIANGLE ? 'triangle' : instrument === Waveform.WARM_ORGAN ? 'soft' : instrument;
  const fingerprintText = [family.id,selected.id,key.tonic,String(tempo),soundIdentity,
    kotlinListText(events.map(event => event.notes)),kotlinListText(context.map(event => event.notes))].join('|');
  const fingerprint = 'realization-'+kotlinUIntHex(jvmStringHash(fingerprintText));
  const selectionIdentity = (target.variantId === null ? '' : ':selected-'+target.variantId)
    + (target.instrumentOverride === null ? '' : ':instrument-'+target.instrumentOverride) + (target.octaveShift === 0 ? '' : ':octave-'+target.octaveShift);
  const id = 'aural-'+kotlinUIntHex(jvmStringHash(`${VERSION}:${family.id}:${skill}:${support}:${transfer}:${microphoneTask?.kind ?? 'null'}:${seed}${selectionIdentity}`));
  const prompts:Record<Exclude<AuralBuiltinSkillId,'reproduce'>,string> = {
    guided:'Listen for the changing feeling of tension and arrival.',compare:'Which relationship matches what you heard?',
    identify:'Identify the progression you heard.',recall:'Listen once, then rebuild the progression from memory.',
    complete:'Learn the complete model, then restore the missing chord from memory.',
    audiate:'Learn the complete model. Internally hear its silent ending before answering.',
  };
  const prompt = skill === 'reproduce' ? microphoneTask!.label : prompts[skill];
  return freeze({id,familyId:family.id,variantId:selected.id,skillId:skill,support,transfer,seed,generatorVersion:VERSION,
    keyTonic:key.tonic,tempo,instrument,events,context,fullDegrees:degrees,gapIndex,options,answer,responseType,microphoneTask,
    fingerprint,prompt,referenceRequired:skill === 'complete' || skill === 'audiate',guidance:degrees.join(' → ')+'. '+family.description,
    provenance:{generatorVersion:VERSION,seed,target:{...target,transfer,reason:''},variantId:selected.id,keyTonic:key.tonic,
      tempo,instrument,inversions,register,spreads,contextDegrees,corpus:null,exampleSettings:null,fallbackReason:null},
    previouslyExposed:false,exposureRegistered:false});
}

export const auralBuiltinGeneratorApi:AuralBuiltinGeneratorApi = Object.freeze({createAuralBuiltinTarget,generateAuralBuiltinExercise});
