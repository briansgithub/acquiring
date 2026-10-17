"""<=16 NEW native session FIELD repair projections, no current/return inputs.
Unchanged frozen constructor/readField/settings/exposure/progress blocks; actual
Kotlin2.2.10 serialization compiler plugin+runtime, not a handwritten native decoder.
Corpus output is presence-only projection: browser preserves validated opaque JSON.
No TS import, old capture, install, Android persistence or full-session parity claim.
"""
from pathlib import Path
import copy,hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT/'generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t14-session-envelope-native'
def source(name):return subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/{name}.kt'],cwd=ROOT).decode('utf-8')
def cases():
 rows=[]
 def add(label,value=None,raw=None):rows.append(dict(label=label,raw=raw if raw is not None else (None if value is None else json.dumps(value,ensure_ascii=True,separators=(',',':')))))
 p=dict(attempts=7,cells={'dominant-return:guided':dict(practice=4,practiceCorrect=4)})
 add('absent')
 add('defaults',{})
 add('metadata-damage-keeps-progress',dict(version=2,progress=p,inversionProgress=p,serial={},microphoneEnabled={},exampleSettings={'popularity':None},sourceHistoryReliable={},sourceExposures={}))
 add('unsupported-version',dict(version=3,progress=p))
 add('structural-version',dict(version={},progress=p))
 add('version-number-lexeme-falls-back1',raw='{"version":2.0,"exampleSettings":{"analysis":"allModes","groupingPriority":"mode"}}')
 add('v2-settings-preserved',dict(version=2,exampleSettings=dict(analysis='allModes',groupingPriority='mode',sortOrder='random',popularity=False)))
 add('progress-decode-damage-isolated',dict(version=2,progress=dict(cells={'dominant-return:guided':{'practice':'bad'}}),inversionProgress=p,serial='9223372036854775807'))
 add('inversion-decode-damage-isolated',dict(progress=p,inversionProgress=dict(cells={'dominant-return:guided':{'practice':None}})))
 add('history-damage-last-wins',dict(progress=p,sourceExposures=[dict(sourceId='a',songId='one',at=1),dict(sourceId='b',songId='two',at=2),dict(sourceId='a',songId='three',at=3),dict(sourceId='x',songId=' ',at=4),dict(sourceId='',songId='bad',at=5),dict(sourceId='z',songId='bad',at=-1)]))
 add('history-unreliable',dict(progress=p,sourceHistoryReliable=False))
 add('progress-version-and-cell-normalization',dict(progress={'version':99,'attempts':100},inversionProgress={'attempts':-2,'cells':{'dominant-return:guided':dict(practice=3,practiceCorrect=9,lastAt=-1,dueAt=-2,mastered=True,support=0)}}))
 add('native-scalar-lexemes',dict(serial='+00012',microphoneEnabled='TrUe',sourceHistoryReliable='FALSE',exampleSettings={'popularity':'true','analysis':123},progress={'attempts':'2'}))
 event=dict(notes=[60,64,67],rootMidi=60,bassMidi=60,degree='I',functionLabel='tonic')
 passage=dict(occurrenceId='o',patternId='p',songId='s',sectionId='sec',sourceRevision='r',startIndex=0,endIndex=2,view='harmony',familyId='dominant-return',variantId='direct',keyTonic='C',keyScale='major',tempo=72,events=[event],context=[event],degreeLabels=['I'])
 corpus=dict(snapshotId='snap',popularityVersion=None,familyMappingVersion='map',passage=passage,settings={},seed='-9223372036854775808',semitoneShift=0)
 attempt=dict(id='h',familyId='dominant-return',skillId='identify',correct=True,independent=True,technicalUncertainty=False,at=10,seed='9223372036854775807',generatorVersion='g',fingerprint='f',key='C',variantId='direct',support=0,transfer=False,assistance=[],plays=1,attempt=1,corpus=corpus)
 add('typed-corpus-and-exact-history-seed',dict(progress={'attempts':3,'recent':[attempt]}))
 broken=copy.deepcopy(attempt);del broken['corpus']['passage']['sectionId']
 add('typed-corpus-required-field-damage',dict(progress={'attempts':3,'recent':[broken]},serial=-2))
 add('explicit-null-field-isolation',dict(progress=None,inversionProgress=p,exampleSettings=None,serial=None,microphoneEnabled=None,sourceExposures=None,sourceHistoryReliable=None))
 assert len(rows)==16
 for row in rows:
  if row['raw']is not None:assert not any(k in json.loads(row['raw'])for k in ['current','playbackReturn'])
 return rows
