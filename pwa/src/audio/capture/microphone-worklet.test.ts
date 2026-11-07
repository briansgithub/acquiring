import { describe, expect, it } from 'vitest';
import {
  CAPTURE_WORKLET_MODULE_URL, CAPTURE_WORKLET_NAME, captureWorkletFrame,
  createWebAudioMicrophoneTransport,
} from './index';
import workletSource from './microphone-capture-worklet.js?raw';

describe('captureWorkletFrame', () => {
  it('copies the first channel so the worklet buffer can be reused', () => {
    const source = Float32Array.from([0.25, -0.5, 1]);
    const frame = captureWorkletFrame([[source]]);
    expect(frame).toEqual(source);
    expect(frame).not.toBe(source);
    source[0] = 0;
    expect(frame?.[0]).toBe(0.25);
    expect(captureWorkletFrame([])).toBeNull();
    expect(captureWorkletFrame([[new Float32Array(0)]])).toBeNull();
  });
});

describe('AudioWorklet module', () => {
  it('is a same-origin hashed module named acquiring-mic-capture, not a blob URL', () => {
    expect(CAPTURE_WORKLET_NAME).toBe('acquiring-mic-capture');
    expect(CAPTURE_WORKLET_MODULE_URL).not.toMatch(/^(blob:|data:)/);
    expect(CAPTURE_WORKLET_MODULE_URL).toMatch(/microphone-capture-worklet/);
    expect(workletSource).toContain(`registerProcessor('${CAPTURE_WORKLET_NAME}'`);
    expect(workletSource).toContain('channel.slice()');
    expect(workletSource).not.toContain('createScriptProcessor');
  });
});

describe('createWebAudioMicrophoneTransport AudioWorklet path', () => {
  it('posts worklet frames to the hop listener and fail-closes permission/module errors', async () => {
    const tracks: Array<{ stop: () => void; stopped: boolean }> = [];
    const stream = {
      getTracks() {
        return tracks.map((track) => ({ stop: () => { track.stopped = true; } }));
      },
    } as unknown as MediaStream;
    const node = {
      port: { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null },
      connect() { return this; },
      disconnect() { /* graph */ },
    };
    let closed = 0;
    const context = {
      state: 'running',
      sampleRate: 16_000,
      destination: {},
      audioWorklet: { addModule: async () => undefined },
      createMediaStreamSource() { return { connect() { return this; }, disconnect() { /* graph */ } }; },
      createGain() { return { gain: { value: 1 }, connect() { return this; }, disconnect() { /* graph */ } }; },
      async resume() { /* already running */ },
      async close() { closed += 1; },
    } as unknown as AudioContext;

    const transport = createWebAudioMicrophoneTransport({
      getUserMedia: async () => {
        tracks.push({ stop() { /* used via stream */ }, stopped: false });
        return stream;
      },
      createContext: () => context,
      createWorkletNode: () => node as unknown as AudioWorkletNode,
    });
    const received: Float32Array[] = [];
    await transport.start((frame) => { received.push(frame); });
    const posted = Float32Array.from([0.5, -0.25]);
    node.port.onmessage?.({ data: posted } as MessageEvent<Float32Array>);
    expect(received).toEqual([posted]);
    transport.stop();
    expect(closed).toBe(1);

    const denied = createWebAudioMicrophoneTransport({
      getUserMedia: async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }); },
    });
    await expect(denied.start(() => undefined)).rejects.toMatchObject({ name: 'NotAllowedError', message: 'Permission denied' });

    tracks.length = 0;
    closed = 0;
    const broken = createWebAudioMicrophoneTransport({
      getUserMedia: async () => {
        tracks.push({ stop() { /* used via stream */ }, stopped: false });
        return stream;
      },
      createContext: () => context,
      addWorkletModule: async () => { throw new Error('worklet blocked'); },
    });
    await expect(broken.start(() => undefined)).rejects.toThrow('worklet blocked');
    expect(tracks[0]?.stopped).toBe(true);
    expect(closed).toBe(1);
  });
});

// Cancellation contracts; injected deferred promises are NOT trusted browser lifecycle proof.
it('retires a late permission stream without creating a capture context',async()=>{
 let resolve!:(stream:MediaStream)=>void;let stopped=0,contexts=0;
 const transport=createWebAudioMicrophoneTransport({getUserMedia:()=>new Promise(done=>{resolve=done;}),createContext:()=>{contexts++;throw new Error('Cancelled capture must not create a context');}});
 const pending=transport.start(()=>undefined);transport.stop();resolve({getTracks:()=>[{stop:()=>stopped++}]} as unknown as MediaStream);await pending;
 expect(stopped).toBe(1);expect(contexts).toBe(0);
});
for(const stage of ['resume','module'])it('retires tracks/context immediately during pending '+stage+' and suppresses late graph creation',async()=>{
 let unblock!:()=>void,entered!:()=>void,stopped=0,closed=0,nodes=0;
 const gate=new Promise<void>(resolve=>{unblock=resolve;}),ready=new Promise<void>(resolve=>{entered=resolve;});
 const context={state:stage==='resume'?'suspended':'running',resume:async()=>{entered();await gate;},close:async()=>{closed++;},createMediaStreamSource:()=>{nodes++;throw new Error('Cancelled graph');}} as unknown as AudioContext;
 const transport=createWebAudioMicrophoneTransport({getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]} as unknown as MediaStream),createContext:()=>context,addWorkletModule:async()=>{entered();if(stage==='module')await gate;}});
 const pending=transport.start(()=>undefined);await ready;transport.stop();expect(stopped).toBe(1);expect(closed).toBe(1);unblock();await pending;expect(nodes).toBe(0);
});
