"""Capture native-only evidence expectations from frozen801cf798; never import TS.

Only declarations/private metadata/cleanCell/normalize/cell/begin/evaluate/record
are extracted, byte-for-byte. Synthetic typed exercises replace generation.
Reflection is a fixture-only JSON adapter; Long seed fields become decimal text.
Uses existing cached Kotlin/JVM tooling. Compiler products stay ignored.
"""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
CORE=runpy.run_path(str(OUT.parents[2]/'audio/synth/fixtures/generate-native.py'))
ROOT,CACHE=CORE['ROOT'],CORE['CACHE']
WORK=ROOT/'.artifacts/pwa-port/t14-evidence-native'
PATTERN='p_0123456789ab_123_0123456789abcdef0123456789abcdef'

def cases():
    data=[]
    def add(label,steps,progress=None,exercise=None):
        data.append(dict(label=label,progress=progress or {},exercise=exercise or {},steps=steps))
    def rec(**options):return dict(op='record',correct=True,now=1000,**options)
    add('native-defaults',[dict(op='normalize'),dict(op='cell')])
    add('version-reset',[dict(op='normalize')],dict(version=99,attempts=888))
    add('native-corrupt-progress',[dict(op='normalize')],dict(attempts=-5,cells={
        'unknown:guided':{},'dominant-return:compare':dict(practice=-2,practiceCorrect=88,
        independentAttempts=-2,independentCorrect=500,keys=['BAD','C','C'],mastered=True,support=0)}))
    add('cell-cleaning-and-filtering',[dict(op='normalize')],dict(cells={
        'dominant-return:reproduce':dict(practice=5,practiceCorrect=8,independentAttempts=7,
        independentCorrect=6,transferCorrect=8,keys=['BAD','C','G','C','F'],lastAt=-1,dueAt=-2,
        streak=999,recentIndependent=[True]*10,microphonePractice={'root':99,'bad':8},
        microphoneIndependent={'bass':-1,'root':99,'bad':1}),
        PATTERN+':compare':dict(practice=4,practiceCorrect=4),
        PATTERN+'\n:compare':{},'dominant-return:compare:extra':{},'dominant-return:bad':{}}))
    for successes in [0,1,2,3,4]:
        add('support-'+str(successes),[dict(op='normalize')],dict(cells={
            'dominant-return:compare':dict(practice=8,practiceCorrect=successes,mastered=True,support=0)}))
    for suffix,patch in [('pass',{}),('few-correct',dict(independentCorrect=5)),
        ('recent-short',dict(recentIndependent=[True]*5)),('accuracy-low',dict(recentIndependent=[True]*6+[False]*2)),
        ('accuracy-inclusive',dict(recentIndependent=[True]*4+[False]+[True])),
        ('one-key',dict(keys=['C'])),('few-transfer',dict(transferCorrect=1))]:
        cell=dict(practice=4,practiceCorrect=4,independentAttempts=8,independentCorrect=8,transferCorrect=2,
            keys=['C','G','F'],recentIndependent=[True]*8)
        cell.update(patch)
        add('mastery-'+suffix,[dict(op='normalize')],dict(cells={'dominant-return:compare':cell}))
    for all_kinds in [False,True]:
        cell=dict(practice=4,practiceCorrect=4,independentAttempts=8,independentCorrect=8,transferCorrect=2,
            keys=['C','G','F'],recentIndependent=[True]*8,
            microphoneIndependent={k:1 for k in (['root','bass','scaleDegree','rootSequence'] if all_kinds else ['root'])})
        add('microphone-mastery-'+str(all_kinds),[dict(op='normalize')],dict(cells={'dominant-return:reproduce':cell}))
    add('counter-caps-and-zero-window',[dict(op='normalize')],dict(attempts=2147483647,cells={
        'dominant-return:compare':dict(practice=2147483647,practiceCorrect=2147483647,
        independentAttempts=0,independentCorrect=2147483647,transferCorrect=99,recentIndependent=[True]*8)}))
    exposures=[dict(fingerprint='f'+str(i),id='e'+str(i),at=i) for i in range(516)]
    exposures += [dict(fingerprint='',id='bad',at=1),dict(fingerprint='x'*201,id='bad',at=1),
        dict(fingerprint='x',id='',at=1),dict(fingerprint='x',id='n',at=-1)]
    history=[dict(id='h'+str(i)) for i in range(124)]
    history += [dict(id='bad-family',familyId='bad'),dict(id='bad-skill',skillId='bad'),
        dict(id='bad-key',key='H'),dict(id='bad-support',support=3),dict(id='bad-mic',microphoneKind='bad'),dict(id='')]
    add('bounded-tails-and-filters',[dict(op='normalize')],dict(recent=history,exposures=exposures))
    add('record-cleaned-history',[dict(op='normalize')],dict(recent=[dict(at=-8,generatorVersion='g'*50,
        fingerprint='f'*220,variantId='v'*120,assistance=['a'*90]*25,plays=-3,attempt=2001,
        requestedVariantId='keep',instrumentOverride='keep',octaveShift=-1)]))
    add('native-practice-fades',[rec() for _ in range(4)],exercise=dict(support=2))
    for label,opts in [('hint',dict(assistance=['hint'])),('preview',dict(assistance=['preview'])),
        ('replay',dict(plays=2)),('retry',dict(attempt=2)),('guided',{})]:
        add('native-practice-'+label,[rec(**opts)],exercise=dict(skillId='guided') if label=='guided' else {})
    add('native-failed-review-preserved',[dict(op='record',correct=False,now=1000),
        dict(op='record',correct=True,now=2000,attempt=2,assistance=['hint'])])
    add('native-familiarity',[dict(op='begin',now=1),rec(),rec(),
        dict(op='record',correct=True,now=3,exercise=dict(id='different',seed='92'))])
    add('reloaded-exposure',[dict(op='begin',now=2),rec()],dict(exposures=[dict(fingerprint='fingerprint',id='old',at=1)]))
    add('technical-resolution',[dict(op='begin',now=1),rec(technicalUncertainty=True),rec()],
        dict(cells={'dominant-return:reproduce':dict(practice=4,practiceCorrect=4,microphonePractice={'root':1})}),
        dict(skillId='reproduce',microphoneKind='root'))
    add('technical-neutral-unregistered',[rec(technicalUncertainty=True)])
    for kind in ['root','bass','scaleDegree','rootSequence']:
        add('native-kind-practice-'+kind,[rec(),dict(op='record',correct=True,now=2,
            exercise=dict(id='second',fingerprint='second',skillId='reproduce',microphoneKind=kind))],
            exercise=dict(skillId='reproduce',microphoneKind=kind))
    add('requested-kind-separate',[rec()],dict(cells={'dominant-return:reproduce':
        dict(practice=4,practiceCorrect=4,microphonePractice={'bass':1})}),dict(skillId='reproduce',microphoneKind='bass',requestedMicrophoneKind=None))
    add('native-explicit-variant',[rec()],exercise=dict(requestedVariantId='departure'))
    for streak in [0,1,2,3,4,5,6]:
        add('review-streak-'+str(streak),[rec()],dict(cells={'dominant-return:compare':
            dict(independentAttempts=8,independentCorrect=8,streak=streak)}))
    add('review-failure',[dict(op='record',correct=False,now=1000)],dict(cells={'dominant-return:compare':
        dict(independentAttempts=8,independentCorrect=8,streak=6,recentIndependent=[True]*8)}))
    add('attempt-cap-not-renormalized',[rec()],dict(attempts=1000000))
    for value in ['-9223372036854775808','9223372036854775807']:
        add('exact-seed-'+value,[dict(op='begin',now=0),rec()],exercise=dict(seed=value))
    add('corpus-preserved',[dict(op='begin',now=1),rec(),dict(op='normalize')],exercise=dict(withCorpus=True))
    add('pattern-family-record',[rec()],exercise=dict(familyId=PATTERN))
    add('normalization-after-record',[dict(op='record',correct=True,now=-1000,plays=-2,attempt=-3),
        dict(op='normalize')])
    for response_type,response in [('choice',['option']),('choice',['other']),('choice',[]),
        ('sequence',['V','I']),('sequence',['I','V']),('sequence',[]),('guided',['V','I']),('microphone',['60'])]:
        add('evaluate-'+response_type+'-'+str(response),[dict(op='evaluate',response=response)],
            exercise=dict(responseType=response_type))
    return data

