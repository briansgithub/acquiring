import type {JsonValue} from '../../contracts';
import type {AuralRestoredBuiltinExercise} from './builtin-current-contracts';
import type {AuralRepairedEnvelope,AuralRepairIssue} from './session-contracts';

export interface AuralPlaybackReturnProjection {
 readonly exerciseId:string;readonly draft:readonly string[];
 readonly heard:boolean;readonly answered:boolean;readonly guidanceVisible:boolean;
 readonly plays:number;readonly attempts:number;readonly assistance:readonly string[];
 readonly feedback:string;readonly open:boolean;readonly fromSongs:boolean;
 /** Complete native typed shape checked; original opaque subtree, deferred for navigation.
  * No musical/source identity validation or reconstruction/default insertion in this subtree. */
 readonly sourcePassage:JsonValue|null;
}
export interface AuralInitialLessonState {
 readonly assistance:readonly string[];readonly plays:number;readonly attempts:number;
 readonly heard:boolean;readonly answered:boolean;readonly guidanceVisible:boolean;readonly feedback:string;
}
export interface AuralBuiltinSessionInitialization {
 readonly saved:AuralRepairedEnvelope & {
  readonly current:AuralRestoredBuiltinExercise|null;
  readonly playbackReturn:AuralPlaybackReturnProjection|null;
 };
 readonly state:AuralInitialLessonState;readonly warning:string;
 readonly issues:readonly AuralRepairIssue[];readonly originalRaw:string|null;
}
export interface AuralBuiltinSessionInitializerApi {
 initializeAuralBuiltinSession(raw:string|null):AuralBuiltinSessionInitialization;
}
/** Pure supported BUILTIN initialization projection, frozen AuralSession10..25/57..66/80..154.
 * Add same-file wrapper/private return schema; reuse accepted repair/current Item decoder/typed
 * regeneration and private parser/scalar leaves UNCHANGED. No parser refactor/export/duplication.
 * First unchanged repair(raw). ANY envelope/fresh issue prevents current/return activation and
 * returns fresh saved fields, null current/return, all state defaults and native fresh warning.
 * Skipping native intermediate current work before final primary-normalize failure is output-
 * equivalent because all accepted dependencies are pure/no clocks/hooks/writes. No I/O in this API.
 * Otherwise parse ORIGINAL raw envelope a second bounded time, use private member Item metadata;
 * never stringify/recast rounded deferred.current. Decode return BEFORE current. Null/absent means
 * null; required/default/nullable return fields match native declarations. Use complete passageDecoder
 * and opaque safety before retaining original sourcePassage. Bad return rejects WHOLE return and
 * adds metadata warning unless history warning outranks it. Nonmatching/out-of-range typed return
 * remains stored; counters arbitrary native Int, no clamping or metadata warning just for range.
 * Then complete current eligibility + accepted typed regeneration, including top version check.
 * Current failure/unsupported corpus/pattern => null plus native unfinished-example warning,
 * overriding metadata/history; fresh envelope still wins. Raw remains exact on every result.
 * Filter base placeholder 'deferred' issues when composed; retain actual safety/refusal issues and
 * add specific return/current codes. Unsupported domains remain recoverable browser refusal only.
 * Initial state [],0,0,false,false,false,''. Restored current => assistance['resumed-example'],
 * guidanceVisible=(support===2), feedback='Resumed example. Listen again; this counts as supported practice.'.
 * If stored return.exerciseId===REGENERATED current.id and plays/attempts EACH0..1000 inclusive:
 * REPLACE assistance with return.assistance+['source-playback']; copy heard/answered/guidanceVisible/
 * plays/attempts/feedback. No open/fromSongs/sourcePassage gate; draft stays in stored return.
 * Input assistance4096 may yield4097 after append: no output truncation/re-normalization.
 * Deep-freeze fresh independent output/aliases. Existing exactLong/string/numeric browser policies,
 *1MiB UTF8/depth32/tokens65536/collections4096/text+keys65536/target reason1024 remain unchanged.
 * Nonstring nonnull JS input throws TypeError. No version/warning/schema changes to old APIs.
 * Both progress stores are exposed; NO derived view selector: native158 uses current.exampleSettings
 * when nonnull, otherwise global settings, and76 selects inversionProgress by distinguishInversions.
 * <=16NEW actual native whole-init projections: real Kotlin2.2.10 plugin/compiler/runtime and unchanged
 * declarations/members/WHOLE init80..154/normalize/theory/generator. Include primary normalization
 * failure overriding valid current/return, plus return match/mismatch/range/open/source/typed damage,
 * history/metadata/current warning precedence and invalid-version fresh guard. ORACLE FIRST; root
 * review/checkpoint before implementation. No old capture/fixtures/RNG/generator recapture.
 * No full class/view rewrite, actions/evidence credit, persistence/encoder/autowrite, UI/audio,
 * return navigation/source music validation or successful corpus/pattern support.
 */
