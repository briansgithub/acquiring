"""Capture new ranking expectations using unchanged frozen Kotlin and real theory/models."""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
CORE=runpy.run_path(str(OUT.parents[2]/'audio/synth/fixtures/generate-native.py'))
ROOT,CACHE=CORE['ROOT'],CORE['CACHE'];WORK=ROOT/'.artifacts/pwa-port/t11-transitions-native'
def cases():
    rows=[]
    def chord(root,beat=1,**extra):return dict(root=root,beat=beat,type=5,**extra)
    def add(label,chords,metadata=None):
        for root_only in [False,True]:rows.append(dict(label=label,rootOnly=root_only,section=dict(chords=chords,metadata=metadata)))
    add('empty',[]);add('single',[chord(1)]);add('self-only',[chord(1),chord(1),chord(1)])
    add('repeated-counts',[chord(1,1),chord(5,2),chord(1,3),chord(5,4),chord(4,5),chord(1,6)])
    add('rest-skip-connects',[chord(1),chord(2,isRest=True),chord(3,rest='TRUE'),chord(5),chord(4,rest=' true '),chord(1)])
    add('same-root-quality',[chord(1),chord(1,quality='minor'),chord(1,inversion=1),chord(1,useMaj7=True),chord(5)])
    add('lexical-ties',[chord(r) for r in [1,5,1,4,1,6]])
    add('input-order-not-beat-sort',[chord(1,9),chord(5,4),chord(4,1),chord(1,3),chord(5,2)])
    add('first-target-zero',[chord(1,8),chord(5,0),chord(1,9),chord(5,4)])
    add('primitive-target-beats',[chord(1),chord(2,'3e0'),chord(3,'-1.5'),chord(4,None),chord(5,True),chord(6,[])])
    add('nonfinite-double-order',[chord(1),chord(2,'NaN'),chord(3,'Infinity'),chord(4,'-Infinity'),chord(1,4),chord(2,2)])
    add('invalid-root-and-letter',[{},chord(0),chord('1'),chord('1.0'),chord(0,_letterRootName='C',_letterQuality='major'),chord(5)])
    add('applied-borrowed',[chord(2,applied=5),chord(4,borrowed='minor'),chord(5,inversion=1),chord(2,applied=5)])
    add('array-borrowed',[chord(1),chord(2,borrowed=[1,3,4,6,8,9,11]),chord(5),chord(1)])
    add('base-key-not-event-key',[chord(1,1),chord(5,3),chord(1,4)],dict(keys=[dict(tonic='Ab',scale='minor',beat=1),dict(tonic='D',scale='major',beat=2)]))
    add('rest-and-self-bridge',[chord(1),chord(5,rest='True'),chord(1),chord(4),chord(4),chord(1)])
    return rows
DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
fun main(args:Array<String>) {
  for(input in Json.parseToJsonElement(File(args[0]).readText()).jsonArray){
    val row=input.jsonObject;val s=row.getValue("section").jsonObject
    val section=ExtractedSection(chords=s.getValue("chords").jsonArray.map {it.jsonObject},metadata=s["metadata"] as? JsonObject)
    val values=ChordTransitionRanking.transitions(section,row.getValue("rootOnly").jsonPrimitive.boolean)
    println(buildJsonArray {for(t in values)add(buildJsonObject {
      put("id",t.id);put("from",t.from);put("to",t.to);put("count",t.count)
      if(t.firstBeat.isFinite())put("firstBeat",t.firstBeat) else put("firstBeat",t.firstBeat.toString())
    })})
  }
}'''
def main():
    WORK.mkdir(parents=True,exist_ok=True)
    names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter','ChordInterpreter','ChordLetterFormat','ChordVoicing','ChordTransitions']
    sources={name:CORE['source'](name) for name in names}
    for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8')
    (WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8');rows=cases();(WORK/'input.json').write_text(json.dumps(rows,ensure_ascii=False),encoding='utf-8')
    cached=CORE['cached'];annotations=cached('org.jetbrains','annotations')
    runtime=[cached('org.jetbrains.kotlin','kotlin-stdlib'),annotations,cached('org.jetbrains.kotlinx','kotlinx-serialization-json-jvm'),cached('org.jetbrains.kotlinx','kotlinx-serialization-core-jvm')]
    compiler=[cached('org.jetbrains.kotlin',name) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:raise RuntimeError('Existing Java and cached Kotlin tooling required')
    compiled=WORK/'classes';encoding=dict(encoding='utf-8',errors='strict')
    subprocess.run([java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),*[str(WORK/(name+'.kt')) for name in names],str(WORK/'Driver.kt')],check=True,cwd=ROOT,**encoding)
    output=subprocess.check_output([java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(WORK/'input.json')],cwd=ROOT,**encoding)
    lines=output.splitlines();assert len(lines)==len(rows)
    for row,line in zip(rows,lines):row['expected']=json.loads(line)
    fixture={'authority':CORE['AUTHORITY'],'adapter':'Unchanged complete ChordTransitions.kt and real native theory/models. JSON-only inputs/outputs; nonfinite firstBeat encoded by native name. No TypeScript.','sourceSha256':{name:hashlib.sha256(text.encode()).hexdigest() for name,text in sources.items()},'cases':rows}
    path=OUT/'native-transitions.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')
    print(f'Captured {len(rows)} native transition cases/{sum(len(row["expected"]) for row in rows)} ranked rows; {path.stat().st_size} bytes')
if __name__=='__main__':main()
