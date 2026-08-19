#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../..");
const GIB = 1024 ** 3;
const REQUIRED_FREE_GIB = 20;
const INTERACTIVE_COMMANDS = new Set(["analyze", "render", "pairs", "audit", "evaluate"]);

export const COMMANDS = Object.freeze({
  analyze: "tools/midi-analyze/index.mjs",
  render: "tools/theory-to-midi/cli.mjs",
  pairs: "tools/theory-to-midi/batch.mjs",
  audit: "tools/decoder-audit/index.mjs",
  evaluate: "tools/midi-evaluate/index.mjs",
  corpus: "tools/midi-corpus/cli.js",
  manifest: "tools/corpus/cli.js",
  serve: "web-player/server.js",
});

const ALIASES = Object.freeze({
  analyse: "analyze",
  theory: "render",
  "json-to-midi": "render",
  batch: "pairs",
  api: "serve",
  server: "serve",
  check: "doctor",
  setup: "doctor",
  "?": "help",
});

const HELP = `Hooktheory MIDI Tools

Easy commands:
  npm run midi -- analyze song.mid
      Decode a MIDI file to song.analysis.json.

  npm run midi -- render section.json
      Render Hooktheory section JSON to section.mid.

  npm run midi -- pairs
      Guided, leakage-safe JSON/MIDI paired-data batch.

  npm run midi -- audit
      Guided full-catalog decoder audit.

  npm run midi -- evaluate truth.json analysis.json
      Score one analyzer result against Hooktheory JSON.

  npm run midi -- serve
      Start the local player and POST /api/v1/midi/analyze on port 3000.

  npm run midi -- doctor
      Check Node, dependencies, catalog/manifest discovery, and storage.

  npm run midi
      Open the interactive menu (when run in a terminal).

Advanced pass-through:
  npm run midi -- corpus <discover|match|fetch|verify|calibrate> ...
  npm run midi -- manifest <build|verify> ...

Options for analyze/render/evaluate:
  --output <path>   Choose the output file.
  --force           Permit replacement of an explicitly named output.

Windows users can also double-click or drag files onto the launchers in
the shortcuts folder.`;

