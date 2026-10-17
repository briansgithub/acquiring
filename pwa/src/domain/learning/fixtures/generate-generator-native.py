"""Capture <=32 NEW builtin exercise expectations from unchanged frozen801cf798.
Uses real native theory and exact Kotlin2.2.10 compiler/runtime, no TypeScript imports.
Only the excluded pattern generator is stubbed to reject. Seed Long -> decimal text
is a fixture serialization boundary; no native reducer/generator logic is changed.
Compiler/input/output products remain ignored; portable fixture is intentional Git data.
"""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess

OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT/'generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[key] for key in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t14-generator-native'

def source(name):
    return subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/{name}.kt'],cwd=ROOT).decode('utf-8')

def cases():
    rows=[]
    families=['dominant-return','plagal-return','predominant-cadence','deceptive-return','relative-motion','secondary-dominant']
    def add(label,family='dominant-return',skill='guided',seed='0',**target):
        rows.append(dict(label=label,seed=seed,target=dict(familyId=family,skillId=skill,**target)))
    for family,skill,seed in zip(families,['guided','compare','identify','recall','complete','audiate'],
        ['0','-1','-9223372036854775808','9223372036854775807','9007199254740992','9007199254740993']):
        add('supported-'+family,family,skill,seed,support=2,reason='native fixture reason')
    for family,skill,seed,variant in zip(families,['identify','complete','compare','audiate','recall','guided'],
        ['432','811','45','128','1','4294967297'],['departure','departure','departure','prepared','cadence','departure']):
        add('independent-'+family,family,skill,seed,support=0,variantId=variant)
    for family,skill in zip(families,['guided','compare','identify','recall','complete','audiate']):
        add('supported-transfer-ignored-'+family,family,skill,'128',support=1,transfer=True)
    for kind in ['root','bass','scaleDegree','rootSequence']:
        add('microphone-'+kind,'secondary-dominant','reproduce','811',support=0,transfer=True,microphoneKind=kind,variantId='departure')
    add('automatic-microphone-supported',skill='reproduce',seed='128',support=2)
    add('automatic-microphone-independent','relative-motion','reproduce','432',support=0)
    add('legacy-sine-alias',instrumentOverride='SINE')
    add('transfer-context','relative-motion','identify','432',support=0,transfer=True)
    add('settings-instrument-octave','secondary-dominant','complete','811',support=1,instrumentOverride='CLARINET',octaveShift=1)
    add('settings-instrument-base','secondary-dominant','complete','811',support=1,instrumentOverride='CLARINET')
    add('legacy-soft-alias','deceptive-return','identify','45',support=0,instrumentOverride='WARM_ORGAN')
    add('legacy-triangle-alias','relative-motion','identify','432',support=0,instrumentOverride='TRIANGLE')
    add('explicit-variant-supported',skill='compare',support=2,variantId='departure')
    add('transfer-ignored-at-support2',support=2,transfer=True)
    assert len(rows)==32
    return rows

DRIVER=r'''package com.acquiring.android
import java.io.File
import java.lang.reflect.Modifier
import kotlinx.serialization.json.*
fun quote(text:String):String = text.map {c->when(c) {
  '"'->"\\\""; '\\'->"\\\\"; else->if(c.code<32 || c.code>=127) "\\u%04x".format(c.code) else c.toString()
}}.joinToString("","\"","\"")
fun json(value:Any?, field:String=""):String = when(value) {
  null->"null"
  is String->quote(value)
  is Long->if(field=="seed") quote(value.toString()) else value.toString()
  is Number,is Boolean->value.toString()
  is JsonElement->value.toString()
  is Iterable<*>->value.joinToString(",","[","]") {json(it)}
  else->value.javaClass.declaredFields.filter {!it.isSynthetic && !Modifier.isStatic(it.modifiers)}
    .joinToString(",","{","}") {it.isAccessible=true;quote(it.name)+":"+json(it.get(value),it.name)}
}
fun main(args:Array<String>) {
  check(KotlinVersion.CURRENT.toString()=="2.2.10")
  for(input in Json.parseToJsonElement(File(args[0]).readText()).jsonArray) {
    val row=input.jsonObject;val t=row.getValue("target").jsonObject
    fun text(key:String)=t[key]?.jsonPrimitive?.contentOrNull
    val target=AuralTarget(t.getValue("familyId").jsonPrimitive.content,t.getValue("skillId").jsonPrimitive.content,
      t["support"]?.jsonPrimitive?.int ?: 2,t["transfer"]?.jsonPrimitive?.boolean ?: false,text("reason") ?: "",
      text("microphoneKind"),text("variantId"),text("instrumentOverride"),t["octaveShift"]?.jsonPrimitive?.int ?: 0)
    println(json(AuralCurriculum.generate(target,row.getValue("seed").jsonPrimitive.content.toLong())))
  }
}
'''