DRIVER=r'''package com.acquiring.android
import java.io.File
import java.lang.reflect.Modifier
import kotlinx.serialization.json.*
fun quote(s:String)=buildString{append('"');for(c in s)when(c){'"'->append("\\\"");'\\'->append("\\\\");else->if(c.code<32||c.code>=127)append("\\u%04x".format(c.code))else append(c)};append('"')}
fun encode(value:Any?,field:String=""):String=when{
 value==null->"null"
 field=="corpus"->quote("typed-corpus-present")
 value is String->quote(value)
 value is Long->if(field=="seed"||field=="serial")quote(value.toString())else value.toString()
 value is Number||value is Boolean->value.toString()
 value is Iterable<*>->value.joinToString(",","[","]"){encode(it)}
 value is Map<*,*>->value.entries.joinToString(",","{","}"){quote(it.key.toString())+":"+encode(it.value)}
 else->value.javaClass.declaredFields.filter{!it.isSynthetic&&!Modifier.isStatic(it.modifiers)}.joinToString(",","{","}"){it.isAccessible=true;quote(it.name)+":"+encode(it.get(value),it.name)}
}
fun main(args:Array<String>){check(KotlinVersion.CURRENT.toString()=="2.2.10");for(row in Json.parseToJsonElement(File(args[0]).readText()).jsonArray){val raw=row.jsonObject["raw"]?.jsonPrimitive?.contentOrNull;val restored=NativeRepair(raw)
 println("{\"envelope\":"+encode(restored.saved)+",\"warning\":"+quote(restored.storageWarning)+"}")}}
'''
def main():
 WORK.mkdir(parents=True,exist_ok=True)
 session=source('AuralSession');curriculum=source('AuralCurriculum');corpus=source('AuralCorpus');catalog=source('AuralCatalog')
 declarations=curriculum[curriculum.index('@Serializable data class AuralVariant'):curriculum.index('/** Pure curriculum')]
 declarations+=corpus[corpus.index('@Serializable data class AuralExampleSettings'):corpus.index('internal val AURAL_MODES')]
 declarations+=corpus[corpus.index('@Serializable data class AuralSourcePassage'):corpus.index('@Serializable data class AuralSourceExposure')]
 declarations+=corpus[corpus.index('@Serializable data class AuralSourceExposure'):].splitlines()[0]+'\n'
 declarations+=catalog[catalog.index('@Serializable data class AuralPatternTarget'):catalog.index('internal fun AuralPatternTarget.sourceMode')]
 saved=session[session.index('@Serializable\ninternal data class AuralSavedSession'):session.index('internal interface AuralPersistence')]
 helpers=curriculum[curriculum.index('    private const val DAY'):curriculum.index('    private fun evidenced')]
 lines=session.splitlines(True);blocks=''.join(lines[79:123])+ '                val current:AuralExercise?=null\n'+lines[138]+lines[148]+''.join(lines[149:154])
 host='class NativeRepair(raw:String?) {\n private val persistence=object{fun read()=raw}\n val json=Json {ignoreUnknownKeys=true;encodeDefaults=true}\n var saved=AuralSavedSession()\n var storageWarning=""\n'+blocks+'\n}\n'
 text='package com.acquiring.android\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.*\n'+declarations+saved+'\nobject AuralCurriculum{\n'+helpers+'}\n'+host
 # Public fixture host must not expose an internal type publicly.
 text=text.replace('class NativeRepair(raw:String?)','internal class NativeRepair(raw:String?)')
 (WORK/'Repair.kt').write_text(text,encoding='utf-8',newline='\n');(WORK/'Driver.kt').write_text(DRIVER,encoding='utf-8',newline='\n')
 rows=cases();inputs=WORK/'input.json';inputs.write_text(json.dumps(rows),encoding='utf-8')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations');plugin=cached('org.jetbrains.kotlin','kotlin-serialization-compiler-plugin-embeddable',VERSION)
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n)for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 java=shutil.which('java');assert java;prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
 command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode();assert 'kotlinc-jvm 2.2.10 'in version
 compiled=WORK/'classes';subprocess.run(command+['-Xplugin='+str(plugin),'-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(compiled),str(WORK/'Repair.kt'),str(WORK/'Driver.kt')],check=True,cwd=ROOT)
 assert list(compiled.glob('com/acquiring/android/*$$serializer.class')),'Actual serialization plugin did not emit serializers'
 output=subprocess.check_output(prefix+['-cp',os.pathsep.join(map(str,[compiled,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],cwd=ROOT);(WORK/'stdout.jsonl').write_bytes(output)
 lines=output.decode('utf-8').splitlines();assert len(lines)==len(rows)
 for row,line in zip(rows,lines):
  expected=json.loads(line);expected['envelope'].pop('current');expected['envelope'].pop('playbackReturn');row['expected']=expected
 assert len(rows[13]['expected']['envelope']['progress']['recent'])==1,'Valid native typed corpus fixture failed decoding'
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,compilerVersion=version.strip().splitlines()[0],sessionSha256=digest(session.encode()),blocksSha256=digest(blocks.encode()),declarationsSha256=digest(declarations.encode()),helperSha256=digest(helpers.encode()),producerSha256=digest(Path(__file__).read_bytes()),driverSha256=digest(DRIVER.encode()),jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([plugin,*compiler,*runtime])],adapter='Native field blocks80..123/139/149..154 with fixture current=null; inputs omit current/return; real serializers; corpus presence projection only; Long seed/serial text adapter; no TS.',cases=rows)
 path=OUT/'native-session-envelope.json';path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8',newline='\n');print('Captured16 native field-repair projections; SHA256='+digest(path.read_bytes()))
if __name__=='__main__':main()
