import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {sonicStretch} from './sonic';
import native from './fixtures/native-sonic.json';

/** Same integer-only signal as the Java fixture driver (Java int wraparound and truncating division). */
function synth(n:number,seed:number):Int16Array {
  const out=new Int16Array(n);
  let lcg=seed|0;
  for(let i=0;i<n;i++){
    lcg=(Math.imul(lcg,1664525)+1013904223)|0;
    const tri=(((i%109)*24000)/109|0)-12000;
    const tri2=(((i%55)*8000)/55|0)-4000;
    const noise=((lcg>>>16)%1001)-500;
    const env=i<2400?(i*10/24|0):(i>n-2400?((n-i)*10/24|0):1000);
    out[i]=(((tri+tri2)*env)/1000|0)+noise;
  }
  return out;
}

function firstClip():Int16Array {
  const raw=readFileSync(resolve('..',native.clip.path));
  expect(createHash('sha256').update(raw).digest('hex')).toBe(native.clip.sha256);
  const frames=native.clip.firstClipFrames,clip=new Int16Array(frames);
  for(let i=0;i<frames;i++)clip[i]=raw.readInt16LE(i*2);
  return clip;
}

const sha256=(samples:Int16Array)=>createHash('sha256').update(Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength)).digest('hex');

describe('native Sonic.java parity (3c887223, SpokenPhraseCache transform)',()=>{
  const sources=[synth(7200,12345),synth(12000,777),firstClip()];
  for(const c of native.cases){
    it(`source ${c.source}, target ${c.targetPercent}%, pitch 2^${c.pitchExponent}`,()=>{
      const source=sources[c.source]!;
      expect(source.length).toBe(c.natural);
      const output=sonicStretch(source,24_000,Math.fround(c.natural/c.target),2**c.pitchExponent,c.target);
      expect([output[0],output[1],output[c.target>>1],output[c.target-1]]).toEqual(c.head);
      expect(sha256(output)).toBe(c.sha256);
    });
  }
});
