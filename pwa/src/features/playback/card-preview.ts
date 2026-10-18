import {renderStaticSamples,type StaticRenderOptions} from '../../audio/synth';
import {rootIntervalPreviewRequest,renderRootIntervalPreview} from './interval-preview-audio';
import type {RootIntervalAudioInput,RootIntervalRequest} from './interval-audio-contracts';

export type IntervalCardRequest=RootIntervalRequest & {readonly cardPreviewKind:'interval'};
/** Immutable feature-local tag. PreviewOwner copies request fields into its render options;
 * actual-browser acceptance protects this path. No mutable renderer mode or extra owner.
 */
export function cardIntervalPreviewRequest(input:RootIntervalAudioInput):IntervalCardRequest {
 return Object.freeze({...rootIntervalPreviewRequest(input),cardPreviewKind:'interval' as const});
}
/** One PreviewOwner arbitrates ALL card taps using its existing revision/lifecycle guard.
 * Untagged ordinary cards retain the accepted native static rendering unchanged.
 */
export function renderCardPreview(options:StaticRenderOptions):Int16Array|null {
 const kind=(options as StaticRenderOptions & {readonly cardPreviewKind?:unknown}).cardPreviewKind;
 if(kind===undefined)return renderStaticSamples(options);
 if(kind==='interval')return renderRootIntervalPreview(options);
 throw new RangeError('Unknown card preview kind.');
}
