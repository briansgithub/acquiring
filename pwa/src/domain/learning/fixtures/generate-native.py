"""Capture frozen pure Kotlin assessment outputs; never import the TypeScript port.

Intentional portable test data with a reproducible producer; cached tooling only.
Coroutine capture is excluded, while the pure function/helpers remain unchanged.
"""
from pathlib import Path
import base64,hashlib,json,os,random,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
CORE=runpy.run_path(str(OUT.parents[2]/'audio/synth/fixtures/generate-native.py'))
ROOT,CACHE=CORE['ROOT'],CORE['CACHE']
WORK=ROOT/'.artifacts/pwa-port/t14-assessment-native'

def voice(midi,start=0,count=12,confidence=.98,held=False,step=40):
    return [dict(timeMs=start+i*step,midi=midi,confidence=confidence,isHeld=held) for i in range(count)]
def silence(start,count=4):return voice(None,start,count,0)
def cases():
    result=[]
    def add(label,frames,targets=(60,),**options):
        result.append(dict(label=label,frames=frames,targets=list(targets),options=options))
    for midi in [60.,72.,61.,60.35]:add('native-stable-'+str(midi),voice(midi))
    add('native-explicit-octave',voice(72.),octaveEquivalent=False)
    for label,frames in [('empty',[]),('silence',silence(0,25)),('short',voice(60.,count=3)),
        ('low-confidence',voice(60.,confidence=.4)),('held',voice(60.,held=True)),
        ('poor-coverage',voice(60.)+silence(480,60)),('nan',voice('NaN'))]:add('native-'+label,frames)
    sequence=voice(60.)+voice(65.,480)+voice(67.,960)
    add('native-ordered',sequence,(48,53,55));add('native-wrong-order',sequence,(48,55,53))
    add('native-repeated-unseparated',voice(60.,count=30),(60,60))
    add('native-repeated-breath',voice(60.)+silence(480)+voice(60.,640),(60,60))
    add('native-too-many-notes',voice(60.)+voice(61.,480))
    add('native-error',voice(61.)+[dict(timeMs=480,midi=None,error='Device disconnected')])
    add('empty-error',voice(61.)+[dict(timeMs=-1,midi=None,error='')])
    add('error-original-order',[dict(timeMs=500,midi=None,error='first'),dict(timeMs=0,midi=None,error='second')])
    add('invalid-target-precedes-error',[dict(timeMs=0,midi=None,error='device')],(0,))
    for targets in [(),(0,),(128,)]:add('target-'+str(targets),voice(60.),targets)
    for midi in [35.,96.,34.999,96.001,'Infinity','-Infinity']:add('range-'+str(midi),voice(midi))
    for confidence in [.85,.849999,'NaN','Infinity',1.2]:add('confidence-'+str(confidence),voice(60.,confidence=confidence))
    for count in [4,6,7]:add('duration-'+str(count),voice(60.,count=count))
    add('duration-240-inclusive',voice(60.,count=6),minStableMs=240)
    for extra in [36,37]:add('coverage-'+str(extra),voice(60.)+silence(480,extra))
    for extra in [4,5]:add('stable-share-'+str(extra),voice(60.)+voice(65.,480,count=extra))
    for gap in [100,101]:add('gap-'+str(gap),voice(60.)+voice(60.,440+gap))
    add('negative-filter',voice(60.,-1000)+voice(60.))
    add('reverse-order',list(reversed(voice(60.))))
    add('duplicate-times',voice(60.,step=0))
    add('cadence-fallback',voice(60.,step=200))
    for base in [8,7]:add('inlier-ratio-'+str(base),voice(60.,count=base)+voice(60.8,base*40,count=10-base))
    for octave in [True,False]:add('alternating-octaves',[dict(timeMs=i*40,midi=60. if i%2==0 else 72.,confidence=.98) for i in range(12)],octaveEquivalent=octave)
    for shift in [.45,-.45,.450001,-.450001]:add('tolerance-'+str(shift),voice(60.+shift))
    add('confidence-setting',voice(60.,confidence=.89),minConfidence=.9)
    add('exact-target-zero-tolerance',voice(60.),toleranceCents=0.)
    rng=random.Random(20261015)
    for index in range(60):
        count=rng.randrange(7,21);offset=rng.choice([-2.,-.4,0.,.4,2.]);step=rng.choice([20,40,50,80])
        frames=[dict(timeMs=i*step,midi=60.+offset+rng.uniform(-.08,.08),confidence=rng.choice([.4,.85,.98]),isHeld=rng.random()<.12) for i in range(count)]
        if index%3==0:frames+=voice(65.,count*step+160,count=12,step=step)
        add('seeded-'+str(index),frames,(60,65) if index%3==0 else (60,))
    return result

