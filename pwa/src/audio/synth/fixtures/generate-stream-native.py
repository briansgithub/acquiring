"""Frozen native renderer-only fixture capture. No TS port is imported.

The exact pure segment is extracted before PlaybackAudioSink. Its default rate
reference is satisfied by a stub; every fixture supplies an explicit rate.
Only SynthVoice Math.random() receives fixture-only seeded injection.
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
WORK = ROOT / '.artifacts/pwa-port/t07-stream-native'
cached, source = CORE['cached'], CORE['source']

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    engine, voice, playback = source('AudioEngine'), source('SynthVoice'), source('PlaybackEngine')
    pure = playback[playback.index('internal enum class PlaybackAudioLayer'):playback.index('internal interface PlaybackAudioSink')]
    enum = engine[engine.index('    enum class Waveform'):engine.index('    enum class PlaybackChannel')]
    (WORK / 'AudioEngine.kt').write_text('package com.acquiring.android\nobject AudioEngine {\n' + enum + '}\nobject AppAudioOutput { val sampleRate = 48000 }\n')
    (WORK / 'PlaybackCore.kt').write_text('package com.acquiring.android\nimport kotlin.math.floor\nimport kotlin.math.roundToInt\n' + pure)
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
  var firstCase = true
  print("[")
  for (waveform in AudioEngine.Waveform.entries) for (rate in listOf(1000, 48000)) {
    NativeFixtureRandom.reset()
    var config = PlaybackConfig(600.0,0,waveform,PlaybackChordMode.FULL,0.37f,0.61f,0.5)
    val timeline = PlaybackTimeline(endBeat=1.25, events=listOf(
      PlaybackTimelineEvent(1,1.0,1.24,PlaybackAudioLayer.CHORD,intArrayOf(48,52,55),36),
      PlaybackTimelineEvent(2,1.03,1.125,PlaybackAudioLayer.MELODY,intArrayOf(60)),
      PlaybackTimelineEvent(3,1.15,1.22,PlaybackAudioLayer.MELODY,intArrayOf(0,-1,64))))
    val renderer = PlaybackPcmRenderer(timeline,config,rate)
    if (!firstCase) print(",")
    firstCase = false
    print("{\"waveform\":\"${waveform.name}\",\"sampleRate\":$rate,\"blocks\":[")
    var firstBlock = true
    fun capture(action: String, frames: Int) {
      val samples = ShortArray(frames)
      val block = renderer.renderInto(samples)
      val bytes = ByteBuffer.allocate(frames*2).order(ByteOrder.LITTLE_ENDIAN)
      samples.forEach { bytes.putShort(it) }
      val encoded = Base64.getEncoder().encodeToString(bytes.array())
      val starts = block.startedEvents.joinToString(",") { "[${it.id},${it.frameOffset}]" }
      if (!firstBlock) print(",")
      firstBlock = false
      print("{\"action\":\"$action\",\"frames\":$frames,\"startBeat\":${block.startBeat},\"beatsPerFrame\":${block.beatsPerFrame},\"startedEvents\":[$starts],\"currentBeat\":${renderer.currentBeat},\"finished\":${renderer.finished},\"pcm16le\":\"$encoded\"}")
    }
    capture("initial",127)
    capture("continue",256)
    config = config.copy(bpm=300.0,melodyGain=0.25f,chordGain=0.125f)
    renderer.updateConfig(config)
    capture("gain_tempo_zero",0)
    capture("gain_tempo",257)
    renderer.seek(1.10)
    capture("seek",127)
    val alternate = if(waveform == AudioEngine.Waveform.SINE) AudioEngine.Waveform.SAWTOOTH else AudioEngine.Waveform.SINE
    config = config.copy(waveform=alternate,transpose=12,chordMode=PlaybackChordMode.ROOT_ONLY,arpeggiateCycles=2.0)
    renderer.updateConfig(config)
    capture("pitch_mode_wave",511)
    config = config.copy(bpm=0.0,melodyGain=0f,chordGain=0f,arpeggiateCycles=4.0)
    renderer.updateConfig(config)
    capture("freeze_mute",64)
    config = config.copy(bpm=600.0,waveform=waveform,transpose=0,chordMode=PlaybackChordMode.FULL,melodyGain=1f,chordGain=0.5f,arpeggiateCycles=0.0)
    renderer.updateConfig(config)
    renderer.replaceTimeline(PlaybackTimeline(startBeat=0.0,endBeat=0.05,completionKey="once",events=listOf(
      PlaybackTimelineEvent(8,0.0,0.05,PlaybackAudioLayer.CHORD,intArrayOf(60,64,67),48),
      PlaybackTimelineEvent(9,0.01,0.04,PlaybackAudioLayer.MELODY,intArrayOf(55)))))
    capture("replace_once",401)
    capture("completed",23)
    print("]}")
  }
  print("]")
}
''')
    stdlib, annotations = cached('org.jetbrains.kotlin','kotlin-stdlib'), cached('org.jetbrains','annotations')
    jars = [cached('org.jetbrains.kotlin',name) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    jars += list((CACHE / 'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars += [cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'), annotations]
    java = shutil.which('java')
    if not java:
        raise RuntimeError('Java executable required')
    compiled = WORK / 'classes'
    subprocess.run([java,'-cp',os.pathsep.join(map(str,jars)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
                    '-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,[stdlib,annotations])),
                    '-d',str(compiled),*map(str,[WORK/'AudioEngine.kt',WORK/'PlaybackCore.kt',WORK/'SynthVoice.kt',WORK/'Driver.kt'])],check=True,cwd=ROOT)
    output = subprocess.check_output([java,'-cp',os.pathsep.join(map(str,[compiled,stdlib])),'com.acquiring.android.DriverKt'],cwd=ROOT)
    cases = json.loads(output)
    for case in cases:
        for block in case['blocks']:
            block['sha256'] = hashlib.sha256(base64.b64decode(block['pcm16le'])).hexdigest()
    fixture = {'authority':CORE['AUTHORITY'],'pureSegmentSha256':hashlib.sha256(pure.encode()).hexdigest(),
               'synthSha256':hashlib.sha256(voice.encode()).hexdigest(),'rng':'same LCG as native-samples.json','cases':cases}
    (OUT/'native-stream.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
    print(f'Captured {len(cases)} native streaming scenarios/{sum(len(c["blocks"]) for c in cases)}blocks')

if __name__ == '__main__':
    main()
