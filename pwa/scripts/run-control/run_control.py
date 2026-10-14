#!/usr/bin/env python3
"""Command-scoped coordinator exclusion and conservative recovery receipts."""
from __future__ import annotations

import argparse
import contextlib
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

BUSY = 75
RECOVERY_REQUIRED = 76
INVALID_RUN = 77
CONTROL_ERROR = 78
PHASES = ("intent", "start", "result", "acknowledgment")


class Busy(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_receipt(path, data):
    """Publish once; the held coordinator lock serializes all writers."""
    if path.exists():
        raise FileExistsError(path)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    # Retain an interrupted temporary file as diagnostic evidence.
    with temp.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(data, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    if os.name != "nt":
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)


class CoordinatorLock:
    def __init__(self, root):
        self.path = root / ".artifacts" / "pwa-port" / "coordinator.lock"
        self.fd = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.fd, msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            os.close(self.fd)
            self.fd = None
            if exc.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                raise Busy from None
            raise
        return self

    def __exit__(self, *_):
        if self.fd is not None:
            # POSIX children inherit the open-file description; do not explicitly
            # unlock it and accidentally release a surviving child's lock.
            os.close(self.fd)
            self.fd = None


def read_runs(root):
    directory = root / ".artifacts" / "pwa-port" / "runs"
    if not directory.exists():
        return []
    runs = []
    for folder in sorted(directory.iterdir()):
        if not folder.is_dir():
            continue
        phases, errors = {}, []
        for phase in PHASES:
            path = folder / (phase + ".json")
            if path.exists():
                try:
                    value = json.loads(path.read_text(encoding="utf-8"))
                    if not isinstance(value, dict) or value.get("runId") != folder.name:
                        raise ValueError("receipt identity mismatch")
                    if value.get("phase") != phase:
                        raise ValueError("receipt phase mismatch")
                    if any(value.get(key) is not None and
                           (type(value[key]) is not int or not 0 < value[key] < 2**32)
                           for key in ("controllerPid", "childPid")):
                        raise ValueError("invalid recorded process ID")
                    if phase == "result" and (
                        value.get("status") not in ("succeeded", "failed", "launch_failed", "interrupted")
                        or not isinstance(value.get("exitCode"), int)
                    ):
                        raise ValueError("result has no authoritative exit result")
                    if phase == "acknowledgment" and (
                        value.get("status") != "reconciled_unknown_result"
                        or not value.get("evidence") or not value.get("reconciledBy")
                    ):
                        raise ValueError("acknowledgment lacks operator reconciliation evidence")
                    phases[phase] = value
                except (OSError, ValueError) as exc:
                    errors.append(f"{path.name}: {exc}")
        partials = sorted(p.name for p in folder.glob("*.tmp"))
        # Any malformed final receipt, unknown folder, or partial phase needs
        # reconciliation; an acknowledgment does not repair a malformed receipt.
        resolved = bool(phases.get("result") or phases.get("acknowledgment"))
        interrupted = bool(errors or "intent" not in phases or not resolved)
        latest = phases.get("start", phases.get("intent", {}))
        runs.append({"runId": folder.name, "receipts": phases, "errors": errors,
                     "partialFiles": partials, "recoveryRequired": interrupted,
                     "observedProcesses": {key: {"pid": latest.get(key),
                                                "liveOrUnknown": pid_alive(latest.get(key))}
                                           for key in ("controllerPid", "childPid")},
                     "interpretation": (
                         "Receipt is incomplete or invalid. Inspect Git, processes and side effects; success is unknown."
                         if interrupted else
                         "Operator reconciled interruption; this is not evidence of success."
                         if "acknowledgment" in phases and "result" not in phases else
                         "Recorded command exit; verify expected outputs and tested revision before completing the task."
                     )})
    return runs


def pid_alive(pid):
    if not pid:
        return False
    if os.name == "nt":
        from ctypes import wintypes as w
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = (w.DWORD, w.BOOL, w.DWORD)
        kernel.OpenProcess.restype = w.HANDLE
        kernel.CloseHandle.argtypes = (w.HANDLE,)
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return ctypes.get_last_error() != 87  # access denied => unknown/live
        code = w.DWORD()
        kernel.GetExitCodeProcess.argtypes = (w.HANDLE, ctypes.POINTER(w.DWORD))
        try:
            return not kernel.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


if os.name == "nt":
    from ctypes import wintypes as w

    class StartupInfo(ctypes.Structure):
        _fields_ = [("cb", w.DWORD), ("reserved", w.LPWSTR), ("desktop", w.LPWSTR),
                    ("title", w.LPWSTR), ("x", w.DWORD), ("y", w.DWORD),
                    ("width", w.DWORD), ("height", w.DWORD), ("charsX", w.DWORD),
                    ("charsY", w.DWORD), ("fill", w.DWORD), ("flags", w.DWORD),
                    ("show", w.WORD), ("reserved2", w.WORD),
                    ("reservedPtr", ctypes.POINTER(ctypes.c_byte)),
                    ("stdin", w.HANDLE), ("stdout", w.HANDLE), ("stderr", w.HANDLE)]

    class ProcessInfo(ctypes.Structure):
        _fields_ = [("process", w.HANDLE), ("thread", w.HANDLE),
                    ("pid", w.DWORD), ("tid", w.DWORD)]

    class BasicLimits(ctypes.Structure):
        _fields_ = [("processTime", ctypes.c_longlong), ("jobTime", ctypes.c_longlong),
                    ("flags", w.DWORD), ("minWorkingSet", ctypes.c_size_t),
                    ("maxWorkingSet", ctypes.c_size_t), ("activeProcessLimit", w.DWORD),
                    ("affinity", ctypes.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]

    class IoCounters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in
                    ("readOps", "writeOps", "otherOps", "readBytes", "writeBytes", "otherBytes")]

    class ExtendedLimits(ctypes.Structure):
        _fields_ = [("basic", BasicLimits), ("io", IoCounters),
                    ("processMemory", ctypes.c_size_t), ("jobMemory", ctypes.c_size_t),
                    ("peakProcessMemory", ctypes.c_size_t), ("peakJobMemory", ctypes.c_size_t)]

    class Accounting(ctypes.Structure):
        _fields_ = [(name, ctypes.c_longlong) for name in
                    ("user", "kernel", "periodUser", "periodKernel")] + [
                    (name, w.DWORD) for name in ("faults", "total", "active", "terminated")]

    class WindowsJob:
        def __init__(self, root):
            self.k = ctypes.WinDLL("kernel32", use_last_error=True)
            signatures = {
                "CreateJobObjectW": (w.HANDLE, (ctypes.c_void_p, w.LPCWSTR)),
                "SetInformationJobObject": (w.BOOL, (w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD)),
                "QueryInformationJobObject": (w.BOOL, (w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p)),
                "AssignProcessToJobObject": (w.BOOL, (w.HANDLE, w.HANDLE)),
                "TerminateJobObject": (w.BOOL, (w.HANDLE, w.UINT)),
                "CloseHandle": (w.BOOL, (w.HANDLE,)),
                "GetStdHandle": (w.HANDLE, (w.DWORD,)),
                "CreateProcessW": (w.BOOL, (w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p,
                                           w.BOOL, w.DWORD, ctypes.c_void_p, w.LPCWSTR,
                                           ctypes.POINTER(StartupInfo), ctypes.POINTER(ProcessInfo))),
                "ResumeThread": (w.DWORD, (w.HANDLE,)),
                "TerminateProcess": (w.BOOL, (w.HANDLE, w.UINT)),
                "WaitForSingleObject": (w.DWORD, (w.HANDLE, w.DWORD)),
                "GetExitCodeProcess": (w.BOOL, (w.HANDLE, ctypes.POINTER(w.DWORD))),
            }
            for name, (restype, argtypes) in signatures.items():
                fn = getattr(self.k, name)
                fn.restype, fn.argtypes = restype, argtypes
            name = "Local\\AcquiringPwaCoordinator-" + hashlib.sha256(
                os.path.normcase(str(root)).encode()).hexdigest()
            self.handle = self.k.CreateJobObjectW(None, name)
            if not self.handle:
                raise ctypes.WinError(ctypes.get_last_error())
            if ctypes.get_last_error() == 183:
                self.close()
                raise Busy
            limits = ExtendedLimits()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if not self.k.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                error = ctypes.WinError(ctypes.get_last_error())
                self.close()
                raise error
            self.process = None

        def start(self, command, root):
            startup, info = StartupInfo(), ProcessInfo()
            startup.cb, startup.flags = ctypes.sizeof(startup), 0x100
            startup.stdin = self.k.GetStdHandle(-10 & 0xffffffff)
            startup.stdout = self.k.GetStdHandle(-11 & 0xffffffff)
            startup.stderr = self.k.GetStdHandle(-12 & 0xffffffff)
            line = ctypes.create_unicode_buffer(subprocess.list2cmdline(command))
            if not self.k.CreateProcessW(None, line, None, None, True, 0x4, None,
                                         str(root), ctypes.byref(startup), ctypes.byref(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                if not self.k.AssignProcessToJobObject(self.handle, info.process):
                    raise ctypes.WinError(ctypes.get_last_error())
                if self.k.ResumeThread(info.thread) == 0xffffffff:
                    raise ctypes.WinError(ctypes.get_last_error())
            except BaseException:
                self.k.TerminateProcess(info.process, CONTROL_ERROR)
                self.k.WaitForSingleObject(info.process, 0xffffffff)
                self.k.CloseHandle(info.process)
                raise
            finally:
                self.k.CloseHandle(info.thread)
            self.process = info.process
            return info.pid

        def wait(self):
            while self.k.WaitForSingleObject(self.process, 100) == 258:
                pass
            code = w.DWORD()
            if not self.k.GetExitCodeProcess(self.process, ctypes.byref(code)):
                raise ctypes.WinError(ctypes.get_last_error())
            return code.value

        def stop(self):
            if not self.k.TerminateJobObject(self.handle, CONTROL_ERROR):
                raise ctypes.WinError(ctypes.get_last_error())
            counts = Accounting()
            while True:
                if not self.k.QueryInformationJobObject(self.handle, 1, ctypes.byref(counts), ctypes.sizeof(counts), None):
                    raise ctypes.WinError(ctypes.get_last_error())
                if counts.active == 0:
                    break
                time.sleep(0.02)

        def close(self):
            if getattr(self, "process", None):
                self.k.CloseHandle(self.process)
                self.process = None
            if self.handle:
                self.k.CloseHandle(self.handle)
                self.handle = None


def valid_run(value):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}", value):
        raise argparse.ArgumentTypeError("run ID must be 1..96 letters, digits, dots, underscores or hyphens")
    return value


def run_command(args, root, lock):
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        raise ValueError("run requires a command after --")
    cwd = (root / (args.cwd or Path("."))).resolve()
    if not cwd.is_relative_to(root) or not cwd.is_dir():
        raise ValueError("--cwd must be an existing directory inside the Git working tree")
    runs = read_runs(root)
    if any(run["runId"] == args.run_id for run in runs):
        print("Run ID already exists; use status to inspect it. Command was not repeated.", file=sys.stderr)
        return INVALID_RUN
    if any(run["recoveryRequired"] for run in runs):
        print("Unreconciled run receipts exist; use status before any new command.", file=sys.stderr)
        return RECOVERY_REQUIRED
    job = WindowsJob(root) if os.name == "nt" else None
    folder = root / ".artifacts" / "pwa-port" / "runs" / args.run_id
    try:
        folder.mkdir(parents=True, exist_ok=False)
        base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
        metadata = {"schemaVersion": 1, "owner": args.owner, "task": args.task,
                    "runId": args.run_id, "command": command, "cwd": str(cwd), "repo": str(root),
                    "controllerPid": os.getpid(), "childPid": None,
                    "baseGitCommit": base, "nextAction": args.next_action}
        def receipt(phase, **fields):
            atomic_receipt(folder / (phase + ".json"),
                           dict(metadata, phase=phase, recordedAt=now(), **fields))
        receipt("intent", status="intended")
        child = None
        try:
            if job:
                metadata["childPid"] = job.start(command, cwd)
            else:
                child = subprocess.Popen(command, cwd=cwd, start_new_session=True, pass_fds=(lock.fd,))
                metadata["childPid"] = child.pid
            receipt("start", status="started")
            code = job.wait() if job else child.wait()
            if job:
                job.stop()  # stop descendants before publishing a completed run
            else:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGKILL)
            receipt("result", status="succeeded" if code == 0 else "failed", exitCode=code)
            return code if 0 <= code <= 255 else 1
        except KeyboardInterrupt:
            if job:
                job.stop()
            elif child:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            receipt("result", status="interrupted", exitCode=130)
            return 130
        except OSError as exc:
            if metadata["childPid"] is None:
                receipt("result", status="launch_failed", exitCode=CONTROL_ERROR, error=str(exc))
            raise
        finally:
            if job:
                job.stop()
            elif child and child.poll() is None:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGKILL)
                child.wait()
    finally:
        if job:
            job.close()


