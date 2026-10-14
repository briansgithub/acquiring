/** Captured-source accuracy adapters; imports shared evidence comparators, never a legacy decoder. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalRoman, canonicalLetter, romanSignature, letterSignature, sourceFingerprint } from '../../../../tooling/scripts/sourceAccuracy.mjs';
import { evaluateHistoricalAccuracy, historicalInputFingerprint, sha256 } from '../../../../tooling/scripts/historicalAccuracy.mjs';
import { interpret } from './index';

const read = name => readFileSync(new URL(`../../../../contracts/fixtures/${name}.json`, import.meta.url), 'utf8');
function observePwa(chord, key) {
  const result = interpret(chord, key);
  return { roman: result.roman, letter: result.letter,
    pcs: [...new Set(result.midi.map(midi => (midi % 12 + 12) % 12))].sort((a, b) => a - b),
    toneRoles: result.toneLabels.map(label => label.replaceAll('\u0302', '').replaceAll('♭', 'b').replaceAll('♯', '#')) };
}

// Integrity/orchestration translated from frozen sourceAccuracyTest.mjs:14-106.
// That executable wrapper imports web decoders and is deliberately not imported or executed.
function evaluateSourceAccuracy(cases, review, findings, observe = observePwa) {
  for (const item of findings.ruleAmbiguities || []) assert.ok(item.rule && item.reason && item.reviewedAt && item.checkedSources?.length, 'Missing unresolved rule provenance');
  assert.equal(cases.length, review.caseCount, 'Source accuracy case coverage changed without evidence review');
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length, 'Duplicate source accuracy case ID');
  assert.equal(sourceFingerprint(cases), review.sourceFingerprint, 'Captured truth or source inputs changed; review independently of parity export');
  const corrections = new Map();
  for (const collection of [review.corrections, findings.corrections]) {
    assert.equal(new Set(collection.map(item => item.id)).size, collection.length, 'Duplicate source correction ID within a review collection');
    for (const item of collection) {
      const existing = corrections.get(item.id) || [], fields = new Set(existing.flatMap(entry => Object.keys(entry.corrected)));
      for (const field of Object.keys(item.corrected)) assert.ok(!fields.has(field), `${item.id}: conflicting reviewed ${field}`);
      corrections.set(item.id, [...existing, item]);
    }
  }
  const knownIds = new Set(cases.map(item => item.id)), derivedExpectations = new Map(), ambiguities = new Map();
  for (const item of findings.derivedRuleExpectations || []) {
    assert.ok(knownIds.has(item.id) && item.source?.url && item.reason, `Missing derived rule provenance: ${item.id}`);
    assert.ok(Array.isArray(item.pcs) && Array.isArray(item.toneRoles), `Missing derived rule expectation: ${item.id}`);
    assert.ok(!derivedExpectations.has(item.id), `Duplicate derived rule expectation: ${item.id}`);
    derivedExpectations.set(item.id, item);
  }
  for (const item of findings.ambiguities || []) {
    assert.ok(knownIds.has(item.id), `Unknown source ambiguity: ${item.id}`);
    assert.ok(item.reason && item.source?.url && item.source?.reviewedAt, `Missing ambiguity provenance: ${item.id}`);
    assert.ok(Array.isArray(item.fields) && item.fields.length && item.fields.every(field => ['roman', 'letter', 'pcs'].includes(field)), `Invalid ambiguity fields: ${item.id}`);
    assert.equal(new Set(item.fields).size, item.fields.length, `Duplicate ambiguous field: ${item.id}`);
    assert.ok(!ambiguities.has(item.id), `Duplicate source ambiguity: ${item.id}`);
    const sourceCase = cases.find(source => source.id === item.id);
    const raw = Object.fromEntries(['json', 'key', 'truthRoman', 'truthLetter', 'truthPcs'].map(field => [field, sourceCase[field]]));
    assert.deepEqual(item.original, raw, `Ambiguous source evidence changed: ${item.id}`);
    assert.equal(item.rawFingerprint, sha256(JSON.stringify(raw)), `Ambiguous source fingerprint changed: ${item.id}`);
    ambiguities.set(item.id, item);
  }
  for (const item of [...review.corrections, ...findings.corrections]) {
    assert.ok(knownIds.has(item.id), `Unknown reviewed case: ${item.id}`);
    assert.ok(item.reason && item.source?.url, `Missing source provenance: ${item.id}`);
  }
  const failures = [], unresolved = [];
  for (const item of cases) {
    const caseCorrections = corrections.get(item.id) || [];
    for (const correction of caseCorrections) for (const [field, original] of Object.entries(correction.original)) assert.deepEqual(item[field], original, `${item.id}: corrected raw ${field} changed`);
    const truth = { truthRoman: item.truthRoman, truthLetter: item.truthLetter, truthPcs: item.truthPcs };
    for (const correction of caseCorrections) Object.assign(truth, correction.corrected);
    try {
      const observed = observe(JSON.parse(item.json), item.key);
      const actual = { roman: canonicalRoman(observed.roman), letter: canonicalLetter(observed.letter), pcs: observed.pcs };
      const expected = { roman: canonicalRoman(truth.truthRoman), letter: canonicalLetter(truth.truthLetter), pcs: [...truth.truthPcs].sort((a, b) => a - b) };
      const derived = derivedExpectations.get(item.id);
      if (derived) {
        for (const [field, observedValue, wanted] of [['derivedPcs', actual.pcs, [...derived.pcs].sort((a, b) => a - b)],
          ['derivedToneRoles', [...observed.toneRoles].sort(), [...derived.toneRoles].sort()]]) {
          if (JSON.stringify(observedValue) !== JSON.stringify(wanted)) failures.push({ id: item.id, field, expected: wanted, actual: observedValue, source: derived.source });
        }
      }
      for (const field of ['roman', 'letter', 'pcs']) {
        const ambiguity = ambiguities.get(item.id);
        if (ambiguity?.fields.includes(field)) {
          unresolved.push({ id: item.id, field, category: ambiguity.category, reason: ambiguity.reason, source: ambiguity.source, rawFingerprint: ambiguity.rawFingerprint });
          continue;
        }
        const signature = value => field === 'roman' ? romanSignature(value) : field === 'letter' ? letterSignature(value) : value;
        if (JSON.stringify(signature(actual[field])) !== JSON.stringify(signature(expected[field]))) failures.push({ id: item.id, field, expected: expected[field], actual: actual[field] });
      }
    } catch (error) { failures.push({ id: item.id, field: 'interpretation', error: error.message }); }
  }
  return { caseCount: cases.length, verifiedFieldCount: cases.length * 3 - unresolved.length,
    derivedRuleAssertions: derivedExpectations.size * 2, unresolved, unresolvedRules: findings.ruleAmbiguities || [], failures };
}

describe('independent captured-source accuracy through PWA interpretation', () => {
  it('retains 5471 verified source fields, two derived rules and separately reported unresolved evidence', () => {
    const result = evaluateSourceAccuracy(JSON.parse(read('hooktheory_parity')), JSON.parse(read('hooktheory_source_review')), JSON.parse(read('hooktheory_source_findings')));
    expect(result.caseCount).toBe(1824);
    expect(result.verifiedFieldCount).toBe(5471);
    expect(result.derivedRuleAssertions).toBe(2);
    expect(result.failures.slice(0, 20), `${result.failures.length} unexplained source failures`).toEqual([]);
    expect(result.unresolved.map(({ id, field }) => ({ id, field }))).toEqual([{ id: 'lady-gaga__die-with-a-smile-%28with-bruno-mars%29/Bridge/71', field: 'pcs' }]);
    expect(result.unresolvedRules.map(rule => rule.rule)).toEqual(['type11-explicit-fifth-alterations']);
    console.info('PWA source accuracy: 5,471 verified fields + 2 derived assertions; Gaga captured pcs unresolved; explicit-fifth eleventh source rule unresolved.');
  });
  it('retains 51774 verified historical assertions and the separately grouped missing-capture ambiguity', () => {
    const inputs = JSON.parse(read('historic_catalog_parity')), sourceText = read('historic_catalog_accuracy'), observations = JSON.parse(sourceText);
    const review = JSON.parse(read('historic_catalog_review')), findings = JSON.parse(read('hooktheory_source_findings'));
    assert.equal(sha256(sourceText), review.sourceAccuracySha256, 'Historical source assertions changed without independent review');
    for (const correction of review.corrections) for (const reference of correction.evidenceReferences || []) {
      assert.equal(reference.file, review.sourceRuleEvidenceFile);
      assert.equal(findings.liveChecks[reference.liveCheckIndex]?.url, reference.url, `${correction.id}: missing live rule evidence`);
      assert.ok(findings.liveChecks[reference.liveCheckIndex].keyboardNotes?.length, `${correction.id}: missing keyboard evidence`);
    }
    const result = evaluateHistoricalAccuracy(inputs, observations, review, observePwa);
    expect(result.inputCount).toBe(21464);
    expect(result.observationCount).toBe(22072);
    expect(result.occurrences).toBe(91107);
    expect(result.assertions).toBe(51774);
    expect(result.failures.slice(0, 20), `${result.failures.length} unexplained historic failures`).toEqual([]);
    expect(result.unresolved.map(({ id, field }) => ({ id, field }))).toEqual([{ id: 'nct-dream__chiller/Pre-Chorus and Chorus/4', field: 'letter' }]);
    expect(result.unresolved[0].affectedIds).toHaveLength(3);
    console.info('PWA historical accuracy: 51,774 verified assertions; one grouped NCT missing-capture label (three occurrences) unresolved.');
  });
});

// Negative controls make sure fixture regeneration and looser presentation matching cannot conceal loss.
describe('accuracy gate independence and integrity detectors', () => {
  const inputs = [{ id: 'input', json: '{"root":1}', key: { tonic: 'C', scale: 'major' }, expectedRoman: 'V' }];
  const cases = [{ ...inputs[0], truthRoman: 'I', truthLetter: 'C', truthPcs: [0, 4, 7] }];
  const review = { caseCount: 1, sourceFingerprint: sourceFingerprint(cases), corrections: [] };
  const findings = { corrections: [], ambiguities: [], ruleAmbiguities: [], derivedRuleExpectations: [] };
  const rows = [{ id: 'capture', inputId: 'input', occurrences: 2, truthRoman: 'I', truthLetter: 'C', truthPcs: [0, 4, 7], requiredFields: ['roman', 'letter', 'pcs'] }];
  const historicReview = { inputFingerprint: historicalInputFingerprint(inputs), historicalSnapshot: { inputCount: 1, observationCount: 1, occurrences: 2 }, requiredFieldCount: 3, corrections: [], ambiguities: [], unexplained: [] };
  it('uses captured truth instead of generated expected fields', () => {
    expect(evaluateSourceAccuracy(cases, review, findings).failures).toEqual([]);
    expect(sourceFingerprint([{ ...cases[0], expectedRoman: 'arbitrary' }])).toBe(review.sourceFingerprint);
    expect(evaluateSourceAccuracy(cases, review, findings, (...args) => ({ ...observePwa(...args), roman: 'V' })).failures).toHaveLength(1);
    expect(evaluateHistoricalAccuracy(inputs, rows, historicReview, (...args) => ({ ...observePwa(...args), roman: 'V' })).failures).toHaveLength(1);
  });
  it('detects lost notes, interpretation exceptions and captured truth mutation', () => {
    expect(evaluateSourceAccuracy(cases, review, findings, (...args) => ({ ...observePwa(...args), pcs: [0, 7] })).failures).toHaveLength(1);
    expect(evaluateSourceAccuracy(cases, review, findings, () => { throw new Error('decoder failure'); }).failures[0].field).toBe('interpretation');
    expect(() => evaluateSourceAccuracy([{ ...cases[0], truthRoman: 'V' }], review, findings)).toThrow(/Captured truth/);
    expect(() => evaluateHistoricalAccuracy(inputs, [{ ...rows[0], requiredFields: ['roman'] }], historicReview, observePwa)).toThrow();
  });
  it('preserves material presentation distinctions and duplicate/applied-side scope', () => {
    expect(canonicalRoman('♭II⁶₄')).toBe('bII64');
    for (const [left, right] of [['I♮', 'I'], ['V7(b9)', 'V7'], ['i°7', 'iø7'], ['i△7', 'i7']]) expect(romanSignature(left)).not.toEqual(romanSignature(right));
    expect(letterSignature('g#m7(n°3n5)(b9#11)')).toEqual(letterSignature('G#m7(no3)(no5)(#11)(b9)'));
    expect(letterSignature('C(add9)(add9)')).not.toEqual(letterSignature('C(add9)'));
    expect(romanSignature('V(maj)/ii')).not.toEqual(romanSignature('V/ii(maj)'));
  });
  it('validates historical correction records, conflicts and ambiguity exclusion', () => {
    const correction = { id: 'capture', inputId: 'input', field: 'roman', original: 'I', expected: 'I(add9)', sourceRecordSha256: sha256(JSON.stringify(rows[0])),
      category: 'test-positioned-capture', reason: 'Independent captured annotation', reviewedAt: '2026-09-08', source: { url: 'https://example.test/source' } };
    expect(() => evaluateHistoricalAccuracy(inputs, rows, { ...historicReview, corrections: [correction, correction] }, observePwa)).toThrow(/Conflicting/);
    expect(() => evaluateHistoricalAccuracy(inputs, rows, { ...historicReview, corrections: [{ ...correction, original: 'V' }] }, observePwa)).toThrow(/Changed original/);
    const ambiguous = evaluateHistoricalAccuracy(inputs, rows, { ...historicReview, ambiguities: [correction] }, observePwa);
    expect(ambiguous.assertions).toBe(2);
    expect(ambiguous.unresolved).toHaveLength(1);
  });
});
