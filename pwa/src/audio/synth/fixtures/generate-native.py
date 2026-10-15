"""Reproduce native-only oscillator fixtures using already cached JVM tooling.

Run at repository root under run-control. No TS port is imported. Fixture-only
RNG injection leaves the production Android file unchanged. Requires cached
Kotlin compiler/stdlib plus its runtime dependencies; installs nothing.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess

AUTHORITY = '801cf7984171d772afc4406ddb5c79c0cb7fd20a'
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
WORK = ROOT / '.artifacts/pwa-port/t07-native-oracle'
CACHE = Path(os.environ.get('GRADLE_USER_HOME', str(Path.home() / '.gradle'))) / 'caches/modules-2/files-2.1'

def source(name):
    path = f'android/app/src/main/java/com/acquiring/android/{name}.kt'
    return subprocess.check_output(['git', 'show', f'{AUTHORITY}:{path}'], cwd=ROOT).decode('utf-8')

def cached(group, artifact):
    jars = sorted(p for p in (CACHE / group / artifact).glob('**/*.jar')
                  if not p.name.endswith(('-sources.jar', '-javadoc.jar')))
    if not jars:
        raise RuntimeError(f'Missing cached {group}:{artifact}; install tooling separately')
    return jars[-1]

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    voice = source('SynthVoice')
    engine = source('AudioEngine')
    enum = engine[engine.index('    enum class Waveform'):engine.index('    enum class PlaybackChannel')]
    (WORK / 'AudioEngine.kt').write_text('package com.acquiring.android\nobject AudioEngine {\n' + enum + '}\n')
    assert voice.count('Math.random()') == 1
    (WORK / 'SynthVoice.kt').write_text(voice.replace('Math.random()', 'NativeFixtureRandom.next()'))
    driver = r'''package com.acquiring.android
import kotlin.math.exp
object NativeFixtureRandom {
    private var state = 0x12345678L
    fun reset() { state = 0x12345678L }
    fun next(): Double {
        state = (1664525L * state + 1013904223L) and 0xffffffffL
        return state.toDouble() / 4294967296.0
    }
}
fun main() {
    val checkpoints = listOf(0, 1, 2, 17, 109, 997, 4095, 20000)
    var first = true
    print("[")
    for (waveform in AudioEngine.Waveform.entries) {
        for (frequency in listOf(440.0, 5000.0)) {
            for (arpeggiated in listOf(false, true)) {
                NativeFixtureRandom.reset()
                val voice = SynthVoice(frequency, waveform, 48000)
                val samples = mutableListOf<Double>()
                for (n in 0..checkpoints.last()) {
                    val sample = voice.nextSample(0.2 + 0.8 * exp(-n / 48000.0), n / 48000.0, arpeggiated)
                    if (n in checkpoints) samples.add(sample)
                }
                if (!first) print(",")
                first = false
                print("{\"waveform\":\"${waveform.name}\",\"frequencyHz\":$frequency,\"sampleRate\":48000,\"arpeggiated\":$arpeggiated,\"samples\":${samples}}")
            }
        }
    }
    println("]")
}
'''
    (WORK / 'Driver.kt').write_text(driver)
    stdlib = cached('org.jetbrains.kotlin', 'kotlin-stdlib')
    annotations = cached('org.jetbrains', 'annotations')
    jars = [cached('org.jetbrains.kotlin', name) for name in [
        'kotlin-compiler-embeddable', 'kotlin-stdlib', 'kotlin-script-runtime', 'kotlin-daemon-embeddable']]
    jars += list((CACHE / 'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars.append(cached('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'))
    jars.append(annotations)
    java = shutil.which('java')
    if not java:
        raise RuntimeError('Java executable is required')
    compiled = WORK / 'classes'
    subprocess.run([java, '-cp', os.pathsep.join(map(str, jars)), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
                    '-no-stdlib', '-no-reflect', '-classpath', os.pathsep.join(map(str, [stdlib, annotations])),
                    '-d', str(compiled), str(WORK / 'AudioEngine.kt'), str(WORK / 'SynthVoice.kt'),
                    str(WORK / 'Driver.kt')], check=True, cwd=ROOT)
    output = subprocess.check_output([java, '-cp', os.pathsep.join(map(str, [compiled, stdlib])),
                                      'com.acquiring.android.DriverKt'], cwd=ROOT)
    fixtures = {'authority': AUTHORITY, 'sourceSha256': hashlib.sha256(voice.encode()).hexdigest(),
                'rng': 'LCG uint32 seed0x12345678; a1664525; c1013904223; /2^32',
                'checkpoints': [0, 1, 2, 17, 109, 997, 4095, 20000], 'cases': json.loads(output)}
    (OUT / 'native-samples.json').write_text(json.dumps(fixtures, indent=2) + '\n', encoding='utf-8')
    print(f'Captured {len(fixtures["cases"])} cases from exact native source; sha256={fixtures["sourceSha256"]}')

if __name__ == '__main__':
    main()
