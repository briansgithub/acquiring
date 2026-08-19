'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ANOMALY_CHALLENGE_FILE,
  GROUPING_POLICY,
  MANIFEST_VERSION,
  ManifestExistsError,
  buildCatalogManifest,
  calculateManifestId,
  readNdjson,
  verifyCatalogManifest,
} = require('../../../lib/midi-corpus/catalog-manifest');
const { summarizePayload } = require('../../../lib/midi-corpus/anomalies');
const { sha256String } = require('../../../lib/midi-corpus/hash');
const { stableStringify } = require('../../../lib/midi-corpus/stable-json');
const { SPLIT_POLICY, SPLIT_POLICY_V1, assignSplit } = require('../../../lib/midi-corpus/split');
const { createCatalogFixture, createGroupingCatalogFixture } = require('./fixtures');

async function withTempDir(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hooktheory-manifest-test-'));
  try {
    return await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('manifest build is deterministic, immutable, grouped, and auditable', async () => {
  await withTempDir(async (root) => {
    const catalogPath = createCatalogFixture(path.join(root, 'android', 'catalog.db'));
    const firstDir = path.join(root, 'manifest-a');
    const secondDir = path.join(root, 'manifest-b');
    const first = await buildCatalogManifest({ catalogPath, outputDir: firstDir });
    const second = await buildCatalogManifest({ catalogPath, outputDir: secondDir });

    assert.equal(first.records.count, 4);
    assert.equal(first.manifest_id, second.manifest_id);
    assert.equal(
      await fs.readFile(path.join(firstDir, 'manifest.json'), 'utf8'),
      await fs.readFile(path.join(secondDir, 'manifest.json'), 'utf8'),
    );
    assert.equal(
      await fs.readFile(path.join(firstDir, 'records.ndjson'), 'utf8'),
      await fs.readFile(path.join(secondDir, 'records.ndjson'), 'utf8'),
    );
    assert.equal(
      await fs.readFile(path.join(firstDir, ANOMALY_CHALLENGE_FILE), 'utf8'),
      await fs.readFile(path.join(secondDir, ANOMALY_CHALLENGE_FILE), 'utf8'),
    );

    const records = [];
    for await (const record of readNdjson(path.join(firstDir, 'records.ndjson'))) records.push(record);
    assert.deepEqual(records.map((record) => record.slug), [
      'example-band__same-song',
      'example-band__same-song-live',
      'other__broken',
      'test-entry',
    ]);
    const sameSong = records.filter((record) => record.slug.startsWith('example-band'));
    assert.equal(sameSong[0].composition.group_id, sameSong[1].composition.group_id);
    assert.equal(sameSong[0].split, sameSong[1].split);
    assert.equal(sameSong[0].split_bucket, sameSong[1].split_bucket);
    assert.ok(sameSong.every((record) => (
      record.anomalies.some((item) => item.code === 'duplicate_decoded_payload')
    )));
    assert.ok(records.find((record) => record.slug === 'other__broken').anomalies
      .some((item) => item.code === 'blob_not_gzip'));
    assert.ok(records.find((record) => record.slug === 'test-entry').anomalies
      .some((item) => item.code === 'missing_data_blob'));

    const challengeRecords = [];
    for await (const record of readNdjson(path.join(firstDir, ANOMALY_CHALLENGE_FILE))) {
      challengeRecords.push(record);
    }
    assert.equal(challengeRecords.length, first.anomaly_challenge.count);
    assert.deepEqual(
      challengeRecords.map((record) => record.record_id),
      records.filter((record) => record.anomalies.length > 0).map((record) => record.record_id),
    );
    for (const challengeRecord of challengeRecords) {
      const ordinaryRecord = records.find((record) => record.record_id === challengeRecord.record_id);
      assert.equal(challengeRecord.composition_group_id, ordinaryRecord.composition.group_id);
      assert.equal(challengeRecord.split, ordinaryRecord.split);
      assert.equal(challengeRecord.split_bucket, ordinaryRecord.split_bucket);
      assert.deepEqual(challengeRecord.anomalies, ordinaryRecord.anomalies);
      assert.equal(Object.hasOwn(challengeRecord, 'blob'), false);
      assert.equal(Object.hasOwn(challengeRecord, 'payload_summary'), false);
      assert.deepEqual(Object.keys(challengeRecord.source).sort(), ['kind', 'row_key', 'row_sha256']);
    }
    assert.match(
      await fs.readFile(path.join(firstDir, 'checksums.sha256'), 'utf8'),
      new RegExp(`  ${ANOMALY_CHALLENGE_FILE.replace('.', '\\.')}(?:\\r?\\n|$)`),
    );

    const verification = await verifyCatalogManifest(firstDir);
    assert.equal(verification.ok, true);
    assert.equal(verification.anomaly_challenge_records, challengeRecords.length);
    await fs.appendFile(path.join(secondDir, ANOMALY_CHALLENGE_FILE), '\n');
    const tampered = await verifyCatalogManifest(secondDir);
    assert.equal(tampered.ok, false);
    assert.ok(tampered.errors.includes('anomaly challenge checksum mismatch'));
    await assert.rejects(
      buildCatalogManifest({ catalogPath, outputDir: firstDir }),
      (error) => error instanceof ManifestExistsError && error.code === 'MANIFEST_EXISTS',
    );
  });
});

test('composition split assignment is stable and stays near 80/10/10', () => {
  const counts = { train: 0, validation: 0, test: 0 };
  for (let index = 0; index < 20_000; index += 1) {
    const first = assignSplit(`group-${index}`);
    const second = assignSplit(`group-${index}`);
    assert.deepEqual(first, second);
    counts[first.split] += 1;
  }
  assert.ok(counts.train > 15_500 && counts.train < 16_500, JSON.stringify(counts));
  assert.ok(counts.validation > 1_700 && counts.validation < 2_300, JSON.stringify(counts));
  assert.ok(counts.test > 1_700 && counts.test < 2_300, JSON.stringify(counts));
});

test('evidence union keeps linked aliases, transpositions, and near duplicates in one split', async () => {
  await withTempDir(async (root) => {
    const catalogPath = createGroupingCatalogFixture(path.join(root, 'catalog.db'));
    const outputDir = path.join(root, 'manifest-v2');
    const manifest = await buildCatalogManifest({ catalogPath, outputDir });
    const records = [];
    for await (const record of readNdjson(path.join(outputDir, 'records.ndjson'))) records.push(record);
    const bySlug = new Map(records.map((record) => [record.slug, record]));

    const assertOneComponent = (slugs, evidenceTypes) => {
      const linked = slugs.map((slug) => bySlug.get(slug));
      assert.ok(new Set(linked.map((record) => (
        assignSplit(record.composition.seed_group_id).split
      ))).size > 1, 'fixture seed identities should span splits before evidence union');
      assert.equal(new Set(linked.map((record) => record.composition.group_id)).size, 1);
      assert.equal(new Set(linked.map((record) => record.split)).size, 1);
      assert.equal(new Set(linked.map((record) => record.split_bucket)).size, 1);
      for (const evidenceType of evidenceTypes) {
        assert.ok(linked[0].composition.grouping.linked_by.includes(evidenceType), evidenceType);
      }
    };

    assertOneComponent(
      ['alias-section-a', 'alias-section-b', 'alias-fp-c'],
      ['hooktheory_section_id', 'section_fp'],
    );
    assertOneComponent(['transposed-c', 'transposed-g'], ['music_transposition']);
    assertOneComponent(['near-duplicate-a', 'near-duplicate-b'], ['music_shingle_pair']);

    assert.equal(manifest.manifest_version, MANIFEST_VERSION);
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.grouping_policy.version, 2);
    assert.equal(manifest.split_policy.grouping_policy_id, manifest.grouping_policy.id);
    assert.equal(manifest.audit.grouping.policy_id, manifest.grouping_policy.id);
    assert.ok(manifest.audit.grouping.unions_by_type.hooktheory_section_id >= 1);
    assert.ok(manifest.audit.grouping.unions_by_type.section_fp >= 1);
    assert.ok(manifest.audit.grouping.unions_by_type.music_transposition >= 1);
    assert.ok(manifest.audit.grouping.unions_by_type.music_shingle_pair >= 1);
    assert.equal((await verifyCatalogManifest(outputDir)).ok, true);
  });
});

test('legacy immutable v1 manifests retain their original identity and verify', async () => {
  await withTempDir(async (root) => {
    const groupId = 'legacy-composition-group';
    const assigned = assignSplit(groupId, SPLIT_POLICY_V1);
    const record = {
      schema_version: 1,
      record_id: 'hooktheory:legacy-row',
      composition: { group_id: groupId },
      split: assigned.split,
      split_bucket: assigned.bucket,
    };
    const recordsText = `${stableStringify(record)}\n`;
    const recordsSha256 = sha256String(recordsText);
    const manifest = {
      manifest_version: 1,
      manifest_id: null,
      source: {
        fingerprint_sha256: 'a'.repeat(64),
        sqlite: { schema_sha256: 'b'.repeat(64) },
      },
      records: {
        file: 'records.ndjson',
        count: 1,
        bytes: Buffer.byteLength(recordsText),
        sha256: recordsSha256,
      },
      split_policy: SPLIT_POLICY_V1,
      audit: { composition_groups: 1 },
    };
    manifest.manifest_id = calculateManifestId(manifest);
    const manifestText = `${stableStringify(manifest, 2)}\n`;
    await fs.writeFile(path.join(root, 'records.ndjson'), recordsText);
    await fs.writeFile(path.join(root, 'manifest.json'), manifestText);
    await fs.writeFile(path.join(root, 'checksums.sha256'), [
      `${sha256String(manifestText)}  manifest.json`,
      `${recordsSha256}  records.ndjson`,
      '',
    ].join('\n'));

    const verification = await verifyCatalogManifest(root);
    assert.equal(verification.ok, true, verification.errors.join('; '));
  });
});

test('legacy immutable v2 manifests verify without an anomaly challenge file', async () => {
  await withTempDir(async (root) => {
    const groupId = 'legacy-v2-composition-group';
    const assigned = assignSplit(groupId, SPLIT_POLICY);
    const record = {
      schema_version: 2,
      record_id: 'hooktheory:legacy-v2-row',
      composition: {
        group_id: groupId,
        grouping: {
          policy_id: GROUPING_POLICY.id,
          policy_version: GROUPING_POLICY.version,
          component_size: 1,
          record_evidence: [],
        },
      },
      split: assigned.split,
      split_bucket: assigned.bucket,
    };
    const recordsText = `${stableStringify(record)}\n`;
    const recordsSha256 = sha256String(recordsText);
    const manifest = {
      manifest_version: 2,
      manifest_id: null,
      source: {
        fingerprint_sha256: 'c'.repeat(64),
        sqlite: { schema_sha256: 'd'.repeat(64) },
      },
      records: {
        file: 'records.ndjson',
        count: 1,
        bytes: Buffer.byteLength(recordsText),
        sha256: recordsSha256,
      },
      split_policy: SPLIT_POLICY,
      grouping_policy: GROUPING_POLICY,
      audit: { composition_groups: 1, grouping: { components: 1 } },
    };
    manifest.manifest_id = calculateManifestId(manifest);
    const manifestText = `${stableStringify(manifest, 2)}\n`;
    await fs.writeFile(path.join(root, 'records.ndjson'), recordsText);
    await fs.writeFile(path.join(root, 'manifest.json'), manifestText);
    await fs.writeFile(path.join(root, 'checksums.sha256'), [
      `${sha256String(manifestText)}  manifest.json`,
      `${recordsSha256}  records.ndjson`,
      '',
    ].join('\n'));

    const verification = await verifyCatalogManifest(root);
    assert.equal(verification.ok, true, verification.errors.join('; '));
    assert.equal(verification.anomaly_challenge_records, null);
  });
});

test('payload audit permanently identifies malformed musical challenge cases', () => {
  const inspected = summarizePayload({
    challenge: {
      songId: 'challenge',
      chords: [{ root: -1, beat: 1, duration: 1, inversion: 7, suspensions: [6] }],
      notes: [{ sd: '1', octave: 0, duration: 1 }],
      metadata: {
        keys: [{ tonic: 'CustomTextInKeySignature', scale: 'major', beat: 1 }],
        tempos: [{ bpm: -120, beat: 1 }],
        meters: [{ numBeats: 0, beatUnit: 0, beat: 1 }],
      },
    },
  });
  const codes = new Set(inspected.anomalies.map((item) => item.code));
  for (const code of [
    'invalid_chord_root',
    'invalid_chord_inversion',
    'unsupported_chord_suspension',
    'invalid_note_events',
    'invalid_key_tonic_events',
    'extreme_or_invalid_bpm_events',
    'invalid_meter_events',
  ]) assert.ok(codes.has(code), code);
});
