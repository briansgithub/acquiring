#!/usr/bin/env node
'use strict';

const {
  initializeAcquisitionDb,
} = require('../../lib/midi-corpus/acquisition-db');
const {
  matchManifestMetadata,
} = require('../../lib/midi-corpus/matching');
const { calibrateFromFile } = require('../../lib/midi-corpus/calibration');
const { verifyContentMatch } = require('../../lib/midi-corpus/content-verification');
const {
  discoverMetadataFiles,
  importMetadataFile,
  metadataDiscoveryPlan,
} = require('../../lib/midi-corpus/metadata');
const {
  listSourcePolicies,
} = require('../../lib/midi-corpus/source-policies');
const {
  assertStoragePreflight,
  storeLocalArtifact,
} = require('../../lib/midi-corpus/storage');
const { fetchArtifact } = require('../../lib/midi-corpus/fetch');
const {
  multipleOption,
  optionalNumber,
  parseArgs,
  printJson,
  reportCliError,
  requiredOption,
} = require('../../lib/midi-corpus/cli-utils');

const HELP = `MIDI corpus acquisition and provenance foundation

Usage:
  node tools/midi-corpus/cli.js init --db <acquisition.db>
  node tools/midi-corpus/cli.js sources
  node tools/midi-corpus/cli.js discover --source <id> --root <dir> [--root <dir>]
  node tools/midi-corpus/cli.js import --db <db> --source <id> --metadata <file>
  node tools/midi-corpus/cli.js match --db <db> --source <id> --manifest <dir>
  node tools/midi-corpus/cli.js verify --db <db> --manifest-id <id> --record-id <id>
      --source <id> --source-item-id <id> --reference <hooktheory.json>
      --candidate <file.mid|midi-analysis.json> [--metadata-algorithm <version>]
      [--reference-section <id|name|index>] [--candidate-section <id|name|index>]
      [--calibration-id <frozen-id>]
  node tools/midi-corpus/cli.js calibrate --db <db> --labels <json|ndjson> [--no-activate]
  node tools/midi-corpus/cli.js fetch --db <db> --store <dir> --source <id>
      --source-item-id <id> [--expected-bytes <integer>] [--allow-host <host>]
      [--extracted-bytes <integer>] [--index-bytes <integer>]
      [--temporary-bytes <integer>]
      [--purpose research|evaluation|product] [--execute]
  node tools/midi-corpus/cli.js preflight --store <dir>
      [--batch-bytes <integer>|--download-bytes <integer>]
      [--extracted-bytes <integer>] [--index-bytes <integer>]
      [--temporary-bytes <integer>]
  node tools/midi-corpus/cli.js store --store <dir> --file <local.mid> --source <id>
      --rights-status <status> [--purpose research|evaluation|product]
      [--db <db> --source-item-id <id>]

Storage hard limits default to a 5 GiB maximum download batch, a 1.25x
allowance over download + extraction + indexes + temporary space, and a
20 GiB free-space reserve. Fetch remains a dry run unless
--execute is supplied; redirects, hosts, rights, and size are checked first.
Content matches remain quarantined unless a valid frozen calibration reaches
a 98% Wilson precision lower bound and 50% known-positive coverage.
`;

