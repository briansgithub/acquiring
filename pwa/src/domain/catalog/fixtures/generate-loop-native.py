"""Independent frozen whole native loop module plus unchanged15 shared authority cases.
Only16 NEW input groups execute on actual cached pinned Kotlin/JVM. No old recapture.
"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
SUPPORT=runpy.run_path(str(OUT/'generate-identity-native.py'));TOOLS=SUPPORT['TOOLS']
ROOT,CACHE,VERSION,AUTHORITY=[SUPPORT[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t15-loop-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
def cases():
 rows=[('single',['Q']),('two-equal',['Q','Q']),('unary-four',['Q']*4),
 ('period2-even',['D','A']*3),('period2-odd',['D','A']*3+['D']),
 ('period3-full',['D','G','A']*3),('period3-partial',['D','G','A']*3+['D','G']),
 ('near-period-border',['D','G','A','D','G','Z']),('both-endpoint-branches',['Z','D','A','D','A']),
 ('retained-several-levels',['D','A']*4),('nested-cycle-transitions',['D','A','D','G']*3),
 ('pair-delimiter-collisions',['a|b','c','a','b|c']*2),('pair-nul-collisions',['a\0b','c','a','b\0c']*2),
 ('exact-unicode-case',['♭VII','VII','i','I']*2),('empty-tokens',['','Q']*3),('longer-periodic',['D','A','G','C']*16)]
 return [dict(name=name,tokens=tokens)for name,tokens in rows]
DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 for(item in Json.parseToJsonElement(File(args.single()).readText(Charsets.UTF_8)).jsonArray) {
  val row=item.jsonObject;val tokens=row.getValue("tokens").jsonArray.map { it.jsonPrimitive.content }
  val reduced=auralReduceLoop(tokens);val children=auralRetainedChildren(tokens)
  println(JsonObject(row+mapOf("version" to JsonPrimitive(AURAL_LOOP_REDUCTION_VERSION),"expected" to buildJsonObject {
   put("reduction",buildJsonObject { put("redundant",reduced.redundant);put("start",reduced.start);put("length",reduced.length) })
   put("children",buildJsonArray { for(child in children)add(JsonArray(child.map { JsonPrimitive(it) })) })
  })))
 }
}
'''
def main():
 WORK.mkdir(parents=True,exist_ok=False)
 native=subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/AuralLoopReduction.kt'],cwd=ROOT)
 shared=subprocess.check_output(['git','show',f'{AUTHORITY}:tooling/aural-corpus/fixtures/loop-reduction.json'],cwd=ROOT)
 assert native.count(b'internal fun auralReduceLoop(')==1 and native.count(b'internal fun auralRetainedChildren(')==1
 rows=cases();common=json.loads(shared);assert len(rows)==16 and len(common)==15
 assert all(row['tokens']!=old['tokens']for row in rows for old in common)
 (WORK/'Loops.kt').write_bytes(native);(WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8',newline='\n')
 inputs=WORK/'input.json';inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations')
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n,'1.8.1')for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 assert VERSION=='2.2.10'and all(VERSION in p.name for p in [stdlib,*compiler[:4]])
 java=shutil.which('java');assert java,'Existing Java required, no install/download'
 prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8'];command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8');assert 'kotlinc-jvm 2.2.10 'in version
 compiled=WORK/'classes';result=subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),str(WORK/'Loops.kt'),str(WORK/'Driver.kt')],capture_output=True,cwd=ROOT)
 (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-8000:])
 classes=['LoopsKt.class','AuralLoopReduction.class'];assert all((compiled/'com/acquiring/android'/name).is_file()for name in classes)
 result=subprocess.run(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],capture_output=True,cwd=ROOT)
 (WORK/'stdout.jsonl').write_bytes(result.stdout);(WORK/'runtime.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native execution failed: '+result.stderr.decode('utf-8')[-8000:])
 captured=[json.loads(line)for line in result.stdout.decode('utf-8').split('\n')if line.strip()];assert len(captured)==16
 for original,actual in zip(rows,captured):
  assert original=={k:v for k,v in actual.items()if k not in ['version','expected']}
  assert actual['version']=='unique-transitions-1'
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],version=captured[0]['version'],nativeSourceSha256=digest(native),driverSha256=digest(DRIVER.encode()),producerSha256=digest(Path(__file__).read_bytes()),sharedSourcePath='tooling/aural-corpus/fixtures/loop-reduction.json',sharedSourceSha256=digest(shared),sharedCases=common,nativeInputSha256=digest(inputs.read_bytes()),nativeStdoutSha256=digest(result.stdout),nativeClassSha256={name:digest((compiled/'com/acquiring/android'/name).read_bytes())for name in classes},jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([*compiler,*runtime])],adapter='Unchanged WHOLE frozen native module.16NEW JVM groups actual reduction/ordered retained children;15shared authority cases copied UNCHANGED, not executed/recaptured; JSON adapter only, no TS expectations.',cases=captured)
 target=OUT/'native-loop.json';target.write_text(json.dumps(fixture,ensure_ascii=True,indent=2)+'\n',encoding='utf-8',newline='\n')
 print(json.dumps(dict(newNativeGroups=16,reusedSharedCases=15,fixtureSha256=digest(target.read_bytes()),nativeSourceSha256=fixture['nativeSourceSha256'],ignoredWork=str(WORK))))
if __name__=='__main__':main()
