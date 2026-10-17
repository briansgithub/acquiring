"""New native-only section preparation cases; existing accepted fixtures are never regenerated."""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
OLD=runpy.run_path(str(OUT.parents[2]/'audio/transport/fixtures/generate-timeline-native.py'))
CORE=OLD['CORE'];ROOT,CACHE=CORE['ROOT'],CORE['CACHE'];WORK=ROOT/'.artifacts/pwa-port/t12-section-native'

def cases():
    rows=[]
    def add(label,chords=None,notes=None,metadata=None):rows.append(dict(label=label,section=dict(chords=chords or [],notes=notes,metadata=metadata)))
    add('empty-fallback');add('metadata-only',metadata=dict(endBeat=9))
    add('metadata-not-authoritative',[dict(root=1,type=5,beat=1,duration=2)],metadata=dict(endBeat=99))
    add('melody1-extends-chords',[dict(root=1,type=5,beat=1)],dict(melody1=[dict(sd='3',beat=3,duration=2,octave=1)]))
    add('raw-array-and-defaults',notes=[None,1,[],{},dict(sd=None,beat=0,duration='2.5',octave='-1'),dict(sd=['bad'],beat='3',octave='1.0')])
    add('rests-case',[dict(root=1,type=5,beat=50,rest='True')],[dict(sd='1',beat=100,isRest='TRUE'),dict(sd='3',beat=2,rest=' true '),dict(sd='5',beat=4,rest=1)])
    add('zero-beat-negative-duration',[dict(root=1,type=5,beat=0,duration=2),dict(root=5,type=7,beat=10,duration=0)],[dict(sd='1',beat=-1,duration=1),dict(sd='3',beat=4,duration=-1)])
    add('invalid-melody-container',notes=dict(melody1={}),metadata=dict(endBeat=1))
    add('fractional-exclusive-end',[dict(root=4,type=5,beat=1.25,duration=.5)],notes=[dict(sd='1',beat=2.25,duration=.125)])
    for bpm in [0,1000,95.123456789,-2]:add('float-bpm-'+str(bpm),metadata=dict(tempos=[dict(bpm=bpm)]))
    add('invalid-first-tempo',metadata=dict(tempos=[None,dict(bpm=88)],endBeat=4))
    return rows

DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
fun main(args:Array<String>) {
  for(input in Json.parseToJsonElement(File(args[0]).readText()).jsonArray) {
    val s=input.jsonObject.getValue("section").jsonObject
    val section=ExtractedSection(chords=s.getValue("chords").jsonArray.map {it.jsonObject},notes=s["notes"],metadata=s["metadata"] as? JsonObject)
    val result=prepareNative(section)
    println(buildJsonObject {
      put("baseBpm",result.first.toDouble());put("endBeat",result.third)
      putJsonArray("melody"){for(n in result.second)add(buildJsonObject {
        put("sd",n.sd);put("beat",n.beat);put("duration",n.duration);put("octave",n.octave);put("isRest",n.isRest)
      })}
    })
  }
}
'''

def main():
    WORK.mkdir(parents=True,exist_ok=True)
    names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter','ChordInterpreter','ChordLetterFormat','ChordVoicing']
    source={n:CORE['source'](n) for n in names}
    view=CORE['source']('PlaybackView');timing=CORE['source']('PlaybackTiming')
    melody=view[view.index('    val notesJson = when'):view.index('    val sectionKeys = remember')]
    melody=melody.replace('remember(notesJson) {','run {')
    end=view[view.index('    val endBeat = remember(section, melody) {'):view.index('    val timeline = remember(section, melody, endBeat) {')]
    end=end.replace('remember(section, melody) {','run {')
    base=next(line for line in view.splitlines() if 'val baseBpm = section.getBpm()' in line)
    source['Timing']=timing
    source['Preparation']='package com.acquiring.android\nimport kotlinx.serialization.json.*\nfun prepareNative(section:ExtractedSection):Triple<Float,List<MelodyNote>,Double> {\n'+base+'\n'+melody+end+'\nreturn Triple(baseBpm,melody,endBeat)\n}\n'
    for n,s in source.items():(WORK/(n+'.kt')).write_text(s,encoding='utf-8')
    (WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8');rows=cases();(WORK/'input.json').write_text(json.dumps(rows),encoding='utf-8')
    cached=CORE['cached'];annotations=cached('org.jetbrains','annotations')
    runtime=[cached('org.jetbrains.kotlin','kotlin-stdlib'),annotations,cached('org.jetbrains.kotlinx','kotlinx-serialization-json-jvm'),cached('org.jetbrains.kotlinx','kotlinx-serialization-core-jvm')]
    compiler=[cached('org.jetbrains.kotlin',n) for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java');assert java,'Existing Java required';compiled=WORK/'classes'
    subprocess.run([java,'-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),*[str(WORK/(n+'.kt')) for n in source],str(WORK/'Driver.kt')],check=True,cwd=ROOT)
    lines=subprocess.check_output([java,'-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(WORK/'input.json')],cwd=ROOT).decode('utf-8').splitlines();assert len(lines)==len(rows)
    for row,line in zip(rows,lines):row['expected']=json.loads(line)
    fixture={'authority':CORE['AUTHORITY'],'sourceSha256':{n:hashlib.sha256(s.encode()).hexdigest() for n,s in source.items()},'adapter':'Frozen leaf code; Compose remember replaced only with run, independent Kotlin/JVM JSON adapter, no TypeScript.','cases':rows}
    p=OUT/'native-section.json';p.write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print('Captured',len(rows),'NEW native section preparation cases;',p.stat().st_size,'bytes')
if __name__=='__main__':main()
