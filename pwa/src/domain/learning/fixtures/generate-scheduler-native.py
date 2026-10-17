"""<=24 NEW native scheduler/unlock cases; unchanged frozen801cf798 helpers/select.
No exercise generation, TS import, existing fixture capture or runtime installation.
Kotlin compiler/stdlib/runtime2.2.10 pinned using existing private RNG tooling.
"""
from pathlib import Path
import copy,hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT/'generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k] for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t14-scheduler-native'
FAMILIES=['dominant-return','plagal-return','predominant-cadence','deceptive-return','relative-motion','secondary-dominant']
SKILLS=['guided','compare','identify','recall','complete','audiate','reproduce']
MIC=['root','bass','scaleDegree','rootSequence']
READY=dict(practice=4,practiceCorrect=4,independentAttempts=8,independentCorrect=8,transferCorrect=2,keys=['C','G','F'],recentIndependent=[True]*8,dueAt=10000,microphonePractice={k:1 for k in MIC},microphoneIndependent={k:1 for k in MIC})

def cases():
    rows=[]
    def add(label,ready=False,attempts=1,cells=None,seed='0',now=100,microphoneEnabled=True,version=1):
        rows.append(dict(label=label,ready=ready,attempts=attempts,cells=cells or {},seed=seed,now=now,microphoneEnabled=microphoneEnabled,version=version))
    def d(skill,patch,family='dominant-return'):return {family+':'+skill:patch}
    weak=dict(independentCorrect=2,independentAttempts=2,recentIndependent=[True,True],transferCorrect=0)
    add('default-negative-time',seed='-9223372036854775808',now=-1)
    add('version-reset-versus-unlock',True,version=99,seed='9223372036854775807')
    add('counter-cap-and-untrusted-flags',attempts=1000001,cells=d('guided',dict(practice=5,practiceCorrect=9,mastered=True,support=0)))
    add('prerequisite-count',cells=d('identify',dict(independentAttempts=1,independentCorrect=1,recentIndependent=[True])))
    add('prerequisite-below-accuracy',cells=d('identify',dict(independentAttempts=4,independentCorrect=2,recentIndependent=[True,True,False,False])))
    add('prerequisite-inclusive-accuracy',cells=d('identify',dict(independentAttempts=5,independentCorrect=3,recentIndependent=[True,True,True,False,False])))
    add('guided-three',cells=d('guided',dict(practice=3,practiceCorrect=3)))
    add('guided-four',cells=d('guided',dict(practice=4,practiceCorrect=4)))
    add('immediate-predecessor',cells=d('compare',dict(practice=4,practiceCorrect=4,independentAttempts=5,independentCorrect=3,recentIndependent=[True,True,True,False,False])))
    add('due-mastered-stable-tie',True,5,cells={**d('compare',dict(dueAt=10)),**d('identify',dict(dueAt=10),'plagal-return')})
    add('due-before-introduction',True,20,cells={**d('compare',dict(dueAt=10)),**d('guided',dict(practiceCorrect=0),'relative-motion')})
    add('due-inclusive',True,5,cells=d('compare',dict(dueAt=10)),now=10)
    add('due-not-yet',True,5,cells=d('compare',dict(dueAt=10)),now=9,seed='-1')
    add('introduction-before-mastered-weak',True,12,cells={**d('guided',dict(practiceCorrect=0),'plagal-return'),**d('recall',dict(lastCorrect=False))})
    add('mastered-weak-seeded-tie',True,3,cells={**d('compare',dict(lastCorrect=False)),**d('identify',dict(lastCorrect=False),'plagal-return')},seed='9007199254740992')
    add('pending-all',True,1,cells={**d('compare',weak),**d('identify',weak)},seed='4294967297')
    add('pending-frontier',True,2,cells={**d('compare',weak),**d('identify',weak)},seed='4294967297')
    add('unstarted-fallback',True,11,cells=d('guided',dict(practiceCorrect=0)))
    add('all-mastered-maintenance',True,11,seed='9007199254740993',now=9007199254740991)
    add('microphone-disabled',True,1,cells=d('reproduce',weak),microphoneEnabled=False)
    add('microphone-introduce-root',True,3,cells=d('reproduce',dict(**weak,microphonePractice={})))
    add('microphone-introduce-bass',True,3,cells=d('reproduce',dict(**weak,microphonePractice={'root':1})))
    add('microphone-shuffle-all-before-min',True,3,cells=d('reproduce',dict(**weak,microphoneIndependent=dict(root=2,bass=1,scaleDegree=1,rootSequence=2))),seed='811')
    add('transfer-deficit-reason',True,1,cells=d('reproduce',dict(independentCorrect=4,transferCorrect=0,recentIndependent=[True]*4)),seed='128')
    assert len(rows)==24
    return rows

