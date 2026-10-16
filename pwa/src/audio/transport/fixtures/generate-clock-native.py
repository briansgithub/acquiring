"""Capture14 unchanged frozen native audibleBeat head cases; never import TS.

Only native model declarations, ClockSegment and audibleBeat are extracted.
Fixture bindings provide head/renderer/timeline/start state; no DSP or Android sink.
Portable expectations belong in Git; cached JVM products remain ignored.
"""
from pathlib import Path
import hashlib,json,os,runpy,shutil,subprocess
OUT=Path(__file__).resolve().parent
CORE=runpy.run_path(str(OUT.parents[2]/'audio/synth/fixtures/generate-native.py'))
ROOT,CACHE=CORE['ROOT'],CORE['CACHE']
WORK=ROOT/'.artifacts/pwa-port/t08-clock-native'
def segment(startFrame=0,frameCount=12000,startBeat=1,beatsPerFrame=.002):
    return dict(startFrame=startFrame,frameCount=frameCount,startBeat=startBeat,beatsPerFrame=beatsPerFrame)
def cases():
    rows=[]
    def add(label,head,segments=None,anchor=1,key=None,started=True):
        rows.append(dict(label=label,sampleRate=1000,startBeat=1,endBeat=5,completionKey=key,
            anchorBeat=anchor,playedFrame=head,sinkStarted=started,segments=segments or []))
    add('empty-default',0)
    add('empty-seek',0,anchor=3.25)
    add('primed-head-zero',0,[segment()])
    add('interior-played-head',128,[segment()])
    add('head-before-segment-origin',0,[segment(startFrame=500,startBeat=2.5)],anchor=2.5)
    add('exact-loop-wrap',2000,[segment()])
    add('multiple-loop-wraps',9500,[segment()])
    add('zero-slope',1000,[segment(startBeat=2.25,beatsPerFrame=0)],anchor=2.25)
    tempo=[segment(frameCount=1000),segment(startFrame=1000,frameCount=2000,startBeat=3,beatsPerFrame=.001)]
    add('tempo-before-boundary',999,tempo)
    add('tempo-at-boundary',1000,tempo)
    add('tempo-after-boundary',1250,tempo)
    add('once-at-end-with-padding',2000,[segment(frameCount=3000)],key='once')
    add('once-past-end-with-empty-key',2300,[segment(frameCount=3000)],key='')
    add('unstarted-seek-to-end',0,[segment(startFrame=256,startBeat=5)],anchor=5,started=False)
    return rows
def main():
    WORK.mkdir(parents=True,exist_ok=True)
    original=CORE['source']('PlaybackEngine')
    models=original[original.index('internal enum class PlaybackAudioLayer'):original.index('internal data class PlaybackConfig')]
    clock_class=original[original.index('    private data class ClockSegment'):original.index('    private class AudioWriteException')]
    body=original[original.index('        fun audibleBeat(): Double'):original.index('        fun publish(')]
    header='package com.acquiring.android\nimport java.util.ArrayDeque\n'
    bindings=r'''
    private data class FixtureRenderer(val currentBeat:Double)
    private var timeline:PlaybackTimeline?=null
    private var renderer:FixtureRenderer?=null
    private var sinkStarted=false
    private var head=0L
    private val clockSegments=ArrayDeque<ClockSegment>()
    private fun unwrappedPlaybackHead():Long=head
'''
    rows=cases()
    driver=[header+models+'\nobject ClockFixture {\n'+clock_class+bindings+body,
        '@JvmStatic fun main(args:Array<String>) {']
    for i,row in enumerate(rows):
        key='null' if row['completionKey'] is None else json.dumps(row['completionKey'])
        driver += ['timeline=PlaybackTimeline(startBeat=1.0,endBeat=5.0,events=emptyList(),completionKey='+key+')',
            'renderer=FixtureRenderer('+repr(float(row['anchorBeat']))+')',
            'sinkStarted='+str(row['sinkStarted']).lower(),'head='+str(row['playedFrame'])+'L','clockSegments.clear()']
        for s in row['segments']:
            driver.append('clockSegments.addLast(ClockSegment('+str(s['startFrame'])+'L,'+
                repr(float(s['startBeat']))+','+repr(float(s['beatsPerFrame']))+',1.0,5.0))')
        driver.append('println('+json.dumps(str(i)+'|')+'+audibleBeat())')
    driver += ['}','}']
    (WORK/'ClockFixture.kt').write_text('\n'.join(driver),encoding='utf-8')
    cached=CORE['cached'];stdlib=cached('org.jetbrains.kotlin','kotlin-stdlib');annotations=cached('org.jetbrains','annotations')
    jars=[cached('org.jetbrains.kotlin',name) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    jars+=list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars+=[cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),annotations]
    java=shutil.which('java')
    if not java:raise RuntimeError('Existing Java and cached Kotlin compiler required')
    utf8=['-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
    compiled=WORK/'classes'
    subprocess.run([java,*utf8,'-cp',os.pathsep.join(map(str,jars)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
        '-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,[stdlib,annotations])),
        '-d',str(compiled),str(WORK/'ClockFixture.kt')],check=True,cwd=ROOT)
    output=subprocess.check_output([java,*utf8,'-cp',os.pathsep.join(map(str,[compiled,stdlib])),
        'com.acquiring.android.ClockFixture'],cwd=ROOT).decode('utf-8')
    lines=output.strip().splitlines();assert len(lines)==len(rows)
    for line in lines:
        index,value=line.split('|');rows[int(index)]['expectedBeat']=float(value)
    fixture=dict(authority=CORE['AUTHORITY'],sourceSha256=hashlib.sha256(original.encode()).hexdigest(),
        clockSegmentSha256=hashlib.sha256(clock_class.encode()).hexdigest(),
        audibleBeatSha256=hashlib.sha256(body.encode()).hexdigest(),
        adapter='Unchanged native model/ClockSegment/audibleBeat with fixture head/start/renderer bindings; frameCount is browser finite-schedule metadata, not native expected logic.',
        cases=rows)
    path=OUT/'native-clock.json'
    path.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
    print('Captured '+str(len(rows))+' unchanged native head cases; '+str(path.stat().st_size)+' bytes; JVM/output UTF-8')
if __name__=='__main__':main()
