import subprocess
import webbrowser
import time
import pathlib
import sys

PORT = 3000
SERVER_JS = pathlib.Path(__file__).parent / "web-player" / "server.js"


def main():
    node_cmd = ["node", str(SERVER_JS)]
    try:
        proc = subprocess.Popen(node_cmd)
    except FileNotFoundError:
        print("Node.js not found. Please install Node to run the player server.")
        sys.exit(1)

    time.sleep(1)
    webbrowser.open(f"http://localhost:{PORT}")
    print(f"Player running at http://localhost:{PORT} (Ctrl+C to stop)")

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        proc.wait()


if __name__ == "__main__":
    main()

