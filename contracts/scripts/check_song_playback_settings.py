"""Source-derived contract check, not execution of Kotlin or Swift.

Extract the numeric bounds/defaults and enum names from pinned Android source.
Interpret those constraints against shared inputs and hand-authored expectations.
Fail closed if the sanitizer's expression form changes. Swift tests consume the
same expected rows; only their execution can establish Swift conformance.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
f = json.loads((ROOT / 'contracts/fixtures/song_playback_settings.json').read_text())
sources = {}
for path, digest in f['sourceSHA256'].items():
    raw = subprocess.check_output(['git', 'show', f"{f['authority']}:{path}"], cwd=ROOT)
    assert hashlib.sha256(raw).hexdigest() == digest, path
    sources[Path(path).name] = raw.decode()
sanitizer = sources['SongPlaybackSettings.kt']
constants = '\n'.join(sources.values())
def constant(name):
    return float(re.search(r'\b' + name + r'\s*=\s*([0-9.]+)f?\b', constants)[1])
def enum_names(file, start):
    body = sources[file].split(start, 1)[1].split('}', 1)[0]
    return set(re.findall(r'\b([A-Z][A-Z_]+)\s*(?:\(|,|;)', body))
instruments = enum_names('AudioEngine.kt', 'enum class Waveform')
cues = enum_names('PlaybackEngine.kt', 'enum class PlaybackRootDegreeCue')
# Numeric rules come from the source, not a second copy of Swift's constants.
rules = {}
for field in ['tempoPercent', 'melodyChordBalance', 'voiceVolume']:
    match = re.search(field + r' = row\.' + field + r'\.takeIf \{ it\.isFinite\(\) && it in (\d+)f\.\.(\d+)f }\s*\?: (\w+)', sanitizer)
    assert match, field
    rules[field] = (float(match[1]), float(match[2]), constant(match[3]))
transpose = re.search(r'PLAYBACK_TRANSPOSE_RANGE = (-?\d+)\.\.(-?\d+)', constants)
options = sources['PlaybackView.kt'].split('PLAYBACK_ARPEGGIO_OPTIONS = listOf(', 1)[1].split('\n)', 1)[0]
option_count = len(re.findall(r'PlaybackArpeggioOption\(', options))
assert option_count > 0
for case in f['sanitizerCases']:
    row = case['input'].copy()
    for field, (low, high, default) in rules.items():
        value = float(row[field])
        if not math.isfinite(value) or not low <= value <= high: row[field] = default
    if not 0 <= row['arpeggioOptionIndex'] < option_count: row['arpeggioOptionIndex'] = int(constant('DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX'))
    if not int(transpose[1]) <= row['transpose'] <= int(transpose[2]): row['transpose'] = 0
    if row['instrument'] not in instruments: row['instrument'] = None
    if row['rootDegreeCue'] not in cues: row['rootDegreeCue'] = 'OFF'
    assert row == case['expected'], (case['id'], row)
    assert json.loads(json.dumps(row)) == row
assert len({c['id'] for c in f['lifecycleCases']}) == 8
print(f"PASS: {len(f['sanitizerCases'])} source-derived sanitizer cases and JSON round trips; 6 pinned source hashes. Lifecycle cases are specifications, not portable runtime tests.")
