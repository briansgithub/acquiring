"""New unchanged native rank-bit oracle only; no old captures or SQL behavior stub."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, os, runpy, shutil, subprocess

OUT = Path(__file__).resolve().parent
TOOLS = runpy.run_path(str(OUT.parents[1]/'learning/fixtures/generate-random-native.py'))
ROOT, CACHE, VERSION, AUTHORITY = [TOOLS[k] for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK = ROOT/'.artifacts/pwa-port/t15-rank-native'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')

def cases():
    boundaries = [(0,0),(0,31),(31,31),(31,32),(32,32),(32,63),(63,63),(63,64),(64,64),(64,127),(127,128),(128,255),(129,192),(191,191),(192,192),(193,2147483647),(-1,0),(0,-1),(-2147483648,2147483647),(8,7)]
    return [dict(name=n, words=w, spans=boundaries+extra) for n,w,extra in [
        ('empty',[],[]),('zero-tail',[0,0,0,0],[]),('lowest',[1],[]),('sign-bit32',[2147483648],[]),
        ('sign-bit64',[0,2147483648],[]),('split-word-boundary',[2147483648,1],[]),
        ('long-word-boundary',[0,2147483648,1],[]),('prefix-only-middle-hit',[0,0,0,0,1,0,0,0,0,0,0,1],[(0,300),(129,320),(129,351),(129,352),(128,351)]),
        ('last-word-highbit',[0,0,0,0,0,0,2147483648],[(192,222),(192,223),(223,223),(224,2147483647)]),
        ('all-bits',[4294967295]*8,[(255,255),(256,2147483647)]),
        ('sparse-trailing-zero',[0,2,0,0,1,0,0,0],[(34,127),(34,128),(128,2147483647)]),
        ('distant-empty-tail',[0]*255+[2147483648]+[0]*4,[(0,8190),(0,8191),(8191,8191),(8192,10000)])]]

def main():
    global WORK
    parser=argparse.ArgumentParser()
    parser.add_argument('--recover-work')
    parser.add_argument('--capture-producer-sha256')
    args=parser.parse_args()
    recover=args.recover_work is not None
    if recover:
        WORK=Path(args.recover_work).resolve()
        assert WORK.is_dir() and WORK.parent==(ROOT/'.artifacts/pwa-port/t15-rank-native').resolve()
        assert args.capture_producer_sha256 and len(args.capture_producer_sha256)==64
    else: WORK.mkdir(parents=True,exist_ok=False)
    def saved(name,data):
        path=WORK/name
        if recover: assert path.read_bytes()==data,name
        else: path.write_bytes(data)
    source = subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/AuralRankEligibility.kt'],cwd=ROOT)
    saved('AuralRankEligibility.kt',source)
    rows=cases(); assert len(rows)==12
    raw=json.dumps(rows,ensure_ascii=True,separators=(',',':')).encode();saved('input.json',raw)
    blocks=[]
    for row in rows:
        words=','.join(str(x)+'L' for x in row['words'])
        spans=','.join('listOf('+str(a)+','+str(b)+')' for a,b in row['spans'])
        blocks.append('''run {
val words=longArrayOf(WORDS)
val packed=LongArray((words.size+1)/2){ i -> words[i*2] or ((words.getOrElse(i*2+1){0L}) shl 32) }
val bits=java.util.BitSet.valueOf(packed)
val eligibility=AuralRankEligibility(bits)
val spans=listOf(SPANS)
val before=spans.map { eligibility.hasAny(it[0],it[1]) }
bits.flip(0,9000)
linkedMapOf("name" to NAME,"words" to words.toList(),"spans" to spans,"isEmpty" to eligibility.isEmpty,"expected" to before,"afterMutation" to spans.map { eligibility.hasAny(it[0],it[1]) })
}'''.replace('WORDS',words).replace('SPANS',spans).replace('NAME',json.dumps(row['name'])))
    writer=TOOLS['DRIVER'][TOOLS['DRIVER'].index('fun quote('):TOOLS['DRIVER'].index('fun main()')]
    driver='package com.acquiring.android\n'+writer+'\nfun main() { check(KotlinVersion.CURRENT.toString()=="2.2.10"); println(json(listOf('+','.join(blocks)+'))) }\n'
    saved('Driver.kt',driver.encode('utf-8'))
    cached=TOOLS['cached']; stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION)
    compiler=[cached('org.jetbrains.kotlin',a,VERSION) for a in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    support=[cached('org.jetbrains','annotations'),cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm')]
    compiler+=support+list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    java=shutil.which('java'); assert java,'Existing Java required; no download'
    prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
    command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
    version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode('utf-8'); assert 'kotlinc-jvm 2.2.10 ' in version
    classes=WORK/'classes'
    if not recover:
        built=subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,[stdlib,support[0]])),'-d',str(classes),str(WORK/'AuralRankEligibility.kt'),str(WORK/'Driver.kt')],capture_output=True,cwd=ROOT)
        (WORK/'compiler.stdout').write_bytes(built.stdout);(WORK/'compiler.stderr').write_bytes(built.stderr)
        if built.returncode: raise RuntimeError(built.stderr.decode('utf-8')[-10000:])
        result=subprocess.run(prefix+['-cp',os.pathsep.join(map(str,[classes,stdlib])),'com.acquiring.android.DriverKt'],capture_output=True,cwd=ROOT)
        (WORK/'stdout.json').write_bytes(result.stdout);(WORK/'runtime.stderr').write_bytes(result.stderr)
        if result.returncode: raise RuntimeError(result.stderr.decode('utf-8')[-10000:])
    else:
        assert (classes/'com/acquiring/android/AuralRankEligibility.class').is_file()
        assert not (WORK/'runtime.stderr').read_bytes()
    stdout=(WORK/'stdout.json').read_bytes()
    output=json.loads(stdout); assert len(output)==12
    for a,b in zip(json.loads(raw),output):
        assert all(a[k]==b[k] for k in a) and b['expected']==b['afterMutation']
    digest=lambda data:hashlib.sha256(data).hexdigest()
    fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,compilerVersion=version.strip().splitlines()[0],nativeSourceSha256=digest(source),producerSha256=digest(Path(__file__).read_bytes()),driverSha256=digest(driver.encode()),nativeInputSha256=digest(raw),nativeStdoutSha256=digest(stdout),captureProducerSha256=args.capture_producer_sha256 if recover else digest(Path(__file__).read_bytes()),
        classes={p.name:digest(p.read_bytes()) for p in classes.rglob('*.class')},jars=[dict(file=p.name,sha256=digest(p.read_bytes())) for p in dict.fromkeys(compiler)],
        capture='Actual unchanged complete AuralRankEligibility class and java.util.BitSet, unsigned32 input packed into native Long words. Input BitSet flipped after construction to test native snapshot. No TS/hand expected results or eligibility predicate/SQL simulation.',cases=output)
    target=OUT/'native-rank-eligibility.json';target.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(groups=12,queries=sum(len(x['spans']) for x in rows),fixtureSha256=digest(target.read_bytes()),ignoredWork=str(WORK))))

if __name__=='__main__': main()
