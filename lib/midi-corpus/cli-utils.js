'use strict';

const { stableStringify } = require('./stable-json');

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }
    const equals = token.indexOf('=');
    const key = token.slice(2, equals === -1 ? undefined : equals);
    let value;
    if (equals !== -1) {
      value = token.slice(equals + 1);
    } else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
      value = argv[index + 1];
      index += 1;
    } else {
      value = true;
    }
    if (key in result) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function requiredOption(args, name) {
  const value = args[name];
  if (value === undefined || value === true || value === '') {
    const error = new Error(`Missing required option --${name}`);
    error.code = 'MISSING_CLI_OPTION';
    throw error;
  }
  return String(value);
}

function multipleOption(args, name) {
  if (!(name in args)) return [];
  return (Array.isArray(args[name]) ? args[name] : [args[name]]).map(String);
}

function optionalNumber(args, name) {
  if (!(name in args)) return undefined;
  const value = Number(args[name]);
  if (!Number.isFinite(value)) throw new TypeError(`--${name} must be a finite number`);
  return value;
}

function printJson(value, stream = process.stdout) {
  stream.write(`${stableStringify(value, 2)}\n`);
}

function reportCliError(error) {
  const response = {
    ok: false,
    code: error.code || 'ERROR',
    message: error.message,
  };
  if (error.details) response.details = error.details;
  if (error.decision) response.decision = error.decision;
  if (error.result) response.result = error.result;
  printJson(response, process.stderr);
}

module.exports = {
  multipleOption,
  optionalNumber,
  parseArgs,
  printJson,
  reportCliError,
  requiredOption,
};
