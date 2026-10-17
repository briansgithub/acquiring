import type {JsonValue} from '../../contracts';
import type {AuralProgress} from './evidence-contracts';

export interface AuralExampleSettings {
 readonly popularity:boolean;readonly variety:boolean;readonly favorites:boolean;
 readonly distinguishInversions:boolean;readonly flatList:boolean;
 readonly analysis:string;readonly modeFilter:string;readonly groupingPriority:string;readonly sortOrder:string;
}
export interface AuralSourceExposure {readonly sourceId:string;readonly songId:string;readonly at:number}
export interface AuralRepairedEnvelope {
 readonly version:2;readonly progress:AuralProgress;readonly inversionProgress:AuralProgress;
 /** Canonical nonnegative signed64 decimal text, never a rounded Number. */
 readonly serial:string;readonly microphoneEnabled:boolean;readonly exampleSettings:AuralExampleSettings;
 readonly sourceExposures:readonly AuralSourceExposure[];readonly sourceHistoryReliable:boolean;
}
export type AuralRepairArea='envelope'|'progress'|'inversionProgress'|'metadata'|'history'|'current';
export interface AuralRepairIssue {readonly area:AuralRepairArea;readonly field:string;readonly code:string}
export interface AuralSessionEnvelopeRepair {
 readonly envelope:AuralRepairedEnvelope;readonly issues:readonly AuralRepairIssue[];
 /** Native warning for supported envelope fields. Deferred current/return may later override it. */
 readonly warning:string;
 readonly deferred:{readonly current:JsonValue|null;readonly playbackReturn:JsonValue|null;readonly originalRaw:string|null};
}
/** Pure first saved-session repair projection, Android801cf798 AuralSession80..123/139/150..153.
 * Strict typed decoder with native defaults/ignoreUnknownKeys/explicit-null rules BEFORE reusing
 * unchanged normalizeAuralProgress; the accepted typed reducer is not a JSON decoder.
 * Null raw gives fresh defaults/no warning. Nonobject/malformed/unsupported envelope version
 * gives fresh defaults/native fresh-session warning, retaining originalRaw. Missing version=1;
 * mirror native JsonPrimitive.intOrNull fallback and structural-error behavior, accept1..2.
 * Isolate bad present progress/inversion/settings/serial/mic/history; absent fields use defaults.
 * Match native decode-versus-normalize ordering: inversion normalization inside its field guard,
 * primary normalization last/outer guard. Invalid primary normalization can reset whole envelope.
 * Do not fabricate per-cell salvage from a failed typed progress decode. Unknown keys are ignored.
 * Metadata warning first; unreliable-history warning overrides. No current/return decode, warning
 * validation or full-session claim: preserve their raw JsonValue and mark nonnull payloads deferred.
 * These values NEVER enter playback/assessment/evidence. No encoder/autowrite: retain originalRaw
 * even on errors/resource refusal to avoid overwriting unsupported or damaged recoverable data.
 * Exposure items: individually drop bad native decode/at<0/sourceId outside1..1000/blank songId;
 * any damaged container/item makes history unreliable. Last sourceId wins, retained-last order.
 * Settings v1 allModes->relativeMajor; missing sortOrder forces grouping none/sort mostSongs.
 * Native nine-field defaults and strings survive, no invented enum restriction.
 * PWA Long outputs serial/attempt seeds canonical decimal text. Accept exact native string integer
 * lexemes or safe numeric Int/Long inputs under native decode rules, wrap/round NONE; clamp valid
 * negative serial to0. Reject unsafe numeric Longs in their field rather than silently losing bits.
 * Native import of numeric Long>2^53 is excluded; freshPWA profiles need no Android migration.
 * Validate nested native AuralCorpusProvenance/SourcePassage/Event/ExampleSettings JSON shapes
 * with required/default fields as part of typed progress decoding, including nested exact Longs;
 * no auralWithCorpus musical/source-identity validation or corpus reconstruction in this slice.
 * Validated opaque corpus JSON, including unknown nested attributes, survives unchanged; reject nonfinite/unsafe integer JSON values in
 * affected typed history fields as an explicit browser extension; originalRaw remains exact.
 * Browser limits: raw<=1MiB UTF8, lexical depth<=32/tokens<=65536 BEFORE JSON.parse; field
 * collections<=4096/cells<=1024 before decoding; strings<=65536 UTF16 units, including opaque JSON.
 * Global parse bounds reset envelope; field bounds isolate field damage where ordering permits.
 * Deeply freeze independent outputs; no caller input object/getters (raw string only), no clocks/RNG.
 * <=16NEW independent native field-repair projections, pinned Kotlin2.2.10 serialization plugin
 * plus compiler/runtime. Capture unchanged native field blocks/constructors/realJSONdecoder;
 * oracle inputs omit current/return (deferred policy has separate browser-only tests).
 * Exclude builtin-current/corpus/pattern restoration, session class/actions/credit, storage records,
 * imports/migrations, UI/audio, dependency/accepted evidence/RNG/generator changes or old recapture.
 */
export interface AuralSessionEnvelopeApi {
 repairAuralSessionEnvelope(raw:string|null):AuralSessionEnvelopeRepair;
}
