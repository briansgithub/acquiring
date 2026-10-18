"""<=16 NEW native WHOLE builtin initializer projections, frozen801cf798.
Unchanged SavedSession/PlaybackReturn declarations, member defaults57..66 and
WHOLE init80..154 execute with real normalize/theory/generator and actual cached
Kotlin2.2.10 serialization compiler plugin. Only persistence.read/unusedwrite is
mocked; excluded corpus/pattern branches reject. Existing14 oldRaw bytes reused,
no old fixture/RNG/generator recapture or TypeScript expectations. Full native
outputs retained; supported comparison projects nonnull sourcePassage presence.
Navigation stays deferred; Long seed/serial text is fixture adapter only.
"""
from pathlib import Path
from datetime import datetime,timezone
import copy,hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
GEN=runpy.run_path(str(OUT/'generate-generator-native.py'));TOOLS=GEN['TOOLS']
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
source=GEN['source'];OLD=OUT/'native-builtin-current.json'
WORK=ROOT/'.artifacts/pwa-port/t14-initializer-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
AMENDMENT='1c4d55aced3d132ce08b9e5170e7fe39331d8304'


def cases():
 old={r['label']:r for r in json.loads(OLD.read_text(encoding='utf-8'))['cases']}
 supported='supported-false-flags-become-true';independent='ignored-rich-data-and-provenance'
 rows=[]
 def add(label,current=None,**fields):
  # Insert the ORIGINAL current fragment bytes, never a numeric parse/stringify roundtrip.
  parts=[json.dumps(k)+':'+json.dumps(v,ensure_ascii=True,separators=(',',':'))for k,v in fields.items()]
  if current is not None:parts.append('"current":'+old[current]['oldRaw'])
  rows.append(dict(label=label,raw='{'+','.join(parts)+'}'))
 def returned(current=supported,**overrides):
  value=dict(exerciseId=old[current]['expected']['current']['id'],draft=['V','I'],heard=True,answered=True,guidanceVisible=False,
   plays=1000,attempts=1000,assistance=['hint','source-playback'],feedback='Restored return feedback',open=False,fromSongs=True)
  value.update(overrides);return value
 rows.append(dict(label='null-input-defaults',raw=None))
 add('missing-version-native-defaults',serial='9223372036854775807',exampleSettings={'analysis':'allModes','groupingPriority':'mode'})
 add('supported-current-resumed-defaults',supported)
 add('independent-current-resumed-defaults',independent)
 add('matching-return-1000-open-false',supported,playbackReturn=returned())
 add('matching-return-zero-overrides-independent',independent,playbackReturn=returned(independent,plays=0,attempts=0,heard=False,answered=False,guidanceVisible=True,assistance=[],feedback=''))
 saved_old_id=json.loads(old[independent]['oldRaw'])['id']
 assert saved_old_id!=old[independent]['expected']['current']['id']
 add('return-matches-old-id-not-regenerated-id',independent,playbackReturn=returned(independent,exerciseId=saved_old_id))
 add('matching-return-plays1001-stored-not-applied',supported,playbackReturn=returned(plays=1001))
 add('matching-return-attempts-negative-stored-not-applied',independent,playbackReturn=returned(independent,attempts=-1,guidanceVisible=True))
 broken=returned();del broken['draft']
 add('malformed-return-keeps-current-metadata-warning',supported,playbackReturn=broken)
 event=dict(notes=[999,-1],rootMidi=999,bassMidi=-1,degree='arbitrary',functionLabel='unvalidated')
 passage=dict(occurrenceId='occ',patternId='pattern',songId='song',sectionId='section',sourceRevision='revision',startIndex=-3,endIndex=-8,
  view='unvalidated',familyId='unknown',variantId='unknown',keyTonic='not-a-key',keyScale='not-a-scale',tempo=-40,
  events=[event],context=[event],degreeLabels=['arbitrary'],startBeat=-5.0,endBeat=-10.0,extra={'opaque':[True,4]})
 bad_source=copy.deepcopy(passage);del bad_source['sectionId']
 add('malformed-source-rejects-whole-return',supported,playbackReturn=returned(sourcePassage=bad_source))
 add('odd-but-typed-source-and-defaults',supported,playbackReturn=returned(sourcePassage=passage))
 add('history-warning-outranks-return-metadata-warning',supported,sourceHistoryReliable=False,playbackReturn=broken)
 add('current-failure-outranks-history-and-return-warning','top-generator-version-mismatch',sourceHistoryReliable=False,playbackReturn=broken)
 add('version-fresh-blocks-valid-current-and-return',supported,version=3,serial='7',progress={'attempts':3},playbackReturn=returned())
 progress=dict(attempts=2147483647,cells={'dominant-return:guided':dict(practice=-7,practiceCorrect=99,independentAttempts=-3,
  independentCorrect=2147483647,transferCorrect=2147483647,keys=['C','C','bad'],mastered=True,support=-9,lastAt=-1,dueAt=-1,
  streak=-1,recentIndependent=[True],microphonePractice={'root':2147483647,'unknown':9},microphoneIndependent={'root':-1})})
 settings='settings-and-fallback-copied'
 add('real-primary-and-inversion-normalization-with-valid-return',settings,progress=progress,inversionProgress={'version':99,'attempts':2147483647},
  serial='-7',microphoneEnabled={},exampleSettings={'distinguishInversions':False},playbackReturn=returned(settings))
 assert len(rows)==16
 return rows


