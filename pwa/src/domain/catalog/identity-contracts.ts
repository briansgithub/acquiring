export interface AuralCatalogIdentityApi {
 auralPatternId(tokens:readonly string[],view:string):Promise<string>;
}
/** Pure stable pattern identity only, frozen801cf798 AuralCatalog.kt38..47 unchanged.
 * Per token: SHA256 of exact UTF8 bytes, first4 signed32 little-endian words;
 * four accumulators start0, update hash*multiplier+word with native Int overflow.
 * Multipliers16777619,2246822519,3266489917,668265263 (signed/unsigned bit patterns
 * identical). Use exact32-bit multiplication/addition, never lossy JS integer products.
 * Namespace: first12 lowercase SHA256 hex of 'aural-normalizer-1'+NUL+exact view.
 * Result p_<namespace>_<token count>_<four unsigned lowercase zero-padded8digit hashes>.
 * No token/view normalization, JSON parse/stringify, sorting/deduplication or separators
 * between token hashes; order and duplicates matter. Empty tokens/view/list are meaningful.
 *
 * BROWSER-domain safety: real indexed array, <=10000 tokens, each token<=65536 UTF16
 * units/view<=4096, aggregate exact UTF8 token bytes<=8388608 (namespace view separately
 * bounded). Reject ill-formed UTF16 (Java replacement bytes differ from TextEncoder).
 * Wrong type/array/shape rejects Promise with TypeError; cap/ill-formed strings RangeError.
 * Capture array length/each indexed value exactly once and bound before copying; never
 * call input iterator/unknown getters. Snapshot/encode all bytes BEFORE first async wait,
 * so caller mutation cannot change an ID. Reentry uses independent locals, no global cache.
 * Use actual Web Crypto SHA256; no dependency/new hash implementation or injected fake.
 * Crypto failure rejects without side effects; no storage/worker construction/network.
 * Export frozen auralCatalogIdentityApi; Promise result is a string, input stays untouched.
 *
 * <=16NEW named actual JVM groups using unchanged native function/imports, cached pinned
 * Kotlin toolchain and native MessageDigest/ByteBuffer/Int overflow. Retain source hash,
 * exact portable inputs/outputs/provenance; no hand/TS expected output or old recapture.
 * Cover empty/list/view, token boundaries/order/repeats, all lanes/overflow/zero padding,
 * ASCII/NUL/newlines, valid surrogate pairs/nonASCII/combining strings, long bounded inputs.
 * Browser-only bounds/getter/iterator/mutation/reentry/error cases separate from native.
 * Oracle-first producer/fixture/log checkpoint and root review before implementation.
 * No query/parser/SQL/ranking/stats/grouping/runtime catalog/target construction/session/UI,
 * old fixture rewrites, dependencies or other package exports. This is identity, not T15 completion.
 */