function trimDraggedPath(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertInputFile(value, extensions, label) {
  const inputPath = path.resolve(trimDraggedPath(value));
  let stat;
  try {
    stat = await fs.stat(inputPath);
  } catch {
    throw new Error(`${label} was not found: ${inputPath}`);
  }
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${inputPath}`);
  const extension = path.extname(inputPath).toLowerCase();
  if (!extensions.includes(extension)) {
    throw new Error(`${label} must end in ${extensions.join(" or ")}: ${inputPath}`);
  }
  return inputPath;
}

function optionValue(args, names) {
  for (let index = 0; index < args.length; index += 1) {
    if (!names.includes(args[index])) continue;
    if (!args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error(`${args[index]} requires a path`);
    }
    return { index, value: args[index + 1] };
  }
  return null;
}

function removeIndexes(args, indexes) {
  return args.filter((_, index) => !indexes.has(index));
}

async function uniqueDefaultOutput(candidate) {
  if (!(await exists(candidate))) return candidate;
  const directory = path.dirname(candidate);
  const extension = path.extname(candidate);
  const stem = path.basename(candidate, extension);
  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const next = path.join(directory, `${stem}-${suffix}${extension}`);
    if (!(await exists(next))) return next;
  }
  throw new Error(`Could not find an unused output name beside ${candidate}`);
}

export function defaultOutputFor(inputPath, kind) {
  const extension = path.extname(inputPath);
  const stem = path.basename(inputPath, extension);
  if (kind === "analyze") return path.join(path.dirname(inputPath), `${stem}.analysis.json`);
  if (kind === "render") return path.join(path.dirname(inputPath), `${stem}.mid`);
  if (kind === "evaluate") return path.join(path.dirname(inputPath), `${stem}.evaluation.json`);
  throw new Error(`Unknown output kind: ${kind}`);
}

async function resolveOutput(inputPath, requested, kind, force) {
  if (!requested) return uniqueDefaultOutput(defaultOutputFor(inputPath, kind));
  const outputPath = path.resolve(trimDraggedPath(requested));
  if (!force && await exists(outputPath)) {
    throw new Error(`Output already exists: ${outputPath}\nUse --force to replace it.`);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  return outputPath;
}

export async function prepareFileCommand(kind, argv, ask = null) {
  const args = [...argv];
  const force = args.includes("--force");
  let cleaned = args.filter((arg) => arg !== "--force");
  let inputValue = cleaned[0] && !cleaned[0].startsWith("-") ? cleaned.shift() : null;
  if (!inputValue && ask) inputValue = await ask(kind === "analyze" ? "MIDI file" : "Section JSON file");
  if (!inputValue) throw new Error(`Missing ${kind === "analyze" ? "MIDI" : "JSON"} input file`);

  const extensions = kind === "analyze" ? [".mid", ".midi"] : [".json"];
  const inputPath = await assertInputFile(inputValue, extensions, kind === "analyze" ? "MIDI input" : "JSON input");
  const outputOption = optionValue(cleaned, ["--output", "-o"]);
  let requestedOutput = outputOption?.value ?? null;
  if (!requestedOutput && cleaned[0] && !cleaned[0].startsWith("-")) requestedOutput = cleaned.shift();
  if (outputOption) cleaned = removeIndexes(cleaned, new Set([outputOption.index, outputOption.index + 1]));
  const outputPath = await resolveOutput(inputPath, requestedOutput, kind, force);
  return { inputPath, outputPath, childArgs: [inputPath, ...cleaned, "--output", outputPath] };
}

export async function runNodeScript(relativeScript, args = [], options = {}) {
  const scriptPath = path.join(REPO_ROOT, ...relativeScript.split("/"));
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...(options.env || {}) },
    stdio: "inherit",
    shell: false,
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 130 : (code ?? 1)));
  });
  if (exitCode !== 0) {
    const error = new Error(`${path.basename(relativeScript)} exited with code ${exitCode}`);
    error.exitCode = exitCode;
    throw error;
  }
  return exitCode;
}

function dataRoot() {
  return path.resolve(process.env.MIDI_DATA_ROOT || path.join(REPO_ROOT, "..", "midi_data"));
}

export async function discoverCatalog() {
  const candidates = [
    process.env.HOOKTHEORY_CATALOG_DB,
    path.join(REPO_ROOT, "android", "catalog.db"),
    path.join(REPO_ROOT, "..", "android", "catalog.db"),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, "Desktop", "diatonic_ring", "android", "catalog.db"),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  for (const candidate of [...new Set(candidates)]) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function discoverManifest() {
  const root = path.join(dataRoot(), "manifests");
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, "manifest.json");
    try {
      const stat = await fs.stat(manifestPath);
      candidates.push({ directory: path.dirname(manifestPath), modified: stat.mtimeMs });
    } catch {
      // Ignore incomplete/non-manifest directories.
    }
  }
  candidates.sort((left, right) => right.modified - left.modified || left.directory.localeCompare(right.directory));
  return candidates[0]?.directory ?? null;
}

function createPrompter(readline) {
  return async (label, defaultValue = null) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = trimDraggedPath(await readline.question(`${label}${suffix}: `));
    return answer || defaultValue || "";
  };
}

async function runAnalyze(argv, context) {
  const prepared = await prepareFileCommand("analyze", argv, context.ask);
  context.write(`\nAnalyzing ${prepared.inputPath}\nOutput: ${prepared.outputPath}\n\n`);
  return context.runScript(COMMANDS.analyze, prepared.childArgs);
}

async function runRender(argv, context) {
  const prepared = await prepareFileCommand("render", argv, context.ask);
  context.write(`\nRendering ${prepared.inputPath}\nMIDI: ${prepared.outputPath}\n\n`);
  return context.runScript(COMMANDS.render, prepared.childArgs);
}

async function runEvaluate(argv, context) {
  let [truth, analysis, ...rest] = argv;
  if (!truth && context.ask) truth = await context.ask("Truth section JSON");
  if (!analysis && context.ask) analysis = await context.ask("Analyzer result JSON");
  if (!truth || !analysis) throw new Error("Evaluation requires truth JSON and analysis JSON");
  const truthPath = await assertInputFile(truth, [".json"], "Truth JSON");
  const analysisPath = await assertInputFile(analysis, [".json"], "Analysis JSON");
  const force = rest.includes("--force");
  rest = rest.filter((arg) => arg !== "--force");
  const outputOption = optionValue(rest, ["--output", "-o"]);
  const outputPath = await resolveOutput(
    analysisPath,
    outputOption?.value,
    "evaluate",
    force,
  );
  if (outputOption) rest = removeIndexes(rest, new Set([outputOption.index, outputOption.index + 1]));
  context.write(`\nEvaluating ${analysisPath}\nReport: ${outputPath}\n\n`);
  return context.runScript(COMMANDS.evaluate, [truthPath, analysisPath, ...rest, "--output", outputPath]);
}

async function runPairs(argv, context) {
  if (argv.length) return context.runScript(COMMANDS.pairs, argv);
  if (!context.ask) throw new Error("pairs requires arguments outside an interactive terminal");
  const manifest = await context.ask("Frozen manifest directory", await discoverManifest());
  const catalog = await context.ask("Android catalog.db", await discoverCatalog());
  const output = await context.ask("New output directory", path.join(dataRoot(), "pairs", `batch-${Date.now()}`));
  const limit = await context.ask("Maximum section pairs", "100");
  const split = await context.ask("Split (train, validation, test, or all)", "train");
  return context.runScript(COMMANDS.pairs, [
    "--manifest", manifest,
    "--catalog", catalog,
    "--output", output,
    "--limit", limit,
    "--split", split,
  ]);
}

async function runAudit(argv, context) {
  if (argv.length) return context.runScript(COMMANDS.audit, argv);
  if (!context.ask) throw new Error("audit requires arguments outside an interactive terminal");
  const catalog = await context.ask("Android catalog.db", await discoverCatalog());
  const output = await context.ask("Audit report", path.join(dataRoot(), "audits", `catalog-raw-${Date.now()}.json`));
  return context.runScript(COMMANDS.audit, ["--catalog", catalog, "--output", output]);
}

export async function runDoctor(write = (value) => process.stdout.write(value)) {
  const checks = [];
  const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
  const supportedNode = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 5);
  checks.push({ required: true, ok: supportedNode, label: `Node ${process.versions.node} (22.5+ required)` });
  for (const dependency of ["@tonejs/midi", "midi-file", "better-sqlite3"]) {
    const dependencyPath = path.join(REPO_ROOT, "node_modules", ...dependency.split("/"), "package.json");
    checks.push({ required: true, ok: await exists(dependencyPath), label: `Dependency ${dependency}` });
  }
  const catalog = await discoverCatalog();
  const manifest = await discoverManifest();
  checks.push({ required: false, ok: Boolean(catalog), label: catalog ? `Catalog ${catalog}` : "Catalog not auto-discovered" });
  checks.push({ required: false, ok: Boolean(manifest), label: manifest ? `Manifest ${manifest}` : "Frozen manifest not auto-discovered" });

  let freeGiB = null;
  try {
    const stat = await fs.statfs(dataRoot(), { bigint: true });
    freeGiB = Number(stat.bavail * stat.bsize) / GIB;
    checks.push({
      required: true,
      ok: freeGiB >= REQUIRED_FREE_GIB,
      label: `${freeGiB.toFixed(2)} GiB free (${REQUIRED_FREE_GIB} GiB reserve required)`,
    });
  } catch {
    checks.push({ required: false, ok: false, label: `MIDI data root is not initialized: ${dataRoot()}` });
  }

  write("\nHooktheory MIDI setup check\n\n");
  for (const check of checks) write(`${check.ok ? "[OK]" : check.required ? "[FAIL]" : "[INFO]"} ${check.label}\n`);
  const failures = checks.filter((check) => check.required && !check.ok);
  if (failures.some((check) => check.label.startsWith("Dependency"))) {
    write("\nRun npm install in the repository to install missing dependencies.\n");
  }
  if (!catalog) write("Set HOOKTHEORY_CATALOG_DB to the full path of android/catalog.db for audits and pair generation.\n");
  if (!manifest) write("Run the manifest shortcut before generating paired datasets.\n");
  write(failures.length ? "\nSetup needs attention.\n" : "\nReady.\n");
  return failures.length ? 1 : 0;
}

async function dispatch(command, argv, context) {
  if (command === "analyze") return runAnalyze(argv, context);
  if (command === "render") return runRender(argv, context);
  if (command === "pairs") return runPairs(argv, context);
  if (command === "audit") return runAudit(argv, context);
  if (command === "evaluate") return runEvaluate(argv, context);
  if (command === "doctor") return runDoctor(context.write);
  if (command === "serve") {
    context.write("\nStarting the local player and MIDI API at http://127.0.0.1:3000\nPress Ctrl+C to stop it.\n\n");
    return context.runScript(COMMANDS.serve, argv);
  }
  if (command === "corpus" || command === "manifest") {
    return context.runScript(COMMANDS[command], argv.length ? argv : ["--help"]);
  }
  if (command === "help") {
    context.write(`${HELP}\n`);
    return 0;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

async function interactiveMenu(context, readline) {
  const ask = createPrompter(readline);
  const menuContext = { ...context, ask };
  const choices = {
    "1": "analyze",
    "2": "render",
    "3": "pairs",
    "4": "audit",
    "5": "evaluate",
    "6": "serve",
    "7": "doctor",
    "8": "corpus",
  };
  while (true) {
    context.write(`\nHooktheory MIDI Tools
  1. Analyze a MIDI file
  2. Create MIDI from Hooktheory JSON
  3. Generate a paired-data batch
  4. Audit the decoder catalog
  5. Evaluate an analysis
  6. Start the local player/API
  7. Check setup
  8. Advanced corpus tools
  0. Exit
`);
    const choice = await ask("Choose an option");
    if (choice === "0" || choice.toLowerCase() === "q") return 0;
    const command = choices[choice];
    if (!command) {
      context.write("Please choose 0 through 8.\n");
      continue;
    }
    try {
      await dispatch(command, [], menuContext);
    } catch (error) {
      context.write(`\nCould not complete that action: ${error.message}\n`);
    }
    if (command !== "serve") await ask("Press Enter to return to the menu");
  }
}

export async function main(argv = process.argv.slice(2), overrides = {}) {
  const write = overrides.write || ((value) => process.stdout.write(value));
  const runScript = overrides.runScript || runNodeScript;
  const context = { write, runScript, ask: overrides.ask || null };
  let [rawCommand, ...commandArgs] = argv;
  if (!rawCommand) {
    if (!process.stdin.isTTY && !overrides.readline) {
      write(`${HELP}\n`);
      return 0;
    }
    const readline = overrides.readline || createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await interactiveMenu(context, readline);
    } finally {
      if (!overrides.readline) readline.close();
    }
  }
  if (rawCommand === "--help" || rawCommand === "-h") rawCommand = "help";
  const draggedExtension = path.extname(trimDraggedPath(rawCommand)).toLowerCase();
  let command;
  if ([".mid", ".midi"].includes(draggedExtension)) {
    command = "analyze";
    commandArgs.unshift(rawCommand);
  } else if (draggedExtension === ".json") {
    command = "render";
    commandArgs.unshift(rawCommand);
  } else {
    command = ALIASES[rawCommand.toLowerCase()] || rawCommand.toLowerCase();
  }

  if (command === "menu") {
    if (!process.stdin.isTTY && !overrides.readline) {
      write(`${HELP}\n`);
      return 0;
    }
    const readline = overrides.readline || createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await interactiveMenu(context, readline);
    } finally {
      if (!overrides.readline) readline.close();
    }
  }

  if (!commandArgs.length && INTERACTIVE_COMMANDS.has(command)
    && (process.stdin.isTTY || overrides.readline)) {
    const readline = overrides.readline || createInterface({ input: process.stdin, output: process.stdout });
    const interactiveContext = { ...context, ask: context.ask || createPrompter(readline) };
    try {
      return await dispatch(command, commandArgs, interactiveContext);
    } finally {
      if (!overrides.readline) readline.close();
    }
  }

  return dispatch(command, commandArgs, context);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = Number(code) || 0;
  }).catch((error) => {
    process.stderr.write(`\nMIDI tools: ${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  });
}