ENCODER=GEN['DRIVER'].split('fun main(args:Array<String>)')[0].replace('json(','encodeNative(').replace('field=="seed"','field=="seed"||field=="serial"')
assert ENCODER.count('  is Iterable<*>')==1
ENCODER=ENCODER.replace('  is Iterable<*>','  is Map<*,*>->value.entries.joinToString(",","{","}"){quote(it.key.toString())+":"+encodeNative(it.value)}\n  is Iterable<*>')
DUMP=r'''
 fun dump():String = "{\"saved\":"+encodeNative(saved)+",\"state\":{\"assistance\":"+encodeNative(assistance)+
  ",\"plays\":"+plays+",\"attempts\":"+attempts+",\"heard\":"+heard+",\"answered\":"+answered+
  ",\"guidanceVisible\":"+guidanceVisible+",\"feedback\":"+quote(feedback)+"},\"warning\":"+quote(storageWarning)+"}"
'''
DRIVER=ENCODER+r'''
fun main(args:Array<String>){
 check(KotlinVersion.CURRENT.toString()=="2.2.10")
 for(row in Json.parseToJsonElement(File(args[0]).readText()).jsonArray){
  val raw=row.jsonObject.getValue("raw").jsonPrimitive.contentOrNull
  println(NativeInitializer(raw).dump())
 }
}
'''