def acknowledge(args, root):
    runs = {run["runId"]: run for run in read_runs(root)}
    run = runs.get(args.run_id)
    if not run or run["errors"] or not run["receipts"].get("intent"):
        raise ValueError("No valid intent to acknowledge; preserve files and investigate manually")
    if "acknowledgment" in run["receipts"]:
        return 0  # idempotent; retain original operator evidence
    if not run["recoveryRequired"]:
        raise ValueError("Run already has a result; no interruption to acknowledge")
    for receipt in run["receipts"].values():
        if any(pid_alive(receipt.get(key)) for key in ("controllerPid", "childPid")):
            raise ValueError("Recorded process is live or cannot be ruled out; acknowledgment refused")
    data = dict(run["receipts"]["intent"], phase="acknowledgment", status="reconciled_unknown_result",
                recordedAt=now(), reconciledBy=args.owner, evidence=args.evidence,
                nextAction=args.next_action)
    atomic_receipt(root / ".artifacts" / "pwa-port" / "runs" / args.run_id / "acknowledgment.json", data)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, help="Git working-tree root (default: this script's repository)")
    actions = parser.add_subparsers(dest="action", required=True)
    run = actions.add_parser("run", help="hold coordinator ownership around one child command")
    run.add_argument("--cwd", type=Path, help="Child directory relative to --repo (must remain inside this working tree)")
    run.add_argument("--run-id", type=valid_run, required=True)
    run.add_argument("--owner", required=True)
    run.add_argument("--task", required=True)
    run.add_argument("--next-action", required=True)
    run.add_argument("command", nargs=argparse.REMAINDER)
    actions.add_parser("status", help="read receipts without mutation or command execution")
    ack = actions.add_parser("acknowledge", help="record operator reconciliation; never rerun or claim success")
    ack.add_argument("--run-id", type=valid_run, required=True)
    ack.add_argument("--owner", required=True)
    ack.add_argument("--evidence", required=True)
    ack.add_argument("--next-action", required=True)
    ack.add_argument("--confirmed-stopped", action="store_true", required=True)
    args = parser.parse_args(argv)
    try:
        root = (args.repo or Path(__file__).resolve().parents[3]).resolve()
        actual = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=root,
                                    capture_output=True, text=True, check=True).stdout.strip()).resolve()
        if root != actual:
            raise ValueError("--repo must name a Git working-tree root")
        if args.action == "status":
            print(json.dumps({"repo": str(root), "runs": read_runs(root)}, indent=2))
            return 0
        with CoordinatorLock(root) as lock:
            if args.action == "run":
                return run_command(args, root, lock)
            # A named Windows job may still be draining after a killed wrapper.
            job = WindowsJob(root) if os.name == "nt" else None
            try:
                return acknowledge(args, root)
            finally:
                if job:
                    job.close()
    except Busy:
        return BUSY  # quiet contention is expected for scheduled invocations
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(f"run-control: {exc}", file=sys.stderr)
        return CONTROL_ERROR


if __name__ == "__main__":
    sys.exit(main())
