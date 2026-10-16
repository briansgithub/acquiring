"""Capture only new native JSON-flag regressions using frozen real Kotlin theory.
No TypeScript expectations, stubs, or modification of earlier parity fixtures.
"""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
CORE=runpy.run_path(str(OUT.parents[2]/'audio/synth/fixtures/generate-native.py'))
ROOT,CACHE=CORE['ROOT'],CORE['CACHE'];WORK=ROOT/'.artifacts/pwa-port/t03-flags-native'

def cases():
    rows=[]
    flags=['isRest','rest','useMaj7','dimTriad','halfDim','flattenHalfDimB5','retainHalfDimOmittedFifth']
    for flag in flags:
        for value in [True,False,'true','false','True','FALSE','tRuE','fAlSe',' true','false ','yes',1,0,None,{},[]]:
            chord=dict(root=5,type=7,inversion=1)
            if flag in ['dimTriad','halfDim']:chord.update(root=7,alterations=['b5'])
            if flag=='flattenHalfDimB5':chord.update(root=2,halfDim=True,alterations=['b5'])
            if flag=='retainHalfDimOmittedFifth':chord.update(root=6,applied=5,halfDim=True,omits=[5])
            chord[flag]=value
            rows.append(dict(label=flag+':'+json.dumps(value),flag=flag,value=value,chord=chord))
    return rows

DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
fun main(args:Array<String>) {
  for (el in Json.parseToJsonElement(File(args[0]).readText()).jsonArray) {
    val row=el.jsonObject;val chord=row.getValue("chord").jsonObject;val key=KeyInfo("C","major")
    val parsed=(row.getValue("value") as? JsonPrimitive)?.booleanOrNull
    val c=ChordInterpreter.interpret(chord,key)
    println(buildJsonObject {
      put("parsed",parsed);put("roman",c.roman);put("letter",c.letter)
      put("midi",JsonArray(c.midi.map(::JsonPrimitive)));put("rootMidi",c.rootMidi)
      put("toneLabels",JsonArray(c.toneLabels.map(::JsonPrimitive)))
      put("pcs",JsonArray(c.midi.map { ((it%12)+12)%12 }.distinct().sorted().map(::JsonPrimitive)))
      put("simpleRoot",ChordInterpreter.resolveChordRoot(chord,key)?.simpleModePitch?.toAudioNoteNumber())
    })
  }
}
'''

def main():
    WORK.mkdir(parents=True,exist_ok=True)
    names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter','ChordInterpreter','ChordLetterFormat','ChordVoicing']
    sources={name:CORE['source'](name) for name in names}
    for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8')
    (WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8');rows=cases()
    (WORK/'input.json').write_text(json.dumps(rows),encoding='utf-8')
    cached=CORE['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib');annotations=cached('org.jetbrains','annotations')
    runtime=[stdlib,annotations,cached('org.jetbrains.kotlinx','kotlinx-serialization-json-jvm'),cached('org.jetbrains.kotlinx','kotlinx-serialization-core-jvm')]
    compiler=[cached('org.jetbrains.kotlin',n) for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:raise RuntimeError('Existing Java/cached Kotlin and JSON runtime required')
    compiled=WORK/'classes'
    subprocess.run([java,'-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
        '-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),
        *[str(WORK/(n+'.kt')) for n in sources],str(WORK/'Driver.kt')],check=True,cwd=ROOT)
    output=subprocess.check_output([java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-cp',os.pathsep.join(map(str,[compiled,*runtime])),
        'com.acquiring.android.DriverKt',str(WORK/'input.json')],cwd=ROOT)
    (WORK/'native-stdout.jsonl').write_bytes(output)
    lines=output.decode('utf-8').splitlines()
    assert len(lines)==len(rows)
    for row,line in zip(rows,lines):row['expected']=json.loads(line)
    fixture={'authority':CORE['AUTHORITY'],'sourceSha256':{n:hashlib.sha256(s.encode()).hexdigest() for n,s in sources.items()},
        'adapter':'Unchanged real native theory/JSON primitive parser; JSON input/output only; no TypeScript.', 'cases':rows}
    p=OUT/'native-flags.json';p.write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f'Captured {len(rows)} native flag cases across7fields; {p.stat().st_size} bytes')
if __name__=='__main__':main()
