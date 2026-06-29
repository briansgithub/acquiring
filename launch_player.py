"""Launch the Hooktheory web player and stop it cleanly (Ctrl+C or Quit in browser)."""

import pathlib
import signal
import subprocess
import sys
import time
import webbrowser

PORT = 3000
ROOT = pathlib.Path(__file__).parent
SERVER_JS = ROOT / "web-player" / "server.js"


def free_port(port: int) -> None:
    """Stop any process already listening on port (stale player from prior run)."""
    if sys.platform != "win32":
        return
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

    time.sleep(0.8)
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
