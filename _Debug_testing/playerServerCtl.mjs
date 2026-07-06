#!/usr/bin/env node
/**
 * Start/stop the web player server as a detached process the agent can control.
 *
 * Usage:
 *   node _Debug_testing/playerServerCtl.mjs start [--port 3000]
 *   node _Debug_testing/playerServerCtl.mjs stop
 *   node _Debug_testing/playerServerCtl.mjs status
 *   node _Debug_testing/playerServerCtl.mjs restart
 *
 * State: _Debug_testing/.player-server.json
 * Logs:  _Debug_testing/player-server.log
 */

import { spawn, execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER_JS = path.join(ROOT, "web-player", "server.js");
const STATE_FILE = path.join(__dirname, ".player-server.json");
const LOG_FILE = path.join(__dirname, "player-server.log");
const DEFAULT_PORT = 3000;

function parseArgs(argv) {
  const args = { command: argv[0] || "status", port: DEFAULT_PORT };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === "--port" && argv[i + 1]) {
      args.port = Number(argv[++i]) || DEFAULT_PORT;
    }
  }
  return args;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearState() {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    /* ignore */
  }
}

function isPidAlive(pid) {
  if (!pid || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fetchHealth(port)) return true;
    await sleep(200);
  }
  return false;
}

function freePortWindows(port) {
  return new Promise((resolve) => {
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
          "Select-Object -ExpandProperty OwningProcess -Unique | " +
          "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    ps.on("close", () => resolve());
    ps.on("error", () => resolve());
  });
}

async function freePort(port) {
  if (process.platform === "win32") {
    await freePortWindows(port);
    await sleep(300);
  }
}

async function requestShutdown(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function killPid(pid) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => resolve());
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already dead */
    }
    resolve();
  });
}

async function cmdStatus(port = DEFAULT_PORT) {
  const state = readState();
  const health = await fetchHealth(port);
  const pidAlive = state?.pid ? isPidAlive(state.pid) : false;
  const running = health && pidAlive;

  console.log(
    JSON.stringify(
      {
        running,
        health,
        pid: state?.pid ?? null,
        pidAlive,
        port: state?.port ?? port,
        logFile: LOG_FILE,
        stateFile: STATE_FILE,
      },
      null,
      2,
    ),
  );
  process.exit(running ? 0 : 1);
}

async function cmdStart(port) {
  const state = readState();
  if (state?.pid && isPidAlive(state.pid) && (await fetchHealth(state.port || port))) {
    console.log(`Server already running (PID ${state.pid}, port ${state.port || port})`);
    process.exit(0);
  }

  await freePort(port);
  clearState();

  const logFd = fs.openSync(LOG_FILE, "a");
  fs.writeSync(
    logFd,
    `\n--- start ${new Date().toISOString()} port=${port} ---\n`,
  );

  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: path.dirname(SERVER_JS),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, PORT: String(port) },
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(logFd);

  writeState({
    pid: child.pid,
    port,
    startedAt: new Date().toISOString(),
    logFile: LOG_FILE,
  });

  const ready = await waitForHealth(port);
  if (!ready) {
    console.error(`Server failed to become healthy on port ${port}. See ${LOG_FILE}`);
    process.exit(1);
  }

  console.log(`Player server started (PID ${child.pid}) → http://127.0.0.1:${port}`);
  console.log(`Stop with: node _Debug_testing/playerServerCtl.mjs stop`);
  process.exit(0);
}

async function cmdStop() {
  const state = readState();
  const port = state?.port ?? DEFAULT_PORT;
  const pid = state?.pid;

  if (!(await fetchHealth(port)) && !isPidAlive(pid)) {
    clearState();
    console.log("Server is not running.");
    return;
  }

  console.log(`Stopping server (PID ${pid ?? "?"}, port ${port})...`);
  await requestShutdown(port);

  for (let i = 0; i < 20; i += 1) {
    if (!isPidAlive(pid) && !(await fetchHealth(port))) {
      clearState();
      console.log("Server stopped cleanly.");
      return;
    }
    await sleep(250);
  }

  if (isPidAlive(pid)) {
    console.log("Graceful shutdown timed out; force-killing...");
    await killPid(pid);
    await sleep(400);
  }

  await freePort(port);
  clearState();
  console.log("Server stopped (forced).");
}

async function cmdRestart(port) {
  await cmdStop();
  await sleep(400);
  await cmdStart(port);
}

const { command, port } = parseArgs(process.argv.slice(2));

switch (command) {
  case "start":
    await cmdStart(port);
    break;
  case "stop":
    await cmdStop();
    break;
  case "restart":
    await cmdRestart(port);
    break;
  case "status":
    await cmdStatus(port);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: playerServerCtl.mjs {start|stop|status|restart} [--port 3000]");
    process.exit(2);
}

if (command === "stop") {
  process.exit(0);
}
