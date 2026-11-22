// Run with Node 24. Uses built-in TypeScript transformation; no dependencies or emitted files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try { return next(specifier + suffix, context); } catch {}
        }
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(fs.readFileSync(new URL(url), 'utf8'), {mode: 'transform'}) };
    return next(url, context);
  }
});
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const hash = b => createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(path.join(root,p));
const manifest = JSON.parse(read('pwa/public/voice/manifest.json'));
for (const f of manifest.files) {
  for (const prefix of ['pwa/public/voice/', 'android/app/src/main/res/raw/', 'ios/Packages/AcquiringKit/Sources/AcquiringAudio/Resources/Voice/']) {
    const b = read(prefix + f.stem + '.pcm');
    assert.equal(b.length, f.bytes); assert.equal(hash(b), f.sha256);
  }
}
const provenance = JSON.parse(read('contracts/fixtures/b04-provenance.json'));
for (const [name, sha] of Object.entries(provenance.fixtures)) assert.equal(hash(read('pwa/src/audio/synth/fixtures/'+name+'.json')),sha);
const { sonicStretch } = require(path.join(root, 'pwa/src/audio/synth/sonic.ts'));
const native = JSON.parse(read('contracts/fixtures/b04-native-sonic.json'));
assert.deepEqual(native, JSON.parse(read('pwa/src/audio/synth/fixtures/native-sonic.json')));
function synth(n,seed) {
  const out=new Int16Array(n); let lcg=seed|0;
  for(let i=0;i<n;i++) {
    lcg=(Math.imul(lcg,1664525)+1013904223)|0;
    const tri=(((i%109)*24000)/109|0)-12000;
    const tri2=(((i%55)*8000)/55|0)-4000;
    const noise=((lcg>>>16)%1001)-500;
    const env=i<2400?(i*10/24|0):(i>n-2400?((n-i)*10/24|0):1000);
    out[i]=(((tri+tri2)*env)/1000|0)+noise;
  } return out;
}
const bytes=read(native.clip.path); assert.equal(hash(bytes),native.clip.sha256);
const clip=Int16Array.from({length:native.clip.firstClipFrames},(_,i)=>bytes.readInt16LE(i*2));
const sources=[synth(7200,12345),synth(12000,777),clip];
for(const c of native.cases) {
  const output=sonicStretch(sources[c.source],24000,Math.fround(c.natural/c.target),2**c.pitchExponent,c.target);
  assert.equal(hash(Buffer.from(output.buffer)),c.sha256);
}
console.log(`${manifest.files.length} exact offline assets; ${native.cases.length} PWA/JVM Sonic cases; three frozen fixture hashes passed. This command executes PWA code, not Swift/C.`);
// Execute the existing PWA renderer against the frozen native stream oracles.
// This is PWA/JVM evidence; Swift graph output has a separate representation.
const { PlaybackPcmRenderer, PlaybackAudioLayer: Layer, PlaybackChordMode: Mode } = require(path.join(root,'pwa/src/audio/synth/playback-pcm.ts'));
const { SpokenRootDegreeClips } = require(path.join(root,'pwa/src/audio/synth/spoken-cues.ts'));
function rng(){ let seed=0x12345678; return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }
const event=(id,startBeat,endBeat,layer,fullMidiNotes,rootMidiNote=null)=>({id,startBeat,endBeat,layer,fullMidiNotes,rootMidiNote});
const stream=JSON.parse(read('pwa/src/audio/synth/fixtures/native-stream.json'));
for(const fixture of stream.cases){
  const waveform=fixture.waveform;
  let config={bpm:600,transpose:0,waveform,chordMode:Mode.FULL,melodyGain:0.37,chordGain:0.61,arpeggiateCycles:0.5};
  const renderer=new PlaybackPcmRenderer({endBeat:1.25,events:[event(1,1,1.24,Layer.CHORD,[48,52,55],36),
    event(2,1.03,1.125,Layer.MELODY,[60]),event(3,1.15,1.22,Layer.MELODY,[0,-1,64])]},config,fixture.sampleRate,rng());
  for(const block of fixture.blocks){
    switch(block.action){
      case 'gain_tempo_zero':config={...config,bpm:300,melodyGain:0.25,chordGain:0.125};renderer.updateConfig(config);break;
      case 'seek':renderer.seek(1.10);break;
      case 'pitch_mode_wave':config={...config,waveform:waveform==='SINE'?'SAWTOOTH':'SINE',transpose:12,chordMode:Mode.ROOT_ONLY,arpeggiateCycles:2};renderer.updateConfig(config);break;
      case 'freeze_mute':config={...config,bpm:0,melodyGain:0,chordGain:0,arpeggiateCycles:4};renderer.updateConfig(config);break;
      case 'replace_once':
        config={...config,bpm:600,waveform,transpose:0,chordMode:Mode.FULL,melodyGain:1,chordGain:0.5,arpeggiateCycles:0};renderer.updateConfig(config);
        renderer.replaceTimeline({startBeat:0,endBeat:0.05,completionKey:'once',events:[event(8,0,0.05,Layer.CHORD,[60,64,67],48),event(9,0.01,0.04,Layer.MELODY,[55])]});break;
    }
    const pcm=new Int16Array(block.frames),actual=renderer.renderInto(pcm);
    assert.equal(hash(Buffer.from(pcm.buffer)),block.sha256,`${waveform}/${block.action}`);
    assert.equal(actual.startBeat,block.startBeat);assert.equal(renderer.currentBeat,block.currentBeat);
    assert.deepEqual(actual.startedEvents.map(e=>[e.id,e.frameOffset]),block.startedEvents);
  }
}
const resources=new Map(manifest.files.map(f=>{
  const raw=read('pwa/public/voice/'+f.stem+'.pcm');
  return [f.stem,Int16Array.from({length:raw.length/2},(_,i)=>raw.readInt16LE(i*2))];
}));
const clips=SpokenRootDegreeClips.fromResources(resources);
function cueTimeline(){
  function chord(id,startBeat,endBeat,notes,degree,alteration,suffix,fifthsKey,fifthsMajor,scale,tonic,relative={degree,alteration}){
    return {id,startBeat,endBeat,layer:Layer.CHORD,fullMidiNotes:notes,rootMidiNote:notes[0],rootDegree:degree,rootDegreeAlteration:alteration,
      fullChordRootMidiNote:notes[0]+12,spokenChordSuffix:suffix,relativeMajorRootDegree:relative,fifthsFromKeyTonic:fifthsKey,
      fifthsFromMajorTonic:fifthsMajor,keyScale:scale,keyTonicMidi:tonic};
  }
  const melody=(id,startBeat,endBeat,note,cue)=>({id,startBeat,endBeat,layer:Layer.MELODY,fullMidiNotes:[note],spokenMelodyCue:cue,melodyCueMidi:note});
  return {startBeat:1,endBeat:10,completionKey:null,events:[chord(1,1,3,[48,52,55],1,0,null,0,0,'major',48),melody(2,1,2,64,'third'),
    chord(3,3,5,[53,57,60],4,0,null,1,1,'major',48),melody(4,3,3.5,62,'passing'),
    chord(5,5,7,[55,59,62,65],5,0,'SEVEN',1,1,'major',48),chord(6,7,9,[58,62,65],7,-1,null,2,3,'mixolydian',48,{degree:4,alteration:0}),
    melody(7,7,8,65,'root'),chord(8,9,10,[45,48,52],6,0,'MIN',3,0,'minor',45,{degree:1,alteration:0})]};
}
const cues=JSON.parse(read('pwa/src/audio/synth/fixtures/native-cue-stream.json'));
for(const scenario of cues.cases){
  const loud=scenario.cue==='OFF';
  let config={bpm:240,transpose:0,waveform:scenario.waveform,chordMode:scenario.mode,melodyGain:loud?1:0.6,chordGain:loud?1:0.4,
    arpeggiateCycles:0,rootDegreeCue:scenario.cue,useRelativeIonianContext:false,voiceVolume:0.5};
  const renderer=new PlaybackPcmRenderer(cueTimeline(),config,scenario.sampleRate,rng(),clips);
  for(const block of scenario.blocks){
    if(block.action==='transpose_voice'){config={...config,transpose:2,voiceVolume:1};renderer.updateConfig(config);}
    if(block.action==='seek')renderer.seek(6.25,true);
    if(block.action==='lock_tempo'){config={...config,useRelativeIonianContext:true,bpm:180};renderer.updateConfig(config);}
    const pcm=new Int16Array(block.frames),actual=renderer.renderInto(pcm);
    assert.equal(hash(Buffer.from(pcm.buffer)),block.sha256,`${scenario.cue}/${scenario.sampleRate}/${block.action}`);
    assert.equal(actual.startBeat,block.startBeat);assert.equal(renderer.currentBeat,block.currentBeat);
    assert.deepEqual(actual.startedEvents.map(e=>[e.id,e.frameOffset]),block.startedEvents);
  }
}
console.log(`${stream.cases.length} native-stream and ${cues.cases.length} native-cue-stream scenarios match PWA PCM16. B05 splice cases excluded.`);
