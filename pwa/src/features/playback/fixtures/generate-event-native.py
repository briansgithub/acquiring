"""Capture NEW event/card state from unchanged native pure source and real theory.
No TypeScript expectations; existing accepted fixtures are never regenerated.
"""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
CORE=runpy.run_path(str(OUT.parents[2]/'audio/synth/fixtures/generate-native.py'))
PIN=runpy.run_path(str(OUT.parents[2]/'domain/learning/fixtures/generate-random-native.py'))
ROOT=CORE['ROOT'];WORK=ROOT/'.artifacts/pwa-port/t12-event-native'
def cases():
    rows=[]
    def c(root=1,beat=1,duration=1,**kw):return dict(root=root,type=5,beat=beat,duration=duration,**kw)
    def n(sd='1',beat=1,duration=1,octave=0,rest=False):return dict(sd=sd,beat=beat,duration=duration,octave=octave,isRest=rest)
    def add(label,chords=None,melody=None,beats=None,metadata=None):
        chords=chords or []
        for i,chord in enumerate(chords):chord['_fixtureId']=i
        rows.append(dict(label=label,section=dict(chords=chords,metadata=metadata),melody=melody or [],beats=beats or [1,2,3,4]))
    add('empty',beats=[0,1,2])
    add('zero-normalized-exclusive-end',[c(beat=0,duration=2)],[n(beat=0,duration=2)],beats=[0,1,2.999,3])
    add('unsorted-overlap-falls-back',[c(5,3),c(1,1,8),c(4,2,0)],[n('5',3),n('1',1,8),n('4',2,0)],beats=[1,2.999,3,3.999,4,8.999,9])
    add('same-onset-source-order',[c(1,1,4),c(5,1),c(4,2,2)],[n('1',1,4),n('5',1),n('4',2,2)],beats=[1,1.999,2,3,4])
    add('rest-current-masks-overlap',[c(1,1,4),c(5,2,1,rest=True)],[n('1',1,4),n('5',2,1,rest=True)],beats=[1,2,2.999,3])
    add('previous-root-skips-rest-melody-barrier',[c(1,1),c(5,2,1,rest=True),c(6,3)],[n('1',1),n('5',2,rest=True),n('6',3)],beats=[1,2,3])
    add('zero-duration-invalid-previous',[c(1,1),c(2,2,0),c(3,3),c(9,4),c(5,5)],[n('1',1),n('2',2,0),n('3',3),n('bad',4),n('5',5)],beats=[2,3,4,5])
    add('unison-and-enharmonic-spelling',[c(1,1),c(1,2),c(2,3)],[n('1',1),n('1',2),n('#2',3),n('b3',4)],beats=[1,2,3,4])
    add('ascending-descending-register',[c(1,1),c(7,2),c(2,3)],[n('1',1),n('7',2,octave=-1),n('2',3,octave=1),n('1',4)],beats=[1,2,3,4])
    add('source-key-at-each-onset',[c(1,1,3),c(1,3),c(5,4)],[n('1',1),n('3',2),n('1',3),n('5',4)],metadata=dict(keys=[dict(tonic='C',scale='major',beat=1),dict(tonic='D',scale='minor',beat=3),dict(tonic='F#',scale='major',beat=4)]))
    add('borrowed-applied-written-root',[c(2,1,borrowed='minor'),c(6,2,borrowed='minor',applied=5),c(5,3,applied=5,substitutions=['tri']),c(0,4,_letterRootName='A#')],[n('b3',1),n('#4',2),n('bb7',3),n('1',4)],metadata=dict(keys=[dict(tonic='Bb',scale='minor',beat=1)]))
    add('negative-onsets-and-durations',[c(1,-1,3),c(5,0),c(4,2,-1)],[n('1',-1,3),n('5',0),n('4',2,-1)],beats=[-1,0,.5,1,2])
    add('primitive-nan-infinite-event-order',[c(1,beat=[],duration={}),c(2,beat='NaN'),c(3,beat='2',duration='NaN'),c(4,beat='3e0',duration='Infinity'),c(5,beat='4',duration='1.25')],beats=[1,2,3,4,5.25,9])
    add('primitive-rest-case-and-invalid-key',[c(1,1),c(2,2,rest='True'),c(3,3,rest=' true '),c(4,4,isRest='FALSE')],[n('1',1),n('2',2,rest=True),n('3',3),n('4',4)],metadata=dict(keys=[None,dict(tonic='Cb',scale='major',beat=1)]))
    return rows
DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
private fun pitch(p:SpelledPitch?):JsonElement=if(p==null)JsonNull else buildJsonObject {put("name",p.displayName);put("midi",p.toAudioNoteNumber())}
private fun interval(i:NamedInterval?):JsonElement=if(i==null)JsonNull else buildJsonObject {put("number",i.number);put("quality",i.quality);put("direction",i.direction.name);put("spokenName",i.spokenName)}
private fun key(k:KeyInfo?):JsonElement=if(k==null)JsonNull else buildJsonObject {put("tonic",k.tonic);put("scale",k.scale)}
private fun note(n:MelodyNote?):JsonElement=if(n==null)JsonNull else buildJsonObject {put("sd",n.sd);put("beat",n.beat);put("duration",n.duration);put("octave",n.octave);put("isRest",n.isRest)}
fun main(args:Array<String>){
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 for(row in Json.parseToJsonElement(File(args[0]).readText()).jsonArray){
  val data=row.jsonObject;val s=data.getValue("section").jsonObject
  val section=ExtractedSection(chords=s.getValue("chords").jsonArray.map{it.jsonObject},metadata=s["metadata"] as? JsonObject)
  val melody=data.getValue("melody").jsonArray.map{v->val n=v.jsonObject;MelodyNote(n.getValue("sd").jsonPrimitive.content,n.getValue("beat").jsonPrimitive.double,n.getValue("duration").jsonPrimitive.double,n.getValue("octave").jsonPrimitive.int,n.getValue("isRest").jsonPrimitive.boolean)}
  val index=PlaybackActiveEventIndex(section,melody)
  println(buildJsonArray {for(b in data.getValue("beats").jsonArray){val beat=b.jsonPrimitive.double;val root=resolveChordRootIntervalState(section,beat);val mi=resolveMelodyIntervalState(melody,beat,section::getKeyAtBeat);val currentNote=index.melodyNoteAtBeat(beat)
   val currentPitch=currentNote?.takeUnless{it.isRest}?.let{MusicTheory.resolveScaleDegreePitch(it.sd,it.octave,section.getKeyAtBeat(it.beat))}
   val mode=melodyPitchCardDisplayMode(currentPitch,mi)
   add(buildJsonObject {
    put("chordIndex",index.chordAtBeat(beat)?.get("_fixtureId")?:JsonNull);put("melodyNote",note(currentNote))
    put("root",if(root==null)JsonNull else buildJsonObject {put("previous",pitch(root.previous?.pitch));put("current",pitch(root.current.pitch));put("previousIntervalPitch",pitch(root.previousIntervalPitch));put("currentIntervalPitch",pitch(root.currentIntervalPitch));put("previousKey",key(root.previous?.sourceKey));put("currentKey",key(root.current.sourceKey));put("interval",interval(root.interval));put("previousDegreeLabel",root.previousDegreeLabel?.let{JsonPrimitive(it)}?:JsonNull);put("currentDegreeLabel",root.currentDegreeLabel);put("showPrevious",showsRootOnlyPrevious(root.previousIntervalPitch));put("showInterval",showsRootOnlyInterval(root.previousIntervalPitch,root.currentIntervalPitch,root.interval))})
    put("melody",if(mi==null)JsonNull else buildJsonObject {put("previous",pitch(mi.previous));put("current",pitch(mi.current));put("interval",interval(mi.interval));put("previousDegreeLabel",mi.previousDegreeLabel);put("currentDegreeLabel",mi.currentDegreeLabel);put("contentDescription",mi.contentDescription)})
    put("melodyMode",mode.name);put("currentVertical",melodyCurrentCardVerticalPosition(mode).name)
    put("cards",buildJsonArray {if(mi!=null)for(c in buildMelodyPitchCards(mi))add(buildJsonObject {put("role",c.role.name);put("pitch",pitch(c.pitch));put("scaleDegreeLabel",c.scaleDegreeLabel);put("verticalPosition",c.verticalPosition.name)})})
   })
  }})
 }
}
'''
def main():
    WORK.mkdir(parents=True,exist_ok=True)
    names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter','ChordInterpreter','ChordLetterFormat','ChordVoicing','PlaybackTiming','PlaybackIntervalState']
    source={name:CORE['source'](name) for name in names};root=CORE['source']('PlaybackRootOnlyRow')
    source['RootConditions']='package com.acquiring.android\n'+root[root.index('internal fun showsRootOnlyPrevious'):root.index('@OptIn')]
    for name,value in source.items():(WORK/(name+'.kt')).write_text(value,encoding='utf-8')
    (WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8');rows=cases();assert len(rows)<=16
    (WORK/'input.json').write_text(json.dumps(rows),encoding='utf-8')
    cached=PIN['cached'];annotations=cached('org.jetbrains','annotations')
    runtime=[cached('org.jetbrains.kotlin','kotlin-stdlib','2.2.10'),annotations,cached('org.jetbrains.kotlinx','kotlinx-serialization-json-jvm'),cached('org.jetbrains.kotlinx','kotlinx-serialization-core-jvm')]
    compiler=[cached('org.jetbrains.kotlin',name,'2.2.10') for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    compiler+=[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    prefix=[shutil.which('java'),'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8'];assert prefix[0],'Existing Java required'
    command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
    version=subprocess.run(command+['-version'],check=True,capture_output=True).stderr.decode('utf-8');assert 'kotlinc-jvm 2.2.10 ' in version
    classes=WORK/'classes'
    subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(classes),*[str(WORK/(name+'.kt')) for name in source],str(WORK/'Driver.kt')],check=True,cwd=ROOT)
    lines=subprocess.check_output(prefix+['-cp',os.pathsep.join(map(str,[classes,*runtime])),'com.acquiring.android.DriverKt',str(WORK/'input.json')],cwd=ROOT).decode('utf-8').splitlines();assert len(lines)==len(rows)
    for row,line in zip(rows,lines):row['expected']=json.loads(line)
    fixture={'authority':CORE['AUTHORITY'],'kotlinVersion':'2.2.10','sourceSha256':{name:hashlib.sha256(value.encode()).hexdigest() for name,value in source.items()},'driverSha256':hashlib.sha256(DRIVER.encode()).hexdigest(),'producerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'jarSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in dict.fromkeys([*runtime,*compiler])},'adapter':'Unchanged native pure functions/classes and real native theory; root-only condition leafs extracted unchanged. No TypeScript expectations.','cases':rows}
    path=OUT/'native-event.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print('Captured',len(rows),'NEW native cases;',sum(len(row['beats']) for row in rows),'queries;',path.stat().st_size,'bytes')
if __name__=='__main__':main()
