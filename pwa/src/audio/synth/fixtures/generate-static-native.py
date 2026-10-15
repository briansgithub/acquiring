"""Capture pure static PCM from frozen native methods; no TypeScript dependency.

Run at repo root under run-control. Uses the core generator's cached JVM tooling.
The extracted native method bodies are unchanged; SAMPLE_RATE is explicit in the
stub, and Math.random is replaced only for reproducible fixture excitation.
"""
from pathlib import Path
import base64
import hashlib
import json
import os
import runpy
import shutil
import subprocess

CORE = runpy.run_path(str(Path(__file__).with_name('generate-native.py')))
ROOT, OUT, CACHE = CORE['ROOT'], CORE['OUT'], CORE['CACHE']
WORK = ROOT / '.artifacts/pwa-port/t07-static-native'
cached, source = CORE['cached'], CORE['source']

def method(text, name):
    start = text.index('    internal fun ' + name + '(')
    body = text.index('{', text.index('):', start))
    # The two selected bodies contain no brace-bearing string literals.
    depth = 1
    end = body + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[start:end]

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    engine, voice = source('AudioEngine'), source('SynthVoice')
    count = method(engine, 'staticPlaybackSampleCount')
    render = method(engine, 'renderStaticSamples')
    enum = engine[engine.index('    enum class Waveform'):engine.index('    enum class PlaybackChannel')]
    (WORK / 'AudioEngine.kt').write_text('package com.acquiring.android\nobject AudioEngine {\n'
        + 'var SAMPLE_RATE = 48000\nconst val MAX_STATIC_PLAYBACK_MS = 30000\n' + enum + count + '\n' + render + '\n}\n')
    (WORK / 'SynthVoice.kt').write_text(voice.replace('Math.random()', 'NativeFixtureRandom.next()'))
    (WORK / 'Driver.kt').write_text(r'''package com.acquiring.android
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
object NativeFixtureRandom {
  private var state = 0x12345678L
  fun reset() { state = 0x12345678L }
  fun next(): Double {
    state = (1664525L * state + 1013904223L) and 0xffffffffL
    return state.toDouble() / 4294967296.0
  }
}
fun main() {
  var first = true
  println("[")
  for (waveform in AudioEngine.Waveform.entries) for (rate in listOf(8000, 48000)) {
    AudioEngine.SAMPLE_RATE = rate
    for (arp in listOf(false, true)) {
      NativeFixtureRandom.reset()
      val gain = if (arp) 0.37f else 1f
      val freqs = listOf(60,64,67).map { 440.0 * Math.pow(2.0, (it - 69) / 12.0) }
      val samples = AudioEngine.renderStaticSamples(freqs,24,arp,7,waveform,gain)!!
      val bytes = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
      samples.forEach { bytes.putShort(it) }
      if (!first) println(",")
      first = false
      val encoded = Base64.getEncoder().encodeToString(bytes.array())
      print("{\"waveform\":\"${waveform.name}\",\"sampleRate\":$rate,\"arpeggiate\":$arp,\"gain\":$gain,\"pcm16le\":\"$encoded\"}")
    }
  }
  println("]")
}
''')
    stdlib = cached('org.jetbrains.kotlin', 'kotlin-stdlib')
    annotations = cached('org.jetbrains', 'annotations')
    jars = [cached('org.jetbrains.kotlin', name) for name in [
        'kotlin-compiler-embeddable', 'kotlin-stdlib', 'kotlin-script-runtime', 'kotlin-daemon-embeddable']]
    jars += list((CACHE / 'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars += [cached('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'), annotations]
    java = shutil.which('java')
    if not java:
        raise RuntimeError('Java executable required')
    compiled = WORK / 'classes'
    subprocess.run([java, '-cp', os.pathsep.join(map(str,jars)), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
                    '-no-stdlib', '-no-reflect', '-classpath', os.pathsep.join(map(str,[stdlib,annotations])),
                    '-d', str(compiled), *map(str, [WORK / 'AudioEngine.kt', WORK / 'SynthVoice.kt', WORK / 'Driver.kt'])],
                   check=True, cwd=ROOT)
    output = subprocess.check_output([java, '-cp', os.pathsep.join(map(str,[compiled,stdlib])),
                                      'com.acquiring.android.DriverKt'], cwd=ROOT)
    cases = json.loads(output)
    for case in cases:
        data = base64.b64decode(case['pcm16le'])
        case['samples'] = len(data) // 2
        case['sha256'] = hashlib.sha256(data).hexdigest()
    fixture = {'authority': CORE['AUTHORITY'], 'methodsSha256': hashlib.sha256((count + render).encode()).hexdigest(),
               'durationMs': 24, 'stepMs': 7, 'midiNotes': [60,64,67], 'rng': 'same LCG as native-samples.json', 'cases': cases}
    (OUT / 'native-static.json').write_text(json.dumps(fixture, indent=2) + '\n', encoding='utf-8')
    print(f'Captured {len(cases)} native PCM cases / {sum(c["samples"] for c in cases)} samples')

if __name__ == '__main__':
    main()
