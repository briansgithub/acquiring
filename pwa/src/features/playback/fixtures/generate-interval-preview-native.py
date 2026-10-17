"""Six NEW frozen RootIntervalPreview plans; no previous fixture recapture or audio claim."""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
TOOLS=runpy.run_path(str(OUT.parents[2]/'domain/learning/fixtures/generate-random-native.py'))
ROOT,CACHE,VERSION,AUTHORITY=[TOOLS[k]for k in ['ROOT','CACHE','VERSION','AUTHORITY']]
WORK=ROOT/'.artifacts/pwa-port/t12-interval-preview-native'
INPUTS=[('standard',60,67,0,450),('octave-shift',60,67,12,450),('unison-distinct',60,60,-12,450),
 ('wrapped-int-addition',2147483647,-2147483648,1,450),('negative-duration',0,-1,0,-1),
 ('long-delay-from-int',1,127,-2147483648,2147483647)]
def main():
 WORK.mkdir(parents=True,exist_ok=True)
 source=subprocess.check_output(['git','show',f'{AUTHORITY}:android/app/src/main/java/com/acquiring/android/RootIntervalPreview.kt'],cwd=ROOT).decode('utf-8')
 (WORK/'RootIntervalPreview.kt').write_text(source,encoding='utf-8',newline='\n')
 inputs=','.join('intArrayOf('+','.join(str(x)for x in row[1:])+')'for row in INPUTS)
 driver='''package com.acquiring.android
fun main(){check(KotlinVersion.CURRENT.toString()=="2.2.10")
 for(q in listOf(INPUTS))println(rootIntervalPreviewSteps(q[0],q[1],q[2],q[3]).joinToString(",","[","]"){
 "{\\\"audioNotes\\\":"+it.audioNotes.joinToString(",","[","]")+",\\\"durationMs\\\":"+it.durationMs+",\\\"delayAfterMs\\\":"+it.delayAfterMs+"}"})}
'''.replace('INPUTS',inputs)
 # Python escapes above form Kotlin JSON string literals, not an alternative implementation.
 (WORK/'Driver.kt').write_text(driver,encoding='utf-8',newline='\n')
 cached=TOOLS['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION);annotations=cached('org.jetbrains','annotations')
 runtime=[stdlib,annotations]
 compiler=[cached('org.jetbrains.kotlin',n,VERSION)for n in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
 compiler+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))+[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
 java=shutil.which('java');assert java;prefix=[java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
 command=prefix+['-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
 version=subprocess.run(command+['-version'],capture_output=True,check=True,cwd=ROOT).stderr.decode();assert 'kotlinc-jvm 2.2.10 'in version
 classes=WORK/'classes';subprocess.run(command+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(classes),str(WORK/'RootIntervalPreview.kt'),str(WORK/'Driver.kt')],check=True,cwd=ROOT)
 output=subprocess.check_output(prefix+['-cp',os.pathsep.join(map(str,[classes,*runtime])),'com.acquiring.android.DriverKt'],cwd=ROOT);(WORK/'stdout.jsonl').write_bytes(output)
 rows=output.decode('utf-8').splitlines();assert len(rows)==len(INPUTS)
 digest=lambda b:hashlib.sha256(b).hexdigest()
 fixture=dict(authority=AUTHORITY,kotlinVersion=VERSION,compilerVersion=version.strip().splitlines()[0],sourceSha256=digest(source.encode()),producerSha256=digest(Path(__file__).read_bytes()),driverSha256=digest(driver.encode()),jars=[dict(file=p.name,sha256=digest(p.read_bytes()))for p in dict.fromkeys([*compiler,*runtime])],cases=[dict(label=row[0],input=dict(zip(['previousAudioNote','currentAudioNote','octaveShiftSemitones','durationMs'],row[1:])),expected=json.loads(result))for row,result in zip(INPUTS,rows)])
 path=OUT/'native-interval-preview.json';path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8',newline='\n');print('Captured6 native interval plans; SHA256='+digest(path.read_bytes()))
if __name__=='__main__':main()
