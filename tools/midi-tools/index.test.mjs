import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  COMMANDS,
  defaultOutputFor,
  main,
  prepareFileCommand,
  runDoctor,
} from "./index.mjs";

test("friendly defaults put outputs beside their inputs", () => {
  assert.equal(defaultOutputFor(path.join("music", "song.mid"), "analyze"), path.join("music", "song.analysis.json"));
  assert.equal(defaultOutputFor(path.join("music", "section.json"), "render"), path.join("music", "section.mid"));
  assert.equal(
    defaultOutputFor(path.join("music", "song.analysis.json"), "evaluate"),
    path.join("music", "song.analysis.evaluation.json"),
  );
});

test("analyze validates input and selects a collision-free output", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "midi-tools-test-"));
  try {
    const input = path.join(directory, "song.mid");
    const firstOutput = path.join(directory, "song.analysis.json");
    await fs.writeFile(input, "MThd");
    await fs.writeFile(firstOutput, "existing");
    const prepared = await prepareFileCommand("analyze", [input, "--top-k", "3"]);
    assert.equal(prepared.outputPath, path.join(directory, "song.analysis-2.json"));
    assert.deepEqual(prepared.childArgs, [input, "--top-k", "3", "--output", prepared.outputPath]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("explicit overwrite is refused unless force is present", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "midi-tools-test-"));
  try {
    const input = path.join(directory, "section.json");
    const output = path.join(directory, "section.mid");
    await fs.writeFile(input, "{}");
    await fs.writeFile(output, "existing");
    await assert.rejects(
      () => prepareFileCommand("render", [input, "--output", output]),
      /Output already exists/,
    );
    const forced = await prepareFileCommand("render", [input, "--output", output, "--force"]);
    assert.equal(forced.outputPath, output);
    assert.equal(forced.childArgs.includes("--force"), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("main maps friendly commands to the existing low-level tools", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "midi-tools-test-"));
  try {
    const input = path.join(directory, "song.mid");
    await fs.writeFile(input, "MThd");
    const calls = [];
    const output = [];
    const code = await main(["analyze", input], {
      write: (value) => output.push(value),
      runScript: async (script, args) => {
        calls.push({ script, args });
        return 0;
      },
    });
    assert.equal(code, 0);
    assert.equal(calls[0].script, COMMANDS.analyze);
    assert.equal(calls[0].args[0], input);
    assert.match(output.join(""), /Analyzing/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("doctor reports required runtime checks", async () => {
  const output = [];
  const code = await runDoctor((value) => output.push(value));
  assert.equal(code, 0);
  assert.match(output.join(""), /Node .*22\.5\+ required/);
  assert.match(output.join(""), /Dependency @tonejs\/midi/);
  assert.match(output.join(""), /Ready/);
});

test("dragged files route directly to analyze or render", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "midi-tools-test-"));
  try {
    const midi = path.join(directory, "dragged song.mid");
    const section = path.join(directory, "dragged section.json");
    await fs.writeFile(midi, "MThd");
    await fs.writeFile(section, "{}");
    const calls = [];
    const runScript = async (script, args) => {
      calls.push({ script, args });
      return 0;
    };
    await main([midi], { write: () => {}, runScript });
    await main([section], { write: () => {}, runScript });
    assert.equal(calls[0].script, COMMANDS.analyze);
    assert.equal(calls[0].args[0], midi);
    assert.equal(calls[1].script, COMMANDS.render);
    assert.equal(calls[1].args[0], section);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("explicit menu and direct shortcuts can prompt interactively", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "midi-tools-test-"));
  try {
    const midi = path.join(directory, "prompted.mid");
    await fs.writeFile(midi, "MThd");
    const menuAnswers = ["0"];
    const menuCode = await main(["menu"], {
      write: () => {},
      readline: { question: async () => menuAnswers.shift() },
    });
    assert.equal(menuCode, 0);

    const promptAnswers = [midi];
    const calls = [];
    const analyzeCode = await main(["analyze"], {
      write: () => {},
      readline: { question: async () => promptAnswers.shift() },
      runScript: async (script, args) => {
        calls.push({ script, args });
        return 0;
      },
    });
    assert.equal(analyzeCode, 0);
    assert.equal(calls[0].script, COMMANDS.analyze);
    assert.equal(calls[0].args[0], midi);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
