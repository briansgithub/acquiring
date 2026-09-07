"""Launch the Hooktheory web player and stop it cleanly (Ctrl+C or Quit in browser)."""

import pathlib
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

PORT = 3000
STARTUP_TIMEOUT = 20.0
ROOT = pathlib.Path(__file__).resolve().parents[2]
SERVER_JS = ROOT / "web" / "server.js"
NODE_MODULES = ROOT / "node_modules"


def ensure_dependencies() -> None:
    """Install npm dependencies if they are missing (server.js needs better-sqlite3)."""
    if NODE_MODULES.is_dir():
        return
    npm = shutil.which("npm")
    if npm is None:
        print("Dependencies are not installed and npm was not found.")
        print(f"Install Node.js, then run: npm install (in {ROOT})")
        sys.exit(1)
    print("Installing dependencies (first run)...")
    result = subprocess.run(
        [npm, "install", "--no-audit", "--no-fund"],
        cwd=ROOT,
        check=False,
    )
    if result.returncode != 0 or not NODE_MODULES.is_dir():
        print(f"npm install failed. Run it manually in {ROOT}")
        sys.exit(1)


def wait_until_ready(proc: subprocess.Popen, port: int) -> bool:
    """Poll the health endpoint until the server answers or the process dies."""
    deadline = time.monotonic() + STARTUP_TIMEOUT
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/api/health", timeout=1
            ) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.25)
    return proc.poll() is None


def free_port(port: int) -> None:
    """Stop any process already listening on port (stale player from prior run)."""
    if sys.platform == "win32":
        try:
            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | "
                    f"Select-Object -ExpandProperty OwningProcess -Unique | "
                    f"ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}",
                ],
                capture_output=True,
                timeout=10,
                check=False,
            )
        except Exception:
            pass
    else:
        try:
            # On Linux/macOS, kill any process listening on the port
            subprocess.run(
                f"lsof -t -i :{port} | xargs kill -9",
                shell=True,
                capture_output=True,
                check=False,
            )
        except Exception:
            pass


def stop_process(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    print("\nStopping server...")
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    print("Server stopped.")


def main() -> None:
    if not SERVER_JS.is_file():
        print(f"Missing server: {SERVER_JS}")
        sys.exit(1)

    ensure_dependencies()
    free_port(PORT)

    try:
        proc = subprocess.Popen(
            ["node", str(SERVER_JS)],
            cwd=SERVER_JS.parent,
        )
    except FileNotFoundError:
        print("Node.js not found. Install Node to run the player.")
        sys.exit(1)

    def on_signal(signum, frame):
        stop_process(proc)
        sys.exit(0)

    signal.signal(signal.SIGINT, on_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, on_signal)

    if not wait_until_ready(proc, PORT):
        code = proc.poll()
        print(f"Server failed to start (exit code {code}). See the error above.")
        stop_process(proc)
        sys.exit(1)

    url = f"http://localhost:{PORT}"
    webbrowser.open(url)

    print()
    print("=" * 52)
    print(f"  Player running: {url}")
    print("  Stop options:")
    print("    • Ctrl+C in this window")
    print("    • Quit button in the player (bottom-right)")
    print("=" * 52)
    print()

    try:
        code = proc.wait()
        if code == 0:
            print("Server exited.")
        else:
            print(f"Server exited with code {code}")
    except KeyboardInterrupt:
        stop_process(proc)


if __name__ == "__main__":
    main()
