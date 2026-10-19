"""<=20 new actual frozen801cf798 statistics/factor/comparator groups.
Only selected suffix/run/song inputs are bound; no SQL simulation, arithmetic
replacement, TS expectations or old fixture execution. Cached Kotlin2.2.10 only.
"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT.parents[1]/'learning/fixtures/generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t15-statistics-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
def source(name):return subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/{name}.kt'],cwd=ROOT).decode('utf-8')
def cases():
 groups=[]
 def run(id=0,song='A',section='section'):return dict(id=id,songId=song,sectionId=section)
 def pop(song='A',score=.5,confidence=1):return dict(songId=song,score=score,confidence=confidence)
 def stats(name,offsets=(0,),**changes):
  value=dict(name=name,targetLength=3,occurrences=[dict(runId=0,offset=o)for o in offsets],runs=[run()],validSongIds=['A'],popularity=[pop()],settings=dict(popularity=True,variety=True,favorites=False),recentSongIds=[],favoriteSongIds=[],minimumPopularityPercent=None)
  value.update(changes);return value
 def add(name,*probes,kind='stats'):groups.append(dict(name=name,kind=kind,probes=list(probes)))
 add('empty-invalid-and-wrapper',stats('empty',()),stats('invalid-song',validSongIds=[]),stats('empty-wrapper',(),statsWrapper=True))
 add('duplicates-valid-and-global',stats('duplicate-offsets',(0,0,3,3)),stats('valid-and-invalid',occurrences=[dict(runId=0,offset=0),dict(runId=1,offset=0),dict(runId=0,offset=0)],runs=[run(),run(1,'B')]))
 songs=['A','B','C','D','E','F']; common=dict(runs=[run(i,s)for i,s in enumerate(songs)],validSongIds=songs,popularity=[pop(s,v)for s,v in zip(songs,[.499999999999,.5,1,None,1.1,-.1])],occurrences=[dict(runId=i,offset=0)for i in range(6)])
 add('threshold-boundaries-and-null',*[stats('threshold-'+str(p),minimumPopularityPercent=p,**common)for p in [None,0,50,100]])
 add('global-counts-before-filter',stats('all-filtered',(0,3),minimumPopularityPercent=60),stats('global-songs-and-occurrences',minimumPopularityPercent=75,**dict(common,popularity=[pop(s,.9 if s=='A'else .1)for s in songs],occurrences=[dict(runId=i,offset=0)for i in [0,1,1,2,3,4,5,5]])))
 add('overlap-touch-sort-and-length',stats('unsorted-touch',(6,2,0,3,1,3)),stats('length2',(0,1,2,3,4),targetLength=2),stats('long-overlap',(0,1,2,9999,10000),targetLength=10000))
 sameRuns=[run(i,'A','s'+str(i))for i in range(6)]
 add('run-change-retains-song-cap',stats('reset-on-run',occurrences=[dict(runId=i,offset=0)for i in [2,0,1]],runs=sameRuns),stats('six-runs-cap-four',occurrences=[dict(runId=i,offset=0)for i in range(6)],runs=sameRuns))
 add('two-songs-cap-four-each',stats('per-song-not-global',occurrences=[dict(runId=i//6,offset=(i%6)*3)for i in range(12)],runs=[run(),run(1,'B')],validSongIds=['A','B'],popularity=[]))
 add('sections-count-even-after-cap',stats('all-six-sections',occurrences=[dict(runId=i,offset=0)for i in range(6)],runs=sameRuns),stats('sectionid-alone',occurrences=[dict(runId=0,offset=0),dict(runId=1,offset=0)],runs=[run(0,'A','same'),run(1,'B','same')],validSongIds=['A','B']))
 add('popularity-clamps',*[stats('clamp-'+str(i),popularity=[pop(score=s,confidence=c)])for i,(s,c)in enumerate([(-2,2),(2,2),(1,-1),(0,3),(.25,.4),(None,1)])])
 add('factor-all-toggle-combinations',*[stats('flags-'+str(i),settings=dict(popularity=bool(i&1),variety=bool(i&2),favorites=bool(i&4)),popularity=[pop(score=1)],recentSongIds=['A'],favoriteSongIds=['A'])for i in range(8)])
 add('recency-first-index-boundaries',*[stats('recent-'+str(i),recentSongIds=['x']*i+['A']+['x']*12+['A'])for i in [0,2,3,9,10]])
 add('favorites-and-no-popularity',stats('favorite-duplicates',settings=dict(popularity=True,variety=True,favorites=True),favoriteSongIds=['A','A']),stats('missing-popularity',popularity=[]),stats('null-popularity',popularity=[pop(score=None,confidence=10)]))
 sumRuns=[run(i,'s'+str(i))for i in range(9)];sumPop=[pop('s'+str(i),score=[.123456789,1,.7][i%3],confidence=[.43210987,.9,.2][i%3])for i in range(9)]
 add('first-seen-factor-sum',*[stats(name,runs=sumRuns,validSongIds=[r['songId']for r in sumRuns],popularity=sumPop,occurrences=[dict(runId=i,offset=0)for i in order],recentSongIds=['s4','s8'],favoriteSongIds=['s1'],settings=dict(popularity=True,variety=True,favorites=True))for name,order in [('forward',list(range(9))),('reverse',list(reversed(range(9)))),('interleaved',[4,8,0,7,3,1,6,2,5])]])
 add('safe-native-end-and-max-length',stats('int-end-boundary',(2147483645,),targetLength=3),stats('max-length-end',(2147473648,),targetLength=10000),stats('signedzero-popularity',popularity=[pop(score=-0.0,confidence=-0.0)]))
 add('section-and-song-text-identity',stats('empty-section',runs=[run(section='')]),stats('prototype-and-nul',runs=[run(song='__proto__',section='s\0x')],validSongIds=['__proto__'],popularity=[pop('__proto__',1)]))
 add('duplicate-valid-and-missing-population',stats('duplicate-valid-list',(0,3),validSongIds=['A','A']),stats('null-vs-missing-threshold',minimumPopularityPercent=0,popularity=[]))
 def row(id,**changes):
  value=dict(id=id,length=3,songs=1,occurrences=2,sections=1,effective=1,score=2.0,globalSongs=1,globalOccurrences=2);value.update(changes);return value
 def cmp(name,rows,orders):return dict(name=name,rows=rows,orders=orders)
 add('recommended-default-unknown-hierarchy',cmp('recommended',[row('base'),row('score',score=3),row('songs',songs=2),row('length',length=4),row('a'),row('z')],[None,'recommended','unknown','MOSTSONGS']),kind='compare')
 add('mostsongs-global-hierarchy',cmp('mostsongs',[row('base',songs=100),row('globalSongs',globalSongs=2),row('globalOccurrences',globalOccurrences=3),row('length',length=4),row('a'),row('z')],['mostSongs']),kind='compare')
 add('longest-shortest-hierarchy',cmp('lengths',[row('base'),row('long',length=4),row('short',length=2),row('globalSongs',globalSongs=2),row('globalOccurrences',globalOccurrences=3),row('a'),row('z')],['longest','shortest']),kind='compare')
 add('utf16-signedzero-and-stable-ties',cmp('utf16',[row(x)for x in ['\ue000','😀','a','A','é','e\u0301','a\0b','a']],[None,'mostSongs','longest','shortest']),cmp('signedzero',[row('positive-zero',score=0.0),row('negative-zero',score=-0.0),row('negative',score=-1.0),row('positive',score=1.0)],['recommended']),kind='compare')
 assert len(groups)==20
 return groups
DRIVER=r"""package com.acquiring.android
import java.io.File
import kotlinx.serialization.json.*
private val output=Json { encodeDefaults=true }
private fun rowJson(row:AuralCatalogRow)=buildJsonObject {
 put("songs",row.songs);put("occurrences",row.occurrences);put("sections",row.sections);put("effective",row.effective);put("score",row.score);put("globalSongs",row.globalSongs);put("globalOccurrences",row.globalOccurrences)
}
private fun target(id:String,length:Int,end:Int)=AuralPatternTarget(id,"fixture",List(length){"fixture-token"},emptyList(),0,end,"fixture-snapshot")
private fun stats(input:JsonObject):JsonElement {
 val runs=input.getValue("runs").jsonArray.map{it.jsonObject};val size=(runs.maxOfOrNull{it.getValue("id").jsonPrimitive.int} ?: -1)+1
 val songByRun=Array(size){""};val sectionByRun=Array(size){""}
 for(run in runs) { val id=run.getValue("id").jsonPrimitive.int;songByRun[id]=run.getValue("songId").jsonPrimitive.content;sectionByRun[id]=run.getValue("sectionId").jsonPrimitive.content }
 val occurrences=input.getValue("occurrences").jsonArray;val suffix=occurrences.flatMap{listOf(it.jsonObject.getValue("runId").jsonPrimitive.int,it.jsonObject.getValue("offset").jsonPrimitive.int)}.toIntArray()
 val popularity=input.getValue("popularity").jsonArray.associate{v->val p=v.jsonObject;p.getValue("songId").jsonPrimitive.content to AuralPopularity(p.getValue("score").jsonPrimitive.doubleOrNull,p.getValue("confidence").jsonPrimitive.double)}
 fun strings(name:String)=input.getValue(name).jsonArray.map{it.jsonPrimitive.content}
 val host=NativeStatisticsHost(suffix,songByRun,sectionByRun,strings("validSongIds").toSet(),popularity)
 val settings=output.decodeFromJsonElement(AuralExampleSettings.serializer(),input.getValue("settings"));val recent=strings("recentSongIds");val favorites=strings("favoriteSongIds").toSet()
 val target=target("stats-input",input.getValue("targetLength").jsonPrimitive.int,occurrences.size-1)
 if(input["statsWrapper"]?.jsonPrimitive?.boolean==true)return try { rowJson(host.stats(target,settings,recent,favorites)) }catch(e:Exception){buildJsonObject{put("failure",e.javaClass.name)}}
 val row=host.statsMatching(target,settings,recent,favorites,input["minimumPopularityPercent"]?.jsonPrimitive?.intOrNull)
 return row?.let{rowJson(it)} ?: JsonNull
}
private fun compare(input:JsonObject)=buildJsonArray {
 val rows=input.getValue("rows").jsonArray.map{v->val r=v.jsonObject;fun int(k:String)=r.getValue(k).jsonPrimitive.int
  AuralCatalogRow(target(r.getValue("id").jsonPrimitive.content,int("length"),0),int("songs"),int("occurrences"),int("sections"),int("effective"),r.getValue("score").jsonPrimitive.double,int("globalSongs"),int("globalOccurrences")) }
 for(value in input.getValue("orders").jsonArray) {
  val order=value.jsonPrimitive.contentOrNull;val comparator=if(order==null)NativeStatisticsHost.rowOrder()else NativeStatisticsHost.rowOrder(order)
  add(buildJsonObject { put("order",value);put("sortedIndices",JsonArray(rows.indices.sortedWith{a,b->comparator.compare(rows[a],rows[b])}.map{JsonPrimitive(it)}))
   put("signs",buildJsonArray { for(a in rows)add(JsonArray(rows.map{b->JsonPrimitive(Integer.signum(comparator.compare(a,b)))})) }) })
 }
}
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 for(value in output.parseToJsonElement(File(args.single()).readText(Charsets.UTF_8)).jsonArray) {
  val group=value.jsonObject;val kind=group.getValue("kind").jsonPrimitive.content
  println(JsonObject(group+mapOf("probes" to buildJsonArray { for(probe in group.getValue("probes").jsonArray) {
   val input=probe.jsonObject;add(JsonObject(input+mapOf("expected" to if(kind=="stats")stats(input)else compare(input))))
  } })))
 }
}
"""
def main():
 WORK.mkdir(parents=True,exist_ok=False)
 catalog=source('AuralCatalog');corpus=source('AuralCorpus');lines=catalog.splitlines(keepends=True);clines=corpus.splitlines(keepends=True)
 slices=dict(targetDeclaration=''.join(lines[14:15]),rowDeclaration=''.join(lines[18:22]),minimumPopularity=''.join(lines[32:37]),base=''.join(lines[47:48]),statsFactor=''.join(lines[146:185]),comparator=''.join(lines[546:556]),settingsDeclaration=''.join(clines[8:17]),popularityDeclaration=''.join(clines[82:83]))
 assert 'end = start + target.tokens.size - 1'in slices['statsFactor'] and slices['statsFactor'].rstrip().endswith('}')
 assert slices['comparator'].rstrip().endswith('}') and 'private fun factor('in slices['statsFactor']
 native='package com.acquiring.android\nimport kotlin.math.log2\nimport kotlinx.serialization.Serializable\n'+''.join(slices[k]for k in ['targetDeclaration','rowDeclaration','minimumPopularity','base','settingsDeclaration','popularityDeclaration'])
 adapter='package com.acquiring.android\ninternal class NativeStatisticsHost(private val suffix:IntArray,private val songByRun:Array<String>,private val sectionByRun:Array<String>,private val validSongIds:Set<String>,private val popularity:Map<String,AuralPopularity>) {\n'+slices['statsFactor']+'\ncompanion object {\n'+slices['comparator']+'\n}\n}\n'
 sources=dict(Native=native,Adapter=adapter,Driver=DRIVER)
 for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8',newline='\n')
 inputs=WORK/'input.json';rows=cases();inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations');plugin=cached('org.jetbrains.kotlin','kotlin-serialization-compiler-plugin-embeddable',VERSION)
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n,'1.8.1')for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 assert VERSION=='2.2.10'and all(VERSION in p.name for p in [stdlib,plugin,*compiler[:4]])
 java=shutil.which('java');assert java,'Existing Java required; no install/download'
 prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8'];command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8');assert 'kotlinc-jvm 2.2.10 'in version
 compiled=WORK/'classes';result=subprocess.run(command+['-Xplugin='+str(plugin),'-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),*[str(WORK/(name+'.kt'))for name in sources]],capture_output=True,cwd=ROOT)
 (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-10000:])
 serializers=sorted(p.name for p in compiled.glob('com/acquiring/android/*$$serializer.class'));assert serializers==['AuralExampleSettings$$serializer.class','AuralPatternTarget$$serializer.class'],serializers
 result=subprocess.run(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],capture_output=True,cwd=ROOT)
 (WORK/'stdout.jsonl').write_bytes(result.stdout);(WORK/'runtime.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native execution failed: '+result.stderr.decode('utf-8')[-10000:])
 captured=[json.loads(line)for line in result.stdout.decode('utf-8').split('\n')if line.strip()];assert len(captured)==20
 for original,actual in zip(rows,captured):
  assert original['name']==actual['name']and original['kind']==actual['kind']and len(original['probes'])==len(actual['probes'])
  for inp,probe in zip(original['probes'],actual['probes']):assert inp=={k:v for k,v in probe.items()if k!='expected'}
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],serializerClasses=serializers,wholeCatalogSha256=digest(catalog.encode()),wholeCorpusSha256=digest(corpus.encode()),sliceSha256={k:digest(v.encode())for k,v in slices.items()},extractedSourceSha256={k:digest(v.encode())for k,v in sources.items()},producerSha256=digest(Path(__file__).read_bytes()),nativeInputSha256=digest(inputs.read_bytes()),nativeStdoutSha256=digest(result.stdout),nativeClassSha256={p.name:digest(p.read_bytes())for p in compiled.glob('com/acquiring/android/*.class')},jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([plugin,*compiler,*runtime])],adapter='Unchanged complete native factor/stats/statsMatching/base/popularity/comparator and declarations. Selected suffix pairs, array song/section lookup, valid-song set and popularity map are input bindings only; no SQLite behavior, replacement arithmetic, TS expectations or old capture. Native comparator output includes all pair signs and stable ordered input indices. Browser numeric/resource domain refusals separate.',cases=captured)
 path=OUT/'native-statistics.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
 print(json.dumps(dict(groups=20,probes=sum(len(g['probes'])for g in captured),statsGroups=16,comparatorGroups=4,fixtureSha256=digest(path.read_bytes()),producerSha256=fixture['producerSha256'],sliceSha256=fixture['sliceSha256'],ignoredWork=str(WORK))))
if __name__=='__main__':main()