def lit(value):
    if value is None:return 'null'
    if isinstance(value,bool):return str(value).lower()
    if isinstance(value,str):return json.dumps(value,ensure_ascii=False)
    if isinstance(value,int):return str(value)
    if isinstance(value,list):return 'listOf('+','.join(lit(v) for v in value)+')'
    if isinstance(value,dict):return 'mapOf('+','.join(lit(k)+' to '+lit(v) for k,v in value.items())+')'
    raise TypeError(value)

def cell(value):return 'AuralCell('+','.join(k+' = '+lit(v)+('L' if k in ['lastAt','dueAt'] else '') for k,v in value.items())+')'
def history(value):
    return 'history('+','.join(k+' = '+(lit(v)+'.toLong()' if k=='seed' else lit(v)+('L' if k=='at' else '')) for k,v in value.items())+')'
def progress(value):
    args=[]
    for key,v in value.items():
        if key=='cells':code='mapOf('+','.join(lit(k)+' to '+cell(c) for k,c in v.items())+')'
        elif key=='recent':code='listOf('+','.join(history(c) for c in v)+')'
        elif key=='exposures':code='listOf('+','.join('AuralExposure('+lit(c['fingerprint'])+','+lit(c['id'])+','+str(c['at'])+'L)' for c in v)+')'
        else:code=lit(v)
        args.append(key+' = '+code)
    return 'AuralProgress('+','.join(args)+')'
