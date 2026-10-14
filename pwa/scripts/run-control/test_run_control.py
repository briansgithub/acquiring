"""Real-process drills. Every write is inside a dedicated temporary Git root."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

SCRIPT = Path(__file__).with_name("run_control.py")
spec = importlib.util.spec_from_file_location("run_control", SCRIPT)
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pwa-run-control-test-")
        self.root = Path(self.temp.name).resolve()
        self.processes = []
        for args in (["git", "init", "-q"],
                     ["git", "-c", "user.name=Run Control Test", "-c", "user.email=test@example.invalid",
                      "commit", "--allow-empty", "-qm", "test root"]):
            subprocess.run(args, cwd=self.root, check=True, capture_output=True)

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=15)
        self.temp.cleanup()

    def cli(self, *args):
        return [sys.executable, str(SCRIPT), "--repo", str(self.root), *args]

    def command(self, run_id, source):
        return self.cli("run", "--run-id", run_id, "--owner", "test", "--task", "T00",
                        "--next-action", "Inspect the saved docs edit before retrying.",
                        "--", sys.executable, "-c", source)

    def invoke(self, command):
        return subprocess.run(command, cwd=self.root, capture_output=True, text=True, timeout=20)

    def launch(self, run_id, source):
        process = subprocess.Popen(self.command(run_id, source), cwd=self.root,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.processes.append(process)
        return process

    def receipt_path(self, run_id, phase):
        return self.root / ".artifacts" / "pwa-port" / "runs" / run_id / (phase + ".json")

    def receipt(self, run_id, phase):
        return json.loads(self.receipt_path(run_id, phase).read_text(encoding="utf-8"))

    def await_condition(self, condition, timeout=10):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if condition():
                return
            time.sleep(0.03)
        self.fail("Timed out waiting for process evidence")

    def status(self):
        response = self.invoke(self.cli("status"))
        self.assertEqual(response.returncode, 0, response.stderr)
        return json.loads(response.stdout)

    def ack(self, run_id):
        return self.invoke(self.cli("acknowledge", "--run-id", run_id, "--owner", "operator",
                                    "--confirmed-stopped", "--evidence", "Inspected local harmless docs output and stopped processes.",
                                    "--next-action", "Continue the inspected docs task."))

    def test_child_cwd_is_explicit_contained_and_preserves_repo_lock_scope(self):
        child_directory = self.root / "pwa"
        child_directory.mkdir()
        command = self.command("subdirectory", "from pathlib import Path; Path('marker').write_text('owned child')")
        position = command.index("run") + 1
        command[position:position] = ["--cwd", "pwa"]
        result = self.invoke(command)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((child_directory / "marker").read_text(), "owned child")
        self.assertFalse((self.root / "marker").exists())
        self.assertEqual(Path(self.receipt("subdirectory", "intent")["cwd"]), child_directory)
        self.assertEqual(Path(self.receipt("subdirectory", "intent")["repo"]), self.root)
        self.assertTrue((self.root / ".artifacts/pwa-port/coordinator.lock").exists())
        escaped = self.command("escape", "raise RuntimeError('must never run')")
        escaped[position:position] = ["--cwd", str(self.root.parent)]
        result = self.invoke(escaped)
        self.assertEqual(result.returncode, control.CONTROL_ERROR)
        self.assertIn("inside the Git working tree", result.stderr)
        self.assertFalse(self.receipt_path("escape", "intent").exists())

    def test_success_failure_and_lost_response_are_inspectable_without_reexecution(self):
        source = "from pathlib import Path; p=Path('count'); p.write_text(p.read_text()+'x' if p.exists() else 'x')"
        self.assertEqual(self.invoke(self.command("once", source)).returncode, 0)
        original = self.receipt_path("once", "result").read_bytes()
        for _ in range(2):
            state = self.status()["runs"][0]
            self.assertEqual(state["receipts"]["result"]["status"], "succeeded")
            self.assertFalse(state["recoveryRequired"])
        repeated = self.invoke(self.command("once", source))
        self.assertEqual(repeated.returncode, control.INVALID_RUN)
        self.assertEqual((self.root / "count").read_text(), "x")
        self.assertEqual(self.receipt_path("once", "result").read_bytes(), original)
        failed = self.invoke(self.command("failed", "import sys; sys.exit(23)"))
        self.assertEqual(failed.returncode, 23, failed.stderr)
        self.assertEqual(self.receipt("failed", "result")["status"], "failed")
        self.assertEqual(self.receipt("failed", "result")["exitCode"], 23)
        intent = self.receipt("once", "intent")
        for key in ("owner", "task", "runId", "command", "controllerPid", "baseGitCommit", "nextAction"):
            self.assertIn(key, intent)
        self.assertIsNotNone(self.receipt("once", "start")["childPid"])

    def test_real_contention_is_quiet_and_does_not_create_receipts_or_truncate_lock(self):
        lock = self.root / ".artifacts" / "pwa-port" / "coordinator.lock"
        lock.parent.mkdir(parents=True)
        lock.write_bytes(b"retain previous recovery metadata\n")
        first = self.launch("holding", "import time; time.sleep(2)")
        self.await_condition(lambda: self.receipt_path("holding", "start").exists())
        second = self.invoke(self.command("contender", "raise Exception('must not run')"))
        self.assertEqual(second.returncode, control.BUSY)
        self.assertEqual((second.stdout, second.stderr), ("", ""))
        self.assertFalse(self.receipt_path("contender", "intent").parent.exists())
        first.communicate(timeout=10)
        self.assertEqual(first.returncode, 0)
        self.assertEqual(lock.read_bytes(), b"retain previous recovery metadata\n")
        self.assertEqual(self.invoke(self.command("next", "pass")).returncode, 0)

    def test_killed_controller_preserves_partial_docs_and_requires_reconciliation(self):
        source = ("from pathlib import Path; import time; "
                  "Path('partial-doc.md').write_text('valuable unfinished edit'); time.sleep(1)")
        process = self.launch("cut", source)
        self.await_condition(lambda: (self.root / "partial-doc.md").exists()
                             and self.receipt_path("cut", "start").exists())
        child_pid = self.receipt("cut", "start")["childPid"]
        process.kill()
        process.communicate(timeout=10)
        immediate = self.invoke(self.command("immediate-retry", "raise Exception('must not run')"))
        self.assertIn(immediate.returncode, (control.BUSY, control.RECOVERY_REQUIRED))
        self.assertFalse(self.receipt_path("immediate-retry", "intent").parent.exists())
        state = self.status()["runs"][0]
        self.assertTrue(state["recoveryRequired"])
        self.assertNotIn("result", state["receipts"])
        self.assertIn("success is unknown", state["interpretation"])
        # Windows jobs kill children; POSIX inherits flock until the child exits.
        self.await_condition(lambda: not control.pid_alive(child_pid), timeout=10)
        blocked = self.invoke(self.command("unsafe-retry", "raise Exception('must not run')"))
        self.assertEqual(blocked.returncode, control.RECOVERY_REQUIRED, blocked.stderr)
        before = self.receipt_path("cut", "intent").read_bytes()
        self.assertEqual(self.ack("cut").returncode, 0)
        self.assertEqual(self.ack("cut").returncode, 0)
        self.assertEqual(self.receipt_path("cut", "intent").read_bytes(), before)
        self.assertEqual((self.root / "partial-doc.md").read_text(), "valuable unfinished edit")
        self.assertEqual(self.invoke(self.command("continued", "pass")).returncode, 0)
        self.assertEqual(self.invoke(self.command("cut", "pass")).returncode, control.INVALID_RUN)

    @unittest.skipUnless(os.name == "nt", "Windows job-tree semantics")
    def test_abrupt_windows_controller_death_stops_grandchild_before_reacquisition(self):
        grandchild = "import time; time.sleep(60)"
        source = ("import subprocess,sys,time; from pathlib import Path; "
                  f"p=subprocess.Popen([sys.executable,'-c',{grandchild!r}]); "
                  "Path('grandchild.pid').write_text(str(p.pid)); time.sleep(60)")
        process = self.launch("tree", source)
        self.await_condition(lambda: (self.root / "grandchild.pid").exists())
        grandchild_pid = int((self.root / "grandchild.pid").read_text())
        self.assertTrue(control.pid_alive(grandchild_pid))
        process.kill()
        process.communicate(timeout=10)
        self.await_condition(lambda: not control.pid_alive(grandchild_pid))
        self.assertEqual(self.ack("tree").returncode, 0)
        self.assertEqual(self.invoke(self.command("after-tree", "pass")).returncode, 0)

    def test_cut_after_intent_partial_atomic_write_and_readonly_inspection(self):
        folder = self.receipt_path("intent-cut", "intent").parent
        folder.mkdir(parents=True)
        data = {"runId": "intent-cut", "phase": "intent", "controllerPid": None,
                "childPid": None, "nextAction": "Inspect partial docs before continuing"}
        control.atomic_receipt(folder / "intent.json", data)
        with mock.patch.object(control.os, "replace", side_effect=OSError("simulated cutoff before publish")):
            with self.assertRaises(OSError):
                control.atomic_receipt(folder / "start.json", dict(data, phase="start"))
        self.assertFalse((folder / "start.json").exists())
        self.assertEqual(len(list(folder.glob("*.tmp"))), 1)
        before = {str(p): (p.read_bytes(), p.stat().st_mtime_ns) for p in folder.iterdir()}
        for _ in range(2):
            run = self.status()["runs"][0]
            self.assertTrue(run["recoveryRequired"])
            self.assertEqual(run["receipts"]["intent"]["nextAction"], data["nextAction"])
            self.assertEqual(len(run["partialFiles"]), 1)
        after = {str(p): (p.read_bytes(), p.stat().st_mtime_ns) for p in folder.iterdir()}
        self.assertEqual(before, after)
        self.assertEqual(self.invoke(self.command("blocked", "pass")).returncode, control.RECOVERY_REQUIRED)
        self.assertEqual(self.ack("intent-cut").returncode, 0)

    def test_malformed_result_fails_closed_and_existing_receipt_is_not_overwritten(self):
        self.assertEqual(self.invoke(self.command("corrupt", "pass")).returncode, 0)
        result = self.receipt_path("corrupt", "result")
        result.write_text('{"phase":', encoding="utf-8")
        self.assertTrue(self.status()["runs"][0]["recoveryRequired"])
        self.assertEqual(self.invoke(self.command("blocked", "pass")).returncode, control.RECOVERY_REQUIRED)
        self.assertEqual(self.ack("corrupt").returncode, control.CONTROL_ERROR)
        with self.assertRaises(FileExistsError):
            control.atomic_receipt(result, {})
        self.assertEqual(result.read_text(), '{"phase":')

    def test_launch_failure_is_recorded_and_run_id_cannot_escape(self):
        command = self.command("missing", "pass")
        command[-3:] = [str(self.root / "no-such-program")]
        response = self.invoke(command)
        self.assertEqual(response.returncode, control.CONTROL_ERROR)
        self.assertEqual(self.receipt("missing", "result")["status"], "launch_failed")
        invalid = self.command("../escape", "pass")
        self.assertEqual(self.invoke(invalid).returncode, 2)
        self.assertFalse((self.root / ".artifacts" / "pwa-port" / "escape").exists())

    def test_empty_status_is_readonly_and_acknowledgment_refuses_live_process(self):
        self.assertEqual(self.status()["runs"], [])
        self.assertFalse((self.root / ".artifacts").exists())
        path = self.receipt_path("live", "intent")
        path.parent.mkdir(parents=True)
        control.atomic_receipt(path, {"runId": "live", "phase": "intent", "childPid": os.getpid()})
        self.assertEqual(self.ack("live").returncode, control.CONTROL_ERROR)
        self.assertFalse(self.receipt_path("live", "acknowledgment").exists())


if __name__ == "__main__":
    unittest.main()