def main():
 WORK.mkdir(parents=True,exist_ok=False)
 curriculum=source('AuralCurriculum');corpus=source('AuralCorpus');catalog=source('AuralCatalog');session=source('AuralSession')
 declarations=curriculum[curriculum.index('@Serializable data class AuralVariant'):curriculum.index('/** Pure curriculum')]
 declarations+=corpus[corpus.index('@Serializable data class AuralExampleSettings'):corpus.index('internal val AURAL_MODES')]
 declarations+=corpus[corpus.index('@Serializable data class AuralSourcePassage'):corpus.index('@Serializable data class AuralSourceExposure')]
 declarations+=corpus[corpus.index('@Serializable data class AuralSourceExposure'):].splitlines()[0]+'\n'
 declarations+=catalog[catalog.index('@Serializable data class AuralPatternTarget'):catalog.index('internal fun AuralPatternTarget.sourceMode')]
 helpers=curriculum[curriculum.index('    private const val DAY'):curriculum.index('    private fun evidenced')]
 version_line=next(line+'\n'for line in curriculum.splitlines()if line.startswith('    const val GENERATOR_VERSION'))
 generator=curriculum[curriculum.index('    private fun buildEvent'):curriculum.index('    /** Register before playback')]
 pure='package com.acquiring.android\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.*\nimport kotlin.random.Random\n'+declarations+'\nobject AuralCurriculum{\n'+version_line+helpers+generator+'\n}\n'
 pure+='internal fun generatePatternExercise(target:AuralTarget,seed:Long):AuralExercise=error("Pattern branch excluded")\n'
 pure+='internal fun auralWithCorpus(base:AuralExercise,corpus:AuralCorpusProvenance):AuralExercise=error("Corpus branch excluded")\n'
 saved=session[session.index('@Serializable\ninternal data class AuralSavedSession'):session.index('internal interface AuralPersistence')]
 lines=session.splitlines(True);members=''.join(lines[56:66]);init=''.join(lines[79:154])
 assert 'AuralCurriculum.normalize(decoded.progress)'in init and 'decoded.playbackReturn?.takeIf'in init
 host='package com.acquiring.android\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.*\n'+saved
 host+='internal class NativeInitializer(raw:String?){\n private val persistence=object{fun read():String?=raw;fun write(value:String)=true}\n'+members+init+DUMP+'\n}\n'
 names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter','ChordInterpreter','ChordLetterFormat','ChordVoicing']
 sources={n:source(n)for n in names};sources['Curriculum']=pure;sources['Initializer']=host
 engine=source('AudioEngine');enum=engine[engine.index('    enum class Waveform'):engine.index('    enum class PlaybackChannel')]
 sources['AudioEngine']='package com.acquiring.android\nobject AudioEngine{\n'+enum+'}\n'
 for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8',newline='\n')
 driver=WORK/'Driver.kt';driver.write_text(DRIVER,encoding='utf-8',newline='\n')
 rows=cases();inputs=WORK/'input.json';inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
 cached=TOOLS['cached'];annotations=cached('org.jetbrains','annotations');stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION)
 plugin=cached('org.jetbrains.kotlin','kotlin-serialization-compiler-plugin-embeddable',VERSION)
 runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',n,'1.8.1')for n in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 assert VERSION=='2.2.10'and all(VERSION in p.name for p in [plugin,stdlib,*compiler[:4]])
 java=shutil.which('java');assert java;prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
 command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],check=True,capture_output=True,cwd=ROOT).stderr.decode('utf-8');assert 'kotlinc-jvm 2.2.10 'in version
 classes=WORK/'classes';result=subprocess.run(command+['-Xplugin='+str(plugin),'-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(classes),
  *[str(WORK/(n+'.kt'))for n in sources],str(driver)],capture_output=True,cwd=ROOT)
 (WORK/'compiler.stdout').write_bytes(result.stdout);(WORK/'compiler.stderr').write_bytes(result.stderr)
 if result.returncode:raise RuntimeError('Native compile failed: '+result.stderr.decode('utf-8')[-12000:])
 serializers=sorted(p.name for p in classes.glob('com/acquiring/android/*$$serializer.class'))
 assert all(n+'$$serializer.class'in serializers for n in ['AuralSavedSession','AuralPlaybackReturn','AuralExercise','AuralProgress','AuralSourcePassage'])
 output=subprocess.check_output(prefix+['-cp',os.pathsep.join(map(str,[classes,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],cwd=ROOT)
 (WORK/'stdout.jsonl').write_bytes(output);out=output.decode('utf-8').splitlines();assert len(out)==len(rows)
 for row,line in zip(rows,out):
  full=json.loads(line);row['nativeFull']=full;comparison=copy.deepcopy(full)
  returned=comparison['saved']['playbackReturn']
  if returned is not None and returned['sourcePassage']is not None:returned['sourcePassage']='typed-source-passage-present'
  row['expected']=comparison
 by={r['label']:r['expected']for r in rows}
 assert by['matching-return-1000-open-false']['state']['assistance']==['hint','source-playback','source-playback']
 assert by['matching-return-zero-overrides-independent']['state']['guidanceVisible']is True
 for label in ['return-matches-old-id-not-regenerated-id','matching-return-plays1001-stored-not-applied','matching-return-attempts-negative-stored-not-applied']:
  assert by[label]['saved']['playbackReturn']is not None and by[label]['state']['plays']==0
 assert by['version-fresh-blocks-valid-current-and-return']['saved']['current']is None
 assert by['version-fresh-blocks-valid-current-and-return']['saved']['playbackReturn']is None
 assert by['version-fresh-blocks-valid-current-and-return']['warning']=='Saved progress could not be read. Starting fresh for this session.'
 repaired=by['real-primary-and-inversion-normalization-with-valid-return']
 assert repaired['saved']['progress']['attempts']==1000000 and repaired['saved']['progress']['cells']['dominant-return:guided']['practice']==0
 assert repaired['saved']['inversionProgress']['attempts']==0 and repaired['saved']['current']is not None and repaired['state']['plays']==1000
 assert repaired['warning']=='Some saved settings or history could not be read. Valid learning progress has been kept.'
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,contractAmendment=AMENDMENT,kotlinVersion=VERSION,serializationVersion='1.8.1',compilerVersion=version.strip().splitlines()[0],
  serializerClasses=serializers,sessionSha256=digest(session.encode()),savedDeclarationsSha256=digest(saved.encode()),membersSha256=digest(members.encode()),
  initSha256=digest(init.encode()),normalizationHelpersSha256=digest(helpers.encode()),generatorSha256=digest(generator.encode()),
  sourceSha256=digest(curriculum.encode()),declarationsSha256=digest(declarations.encode()),dependencySha256={n:digest(t.encode())for n,t in sources.items()},
  reusedOldRawFixtureSha256=digest(OLD.read_bytes()),producerSha256=digest(Path(__file__).read_bytes()),driverSha256=digest(DRIVER.encode()),
  jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([plugin,*compiler,*runtime])],
  adapter='Unchanged whole native init80..154/member57..66/declarations10..25, real normalize/theory/generator; persistence read only; excluded corpus/pattern reject. Full native output retained, expected comparison uses sourcePassage presence only; original opaque navigation later browser-only. Long seed/serial text adapter. Native normalization total: genuine repair not fabricated exception; unsafe-time fresh later browser extension. No TS/old recapture.',cases=rows)
 path=OUT/'native-initializer.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
 print('Captured16 NEW native WHOLE initializer cases; fixtureSHA256='+digest(path.read_bytes()))
 print('Kotlin compiler/runtime/plugin2.2.10;serialization1.8.1;actualSerializerClasses='+str(len(serializers))+';ignoredWork='+str(WORK))


if __name__=='__main__':main()