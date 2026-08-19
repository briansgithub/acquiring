#!/usr/bin/env node
'use strict';

const {
  buildCatalogManifest,
  verifyCatalogManifest,
} = require('../../lib/midi-corpus/catalog-manifest');
const {
  optionalNumber,
  parseArgs,
  printJson,
  reportCliError,
  requiredOption,
} = require('../../lib/midi-corpus/cli-utils');

const HELP = `Hooktheory corpus manifest CLI (offline)

Usage:
  node tools/corpus/cli.js build --catalog <android/catalog.db> --output <manifest-dir>
  node tools/corpus/cli.js verify --manifest <manifest-dir>

Options:
  --max-decoded-bytes <n>  Per-row decompression ceiling (default 67108864)

Builds an immutable directory containing manifest.json, records.ndjson,
anomaly-challenge.ndjson, and checksums.sha256. The challenge file is a compact
overlay: it preserves each anomalous record's ordinary composition-group split
without copying catalog BLOB payloads. Existing output directories are never
overwritten.
`;

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || command === 'help' || args.help) {
    process.stdout.write(HELP);
    return { help: true };
  }
  if (command === 'build') {
    const manifest = await buildCatalogManifest({
      catalogPath: requiredOption(args, 'catalog'),
      outputDir: requiredOption(args, 'output'),
      maxDecodedBytes: optionalNumber(args, 'max-decoded-bytes'),
    });
    const result = {
      ok: true,
      manifest_id: manifest.manifest_id,
      records: manifest.records.count,
      anomaly_challenge_records: manifest.anomaly_challenge.count,
      composition_groups: manifest.audit.composition_groups,
      output: requiredOption(args, 'output'),
    };
    printJson(result);
    return result;
  }
  if (command === 'verify') {
    const result = await verifyCatalogManifest(requiredOption(args, 'manifest'));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  const error = new Error(`Unknown corpus command: ${command}`);
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