def main():
    WORK.mkdir(parents=True,exist_ok=True)
    original=source('AuralCurriculum');corpus=source('AuralCorpus');catalog=source('AuralCatalog')
    declarations=original[original.index('@Serializable data class AuralVariant'):original.index('@Serializable data class AuralCell')]
    declarations+=corpus[corpus.index('@Serializable data class AuralExampleSettings'):corpus.index('internal val AURAL_MODES')]
    declarations+=corpus[corpus.index('@Serializable data class AuralSourcePassage'):corpus.index('@Serializable data class AuralSourceExposure')]
    declarations+=catalog[catalog.index('@Serializable data class AuralPatternTarget'):catalog.index('internal fun AuralPatternTarget.sourceMode')]
    metadata=original[original.index('    const val GENERATOR_VERSION'):original.index('    private const val DAY')]
    metadata+=original[original.index('    val microphoneKinds'):original.index('    private val familyIds')]
    metadata+=next(line+'\n' for line in original.splitlines() if line.startswith('    private val skillIds'))
    generator=original[original.index('    private fun buildEvent'):original.index('    /** Register before playback')]
    pure='package com.acquiring.android\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.*\nimport kotlin.random.Random\n'+declarations+'\nobject AuralCurriculum {\n'+metadata+generator+'\n}\n'
    pure+='internal fun generatePatternExercise(target:AuralTarget,seed:Long):AuralExercise = error("Pattern branch excluded from builtin fixture")\n'
    names=['MusicTheory','HooktheoryModels','SpelledInterval','RelativeIonianContext','AudioPitchAdapter','ChordInterpreter','ChordLetterFormat','ChordVoicing']
    sources={name:source(name) for name in names}
    sources['Generator']=pure
    engine=source('AudioEngine')
    enum=engine[engine.index('    enum class Waveform'):engine.index('    enum class PlaybackChannel')]
    sources['AudioEngine']='package com.acquiring.android\nobject AudioEngine {\n'+enum+'}\n'
    for name,text in sources.items():(WORK/(name+'.kt')).write_text(text,encoding='utf-8',newline='\n')
    driver=WORK/'Driver.kt';driver.write_text(DRIVER,encoding='utf-8',newline='\n')
    rows=cases();inputs=WORK/'input.json';inputs.write_text(json.dumps(rows,ensure_ascii=True),encoding='utf-8')
    cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations')
    runtime=[stdlib,annotations,*[cached('org.jetbrains.kotlinx',name) for name in ['kotlinx-serialization-json-jvm','kotlinx-serialization-core-jvm']]]
    compiler=[cached('org.jetbrains.kotlin',name,VERSION) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:raise RuntimeError('Existing Java required')
    prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
    command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
    version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8')
    assert 'kotlinc-jvm 2.2.10 ' in version,version
    classes=WORK/'classes'
    subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(classes),
      *[str(WORK/(name+'.kt')) for name in sources],str(driver)],check=True,cwd=ROOT)
    output=subprocess.check_output(prefix+['-cp',os.pathsep.join(map(str,[classes,*runtime])),'com.acquiring.android.DriverKt',str(inputs)],cwd=ROOT)
    (WORK/'stdout.jsonl').write_bytes(output)
    lines=output.decode('utf-8').splitlines();assert len(lines)==len(rows)
    for row,line in zip(rows,lines):row['expected']=json.loads(line)
    digest=lambda blob:hashlib.sha256(blob).hexdigest()
    fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,compilerVersion=version.strip().splitlines()[0],
      generatorSha256=digest(generator.encode()),metadataSha256=digest(metadata.encode()),declarationsSha256=digest(declarations.encode()),
      sourceSha256=digest(original.encode()),dependencySha256={name:digest(text.encode()) for name,text in sources.items()},
      producerSha256=digest(Path(__file__).read_bytes()),driverSha256=digest(driver.read_bytes()),
      jars=[dict(file=path.name,sha256=digest(path.read_bytes())) for path in dict.fromkeys([*compiler,*runtime])],
      adapter='Unchanged frozen generator/helpers/metadata/declarations and real native theory; only excluded pattern branch rejects; Long seed text adapter; no TS.',cases=rows)
    path=OUT/'native-generator.json';path.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
    print(f'Captured{len(rows)} native builtin exercises; fixtureSHA256='+digest(path.read_bytes()))

if __name__=='__main__':main()
