const fs = require('fs');
const path = require('path');
const { loadDisplayNameMap } = require('./catalogDisplayNames');

/** Explicit output directories are staging targets and never overwrite files. */
function catalogExportOptions(argv, defaults) {
  const options = { ...defaults };
  const fields = new Map([
    ['--source-db', 'sourceDbPath'],
    ['--output-dir', 'outputDir'],
    ['--names-file', 'namesFile'],
    ['--cache-dir', 'cacheDir'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const field = fields.get(argv[i]);
    if (!field || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`Expected --source-db PATH, --output-dir PATH, --names-file PATH, or --cache-dir PATH; got ${argv[i]}`);
    }
    options[field] = path.resolve(argv[++i]);
    if (field === 'outputDir') options.staging = true;
  }
  options.outputDbPath = path.join(options.outputDir, defaults.databaseFilename);
  options.outputGzPath = path.join(options.outputDir, defaults.archiveFilename);
  const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  for (const output of [options.outputDbPath, options.outputGzPath]) {
    if (samePath(output, options.sourceDbPath)
        || (options.namesFile && samePath(output, options.namesFile))) {
      throw new Error(`Export output must not replace an input file: ${output}`);
    }
    if (options.staging && fs.existsSync(output)) {
      throw new Error(`Staging output already exists: ${output}`);
    }
  }
  options.namesBySlug = options.namesFile ? loadDisplayNameMap(options.namesFile) : new Map();
  return options;
}

function prepareCatalogOutput(options) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  for (const output of [options.outputDbPath, options.outputGzPath]) {
    if (fs.existsSync(output)) fs.unlinkSync(output);
  }
}

module.exports = { catalogExportOptions, prepareCatalogOutput };
