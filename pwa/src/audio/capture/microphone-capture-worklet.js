// Same-origin AudioWorklet module. Keep captureWorkletFrame semantics in microphone-worklet-process.ts.
class AcquiringMicCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || !channel.length) return true;
    const frame = channel.slice();
    this.port.postMessage(frame, [frame.buffer]);
    return true;
  }
}
registerProcessor('acquiring-mic-capture', AcquiringMicCaptureProcessor);
