"""<=12 groups/40 NEW actual native catalog decoder+target probes, frozen801cf798.
Actual Kotlin2.2.10 serialization1.8.1/plugin; unchanged native declarations, gzip,
complete typed decode expressions, target and identity. Only row-column inputs and
run lookup are fixture bindings; no SQLite behavior stub, TS expectation or old capture.
Original JSON lexemes are input STRINGS, gzip bytes are fixture transport only.
"""
from pathlib import Path
from datetime import datetime,timezone
import base64,gzip,hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT.parents[1]/'learning/fixtures/generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t15-target-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')

def source(name):return subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/{name}.kt'],cwd=ROOT).decode('utf-8')
def raw(value):return json.dumps(value,ensure_ascii=True,separators=(',',':'))
def cases():
 groups=[]
 position=dict(startIndex=0,endIndex=0,startBeat=0.0,endBeat=1.0,degree='V7',roman='V65',notes=[60,64,67],rootMidi=60,bassMidi=60)
 key=dict(tonic='C',scale='major')
 def probe(name,**changes):
  row=dict(name=name,rowId=0,stableId='target-reference-run',view='diagnostic_harmony',song='fixture-song',section='fixture-section',revision='revision',schemaVersion=3,supportsModeAnalysis=True,
   tokensRaw=raw(['target-native-A']),positionsRaw=raw([position]),keyRaw=raw(key),sourceKeyRaw=raw(dict(tonic='D',scale='minor')),suffix=[0,0],start=0,end=77,length=1,snapshotId='target-reference-snapshot')
  row.update(changes)
  for name in ['tokens','positions']:row[name+'Gzip']=base64.b64encode(gzip.compress(row[name+'Raw'].encode('utf-8'),mtime=0)).decode('ascii')
  return row
 def pos(**changes):return raw([dict(position,**changes)])
 def add(name,*rows):groups.append(dict(name=name,probes=list(rows)))
 add('minimal-default-unknown-and-odd-typed',probe('default-varyingBass'),probe('explicit-varyingBass',positionsRaw=pos(varyingBass=True)),
  probe('unknown-fields-odd-values',positionsRaw=pos(startIndex=-7,endIndex=-9,startBeat=3.0,endBeat=-2.0,rootMidi=-999,bassMidi=999,unknown={'ignored':None}),keyRaw=raw(dict(tonic='not-a-tonic',scale='not-a-mode',unknown=17)),sourceKeyRaw=raw(dict(key,unknown=False))))
 missing=[]
 for field in position:
  partial=dict(position);del partial[field];missing.append(probe('missing-'+field,positionsRaw=raw([partial])))
 add('every-required-position-field',*missing)
 missing=[]
 for column in ['keyRaw','sourceKeyRaw']:
  for field in key:
   partial=dict(key);del partial[field];missing.append(probe('missing-'+column+'-'+field,**{column:raw(partial)}))
 add('both-keys-required-fields',*missing)
 add('schema1-key-fallback-vs-modern',probe('legacy-ignores-invalid-source-key',schemaVersion=1,supportsModeAnalysis=False,sourceKeyRaw='not json'),probe('modern-decodes-invalid-source-key',sourceKeyRaw='not json'))
 add('raw-numeric-and-boolean-string-fields',probe('tokens-numeric-lexemes',tokensRaw='[1.0,1e2,-0]',positionsRaw=raw([position]*3),length=3),
  probe('tokens-boolean-primitives',tokensRaw='[true,false]',positionsRaw=raw([position]*2),length=2),
  probe('degree-numeric-lexeme',positionsRaw=raw([position]).replace('"degree":"V7"','"degree":1e2')),
  probe('key-string-numeric-lexeme',keyRaw='{"tonic":1.0,"scale":"major"}'))
 add('int-numeric-quoted-and-boundaries',probe('numeric-decimal-int',positionsRaw=raw([position]).replace('"startIndex":0','"startIndex":1.0',1)),
  probe('numeric-exponent-int',positionsRaw=raw([position]).replace('"startIndex":0','"startIndex":1e2',1)),
  probe('quoted-exponent-and-int-extrema',positionsRaw=pos(startIndex='1e2',endIndex='2147483647',rootMidi='-2147483648',bassMidi='0')),
  probe('notes-int-overflow',positionsRaw=pos(notes=[2147483648])))
 add('quoted-double-bool-and-nonfinite',probe('quoted-hex-and-suffixed-double',positionsRaw=pos(startBeat='0x1.8p1',endBeat=' 1.5D ')),
  probe('quoted-case-boolean',positionsRaw=pos(varyingBass='TrUe')),
  probe('nonfinite-double-exponent',positionsRaw=raw([position]).replace('"startBeat":0.0','"startBeat":1e309',1)))
 add('known-null-fields',probe('null-degree',positionsRaw=pos(degree=None)),probe('null-key-object',keyRaw='null'))
 add('duplicate-known-field-order',probe('duplicate-degree-and-varyingBass',positionsRaw=raw([position]).replace('"degree":"V7"','"degree":"old","degree":"new","varyingBass":true,"varyingBass":false')))
 add('zero-slice-and-independent-array-bounds',probe('zero-length-unchecked-end',suffix=[0,1],length=0,end=-99),
  probe('positions-shorter-than-tokens',tokensRaw=raw(['target-native-A','target-native-B']),suffix=[0,1]),
  probe('tokens-shorter-than-positions',positionsRaw=raw([position]*2),suffix=[0,1]))
 add('native-offset-length-bounds',probe('negative-offset',suffix=[0,-1]),probe('negative-length',suffix=[0,1],length=-1),probe('span-past-both-arrays',length=2))
 add('actual-view-suffix-label-choice',probe('bass-view-roman',view='relative_harmony_bass'),probe('non-suffix-degree',view='harmony_bass_extra'))
 assert len(groups)==12 and sum(len(g['probes'])for g in groups)==40
 return groups