def number(value):
    if value is None:return 'null'
    if isinstance(value,str):return 'Double.'+{'NaN':'NaN','Infinity':'POSITIVE_INFINITY','-Infinity':'NEGATIVE_INFINITY'}[value]
    return repr(float(value))
def main():
    WORK.mkdir(parents=True,exist_ok=True)
    original=CORE['source']('AuralPitchAssessment')
    declarations=original[original.index('internal data class AuralPitchFrame'):original.index('/** Permission')]
    pure=original[original.index('private fun pitchMedian'):]
    (WORK/'Assessment.kt').write_text('package com.acquiring.android\nimport kotlin.math.abs\n'+declarations+pure,encoding='utf-8')
    data=cases();lines=['package com.acquiring.android','import java.util.Base64','fun main() {']
    for index,case in enumerate(data):
        frames=[]
        for f in case['frames']:
            error='null' if f.get('error') is None else json.dumps(f['error'])
            frames.append(f'AuralPitchFrame({f["timeMs"]}L,{number(f["midi"])},{number(f.get("confidence",0))},{str(f.get("isHeld",False)).lower()},{error})')
        opts=[]
        for k,v in case['options'].items():opts.append(f'{k} = '+(str(v).lower() if isinstance(v,bool) else str(v)+'L' if k=='minStableMs' else number(v)))
        args='listOf('+','.join(frames)+'),listOf('+','.join(map(str,case['targets']))+')'+(','+','.join(opts) if opts else '')
        lines.append('run { val a=assessAuralPitch('+args+'); println("'+str(index)+'|${a.status}|${Base64.getEncoder().encodeToString(a.reason.toByteArray(Charsets.UTF_8))}|${a.cents.joinToString(",")}") }')
    lines.append('}')
    (WORK/'Driver.kt').write_text('\n'.join(lines),encoding='utf-8')
    cached=CORE['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib');annotations=cached('org.jetbrains','annotations')
    jars=[cached('org.jetbrains.kotlin',name) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    jars+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars+=[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:raise RuntimeError('Cached Kotlin tooling and Java are required')
    compiled=WORK/'classes'
    subprocess.run([java,'-cp',os.pathsep.join(map(str,jars)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,[stdlib,annotations])),'-d',str(compiled),str(WORK/'Assessment.kt'),str(WORK/'Driver.kt')],check=True,cwd=ROOT)
    output=subprocess.check_output([java,'-cp',os.pathsep.join(map(str,[compiled,stdlib])),'com.acquiring.android.DriverKt'],cwd=ROOT,text=True)
    rows=output.strip().splitlines();assert len(rows)==len(data)
    for row in rows:
        index,status,reason,cents=row.split('|');data[int(index)]['expected']={'status':status,'reason':base64.b64decode(reason).decode(),'cents':[float(x) for x in cents.split(',')] if cents else []}
    fixture={'authority':CORE['AUTHORITY'],'sourceSha256':hashlib.sha256(original.encode()).hexdigest(),'pureSha256':hashlib.sha256((declarations+pure).encode()).hexdigest(),'cases':data}
    (OUT/'native-assessment.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
    print(f'Captured {len(data)}frozen native assessments/{sum(len(c["frames"]) for c in data)}frames;pure function unchanged')
if __name__=='__main__':main()