def exercise(value):
    return 'exercise('+','.join(k+' = '+(lit(v)+'.toLong()' if k=='seed' else lit(v)) for k,v in value.items())+')'

ADAPTER=r'''
fun quote(s:String):String = "\"" + s.map { c -> when(c) {
    '\\' -> "\\\\"; '"' -> "\\\""; '\n' -> "\\n"; '\r' -> "\\r"; '\t' -> "\\t"
    else -> if(c.code < 32) "\\u" + c.code.toString(16).padStart(4,'0') else c.toString()
} }.joinToString("") + "\""
fun json(value:Any?,name:String=""):String = when(value) {
    null -> "null"
    is String -> quote(value)
    is Long -> if(name == "seed") quote(value.toString()) else value.toString()
    is Number, is Boolean -> value.toString()
    is Map<*,*> -> value.entries.joinToString(",","{","}") { quote(it.key.toString())+":"+json(it.value,it.key.toString()) }
    is Iterable<*> -> value.joinToString(",","[","]") { json(it) }
    else -> value.javaClass.declaredFields.filter { !it.isSynthetic && !java.lang.reflect.Modifier.isStatic(it.modifiers) }
        .joinToString(",","{","}") { it.isAccessible=true;quote(it.name)+":"+json(it.get(value),it.name) }
}
fun corpus()=AuralCorpusProvenance("snapshot",null,"mapping",
    AuralSourcePassage("occurrence","pattern","song",sectionId="section",sourceRevision="revision",
        startIndex=0,endIndex=2,view="harmony",familyId="dominant-return",variantId="direct",
        keyTonic="C",keyScale="major",tempo=100,events=emptyList(),context=emptyList(),degreeLabels=listOf("V","I")),
    AuralExampleSettings(),seed=Long.MAX_VALUE,semitoneShift=2,recentSongIds=listOf("previous"))
fun exercise(id:String="exercise",familyId:String="dominant-return",skillId:String="compare",
    support:Int=0,transfer:Boolean=false,seed:Long=1, fingerprint:String="fingerprint",
    requestedVariantId:String?=null,microphoneKind:String?=null,requestedMicrophoneKind:String?=null,
    responseType:String="sequence",withCorpus:Boolean=false):AuralExercise {
    val target=AuralTarget(familyId,skillId,support,transfer,microphoneKind=requestedMicrophoneKind,
        variantId=requestedVariantId,instrumentOverride="CLARINET",octaveShift=1)
    val provenance=AuralProvenance("android-aural-1",seed,target,"direct","C",100,"CLARINET",
        emptyList(),4,emptyList(),emptyList(),corpus=if(withCorpus) corpus() else null)
    return AuralExercise(id,familyId,"direct",skillId,support,transfer,seed,"android-aural-1","C",100,
        "CLARINET",emptyList(),emptyList(),listOf("V","I"),null,emptyList(),
        AuralAnswer(listOf("V","I"),"option"),responseType,
        if(microphoneKind==null)null else AuralMicrophoneTask(microphoneKind,"label",emptyList(),listOf(60)),
        fingerprint,"prompt",false,"guidance",provenance)
}
fun project(e:AuralExercise):Map<String,Any?> = linkedMapOf(
    "id" to e.id,"familyId" to e.familyId,"variantId" to e.variantId,"skillId" to e.skillId,
    "generatorVersion" to e.generatorVersion,"keyTonic" to e.keyTonic,"fingerprint" to e.fingerprint,
    "responseType" to e.responseType,"support" to e.support,"transfer" to e.transfer,"seed" to e.seed,
    "answer" to mapOf("degrees" to e.answer.degrees,"optionId" to e.answer.optionId),
    "microphoneTask" to e.microphoneTask?.let { mapOf("kind" to it.kind) },
    "provenance" to mapOf("target" to mapOf("microphoneKind" to e.provenance.target.microphoneKind,
        "variantId" to e.provenance.target.variantId,"instrumentOverride" to e.provenance.target.instrumentOverride,
        "octaveShift" to e.provenance.target.octaveShift),"corpus" to e.provenance.corpus),
    "previouslyExposed" to e.previouslyExposed,"exposureRegistered" to e.exposureRegistered)
fun history(id:String="history",familyId:String="dominant-return",skillId:String="compare",
    correct:Boolean=true,independent:Boolean=true,technicalUncertainty:Boolean=false,at:Long=1,seed:Long=1,
    generatorVersion:String="android-aural-1",fingerprint:String="history",key:String="C",variantId:String="direct",
    support:Int=0,transfer:Boolean=false,assistance:List<String> = emptyList(),plays:Int=1,attempt:Int=1,
    microphoneKind:String?=null,requestedVariantId:String?=null,instrumentOverride:String?=null,
    octaveShift:Int=0)=AuralAttemptRecord(id,familyId,skillId,correct,independent,technicalUncertainty,at,seed,
        generatorVersion,fingerprint,key,variantId,support,transfer,assistance,plays,attempt,microphoneKind,
        requestedVariantId,instrumentOverride,octaveShift)
'''
def main():
    WORK.mkdir(parents=True,exist_ok=True)
    original=CORE['source']('AuralCurriculum')
    corpus_source=CORE['source']('AuralCorpus')
    catalog_source=CORE['source']('AuralCatalog')
    declarations=original[original.index('@Serializable data class AuralVariant'):original.index('/** Pure curriculum')]
    declarations+=corpus_source[corpus_source.index('@Serializable data class AuralExampleSettings'):corpus_source.index('internal val AURAL_MODES')]
    declarations+=corpus_source[corpus_source.index('@Serializable data class AuralSourcePassage'):corpus_source.index('@Serializable data class AuralSourceExposure')]
    declarations+=catalog_source[catalog_source.index('@Serializable data class AuralPatternTarget'):catalog_source.index('internal fun AuralPatternTarget.sourceMode')]
    metadata=original[original.index('    private const val DAY'):original.index('    private fun evidenced')]
    reducers=original[original.index('    fun beginExercise'):original.rindex('\n}')]
    pure=declarations+'\nobject AuralCurriculum {\n'+metadata+reducers+'\n}\n'
    (WORK/'Evidence.kt').write_text('package com.acquiring.android\nimport kotlin.math.pow\nannotation class Serializable\n'+pure,encoding='utf-8')
    data=cases()
    lines=['package com.acquiring.android',ADAPTER]
    for index,case in enumerate(data):
        lines+=['fun case'+str(index)+'() {','var p='+progress(case['progress']),'var e='+exercise(case['exercise']),
            'val outputs=mutableListOf<Any?>()']
        for step in case['steps']:
            if 'exercise' in step:lines.append('e='+exercise(step['exercise']))
            op=step['op']
            if op=='normalize':lines+=['p=AuralCurriculum.normalize(p)','outputs.add(p)']
            elif op=='cell':lines+=['outputs.add(AuralCurriculum.cell(p,"dominant-return","compare"))']
            elif op=='begin':
                lines+=['run { val begun=AuralCurriculum.beginExercise(p,e,'+str(step['now'])+'L);p=begun.first;e=begun.second;outputs.add(mapOf("progress" to p,"exercise" to project(e))) }']
            elif op=='evaluate':lines+=['outputs.add(AuralCurriculum.evaluate(e,'+lit(step['response'])+'))']
            elif op=='record':
                args=['now='+str(step['now'])+'L']+[k+'='+lit(v) for k,v in step.items() if k not in ['op','now','correct','exercise']]
                lines+=['p=AuralCurriculum.record(p,e,'+lit(step['correct'])+','+','.join(args)+')','outputs.add(p)']
            else:raise ValueError(op)
        lines+=['println(json(outputs))','}']
    lines+=['fun main() {','println(json(corpus()))']+['case'+str(i)+'()' for i in range(len(data))]+['}']
    (WORK/'Driver.kt').write_text('\n'.join(lines),encoding='utf-8')
    cached=CORE['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib');annotations=cached('org.jetbrains','annotations')
    jars=[cached('org.jetbrains.kotlin',name) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    jars+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars+=[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:raise RuntimeError('Existing Java and cached Kotlin compiler required')
    compiled=WORK/'classes'
    subprocess.run([java,'-cp',os.pathsep.join(map(str,jars)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
        '-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,[stdlib,annotations])),
        '-d',str(compiled),str(WORK/'Evidence.kt'),str(WORK/'Driver.kt')],check=True,cwd=ROOT)
    output=subprocess.check_output([java,'-cp',os.pathsep.join(map(str,[compiled,stdlib])),
        'com.acquiring.android.DriverKt'],cwd=ROOT).decode('utf-8')
    rows=output.strip().splitlines();assert len(rows)==len(data)+1
    for case,row in zip(data,rows[1:]):case['expected']=json.loads(row)
    fixture={'authority':CORE['AUTHORITY'],'sourceSha256':hashlib.sha256(original.encode()).hexdigest(),
        'pureSha256':hashlib.sha256(pure.encode()).hexdigest(),
        'adapter':'Synthetic native typed constructors; reflection serializes seed Long fields as decimal text. No generator or TS.',
        'corpusSample':json.loads(rows[0]),'cases':data}
    path=OUT/'native-evidence.json'
    path.write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('Captured '+str(len(data))+' frozen native evidence cases/'+str(sum(len(c['steps']) for c in data))+' steps; '+str(path.stat().st_size)+' bytes')
if __name__=='__main__':main()