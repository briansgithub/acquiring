"""Actual native stable catalog identity reference, frozen801cf798 AuralCatalog38..47.
Uses cached pinned Kotlin/JVM and native SHA256/ByteBuffer/Int overflow unchanged.
No TS expected generation, downloads, installed dependency changes or old recapture.
"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT.parents[1]/'learning/fixtures/generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t15-identity-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')

def cases():
 rows=[]
 def add(name,*items):rows.append(dict(name=name,inputs=[dict(tokens=tokens,view=view)for tokens,view in items]))
 add('empty-list-view',([],''),([],'root'),([],'inversion'))
 add('single-case-sensitive-token',(['I'],'root'),(['i'],'root'),(['I '],'root'))
 add('duplicates-and-order',(['I','V','I'],'root'),(['I','I','V'],'root'),(['I','V'],'root'))
 add('token-boundaries',(['ab','c'],'root'),(['a','bc'],'root'),(['abc'],'root'))
 add('empty-token-multiplication',([''],'root'),(['I',''],'root'),(['','I'],'root'),(['',''],'root'))
 add('view-exact-and-case-sensitive',(['I'],'Root'),(['I'],'root '),(['I'],''))
 add('nul-token-boundaries',(['I\0V'],'root'),(['I','\0','V'],'root'))
 add('nul-view-namespace',(['I'],'root\0mode'),(['I'],'rootmode'))
 add('newline-and-control',(['I\r\nV','\tI\u0085\u2028\u2029'],'root'))
 add('unicode-musical-utf8',(['♭VII','V△7','iiø7','𝄫VII','𝄪IV'],'音楽'))
 add('valid-surrogate-pairs',(['😀','a😀b','𝄞'],'😀'))
 add('combining-not-normalized',(['é'],'root'),(['e\u0301'],'root'))
 add('signed-overflow-many-tokens',(['I','V7','iiø7','♭VII']*32,'inversion'))
 add('zero-padding-lane-probes',*[( [str(i)],'root')for i in range(24)])
 add('long-token-bytes',(['x'*8192,'é'*4096],'root'))
 add('exact-json-spelling',(['{"degree":1}','{ "degree": 1 }','{"degree":"1"}'],'mode'))
 assert len(rows)==16
 return rows

DRIVER=r'''package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 val json=Json
 for(row in json.parseToJsonElement(File(args.single()).readText(Charsets.UTF_8)).jsonArray) {
  val group=row.jsonObject
  println(buildJsonObject {
   put("name",group.getValue("name"));put("cases",buildJsonArray {
    for(input in group.getValue("inputs").jsonArray) {
     val sample=input.jsonObject
     val tokens=sample.getValue("tokens").jsonArray.map { it.jsonPrimitive.content }
     val view=sample.getValue("view").jsonPrimitive.content
     add(JsonObject(sample+mapOf("expected" to JsonPrimitive(auralPatternId(tokens,view)))))
    }
   })
  })
 }
}
'''

def main():
 WORK.mkdir(parents=True,exist_ok=False)
 native=subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/AuralCatalog.kt'],cwd=ROOT).decode('utf-8')
 body=''.join(native.splitlines(keepends=True)[37:47])
 assert body.startswith('internal fun auralPatternId(')and body.rstrip().endswith('}')
 assert 'hashes[i] * multipliers[i] + bytes.getInt(i * 4)'in body
 source='package com.acquiring.android\nimport java.nio.ByteBuffer\nimport java.nio.ByteOrder\nimport java.security.MessageDigest\n\n'+body
 (WORK/'Identity.kt').write_text(source,encoding='utf-8',newline='\n');(WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8',newline='\n')
 rows=cases();input_path=WORK/'input.json';input_path.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations')
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n,'1.8.1')for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 assert VERSION=='2.2.10'and all(VERSION in p.name for p in [stdlib,*compiler[:4]])
 java=shutil.which('java');assert java,'Existing Java required; no install/download'
 prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8'];command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8');assert 'kotlinc-jvm 2.2.10 'in version
 compiled=WORK/'classes'
 result=subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),str(WORK/'Identity.kt'),str(WORK/'Driver.kt')],capture_output=True,cwd=ROOT)
 (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-8000:])
 assert (compiled/'com/acquiring/android/IdentityKt.class').is_file()
 result=subprocess.run(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(input_path)],capture_output=True,cwd=ROOT)
 (WORK/'stdout.jsonl').write_bytes(result.stdout);(WORK/'runtime.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native execution failed: '+result.stderr.decode('utf-8')[-8000:])
 captured=[json.loads(line)for line in result.stdout.decode('utf-8').split('\n')if line.strip()];assert len(captured)==16
 for original,actual in zip(rows,captured):
  assert original['name']==actual['name']and len(original['inputs'])==len(actual['cases'])
  for sample,output in zip(original['inputs'],actual['cases']):
   assert sample=={k:v for k,v in output.items()if k!='expected'}
   assert len(output['expected'].split('_'))==4 and len(output['expected'].split('_')[-1])==32
 padding=[sample['expected'].split('_')[-1]for row in captured for sample in row['cases']]
 assert any(any(value[i]=='0'for i in [0,8,16,24])for value in padding)
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],nativeBodySha256=digest(body.encode()),wholeCatalogSourceSha256=digest(native.encode()),extractedSourceSha256=digest(source.encode()),driverSha256=digest(DRIVER.encode()),producerSha256=digest(Path(__file__).read_bytes()),nativeInputSha256=digest(input_path.read_bytes()),nativeStdoutSha256=digest(result.stdout),nativeClassSha256=digest((compiled/'com/acquiring/android/IdentityKt.class').read_bytes()),jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([*compiler,*runtime])],adapter='Unchanged native AuralCatalog38..47 with actual JVM MessageDigest/ByteBuffer/Int overflow. Input/output JSON adapter only; no TS output or SQL/native stubs. UTF16 browser refusals separately tested later.',cases=captured)
 target=OUT/'native-identity.json';target.write_text(json.dumps(fixture,ensure_ascii=True,indent=2)+'\n',encoding='utf-8',newline='\n')
 print(json.dumps(dict(groups=16,samples=sum(len(r['cases'])for r in captured),fixtureSha256=digest(target.read_bytes()),nativeBodySha256=fixture['nativeBodySha256'],ignoredWork=str(WORK))))

if __name__=='__main__':main()
