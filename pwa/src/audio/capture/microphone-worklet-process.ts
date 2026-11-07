/** Pure AudioWorklet input copy. The processor file must keep this contract. */
export const CAPTURE_WORKLET_NAME = 'acquiring-mic-capture';

export function captureWorkletFrame(
  inputs: ArrayLike<ArrayLike<Float32Array | undefined> | undefined>,
): Float32Array | null {
  const channel = inputs[0]?.[0];
  if (!channel || channel.length === 0) return null;
  return channel.slice();
}