def source(name):return subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/{name}.kt'],cwd=ROOT).decode('utf-8')
DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 val input=Json.parseToJsonElement(File(args[0]).readText()).jsonObject
 fun cell(q:JsonObject)=AuralCell(
   practice=q["practice"]?.jsonPrimitive?.int?:0,practiceCorrect=q["practiceCorrect"]?.jsonPrimitive?.int?:0,
   independentAttempts=q["independentAttempts"]?.jsonPrimitive?.int?:0,independentCorrect=q["independentCorrect"]?.jsonPrimitive?.int?:0,
   transferCorrect=q["transferCorrect"]?.jsonPrimitive?.int?:0,keys=q["keys"]?.jsonArray?.map{it.jsonPrimitive.content}?:emptyList(),
   mastered=q["mastered"]?.jsonPrimitive?.boolean?:false,support=q["support"]?.jsonPrimitive?.int?:2,
   lastAt=q["lastAt"]?.jsonPrimitive?.long?:0,dueAt=q["dueAt"]?.jsonPrimitive?.long?:0,
   lastCorrect=q["lastCorrect"]?.jsonPrimitive?.booleanOrNull,streak=q["streak"]?.jsonPrimitive?.int?:0,
   recentIndependent=q["recentIndependent"]?.jsonArray?.map{it.jsonPrimitive.boolean}?:emptyList(),
   microphonePractice=q["microphonePractice"]?.jsonObject?.mapValues{it.value.jsonPrimitive.int}?:emptyMap(),
   microphoneIndependent=q["microphoneIndependent"]?.jsonObject?.mapValues{it.value.jsonPrimitive.int}?:emptyMap())
 for(el in input.getValue("cases").jsonArray){val r=el.jsonObject;val cells=linkedMapOf<String,AuralCell>()
   if(r.getValue("ready").jsonPrimitive.boolean) for(f in AuralCurriculum.families)for(s in AuralCurriculum.skills)cells["${f.id}:${s.id}"]=cell(input.getValue("readyCell").jsonObject)
   for((key,patch) in r.getValue("cells").jsonObject){val base=if(r.getValue("ready").jsonPrimitive.boolean)input.getValue("readyCell").jsonObject else JsonObject(emptyMap());cells[key]=cell(JsonObject(base+patch.jsonObject))}
   val p=AuralProgress(version=r.getValue("version").jsonPrimitive.int,attempts=r.getValue("attempts").jsonPrimitive.int,cells=cells)
   val target=AuralCurriculum.selectTarget(p,r.getValue("seed").jsonPrimitive.content.toLong(),r.getValue("now").jsonPrimitive.long,r.getValue("microphoneEnabled").jsonPrimitive.boolean)
   val families=AuralCurriculum.families.map{it.id}+listOf("unknown","p_0123456789ab_1_0123456789abcdef0123456789abcdef")
   println(buildJsonObject {
    put("target",buildJsonObject {put("familyId",target.familyId);put("skillId",target.skillId);put("support",target.support);put("transfer",target.transfer);put("reason",target.reason);put("microphoneKind",target.microphoneKind);put("variantId",target.variantId);put("instrumentOverride",target.instrumentOverride);put("octaveShift",target.octaveShift);put("pattern",JsonNull)})
    put("families",JsonArray(families.map{JsonPrimitive(AuralCurriculum.familyUnlocked(p,it))}))
    put("skills",JsonArray(families.flatMap{f->(AuralCurriculum.skills.map{it.id}+"unknown").map{s->JsonPrimitive(AuralCurriculum.skillUnlocked(p,f,s))}}))
   })
 }
}
'''
def main():
    WORK.mkdir(parents=True,exist_ok=True)
    original=source('AuralCurriculum');corpus=source('AuralCorpus');catalog=source('AuralCatalog')
    declarations=original[original.index('@Serializable data class AuralVariant'):original.index('/** Pure curriculum')]
    declarations+=corpus[corpus.index('@Serializable data class AuralExampleSettings'):corpus.index('internal val AURAL_MODES')]
    declarations+=corpus[corpus.index('@Serializable data class AuralSourcePassage'):corpus.index('@Serializable data class AuralSourceExposure')]
    declarations+=catalog[catalog.index('@Serializable data class AuralPatternTarget'):catalog.index('internal fun AuralPatternTarget.sourceMode')]
    helpers=original[original.index('    private const val DAY'):original.index('    private fun buildEvent')]
    pure='package com.acquiring.android\nimport kotlinx.serialization.Serializable\nimport kotlin.random.Random\n'+declarations+'\nobject AuralCurriculum {\n'+helpers+'}\n'
    (WORK/'Scheduler.kt').write_text(pure,encoding='utf-8',newline='\n');(WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8',newline='\n')
    rows=cases();inputs=WORK/'input.json';inputs.write_text(json.dumps(dict(readyCell=READY,cases=rows)),encoding='utf-8')
    cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations')
    runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n) for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
    compiler=[cached('org.jetbrains.kotlin',n,VERSION) for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java');assert java
    prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
    command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
    version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode();assert 'kotlinc-jvm 2.2.10 ' in version
    compiled=WORK/'classes'
    subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),str(WORK/'Scheduler.kt'),str(WORK/'Driver.kt')],check=True,cwd=ROOT)
    output=subprocess.check_output(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],cwd=ROOT)
    (WORK/'stdout.jsonl').write_bytes(output);lines=output.decode('utf-8').splitlines();assert len(lines)==len(rows)
    for row,line in zip(rows,lines):row['expected']=json.loads(line)
    digest=lambda b:hashlib.sha256(b).hexdigest()
    fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,compilerVersion=version.strip().splitlines()[0],helpersSha256=digest(helpers.encode()),declarationsSha256=digest(declarations.encode()),sourceSha256=digest(original.encode()),producerSha256=digest(Path(__file__).read_bytes()),driverSha256=digest(DRIVER.encode()),jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([*compiler,*runtime])],adapter='Unchanged frozen native helper/select code and typed constructors; no TS or exercise generation.',readyCell=READY,cases=rows)
    path=OUT/'native-scheduler.json';path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8',newline='\n');print('Captured24 native scheduler cases; SHA256='+digest(path.read_bytes()))
if __name__=='__main__':main()