function openDb(args) {
  return initializeAcquisitionDb(requiredOption(args, 'db'));
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || command === 'help' || args.help) {
    process.stdout.write(HELP);
    return { help: true };
  }
  if (command === 'sources') {
    const result = { policy_registry: listSourcePolicies() };
    printJson(result);
    return result;
  }
  if (command === 'init') {
    const db = openDb(args);
    const version = Number(db.prepare('PRAGMA user_version').get().user_version);
    const sourcePolicies = Number(db.prepare('SELECT count(*) AS count FROM source_policies').get().count);
    db.close();
    const result = { ok: true, schema_version: version, source_policies: sourcePolicies };
    printJson(result);
    return result;
  }
  if (command === 'discover') {
    const sourceId = requiredOption(args, 'source');
    const roots = multipleOption(args, 'root');
    if (roots.length === 0) requiredOption(args, 'root');
    const result = {
      plan: metadataDiscoveryPlan(sourceId, roots),
      files: await discoverMetadataFiles(roots),
    };
    printJson(result);
    return result;
  }
  if (command === 'import') {
    const db = openDb(args);
    try {
      const result = await importMetadataFile(db, {
        sourceId: requiredOption(args, 'source'),
        filePath: requiredOption(args, 'metadata'),
      });
      printJson(result);
      return result;
    } finally {
      db.close();
    }
  }
  if (command === 'match') {
    const db = openDb(args);
    try {
      const result = await matchManifestMetadata(db, {
        sourceId: requiredOption(args, 'source'),
        manifestDir: requiredOption(args, 'manifest'),
        minimumScore: optionalNumber(args, 'minimum-score'),
      });
      printJson(result);
      return result;
    } finally {
      db.close();
    }
  }
  if (command === 'verify') {
    const db = openDb(args);
    try {
      const result = await verifyContentMatch(db, {
        manifestId: requiredOption(args, 'manifest-id'),
        recordId: requiredOption(args, 'record-id'),
        sourceId: requiredOption(args, 'source'),
        sourceItemId: requiredOption(args, 'source-item-id'),
        metadataAlgorithmVersion: args['metadata-algorithm']
          ? String(args['metadata-algorithm'])
          : undefined,
        reference: requiredOption(args, 'reference'),
        candidate: requiredOption(args, 'candidate'),
        referenceSection: args['reference-section'],
        candidateSection: args['candidate-section'],
        calibrationId: args['calibration-id'] ? String(args['calibration-id']) : undefined,
      });
      printJson(result);
      return result;
    } finally {
      db.close();
    }
  }
  if (command === 'calibrate') {
    const db = openDb(args);
    try {
      const result = await calibrateFromFile(db, requiredOption(args, 'labels'), {
        activate: !args['no-activate'],
      });
      printJson(result);
      return result;
    } finally {
      db.close();
    }
  }
  if (command === 'fetch') {
    const db = openDb(args);
    try {
      const result = await fetchArtifact(db, {
        storeRoot: requiredOption(args, 'store'),
        sourceId: requiredOption(args, 'source'),
        sourceItemId: requiredOption(args, 'source-item-id'),
        expectedBytes: args['expected-bytes'],
        extractedBytes: args['extracted-bytes'],
        indexBytes: args['index-bytes'],
        temporaryBytes: args['temporary-bytes'],
        allowHosts: multipleOption(args, 'allow-host'),
        purpose: args.purpose ? String(args.purpose) : 'research',
        maximumBatchBytes: args['maximum-batch-bytes'],
        reserveBytes: args['reserve-bytes'],
        execute: Boolean(args.execute),
      });
      printJson(result);
      return result;
    } finally {
      db.close();
    }
  }
  if (command === 'preflight') {
    if (args['batch-bytes'] === undefined && args['download-bytes'] === undefined) {
      requiredOption(args, 'download-bytes');
    }
    const result = await assertStoragePreflight({
      storeRoot: requiredOption(args, 'store'),
      batchBytes: args['batch-bytes'],
      downloadBytes: args['download-bytes'],
      extractedBytes: args['extracted-bytes'],
      indexBytes: args['index-bytes'],
      temporaryBytes: args['temporary-bytes'],
      maximumBatchBytes: args['maximum-batch-bytes'],
      reserveBytes: args['reserve-bytes'],
    });
    printJson(result);
    return result;
  }
  if (command === 'store') {
    let db;
    try {
      if (args.db) db = openDb(args);
      const sourceItemId = args['source-item-id'] ? String(args['source-item-id']) : undefined;
      if (db && !sourceItemId) requiredOption(args, 'source-item-id');
      const result = await storeLocalArtifact({
        db,
        sourceItemId,
        storeRoot: requiredOption(args, 'store'),
        filePath: requiredOption(args, 'file'),
        sourceId: requiredOption(args, 'source'),
        rightsStatus: requiredOption(args, 'rights-status'),
        purpose: args.purpose ? String(args.purpose) : 'research',
        mediaType: args['media-type'] ? String(args['media-type']) : 'audio/midi',
        maximumBatchBytes: args['maximum-batch-bytes'],
        reserveBytes: args['reserve-bytes'],
      });
      printJson(result);
      return result;
    } finally {
      if (db) db.close();
    }
  }
  const error = new Error(`Unknown MIDI corpus command: ${command}`);
  error.code = 'UNKNOWN_CLI_COMMAND';
  throw error;
}

if (require.main === module) {
  main().catch((error) => {
    reportCliError(error);
    process.exitCode = 1;
  });
}

module.exports = { HELP, main };
