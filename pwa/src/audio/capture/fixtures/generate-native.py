"""Capture frozen pure pitch outputs using cached Kotlin tooling; no TS imports.

Run at Git root under run-control. Synth tooling supplies only source/cache lookup.
Detector/smoother files are copied unchanged. The tracker stub extracts only its
result values and pure signal-gate method; no microphone/coroutine owner compiles.
"""
from pathlib import Path
import base64
import hashlib
import json
import os
import runpy
import shutil
import subprocess

OUT = Path(__file__).resolve().parent
CORE = runpy.run_path(str(OUT.parents[1] / 'synth/fixtures/generate-native.py'))
ROOT, CACHE = CORE['ROOT'], CORE['CACHE']
WORK = ROOT / '.artifacts/pwa-port/t09-pitch-native'
cached, source = CORE['cached'], CORE['source']

def extract(text, marker):
    start = text.index(marker)
    brace = text.index('{', start)
    depth, end = 1, brace + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[start:end]

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    detector, smoother, tracker = source('PitchDetector'), source('PitchSmoother'), source('MicrophonePitchTracker')
    result = extract(tracker, '    sealed class PitchResult')
    gate = extract(tracker, '    private fun processEstimate(')
    (WORK/'PitchDetector.kt').write_text(detector)
    (WORK/'PitchSmoother.kt').write_text(smoother)
    (WORK/'TrackerStub.kt').write_text('package com.acquiring.android\nimport kotlin.math.log2\nclass MicrophonePitchTracker {\n'
        + result + '\n' + gate + '\nfun mapped(e:PitchDetector.PitchEstimate):PitchResult { var r:PitchResult=PitchResult.NoSignal; processEstimate(e,60){r=it}; return r }\n}\n')
    (WORK/'Driver.kt').write_text(r'''package com.acquiring.android
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import kotlin.math.abs
import kotlin.math.sin
fun estimateJson(e: MicrophonePitchTracker.PitchResult.Estimate?): String = if(e == null) "null" else
  "{\"midi\":${e.midi},\"centsError\":${e.centsError},\"confidence\":${e.confidence},\"isHeld\":${e.isHeld}}"
fun sine(freq:Double,rate:Int,length:Int,amplitude:Double=32767.0,phase:Double=0.0) = ShortArray(length) { i ->
  (sin(2.0*Math.PI*freq*i/rate+phase)*amplitude).toInt().toShort() }
fun harmonic(freq:Double,rate:Int,length:Int,partials:Int,phase:Double=1.1): ShortArray {
  val raw = DoubleArray(length) { i ->
    var value=0.0
    for(k in 1..partials) {
      if(k*freq >= rate/2.0) break
      value += (1.0/k)*sin(2.0*Math.PI*k*freq*i/rate+phase*k*0.7)
    }
    value
  }
  val peak=raw.maxOf{abs(it)}
  return ShortArray(length) { i -> (raw[i]/peak*26000).toInt().toShort() }
}
fun main() {
  val tracker=MicrophonePitchTracker()
  var first=true
  print("{\"detector\":[")
  fun capture(label:String,pcm:ShortArray,rate:Int=16000,threshold:Double=0.15,min:Double=65.0,max:Double=1000.0) {
    val e=PitchDetector.estimatePitch(pcm,rate,threshold,min,max)
    val bytes=ByteBuffer.allocate(pcm.size*2).order(ByteOrder.LITTLE_ENDIAN)
    pcm.forEach{bytes.putShort(it)}
    if(!first) print(",")
    first=false
    val encoded=Base64.getEncoder().encodeToString(bytes.array())
    val signal=tracker.mapped(e) is MicrophonePitchTracker.PitchResult.Estimate
    print("{\"label\":\"$label\",\"sampleRate\":$rate,\"threshold\":$threshold,\"minFreq\":$min,\"maxFreq\":$max,\"frequencyHz\":${e.frequencyHz},\"confidence\":${e.confidence},\"rms\":${e.rms},\"signal\":$signal,\"pcm16le\":\"$encoded\"}")
  }
  for(freq in listOf(82.41,220.0,440.0,587.33,950.0)) for(length in listOf(1024,2048)) capture("sine-$freq-$length",sine(freq,16000,length))
  for(freq in listOf(82.41,110.0,440.0,587.33)) for(partials in listOf(4,8)) for(length in listOf(1024,2048))
    capture("harmonic-$freq-$partials-$length",harmonic(freq,16000,length,partials))
  for(amplitude in listOf(0.0,8.0,16.0,24.0,100.0,1000.0,32767.0)) capture("amplitude-$amplitude",sine(440.0,16000,2048,amplitude))
  val random=java.util.Random(20240811L)
  repeat(20) { index -> capture("gaussian-$index",ShortArray(2048){(random.nextGaussian()*3000).toInt().toShort()}) }
  for(value in listOf(0,1000,-32768)) capture("dc-$value",ShortArray(2048){value.toShort()})
  capture("odd-frame",sine(440.0,16000,2049,phase=2.4))
  capture("global-minimum",sine(440.0,16000,2048),threshold=0.0)
  capture("post-interpolation-range",sine(440.0,16000,2048),min=440.0,max=440.0)
  capture("expanded-low",sine(55.0,16000,2048),min=40.0,max=110.0)
  capture("expanded-high",sine(1500.0,16000,2048),max=2000.0)
  capture("rate44100",harmonic(110.0,44100,4096,8),rate=44100)
  print("],\"gates\":[")
  first=true
  for(freq in listOf(0.0,440.0)) for(confidence in listOf(0.399999,0.4,0.400001)) for(rms in listOf(0.000499,0.0005,0.000501)) {
    val e=PitchDetector.PitchEstimate(freq,confidence,rms)
    val signal=tracker.mapped(e) is MicrophonePitchTracker.PitchResult.Estimate
    if(!first) print(",")
    first=false
    print("{\"frequencyHz\":$freq,\"confidence\":$confidence,\"rms\":$rms,\"signal\":$signal}")
  }
  print("],\"smoother\":[")
  first=true
  for(mode in PitchTrackingMode.entries) {
    val smooth=PitchSmoother(60,mode)
    if(!first) print(",")
    first=false
    print("{\"mode\":\"${mode.name}\",\"operations\":[")
    var firstOp=true
    fun record(action:String,midi:Double=60.0,confidence:Double=0.9) {
      val result=when(action) {
        "accept" -> smooth.accept(midi,confidence)
        "setTarget" -> smooth.setTarget(midi.toInt())
        "retarget" -> {smooth.retarget(midi.toInt());null}
        "targetProperty" -> {smooth.targetMidi=midi.toInt();null}
        else -> {smooth.reset();null}
      }
      if(!firstOp) print(",")
      firstOp=false
      print("{\"action\":\"$action\",\"midi\":$midi,\"confidence\":$confidence,\"targetMidi\":${smooth.targetMidi},\"result\":${estimateJson(result)}}")
    }
    for(confidence in listOf(0.9,0.8,0.7,0.6,0.5,0.42)) record("accept",60.0,confidence)
    record("accept",63.0);record("accept");record("accept",72.0);record("accept")
    record("setTarget",72.0);record("accept")
    repeat(8){record("accept",72.0)}
    record("setTarget",64.0);record("reset");record("setTarget",67.0)
    repeat(4){record("accept",67.0)}
    record("retarget",69.0);repeat(4){record("accept",69.0)}
    record("targetProperty",70.0);record("accept",69.0)
    print("]}")
  }
  print("]}")
}
''')
    stdlib, annotations=cached('org.jetbrains.kotlin','kotlin-stdlib'),cached('org.jetbrains','annotations')
    jars=[cached('org.jetbrains.kotlin',name) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    jars+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars+=[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:
        raise RuntimeError('Java executable required')
    compiled=WORK/'classes'
    subprocess.run([java,'-cp',os.pathsep.join(map(str,jars)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
                    '-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,[stdlib,annotations])),
                    '-d',str(compiled),*map(str,[WORK/'PitchDetector.kt',WORK/'PitchSmoother.kt',WORK/'TrackerStub.kt',WORK/'Driver.kt'])],check=True,cwd=ROOT)
    output=subprocess.check_output([java,'-cp',os.pathsep.join(map(str,[compiled,stdlib])),'com.acquiring.android.DriverKt'],cwd=ROOT)
    fixture=json.loads(output)
    for case in fixture['detector']:
        case['sha256']=hashlib.sha256(base64.b64decode(case['pcm16le'])).hexdigest()
    fixture={'authority':CORE['AUTHORITY'],'detectorSha256':hashlib.sha256(detector.encode()).hexdigest(),
             'smootherSha256':hashlib.sha256(smoother.encode()).hexdigest(),
             'gateSha256':hashlib.sha256(gate.encode()).hexdigest(),**fixture}
    (OUT/'native-pitch.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
    print(f'Captured {len(fixture["detector"])}native PCM cases/{len(fixture["gates"])}gate edges/{sum(len(x["operations"]) for x in fixture["smoother"])}smoother operations')

if __name__=='__main__':
    main()
