"""Native-only T15 query oracle: <=24 NEW groups, frozen801cf798 source unchanged.
Run from repository root under run-control. Cached Kotlin2.2.10 compiler/runtime/plugin
emit actual query/constraint serializers; no TS expectations, SQL, old fixture capture,
network, dependency install or matcher implementation. Portable JSON is intentional
source evidence; ordinary compiler/input/output products remain ignored per run.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse,hashlib,json,os,runpy,shutil,subprocess

OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT.parents[1]/'learning/fixtures/generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t15-query-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')

def source(name):
 return subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/{name}.kt'],cwd=ROOT).decode('utf-8')

def cases():
 rows=[]
 def canonical(*labels):return [dict(kind='canonical',label=v)for v in labels]
 def constraint(degree,labels=(),roots=None,**fields):
  checks=[dict(label=l,**({}if roots is None else dict(rootLabel=roots[i])))for i,l in enumerate(labels)]
  return dict(kind='constraint',constraint=dict(degree=degree,**fields),checks=checks)
 def query(chords=(),labels=(),roots=None,version=1):
  return dict(kind='query',query=dict(version=version,chords=list(chords)),labels=list(labels),**({}if roots is None else dict(rootLabels=list(roots))))
 def failure(probe):return dict(probe,expectFailure=True)
 def add(name,*probes):rows.append(dict(name=name,probes=list(probes)))
 add('empty-query',dict(kind='query',query={},labels=[]),query(labels=['not a chord']))
 add('nonempty-query-empty-or-short',query([dict(degree=5)],[]),query([dict(degree=5),dict(degree=1)],['V']))
 add('consecutive-offset',query([dict(degree=5),dict(degree=1,family='minor')],['ii','V7','i9','IV']))
 add('no-gap-subsequence-or-wrap',query([dict(degree=5),dict(degree=1,family='minor')],['V7','IV','i9']),query([dict(degree=5),dict(degree=1)],['I','V']))
 add('multiple-window-starts',query([dict(degree=5),dict(degree=1)],['V','ii','V7','I','V','I']))
 add('nonexact-applied-refusal',constraint(5,['V/V','V7/V','V(foo/bar)','V7']))
 add('exact-applied-form',constraint(5,['V7/V','V7',' V7/V '],exact='V7/V'),constraint(2,['iiø7','iio7'],exact='iiø7'))
 add('exact-root-distinct-inversion',constraint(5,['V65','V65'],['V7','V△7'],exact='V7'),query([dict(degree=5,exact='V7',inversion='V65')],['ii','V65'],['ii','V7']))
 add('required-inversion-mismatch',constraint(5,['V65','V43',' V65 '],['V7','V7',' V7 '],exact='V7',inversion='V65'))
 add('inversion-without-exact-ignored',constraint(5,['V43','V','IV'],inversion='unrelated'),constraint(5,['V7/V'],inversion='V7/V'))
 add('ascii-double-mixed-accidentals',*canonical(' bVII13sus4 ','##IV','b#IV','bbVII','♭#IV'),constraint(7,['bVII13sus4','♭VII13sus4','VII'],accidental='♭'))
 add('internal-sharp-flat-digit-canonical',*canonical('V#11','Vb9','Vbb9','Bb9','IVb','♭VIIb13','V𝄫9'))
 add('kotlin-whitespace-vs-feff-nel',*canonical('\u00a0\u2007V7\u202f','\u001cV7\u001f','\ufeffV7\ufeff','\u0085V7\u0085'),constraint(5,['\u00a0V7\u3000','\ufeffV7','\u0085V7']))
 add('mixed-invalid-roman-prefix',constraint(4,['iVfoo','IVfoo','VIII','VX','IV(extra)','IV nonsense']),constraint(4,['iVfoo','IVfoo'],family='minor'))
 add('major-minor-extended-quality',constraint(5,['V','V7','V9','v9','V+','Vø7'],family='major'),constraint(5,['v','v9','V9','v°7'],family='minor'))
 add('any-diminished-halfdim-augmented',constraint(7,['vii°7','viiø7','VII+','viio','VIIweird','vii']),constraint(7,['vii°7','viiø7','VII+'],family='minor'))
 aliases=['V7','V9','V11','V13','V65','V43','V42','V6','V64']
 add('dominant-seventh-numeral-aliases',constraint(5,aliases,family='7'))
 add('major-seventh-delta-triangle',constraint(5,['V△7','VΔ9','V7','V△','VΔ65'],family='maj7'),constraint(5,['V△7','VΔ9','V7'],family='7'))
 add('minor-seventh-vs-halfdim',constraint(2,['ii7','ii9','ii65','iiø7','ii°7','ii△7'],family='m7'))
 add('add-sus-removal-literal-o-suffix',constraint(5,['Vadd9','Vsus4','Vadd9sus4','Vsus13','V7sus4','VADD9','Vsolo7','Vo7'],family='7'),constraint(5,['Vsolo7','Vfoo','V+7','Vø7']))
 add('display-null-empty-precedence',constraint(4,[],accidental='♯',family='major'),constraint(2,[],family='minor'),constraint(5,[],family='7'),constraint(5,[],family='maj7'),constraint(2,[],family='m7'),constraint(1,[],exact=''),constraint(1,[],exact='I',inversion=''),constraint(1,[],exact=None,inversion=None))
 add('defaults-and-32-33-cap',constraint(1,['I']),dict(kind='query',query={},labels=[]),query([dict(degree=1)]*32,['I']*32),failure(query([dict(degree=1)]*33,['I']*33)))
 invalid=[constraint(d)for d in [0,8,-1]]+[constraint(1,accidental=a)for a in ['b','#','bb']]+[constraint(1,family=f)for f in ['Major','diminished','m']]
 add('invalid-constraint-constructor',*[failure(p)for p in invalid])
 add('invalid-query-version',*[failure(query(version=v))for v in [0,2,-1]])
 assert len(rows)==24
 return rows

DRIVER=r"""package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
private val codec=Json { encodeDefaults=true }
private fun execute(probe:JsonObject):JsonObject = try {
 when(probe.getValue("kind").jsonPrimitive.content) {
  "canonical" -> buildJsonObject { put("canonical",auralCanonicalChord(probe.getValue("label").jsonPrimitive.content)) }
  "constraint" -> {
   val constraint=codec.decodeFromJsonElement(AuralChordConstraint.serializer(),probe.getValue("constraint"))
   buildJsonObject {
    put("constraint",codec.encodeToJsonElement(AuralChordConstraint.serializer(),constraint));put("label",constraint.label)
    put("matches",buildJsonArray { for(item in probe.getValue("checks").jsonArray) {
     val check=item.jsonObject;val label=check.getValue("label").jsonPrimitive.content
     add(constraint.matches(label,check["rootLabel"]?.jsonPrimitive?.content ?: label))
    } })
   }
  }
  "query" -> {
   val query=codec.decodeFromJsonElement(AuralProgressionQuery.serializer(),probe.getValue("query"))
   val labels=probe.getValue("labels").jsonArray.map { it.jsonPrimitive.content }
   val roots=probe["rootLabels"]?.jsonArray?.map { it.jsonPrimitive.content } ?: labels
   buildJsonObject { put("query",codec.encodeToJsonElement(AuralProgressionQuery.serializer(),query));put("matches",query.matches(labels,roots)) }
  }
  else -> error("Unknown fixture adapter operation")
 }
} catch(error:Exception) { buildJsonObject {
 put("failure",true);put("errorClass",error.javaClass.name);put("errorMessage",error.message ?: "")
} }
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 for(item in codec.parseToJsonElement(File(args.single()).readText(Charsets.UTF_8)).jsonArray) {
  val group=item.jsonObject
  println(buildJsonObject {
   put("name",group.getValue("name"));put("probes",buildJsonArray { for(probe in group.getValue("probes").jsonArray) {
    val input=probe.jsonObject;add(JsonObject(input+mapOf("expected" to execute(input))))
   } })
  })
 }
}
"""

def main():
 global WORK
 options=argparse.ArgumentParser(description=__doc__);options.add_argument('--reuse-work',type=Path)
 reuse=options.parse_args().reuse_work
 if reuse is not None:
  WORK=reuse.resolve();WORK.relative_to((ROOT/'.artifacts/pwa-port/t15-query-native').resolve());assert WORK.is_dir()
 else:WORK.mkdir(parents=True,exist_ok=False)
 query=source('AuralProgressionQuery');corpus=source('AuralCorpus');lines=corpus.splitlines(keepends=True)
 declarations=''.join(lines[25:27]);parser=''.join(lines[34:51])
 assert query.count('internal data class AuralChordConstraint')==1 and query.count('internal data class AuralProgressionQuery')==1
 assert declarations.startswith('internal data class AuralStartGroup')and parser.rstrip().endswith('}')
 sources={'AuralProgressionQuery':query,'StartGroup':'package com.acquiring.android\n\n'+declarations+'\n'+parser,'Driver':DRIVER}
 for name,text in sources.items():
  path=WORK/(name+'.kt')
  if reuse is not None:assert path.read_bytes()==text.encode('utf-8'),path
  else:path.write_text(text,encoding='utf-8',newline='\n')
 rows=cases();inputs=WORK/'input.json'
 if reuse is not None:assert json.loads(inputs.read_text(encoding='utf-8'))==rows
 else:inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations')
 plugin=cached('org.jetbrains.kotlin','kotlin-serialization-compiler-plugin-embeddable',VERSION)
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n,'1.8.1')for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 assert VERSION=='2.2.10' and all(VERSION in p.name for p in [plugin,stdlib,*compiler[:4]])
 java=shutil.which('java');assert java,'Existing Java required; no install/download'
 prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
 command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8')
 assert 'kotlinc-jvm 2.2.10 'in version,version
 compiled=WORK/'classes'
 if reuse is None:
  result=subprocess.run(command+['-Xplugin='+str(plugin),'-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),*[str(WORK/(name+'.kt'))for name in sources]],capture_output=True,cwd=ROOT)
  (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
  if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-12000:])
 serializers=sorted(p.name for p in compiled.glob('com/acquiring/android/*$$serializer.class'))
 assert serializers==['AuralChordConstraint$$serializer.class','AuralProgressionQuery$$serializer.class'],serializers
 if reuse is not None:output=(WORK/'stdout.jsonl').read_bytes()
 else:
  result=subprocess.run(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],capture_output=True,cwd=ROOT)
  (WORK/'stdout.jsonl').write_bytes(result.stdout);(WORK/'runtime.stderr').write_bytes(result.stderr)
  if result.returncode:raise RuntimeError('Native execution failed: '+result.stderr.decode('utf-8')[-12000:])
  output=result.stdout
 # JSON strings may contain literal NEL/LS/PS; only LF delimits println records.
 captured=[json.loads(line)for line in output.decode('utf-8').split('\n')if line.strip()];assert len(captured)==24
 for original,capture in zip(rows,captured):
  assert original['name']==capture['name'] and len(original['probes'])==len(capture['probes'])
  for input,probe in zip(original['probes'],capture['probes']):
   assert input=={k:v for k,v in probe.items()if k!='expected'}
   assert bool(probe['expected'].get('failure'))==input.get('expectFailure',False),probe
 failure_count=sum(bool(p['expected'].get('failure'))for r in captured for p in r['probes'])
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(captureMode='retained-successful-native-output'if reuse is not None else 'fresh-native-compile-and-execute',nativeStdoutSha256=digest(output),nativeInputSha256=digest(inputs.read_bytes()),serializerClassSha256={name:digest((compiled/'com/acquiring/android'/name).read_bytes())for name in serializers},authority=AUTHORITY,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],serializerClasses=serializers,
  querySourceSha256=digest(query.encode()),corpusSourceSha256=digest(corpus.encode()),startGroupDeclarationsSha256=digest(declarations.encode()),startGroupParserSha256=digest(parser.encode()),
  extractedSourceSha256={name:digest(text.encode())for name,text in sources.items()},producerSha256=digest(Path(__file__).read_bytes()),
  jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([plugin,*compiler,*runtime])],
  adapter='Unchanged WHOLE frozen AuralProgressionQuery.kt plus AuralCorpus26..27/35..51 parser; real emitted serializers construct typed defaults/validate. JSON fixture adapter only; native canonical/display/match outputs and constructor failures; no TS expectations, SQL/runtime/groups or old fixture capture.',cases=captured)
 path=OUT/'native-query.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
 print(json.dumps(dict(groups=len(captured),probes=sum(len(r['probes'])for r in captured),nativeConstructorFailures=failure_count,fixtureSHA256=digest(path.read_bytes()),serializerClasses=serializers,ignoredWork=str(WORK))))

if __name__=='__main__':main()
