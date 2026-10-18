"""<=14 NEW full native builtin-current restore cases, frozen801cf798.
Actual Kotlin2.2.10 serialization plugin decodes COMPLETE old AuralExercise JSON;
unchanged AuralSession125..138 restores via real native generator/theory. Pattern
and corpus branches only reject; never successful stubs. No TypeScript imports,
old fixture recapture or storage/session activation. Long seeds become decimal
text ONLY at portable fixture adapter. Ordinary compiler artifacts stay ignored.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,os,runpy,shutil,subprocess

OUT=Path(__file__).resolve().parent
GEN=runpy.run_path(str(OUT/'generate-generator-native.py'))
TOOLS=GEN['TOOLS']
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
source=GEN['source']
WORK=ROOT/'.artifacts/pwa-port/t14-builtin-current-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')


def cases():
 rows=[]
 def add(label,family='dominant-return',skill='guided',seed='17',patch=None,**target):
  rows.append(dict(label=label,seed=seed,target=dict(familyId=family,skillId=skill,**target),patch=patch or {}))
 add('supported-false-flags-become-true',support=2)
 add('already-true-flags-stay-true',skill='compare',seed='123',support=1,patch={'previouslyExposed':True,'exposureRegistered':True})
 add('independent-transfer-minimum-long','relative-motion','complete','-9223372036854775808',support=0,transfer=True)
 add('supported-transfer-ignored-maximum-long','plagal-return','audiate','9223372036854775807',support=1,transfer=True,patch={'provenance':{'target':{'transfer':True}}})
 for seed in ['9007199254740992','9007199254740993']:
  add('top-seed-wins-'+seed,skill='identify',support=0,patch={'seed':seed,'provenance':{'seed':'-1','generatorVersion':'ignored-provenance-version'}})
 add('ignored-rich-data-and-provenance','secondary-dominant','complete','-812',support=0,patch={
  'id':'obsolete-id','familyId':'obsolete-family','variantId':'obsolete-variant','skillId':'obsolete-skill','support':99,'transfer':True,
  'keyTonic':'not-a-key','tempo':-1,'instrument':'obsolete-instrument','events':[],'context':[],'fullDegrees':['obsolete'],
  'gapIndex':123,'options':[{'id':'obsolete','label':'obsolete','degrees':['wrong']}],
  'answer':{'degrees':['wrong'],'optionId':'missing','targetMidis':[999]},'responseType':'obsolete',
  'microphoneTask':{'kind':'obsolete','label':'old task','eventIndices':[99],'targetMidis':[999],'scaleDegree':99},
  'fingerprint':'obsolete-fingerprint','prompt':'old prompt','referenceRequired':False,'guidance':'old guidance',
  'provenance':{'generatorVersion':'ignored-version','seed':'9223372036854775807','variantId':'ignored-variant','keyTonic':'ignored-key',
    'tempo':-1,'instrument':'ignored-instrument','inversions':[-9],'register':999,'spreads':[True],'contextDegrees':['ignored']}})
 settings=dict(popularity=False,variety=False,favorites=True,distinguishInversions=True,flatList=True,
  analysis='unrestricted analysis',modeFilter='unrestricted mode',groupingPriority='unrestricted grouping',sortOrder='unrestricted sort')
 add('settings-and-fallback-copied',seed='9234',patch={'provenance':{'exampleSettings':settings,'fallbackReason':'Saved fallback \u2192 unchanged'}})
 add('explicit-null-metadata-stays-null',seed='9',patch={'provenance':{'exampleSettings':None,'fallbackReason':None}})
 add('microphone-and-selection-overrides','secondary-dominant','reproduce','321',support=0,transfer=True,
  microphoneKind='rootSequence',variantId='departure',instrumentOverride='CLARINET',octaveShift=1)
 add('supported-selection-overrides',skill='compare',seed='333',support=2,variantId='departure',instrumentOverride='WARM_ORGAN',octaveShift=1)
 add('top-generator-version-mismatch',seed='-1',patch={'generatorVersion':'stale-top-version'})
 add('invalid-target-family',patch={'provenance':{'target':{'familyId':'missing-family'}}})
 add('invalid-target-support',patch={'provenance':{'target':{'support':3}}})
 assert len(rows)==14
 return rows


DRIVER=GEN['DRIVER'].split('fun main(args:Array<String>)')[0]+r'''
fun merge(base:JsonElement, patch:JsonElement):JsonElement {
 if(base !is JsonObject || patch !is JsonObject) return patch
 val fields=base.toMutableMap()
 for((key,value)in patch)fields[key]=fields[key]?.let{merge(it,value)} ?: value
 return JsonObject(fields)
}
fun main(args:Array<String>) {
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 val codec=Json {ignoreUnknownKeys=true;encodeDefaults=true}
 for(input in Json.parseToJsonElement(File(args[0]).readText()).jsonArray) {
  val row=input.jsonObject
  val target=codec.decodeFromJsonElement<AuralTarget>(row.getValue("target"))
  val base=AuralCurriculum.generate(target,row.getValue("seed").jsonPrimitive.content.toLong())
  val element=merge(codec.encodeToJsonElement(AuralExercise.serializer(),base),row.getValue("patch"))
  // Eligibility is complete native typed JSON decoding, not just a small projection.
  val old=codec.decodeFromJsonElement<AuralExercise>(element)
  check(old.provenance.corpus==null && old.provenance.target.pattern==null)
  val projection=buildJsonObject {
   put("seed",old.seed.toString());put("generatorVersion",old.generatorVersion)
   put("provenance",buildJsonObject {
    put("target",codec.encodeToJsonElement(AuralTarget.serializer(),old.provenance.target));put("corpus",JsonNull)
    put("exampleSettings",old.provenance.exampleSettings?.let{codec.encodeToJsonElement(AuralExampleSettings.serializer(),it)} ?: JsonNull)
    put("fallbackReason",old.provenance.fallbackReason?.let{JsonPrimitive(it)} ?: JsonNull)
   })
  }
  val restored=NativeCurrent(JsonObject(mapOf("current" to element)))
  println("{\"input\":"+projection+",\"oldRaw\":"+quote(element.toString())+
   ",\"expected\":{\"current\":"+json(restored.current)+",\"warning\":"+quote(restored.storageWarning)+"}}")
 }
}
'''


def main():
 WORK.mkdir(parents=True,exist_ok=False)
 original=source('AuralCurriculum');corpus=source('AuralCorpus');catalog=source('AuralCatalog');session=source('AuralSession')
 declarations=original[original.index('@Serializable data class AuralVariant'):original.index('@Serializable data class AuralCell')]
 declarations+=corpus[corpus.index('@Serializable data class AuralExampleSettings'):corpus.index('internal val AURAL_MODES')]
 declarations+=corpus[corpus.index('@Serializable data class AuralSourcePassage'):corpus.index('@Serializable data class AuralSourceExposure')]
 declarations+=catalog[catalog.index('@Serializable data class AuralPatternTarget'):catalog.index('internal fun AuralPatternTarget.sourceMode')]
 metadata=original[original.index('    const val GENERATOR_VERSION'):original.index('    private const val DAY')]
 metadata+=original[original.index('    val microphoneKinds'):original.index('    private val familyIds')]
 metadata+=next(line+'\n'for line in original.splitlines()if line.startswith('    private val skillIds'))
 generator=original[original.index('    private fun buildEvent'):original.index('    /** Register before playback')]
 pure='package com.acquiring.android\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.*\nimport kotlin.random.Random\n'+declarations+'\nobject AuralCurriculum {\n'+metadata+generator+'\n}\n'
 pure+='internal fun generatePatternExercise(target:AuralTarget,seed:Long):AuralExercise = error("Pattern branch excluded from builtin-current fixture")\n'
 pure+='internal fun auralWithCorpus(base:AuralExercise,corpus:AuralCorpusProvenance):AuralExercise = error("Corpus branch excluded from builtin-current fixture")\n'
 restore=''.join(session.splitlines(True)[124:138])
 assert 'json.decodeFromJsonElement<AuralExercise>(element)'in restore
 assert 'AuralCurriculum.generate(old.provenance.target, old.seed)'in restore
 host='package com.acquiring.android\nimport kotlinx.serialization.json.*\ninternal class NativeCurrent(envelope:JsonObject) {\n private val json=Json {ignoreUnknownKeys=true;encodeDefaults=true}\n var storageWarning=""\n'+restore+'\n}\n'
 names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter','ChordInterpreter','ChordLetterFormat','ChordVoicing']
 sources={name:source(name)for name in names};sources['Generator']=pure;sources['Restore']=host
 engine=source('AudioEngine');enum=engine[engine.index('    enum class Waveform'):engine.index('    enum class PlaybackChannel')]
 sources['AudioEngine']='package com.acquiring.android\nobject AudioEngine {\n'+enum+'}\n'
 for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8',newline='\n')
 driver=WORK/'Driver.kt';driver.write_text(DRIVER,encoding='utf-8',newline='\n')
 rows=cases();inputs=WORK/'input.json';inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
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
 result=subprocess.run(command+['-Xplugin='+str(plugin),'-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),
  *[str(WORK/(name+'.kt'))for name in sources],str(driver)],capture_output=True,cwd=ROOT)
 (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-12000:])
 serializer_names=sorted(p.name for p in compiled.glob('com/acquiring/android/*$$serializer.class'))
 assert all(name+'$$serializer.class'in serializer_names for name in ['AuralExercise','AuralProvenance','AuralTarget','AuralExampleSettings'])
 output=subprocess.check_output(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],cwd=ROOT)
 (WORK/'stdout.jsonl').write_bytes(output);lines=output.decode('utf-8').splitlines();assert len(lines)==len(rows)
 for row,line in zip(rows,lines):row.update(json.loads(line))
 successful=[r for r in rows if r['expected']['current']is not None]
 assert len(successful)==11
 for row in successful:
  current=row['expected']['current'];assert current['previouslyExposed']and current['exposureRegistered']
  assert current['seed']==row['input']['seed']==current['provenance']['seed']
  assert current['provenance']['exampleSettings']==row['input']['provenance']['exampleSettings']
  assert current['provenance']['fallbackReason']==row['input']['provenance']['fallbackReason']
  assert row['expected']['warning']==''
 assert all(r['expected']['warning']=='The unfinished example could not be restored. Your learning progress has been kept.'for r in rows if r not in successful)
 ignored=next(r for r in rows if r['label']=='ignored-rich-data-and-provenance')
 assert json.loads(ignored['oldRaw'])['id']!=ignored['expected']['current']['id']
 assert {r['input']['seed']for r in rows if r['label'].startswith('top-seed-wins-')}=={'9007199254740992','9007199254740993'}
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],
  serializerClasses=serializer_names,sessionSha256=digest(session.encode()),restoreBlockSha256=digest(restore.encode()),
  generatorSha256=digest(generator.encode()),metadataSha256=digest(metadata.encode()),declarationsSha256=digest(declarations.encode()),
  sourceSha256=digest(original.encode()),dependencySha256={n:digest(t.encode())for n,t in sources.items()},
  producerSha256=digest(Path(__file__).read_bytes()),driverSha256=digest(DRIVER.encode()),
  jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([plugin,*compiler,*runtime])],
  adapter='Complete old native AuralExercise JSON decoded by actual serializer; unchanged125..138 restore and real native generator/theory; corpus/pattern excluded with reject-only stubs. Input projection after typed eligibility; full restored output; only Long seed text adapter. No TS/old recapture/storage.',cases=rows)
 path=OUT/'native-builtin-current.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
 print('Captured14 NEW builtin-current cases:11 full native restored outputs/3 native failures; fixtureSHA256='+digest(path.read_bytes()))
 print('Compiler/runtime/plugin Kotlin2.2.10; serialization1.8.1; actual serializerClasses='+str(len(serializer_names))+'; ignoredWork='+str(WORK))


if __name__=='__main__':main()