DRIVER=r"""package com.acquiring.android
import java.io.File
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.*
private val output=Json { encodeDefaults=true }
private fun runJson(run:AuralCatalogRun)=buildJsonObject {
 put("id",run.id);put("stableId",run.stableId);put("view",run.view);put("song",run.song);put("section",run.section);put("revision",run.revision)
 put("tokens",output.encodeToJsonElement(ListSerializer(String.serializer()),run.tokens))
 put("positions",output.encodeToJsonElement(ListSerializer(AuralCatalogPosition.serializer()),run.positions))
 put("key",output.encodeToJsonElement(KeyInfo.serializer(),run.key));put("sourceKey",output.encodeToJsonElement(KeyInfo.serializer(),run.sourceKey))
}
private fun failure(stage:String,error:Exception)=buildJsonObject {
 put("failure",true);put("stage",stage);put("errorClass",error.javaClass.name);put("errorMessage",error.message ?: "")
}
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 val decoder=NativeRowDecoder()
 for(item in output.parseToJsonElement(File(args.single()).readText(Charsets.UTF_8)).jsonArray) {
  val group=item.jsonObject
  println(buildJsonObject {
   put("name",group.getValue("name"));put("probes",buildJsonArray { for(value in group.getValue("probes").jsonArray) {
    val row=value.jsonObject
    val expected=try {
     val run=decoder.decode(row)
     val target=try {
      val suffix=row.getValue("suffix").jsonArray.map{it.jsonPrimitive.int}.toIntArray()
      val host=NativeTargetHost(mapOf(run.id to run),suffix,row.getValue("snapshotId").jsonPrimitive.content)
      output.encodeToJsonElement(AuralPatternTarget.serializer(),host.target(row.getValue("start").jsonPrimitive.int,row.getValue("end").jsonPrimitive.int,row.getValue("length").jsonPrimitive.int))
     } catch(error:Exception) { failure("target",error) }
     buildJsonObject { put("run",runJson(run));put("target",target) }
    } catch(error:Exception) { failure("decode",error) }
    add(JsonObject(row+mapOf("expected" to expected)))
   } })
  })
 }
}
"""

