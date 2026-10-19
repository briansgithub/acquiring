"""<=12 NEW actual native song-rank predicate groups, frozen801cf798.
Fresh host/cache per probe. Reflection ONLY reads actual private packed Long words;
unsigned32 split/padding and UTF16-unit observations are output adapters, not predicate.
"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,math,os,runpy,shutil,struct,subprocess,sys
OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT.parents[1]/'learning/fixtures/generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t15-song-rank-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
def source(name):return subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/{name}.kt'],cwd=ROOT).decode('utf-8')
def cases():
 groups=[]
 def probe(name,ranks=('A',),valid=('A',),scores=(('A',.5),),percent=50):return dict(name=name,songByRank=list(ranks),validSongIds=list(valid),popularity=[dict(songId=id,score=score)for id,score in scores],percent=percent)
 def add(name,*rows):groups.append(dict(name=name,probes=list(rows)))
 add('empty-rank',probe('empty',()),probe('empty-with-unreferenced-data',(),('unused',),(('unused',1),)))
 add('all-invalid-songs',probe('invalid',('A','B'),()),probe('valid-but-unseen',('A','B'),('C',),(('A',1),('B',1),('C',1))))
 add('missing-and-null-score',probe('null-and-missing',('A','B','C'),('A','B','C'),(('A',None),('C',1))))
 scores=[('negative',-.1),('zero',0),('below',math.nextafter(.5,0)),('half',.5),('above',math.nextafter(.5,1)),('one',1),('outside',1.1),('null',None)]
 add('thresholds-inclusive-neighbors',*[probe('percent-'+str(p),[s for s,_ in scores],[s for s,_ in scores],scores,p)for p in [0,50,100]])
 add('finite-out-of-range',probe('extreme-finite',('negative','positive','zero'),('negative','positive','zero'),(('negative',-sys.float_info.max),('positive',sys.float_info.max),('zero',-0.0)),0))
 add('repeated-ranks-and-valid-ids',probe('duplicates',('A','A','B','A','B','A'),('A','A','B','B'),(('A',1),('B',.4))))
 add('packed-word-boundaries',probe('ranks-0-31-32-63-64',['yes'if i in [0,31,32,63,64]else'no'for i in range(65)],('yes','no'),(('yes',1),('no',0))))
 add('explicit-zero-tail-padding',*[probe('length-'+str(n),['yes']+['absent']*(n-1),('yes','absent'),(('yes',1),))for n in [33,65,96]])
 add('all-eligible-word-extents',*[probe('length-'+str(n),['A']*n,('A',),(('A',1),))for n in [1,31,32,63,64,65]])
 ids=['__proto__','a\0b','a','\ufeffa','😀','é','e\u0301','A']
 add('raw-text-identity',probe('nul-bom-prototype-astral-case',ids,ids[::2],[(id,1)for id in ids]))
 ids=['\ud800','\udc00','\U00010000','x\ud800y','x\udc00y','x']
 add('exact-lone-utf16-units',probe('unpaired-and-pair-distinct',ids,ids[::2],[(id,1)for id in ids]))
 scores=[('A',0),('B',.4),('C',.7),('D',1)]
 add('same-facts-different-percent-fresh-host',*[probe('fresh-'+str(p),['A','B','C','D']*3,['A','B','C','D'],scores,p)for p in [0,50,100]])
 assert len(groups)==12
 return groups
DRIVER=r"""package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
private fun units(values:List<String>)=JsonArray(values.map{JsonArray(it.map{ch->JsonPrimitive(ch.code)})})
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 for(value in Json.parseToJsonElement(File(args.single()).readText(Charsets.UTF_8)).jsonArray) {
  val group=value.jsonObject
  println(buildJsonObject {
   put("name",group.getValue("name"));put("probes",buildJsonArray {
    for(value in group.getValue("probes").jsonArray) {
     val input=value.jsonObject
     fun strings(key:String)=input.getValue(key).jsonArray.map{it.jsonPrimitive.content}
     val ranks=strings("songByRank");val valid=strings("validSongIds")
     val pop=input.getValue("popularity").jsonArray.map{it.jsonObject}
     val popularity=pop.associate{it.getValue("songId").jsonPrimitive.content to AuralPopularity(it.getValue("score").jsonPrimitive.doubleOrNull)}
     val host=NativeSongRankHost(ranks,valid.toSet(),popularity) // Fresh cache and one actual call per probe.
     val actual=host.result(input.getValue("percent").jsonPrimitive.int)
     val field=AuralRankEligibility::class.java.getDeclaredField("words");field.isAccessible=true
     val longs=(field.get(actual) as LongArray).copyOf()
     val words=List((ranks.size+31)/32){i->if(i/2<longs.size)(longs[i/2] ushr ((i%2)*32)) and 0xffffffffL else 0L}
     add(buildJsonObject {
      put("name",input.getValue("name"));put("expected",buildJsonObject {put("rankCount",ranks.size);put("words",JsonArray(words.map{JsonPrimitive(it)}))})
      put("nativeLongWords",JsonArray(longs.map{JsonPrimitive(it.toString())}));put("nativeIsEmpty",actual.isEmpty)
      put("decodedUtf16",buildJsonObject {put("songByRank",units(ranks));put("validSongIds",units(valid));put("popularityIds",units(pop.map{it.getValue("songId").jsonPrimitive.content}))})
     })
    }
   })
  })
 }
}
"""
def main():
 WORK.mkdir(parents=True,exist_ok=False)
 catalog=source('AuralCatalog');corpus=source('AuralCorpus');rank=source('AuralRankEligibility')
 lines=catalog.splitlines(keepends=True);clines=corpus.splitlines(keepends=True)
 slices=dict(method=''.join(lines[185:195]),helper=''.join(lines[32:37]),popularity=''.join(clines[82:83]))
 assert slices['method'].lstrip().startswith('@Synchronized private fun eligibleRankBits(')and slices['method'].rstrip().endswith('}')
 assert slices['helper'].rstrip().endswith('}')and'private val words = bits.toLongArray()'in rank
 native='package com.acquiring.android\n'+slices['helper']+slices['popularity']
 adapter='package com.acquiring.android\nimport java.util.BitSet\ninternal class NativeSongRankHost(songByRank:List<String>,private val validSongIds:Set<String>,private val popularity:Map<String,AuralPopularity>) {\nprivate val songByRun=songByRank.toTypedArray()\nprivate val suffix=IntArray(songByRank.size*2){if(it%2==0)it/2 else 0}\nprivate var eligibleRanksCache:Pair<Int,AuralRankEligibility>?=null\nfun result(percent:Int)=eligibleRankBits(percent)\n'+slices['method']+'}\n'
 sources=dict(Native=native,Rank=rank,Adapter=adapter,Driver=DRIVER)
 for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8',newline='\n')
 rows=cases();inputs=WORK/'input.json';inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations')
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n,'1.8.1')for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 assert VERSION=='2.2.10'and all(VERSION in p.name for p in [stdlib,*compiler[:4]])
 java=shutil.which('java');assert java,'Existing Java required; no installs/downloads'
 prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8'];command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8');assert 'kotlinc-jvm 2.2.10 'in version
 compiled=WORK/'classes';result=subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),*[str(WORK/(n+'.kt'))for n in sources]],capture_output=True,cwd=ROOT)
 (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-10000:])
 assert (compiled/'com/acquiring/android/AuralRankEligibility.class').is_file()
 result=subprocess.run(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],capture_output=True,cwd=ROOT)
 (WORK/'stdout.jsonl').write_bytes(result.stdout);(WORK/'runtime.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native execution failed: '+result.stderr.decode('utf-8')[-10000:])
 captured=[json.loads(line)for line in result.stdout.decode('utf-8').split('\n')if line.strip()];assert len(captured)==12
 def units(text):return list(struct.unpack('<'+'H'*(len(text.encode('utf-16-le','surrogatepass'))//2),text.encode('utf-16-le','surrogatepass')))
 merged=[]
 for original,actual in zip(rows,captured):
  assert original['name']==actual['name']and len(original['probes'])==len(actual['probes'])
  probes=[]
  for inp,out in zip(original['probes'],actual['probes']):
   assert inp['name']==out['name'];decoded=out['decodedUtf16']
   assert decoded==dict(songByRank=[units(s)for s in inp['songByRank']],validSongIds=[units(s)for s in inp['validSongIds']],popularityIds=[units(s['songId'])for s in inp['popularity']])
   assert out['expected']['rankCount']==len(inp['songByRank'])and len(out['expected']['words'])==(len(inp['songByRank'])+31)//32
   probes.append(dict(inp,**out))
  merged.append(dict(name=original['name'],probes=probes))
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],wholeSourceSha256=dict(catalog=digest(catalog.encode()),corpus=digest(corpus.encode()),rank=digest(rank.encode())),sliceSha256={k:digest(v.encode())for k,v in slices.items()},extractedSourceSha256={k:digest(v.encode())for k,v in sources.items()},producerSha256=digest(Path(__file__).read_bytes()),nativeInputSha256=digest(inputs.read_bytes()),nativeStdoutSha256=digest(result.stdout),nativeClassSha256={p.name:digest(p.read_bytes())for p in compiled.glob('com/acquiring/android/*.class')},jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([*compiler,*runtime])],adapter='WHOLE unchanged native eligibleRankBits/helper/rank class/popularity declaration. Fresh cache perprobe; only supplied rank-song via suffix/run arrays, validity and popularity bindings. Reflection reads returned actual private Long words; unsigned32 split/zero padding ONLY wire extent adapter. UTF16 unit observations prove exact input decode including lone surrogates without lossy stdout string echo. No predicate replacement/TS truth/SQL/cache/global scan/old recapture. No serialization plugin needed: declarations are nonserializable, actual JSON element runtime used.',cases=merged)
 path=OUT/'native-song-rank.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
 print(json.dumps(dict(groups=12,probes=sum(len(g['probes'])for g in merged),fixtureSha256=digest(path.read_bytes()),producerSha256=fixture['producerSha256'],sliceSha256=fixture['sliceSha256'],nativeWork=str(WORK))))
if __name__=='__main__':main()
