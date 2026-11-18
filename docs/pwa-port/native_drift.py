#!/usr/bin/env python3
"""Report Android work newer than the port's native authority. Run at the start of each slice.

Usage: python docs/pwa-port/native_drift.py [ref]   (default ref: main)
Exit 0 when there is no drift, 1 when Android commits exist after the pin.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True,
                          encoding='utf-8', check=True).stdout


def main():
    ref = sys.argv[1] if len(sys.argv) > 1 else 'main'
    pin = json.loads((HERE / 'tasks.json').read_text(encoding='utf-8-sig'))['currentNativeAuthority']
    log = git('log', '--no-merges', '--format=%h %ad %s', '--date=short', f'{pin}..{ref}', '--', 'android', 'contracts')
    dirty = git('status', '--short', '--', 'android', 'contracts')
    if not log.strip() and not dirty.strip():
        print(f'No Android drift: {ref} matches pin {pin[:8]}.')
        return 0
    changed = set(git('diff', '--name-only', pin, ref, '--', 'android', 'contracts').split())
    changed |= {line[3:] for line in dirty.splitlines()}
    rows = json.loads((HERE / 'feature-ledger.json').read_text(encoding='utf-8'))['rows']
    rows += json.loads((HERE / 'android-delta-2026-11.json').read_text(encoding='utf-8'))['features']
    print(f'Android commits after pin {pin[:8]} on {ref}:\n{log or "(none)"}')
    if dirty.strip():
        print(f'Uncommitted Android changes:\n{dirty}')
    for row in rows:
        native = row['native']['paths'] if isinstance(row['native'], dict) else row['native']
        hit = sorted(p for p in changed if any(p == n or p.startswith(n.rstrip('/') + '/') for n in native))
        if hit:
            print(f"  {row['id']}: {', '.join(Path(p).name for p in hit)}")
    print('Ledger the new commits in android-delta-*.json before porting affected rows.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
