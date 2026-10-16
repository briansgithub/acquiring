"""Capture timeline expectations from unchanged frozen Kotlin and real theory/models.

No TypeScript import, theory stub, output regeneration from the port, or Android build.
Uses the existing cached Kotlin compiler and serialization JSON runtime; all compiler
products/input staging are ignored. The portable regression fixture belongs in Git.
"""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
CORE=runpy.run_path(str(OUT.parents[1]/'synth/fixtures/generate-native.py'))
ROOT,CACHE=CORE['ROOT'],CORE['CACHE']
WORK=ROOT/'.artifacts/pwa-port/t08-timeline-native'

def cases():
    rows=[]
    def add(label,chords=None,melody=None,metadata=None,end=5):
        rows.append(dict(label=label,section=dict(chords=chords or [],metadata=metadata),melody=melody or [],endBeat=end))
    def note(sd='1',beat=1,duration=1,octave=0,rest=False):
        return dict(sd=sd,beat=beat,duration=duration,octave=octave,isRest=rest)
    add('empty')
    for key in ['C','G','F','D','Bb','A','Eb','E','Ab','B','Db','Gb','Cb','B#']:
        add('key-'+key,[dict(root=1,type=5,inversion=1,beat=1,duration=2),
            dict(root=6,applied=5,type=7,inversion=1,beat=2,duration=2)],
            [note('1'),note('#4',2,2,1)],dict(keys=[dict(tonic=key,scale='major',beat=1)]))
    add('clip-sort-and-consumed-ids',[
        dict(root=5,type=7,beat=2,duration=8),dict(root=1,type=5,beat=8),dict(root=2,type=5,beat=-1,duration=3),
        dict(root=4,type=5,beat=1,duration=1)],
        [note('3',2),note('1',9),note('5',-1,3),note('2',1)])
    add('rests-invalid-and-defaults',[
        dict(root=1,type=5,isRest=True),dict(root=2,type=5,rest='true'),dict(root=3,type=5,duration=0),
        dict(root=4,type=5,duration=-1),dict(root=5,type=5,beat=[],duration={}),dict(root=1,type=5),
        dict(root=2,type=5,isRest='True'),dict(root=0),{}],
        [note(rest=True),note(duration=0),note(duration=-1),note(octave=-10),note('0')])
    add('primitive-beats-durations',[
        dict(root=1,type=5,beat='0',duration='2.5'),dict(root=2,type=5,beat='3e0',duration='1.25'),
        dict(root=3,type=5,beat=True,duration=None),dict(root=4,type=5,beat='NaN',duration=1),
        dict(root=5,type=5,beat=1,duration='NaN'),dict(root=6,type=5,beat=1,duration='Infinity')])
    add('key-change-original-melody-normalized-chord',[
        dict(root=1,type=5,beat=0),dict(root=1,type=5,beat=2),dict(root=5,type=7,beat=3)],
        [note('1',0,2),note('1',2),note('1',3)],dict(keys=[dict(tonic='F',scale='minor',beat=3),
        dict(tonic='C',scale='major',beat=0),dict(tonic='D',scale='major',beat=1),dict(tonic='G',scale='major',beat=2)]))
    add('duplicate-and-invalid-key-entries',[dict(root=5,type=7)], [note('7')],
        dict(keys=[None,3,dict(tonic='C',scale='minor',beat=1),dict(tonic='F#',scale='major',beat=1)]))
    add('borrowed-and-register',[
        dict(root=2,type=5,inversion=2,borrowed=[1,3,4,6,8,9,11],beat=1),
        dict(root=6,applied=5,borrowed='minor',type=7,beat=2),dict(root=5,applied=5,substitutions=['tri'],type=7,beat=3)],
        [note('8'),note('bb7',2,1,-1)],dict(keys=[dict(tonic='Ab',scale='major')]))
    add('fractional-end-and-boundary',[dict(root=1,type=5,beat=1.25,duration=.5),dict(root=5,type=7,beat=2.5)],
        [note('1',1,.25),note('2',1.25,.5),note('3',1.5,.25)],end=1.5)
    return rows

DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
fun main(args:Array<String>) {
  val inputs=Json.parseToJsonElement(File(args[0]).readText()).jsonArray
  for (input in inputs) {
    val row=input.jsonObject;val s=row.getValue("section").jsonObject
    val section=ExtractedSection(chords=s.getValue("chords").jsonArray.map {it.jsonObject},metadata=s["metadata"] as? JsonObject)
    val melody=row.getValue("melody").jsonArray.map {el->val n=el.jsonObject
      MelodyNote(n.getValue("sd").jsonPrimitive.content,n.getValue("beat").jsonPrimitive.double,
        n.getValue("duration").jsonPrimitive.double,n.getValue("octave").jsonPrimitive.int,n.getValue("isRest").jsonPrimitive.boolean)}
    val timeline=buildPlaybackTimeline(section,melody,row.getValue("endBeat").jsonPrimitive.double)
    println(buildJsonObject {
      put("startBeat",timeline.startBeat);put("endBeat",timeline.endBeat);put("completionKey",timeline.completionKey)
      putJsonArray("events") {for(e in timeline.events) add(buildJsonObject {
        put("id",e.id);put("startBeat",e.startBeat);put("endBeat",e.endBeat);put("layer",e.layer.name)
        put("fullMidiNotes",JsonArray(e.fullMidiNotes.map(::JsonPrimitive)));put("rootMidiNote",e.rootMidiNote)
      })}
    })
  }
}
'''

def main():
    WORK.mkdir(parents=True,exist_ok=True)
    names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter',
        'ChordInterpreter','ChordLetterFormat','ChordVoicing']
    source={name:CORE['source'](name) for name in names}
    playback=CORE['source']('PlaybackEngine');timing=CORE['source']('PlaybackTiming')
    models=playback[playback.index('internal enum class PlaybackAudioLayer'):playback.index('internal data class PlaybackConfig')]
    builder=playback[playback.index('internal fun buildPlaybackTimeline'):]
    normalization=timing[timing.index('internal fun normalizePlaybackBeat'):timing.index('internal fun playbackEventEndBeat')]
    source['Timeline']='package com.acquiring.android\nimport kotlinx.serialization.json.*\nprivate const val FIRST_PLAYBACK_BEAT=1.0\n'+models+normalization+builder
    for name,text in source.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8')
    (WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8')
    rows=cases();(WORK/'input.json').write_text(json.dumps(rows,ensure_ascii=False),encoding='utf-8')
    cached=CORE['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib');annotations=cached('org.jetbrains','annotations')
    runtime=[stdlib,annotations,cached('org.jetbrains.kotlinx','kotlinx-serialization-json-jvm'),cached('org.jetbrains.kotlinx','kotlinx-serialization-core-jvm')]
    compiler=[cached('org.jetbrains.kotlin',n) for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:raise RuntimeError('Existing Java and cached Kotlin compiler/runtime required')
    compiled=WORK/'classes'
    subprocess.run([java,'-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
        '-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),
        *[str(WORK/(name+'.kt')) for name in source],str(WORK/'Driver.kt')],check=True,cwd=ROOT)
    lines=subprocess.check_output([java,'-cp',os.pathsep.join(map(str,[compiled,*runtime])),
        'com.acquiring.android.DriverKt',str(WORK/'input.json')],cwd=ROOT).decode('utf-8').splitlines()
    assert len(lines)==len(rows)
    for row,line in zip(rows,lines):row['expected']=json.loads(line)
    fixture={'authority':CORE['AUTHORITY'],'builderSha256':hashlib.sha256(builder.encode()).hexdigest(),
        'dependencySha256':{n:hashlib.sha256(v.encode()).hexdigest() for n,v in source.items()},
        'adapter':'Unchanged frozen builder, timing normalization and real native theory/models; JSON-only input/output adapter; no TypeScript.',
        'cases':rows}
    p=OUT/'native-timeline.json';p.write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f'Captured {len(rows)} native timelines/{sum(len(r["expected"]["events"]) for r in rows)} events; {p.stat().st_size} bytes')
if __name__=='__main__':main()