def main():
 WORK.mkdir(parents=True,exist_ok=False)
 catalog=source('AuralCatalog');music=source('MusicTheory');lines=catalog.splitlines(keepends=True);musicLines=music.splitlines(keepends=True)
 slices=dict(targetDeclaration=''.join(lines[14:15]),positionRunDeclarations=''.join(lines[22:26]),keyDeclaration=''.join(musicLines[338:340]),
  jsonConfiguration=''.join(lines[51:52]),gzipUnpack=''.join(lines[119:120]),runDecodeExpression=''.join(lines[124:126]),targetFunction=''.join(lines[127:133]),identityFunction=''.join(lines[37:47]))
 assert slices['targetFunction'].lstrip().startswith('fun target(')and slices['targetFunction'].rstrip().endswith('}')
 assert '@Serializable' in slices['keyDeclaration']and 'varyingBass: Boolean = false' in slices['positionRunDeclarations']
 expression=slices['runDecodeExpression']
 stringColumns={0:'stableId',1:'view',2:'song',3:'section',4:'revision',7:'keyRaw',8:'sourceKeyRaw'}
 for index,name in stringColumns.items():expression=expression.replace(f'c.getString({index})',f'row.getValue("{name}").jsonPrimitive.content'if index!=8 else 'sourceKey')
 for index,name in {5:'tokensGzip',6:'positionsGzip'}.items():expression=expression.replace(f'c.getBlob({index})',f'Base64.getDecoder().decode(row.getValue("{name}").jsonPrimitive.content)')
 assert 'c.'not in expression
 adapter='package com.acquiring.android\nimport java.util.Base64\nimport java.util.zip.GZIPInputStream\nimport kotlinx.serialization.json.*\ninternal class NativeRowDecoder {\n'+slices['jsonConfiguration']+slices['gzipUnpack']+"""    fun decode(row:JsonObject):AuralCatalogRun {
        val id=row.getValue("rowId").jsonPrimitive.int
        val sourceKey=if(row.getValue("supportsModeAnalysis").jsonPrimitive.boolean)row.getValue("sourceKeyRaw").jsonPrimitive.content else row.getValue("keyRaw").jsonPrimitive.content
        return """+expression.lstrip()+"""    }
}
internal class NativeTargetHost(private val rows:Map<Int,AuralCatalogRun>,private val suffix:IntArray,val snapshotId:String) {
    private fun run(id:Int):AuralCatalogRun = rows.getValue(id)
"""+slices['targetFunction']+'}\n'
 native='package com.acquiring.android\nimport java.nio.ByteBuffer\nimport java.nio.ByteOrder\nimport java.security.MessageDigest\nimport kotlinx.serialization.Serializable\n'+slices['targetDeclaration']+slices['positionRunDeclarations']+slices['keyDeclaration']+slices['identityFunction']
 sources=dict(Native=native,Adapter=adapter,Driver=DRIVER)
 for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8',newline='\n')
 inputs=WORK/'input.json';rows=cases();inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations');plugin=cached('org.jetbrains.kotlin','kotlin-serialization-compiler-plugin-embeddable',VERSION)
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',name,'1.8.1')for name in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',name,VERSION)for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 assert VERSION=='2.2.10'and all(VERSION in p.name for p in [stdlib,plugin,*compiler[:4]])
 java=shutil.which('java');assert java,'Existing Java required; no install/download';prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
 command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler'];version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8');assert 'kotlinc-jvm 2.2.10 'in version
 compiled=WORK/'classes';result=subprocess.run(command+['-Xplugin='+str(plugin),'-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),*[str(WORK/(name+'.kt'))for name in sources]],capture_output=True,cwd=ROOT)
 (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-12000:])
 serializers=sorted(p.name for p in compiled.glob('com/acquiring/android/*$$serializer.class'));assert serializers==['AuralCatalogPosition$$serializer.class','AuralPatternTarget$$serializer.class','KeyInfo$$serializer.class'],serializers
 result=subprocess.run(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],capture_output=True,cwd=ROOT);(WORK/'stdout.jsonl').write_bytes(result.stdout);(WORK/'runtime.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native execution failed: '+result.stderr.decode('utf-8')[-12000:])
 captured=[json.loads(line)for line in result.stdout.decode('utf-8').split('\n')if line.strip()];assert len(captured)==12 and sum(len(g['probes'])for g in captured)==40
 for original,capture in zip(rows,captured):
  assert original['name']==capture['name']and len(original['probes'])==len(capture['probes'])
  for input,probe in zip(original['probes'],capture['probes']):assert input=={k:v for k,v in probe.items()if k!='expected'}
 digest=lambda value:hashlib.sha256(value).hexdigest();classes={p.name:digest(p.read_bytes())for p in compiled.glob('com/acquiring/android/*.class')}
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],serializerClasses=serializers,classSha256=classes,
  catalogSourceSha256=digest(catalog.encode()),musicSourceSha256=digest(music.encode()),sliceSha256={name:digest(text.encode())for name,text in slices.items()},mappedRunDecoderSha256=digest(expression.encode()),
  extractedSourceSha256={name:digest(text.encode())for name,text in sources.items()},producerSha256=digest(Path(__file__).read_bytes()),nativeInputSha256=digest(inputs.read_bytes()),nativeStdoutSha256=digest(result.stdout),
  jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([plugin,*compiler,*runtime])],
  adapter='Actual serializer classes decode native complete tokens/positions/BOTH keys from actual gzip/uncompressed JSON; run column access only mapped to fixture row inputs and schema1/source-key capability binding. Native target128..133 and identity38..47 unchanged, run lookup fixture map only. No Android SQLite behavior/cache/header simulation or TS expected output. All original raw JSON lexemes preserved; no old fixture recapture.',
  unproven='No corrupt/multimember gzip, malformed UTF8, every scalar lexical variant/null/duplicate ordering, start-rank Int-overflow or real SQL/header/snapshot/runtime/browser behavior claim.',cases=captured)
 path=OUT/'native-target.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
 decodeFailures=sum(bool(p['expected'].get('failure'))for g in captured for p in g['probes']);targetFailures=sum(bool(p['expected'].get('target',{}).get('failure'))for g in captured for p in g['probes'])
 print(json.dumps(dict(groups=12,probes=40,decodeFailures=decodeFailures,targetFailures=targetFailures,fullTargetSuccesses=40-decodeFailures-targetFailures,fixtureSHA256=digest(path.read_bytes()),serializerClasses=serializers,ignoredWork=str(WORK))))
if __name__=='__main__':main()
