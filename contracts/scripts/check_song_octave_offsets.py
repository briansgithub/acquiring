"""Check pinned Android bounds and shared octave cases; does not execute Swift."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parents[2]
fixture = json.loads((root / 'contracts/fixtures/song_octave_offsets.json').read_text())
source = ''
for path, expected in fixture['sourceSHA256'].items():
    raw = subprocess.check_output(['git', 'show', fixture['authority'] + ':' + path], cwd=root)
    assert hashlib.sha256(raw).hexdigest() == expected, path
    if path.endswith('/SingingTargets.kt'):
        source = raw.decode()
low = int(re.search(r'OCTAVE_OFFSET_MIN\s*=\s*(-?\d+)', source)[1])
high = int(re.search(r'OCTAVE_OFFSET_MAX\s*=\s*(-?\d+)', source)[1])
assert re.search(r'fun clampSingingOctaveOffset\(offset: Int\): Int\s*=\s*offset.coerceIn\(OCTAVE_OFFSET_MIN, OCTAVE_OFFSET_MAX\)', source)
for case in fixture['cases']:
    assert case['expected'] == min(high, max(low, case['input'])), case
print(f"PASS: {len(fixture['cases'])} source-derived clamp cases and three native hashes. Swift/storage tests unrun.")
