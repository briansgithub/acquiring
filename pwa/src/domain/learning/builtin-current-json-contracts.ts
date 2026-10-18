import type {AuralBuiltinCurrentProjection} from './builtin-current-contracts';

export type AuralBuiltinCurrentJsonResult =
 | {readonly status:'absent';readonly originalRaw:string|null}
 | {readonly status:'eligible';readonly projection:AuralBuiltinCurrentProjection;readonly originalRaw:string}
 | {readonly status:'refused';readonly reason:'invalid'|'unsupported';readonly code:string;readonly originalRaw:string};
export interface AuralBuiltinCurrentJsonApi {
 decodeAuralBuiltinCurrentJson(currentRaw:string|null):AuralBuiltinCurrentJsonResult;
}
/** Pure complete old-native BUILTIN current JSON fragment eligibility, frozen801cf798.
 * Add private Item schema/decoder and public raw-fragment wrapper in session-envelope.ts;
 * reuse its private lexical/scalar/struct/list/settings/event/opaque/freeze leaves UNCHANGED.
 * No codec export/refactor or duplicate parser; existing envelope API/behavior/tests unchanged.
 * Null input/JSON literal null => absent; invalid parse/shape/resource/precision/domain => refused.
 * Keep exact originalRaw on every result, even failure. Nonstring nonnull JS input throws TypeError.
 * Eligible alone exposes a deeply frozen independent AuralBuiltinCurrentProjection, after
 * ALL26 exercise fields and required nested native shapes pass. Validate ignored old values too.
 * Required nullable gapIndex/microphoneTask are required despite allowing null. Only native
 * declared defaults apply (flags, event beats, Answer/Task/Target/Provenance/settings fields).
 * Old top-level musical identities/instrument/task labels are typed strings, not invented enums.
 * Validate old provenance seed/version/realization even though regeneration later ignores them.
 * Then unchanged createAuralBuiltinTarget validates the narrowed target without RNG/generation.
 * No top generatorVersion comparison here: unknown version may be eligible; typed restore owns it.
 * Nonnull corpus/pattern => unsupported/refused; no successful unsupported-domain decode claim.
 * Reuse native accepted Int/Long/bool/string/finiteDouble rules, exact numeric lexeme metadata,
 * BigInt/canonical decimal Long output. Unsafe numericLong and unsafe/inexact exponent refusal
 * remain explicit browser extensions. Never Number-round seeds, stringify a rounded deferred
 * object or cast it into this API. No caller object getters; input is raw text only.
 * Apply existing opaque safety pass plus1MiB UTF8/depth32/tokens65536 before JSON.parse,
 * collections4096/strings+keys65536UTF16, target reason1024 via factory. Unknown fields are
 * ignored for typed semantics but remain subject to opaque/resource safety browser extensions.
 * No generated4event/32voice cap on ignored old arrays; no timestamp fields added.
 * Keep private decodeBuiltinCurrentItem(Item) reusable for a FUTURE original-envelope parser.
 * This fragment API does not activate/play, regenerate, resolve envelope version/warning order,
 * encode/autowrite, modify progress/credit, persist storage, support corpus/pattern or implement
 * session actions/assistance/guidance/feedback/playbackReturn/UI/audio. Existing raw recovery is
 * authoritative; future envelope adapter must use ORIGINAL bytes/private member metadata.
 * Reuse14 existing actual-serializer native oldRaw cases/output expectations; no recapture.
 * Test-only lexical quoting of integer seed tokens may exercise exactLong string input without
 * a Number/JSON stringify roundtrip. Distinguish typed eligibility, target-domain refusal and
 * later generatorVersion failure. Cover missing EVERY required field, nested/default/nullable
 * gates, scalars, unknown safety, duplicate last-wins, exponents, unsupported/raw/resource bounds.
 */
