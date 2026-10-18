export type AuralChordFamily='any'|'major'|'minor'|'7'|'maj7'|'m7';
export interface AuralChordConstraint {
 readonly degree:number;readonly accidental:''|'♭'|'♯';readonly family:AuralChordFamily;
 readonly exact:string|null;readonly inversion:string|null;
}
export interface AuralChordConstraintInput {
 readonly degree:number;readonly accidental?:string;readonly family?:string;
 readonly exact?:string|null;readonly inversion?:string|null;
}
export interface AuralProgressionQuery {
 readonly version:1;readonly chords:readonly AuralChordConstraint[];
}
export interface AuralProgressionQueryInput {
 readonly version?:number;readonly chords?:readonly AuralChordConstraint[];
}
export interface AuralProgressionQueryApi {
 createAuralChordConstraint(input:AuralChordConstraintInput):AuralChordConstraint;
 createAuralProgressionQuery(input?:AuralProgressionQueryInput):AuralProgressionQuery;
 auralChordConstraintLabel(constraint:AuralChordConstraint):string;
 auralCanonicalChord(label:string):string;
 matchesAuralChordConstraint(constraint:AuralChordConstraint,label:string,rootLabel?:string):boolean;
 matchesAuralProgressionQuery(query:AuralProgressionQuery,labels:readonly string[],rootLabels?:readonly string[]):boolean;
}
/** Pure native query/matcher only: frozen801cf798 AuralProgressionQuery.kt WHOLE file and
 * private AuralCorpus.kt26..27/35..51 parser dependency, NOT theory-parser substitution.
 * degree integer1..7, accidental empty/♭/♯, family exactly the six above, even when exact set.
 * Defaults accidental='',family='any',exact=null,inversion=null; empty strings are meaningful.
 * Label inversion ?? exact ?? accidental+UPPER roman degree; family adds ' · ' and native
 * Major/Minor/7/maj7/m7 spelling. Query defaults version1/chords[], max32; empty query true.
 * Match any consecutive complete window; no wrap/gap/subsequence. Preserve source order.
 * Canonical: reuse trimNativeWhitespace; leading ASCII [b#]+ -> ♭/♯, all remaining # -> ♯,
 * then b directly before ASCII digit -> ♭. No lowercase/Unicode normalization/reinterpretation.
 * Exact compares canonical rootLabel(default label); optional inversion compares label separately.
 * Nonexact rejects ANY slash; inversion alone ignored. Native private prefix parser preserves
 * mixed-case/invalid numerals, arbitrary suffixes, lowercase o/°/ø/+, add/sus digit removal,
 * seventh aliases7/9/11/13/65/43/42 and Δ/△ behavior. 'any' every parsed quality;
 * major/minor compare quality only; 7/maj7/m7 compare BOTH quality and seventhQuality.
 * No family/accidental alias invention or anchoring suffix more strictly than native.
 *
 * Explicit BROWSER-domain guards (not native guarantees): real arrays/index traversal,
 * constraints<=32, labels/rootLabels<=4096, every string<=4096 UTF16 code units,
 * aggregate input text<=1048576 UTF16 units PER PUBLIC CALL (constraint strings included).
 * Omitted rootLabels reuses copied labels without double-counting text; supplied rootLabels
 * MUST have equal length (native can lazily fail/ignore mismatched lengths). Validate ALL
 * known inputs even empty-query/early-match. Defaults apply only undefined, not null for
 * nonnullable fields; exact/inversion accept null. No Number/String coercion.
 * Wrong shape/type => TypeError; invalid numeric/enum values or resource bounds => RangeError.
 * Every public operation independently snapshots/validates known fields exactly once; do
 * not trust a caller cast or previously-created object. Read each length/index/known field
 * once, cap lengths before copying, never execute input iterators or unknown getters.
 * Getter exceptions propagate; nested reentry has independent local budgets/snapshots.
 * No input mutation or global cache. Factories return fresh independent deep-frozen
 * constraints/arrays/query; exported auralProgressionQueryApi is frozen and agrees above.
 * No JSON codec/serializer claim; typed constructors/defaults/validation only.
 *
 * Oracle FIRST: <=24NEW native named groups, unchanged full query and private parser,
 * pinned actual Kotlin2.2.10 compiler/stdlib/runtime/serialization plugin, emitted real
 * constraint/query serializer classes. Retain exact input/output, native constructor
 * failures, extraction hashes/provenance; no hand/TS expected generation or old capture.
 * Cover defaults/32vs33/version/invalid constraints; exact/inversion/empty precedence;
 * offset/consecutive/no-gap; mixed/invalid prefix/accidentals/whitespace; all native family
 * quality/seventh/permissive suffix aliases. Browser-only tests separately cover above
 * guards, full validation, hostile getters/iterators/reentry, snapshots and immutability.
 * Root reviews producer/oracle checkpoint BEFORE source implementation, then validates
 * exact integrated revision. No old fixture changes, SQL/runtime catalog/ranking/group
 * ordering/modes/loop/search/session/UI/audio/dependencies/other exports or parser rewrite.
 */
