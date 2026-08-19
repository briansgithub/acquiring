import { augmentRenderPlan } from "./augment.mjs";
import { createRenderPlan } from "./plan.mjs";
import { renderPlanToMidi, sha256, stableStringify } from "./render.mjs";
import { sanitizePublicHooktheoryChord } from "../../../web-player/lib/harmonicContract.js";

export { augmentRenderPlan } from "./augment.mjs";
export {
  AUGMENTATION_FAMILY_IDS,
  AUGMENTATION_RECIPES,
  RENDERER_FAMILY_IDS,
  resolveAugmentationFamily,
} from "./families.mjs";
export { activeKeyAtBeat, createRenderPlan, extractSplitMetadata } from "./plan.mjs";
export {
  beatToTicks,
  durationToTicks,
  meterDenominator,
  midiKeySignatureFor,
  normalizeTonic,
  noteNameToMidi,
  PPQ,
  transposeTonic,
} from "./pitch.mjs";
export {
  RENDERER_NAME,
  RENDERER_VERSION,
  renderPlanToMidi,
  sha256,
  stableStringify,
} from "./render.mjs";

/**
 * Render one ExtractedSection-compatible object into a deterministic type-1
 * Standard MIDI File plus a JSON-ready provenance sidecar.
 */
export function renderSectionToMidi(section, options = {}) {
  const {
    augmentation = null,
    ...renderOptions
  } = options;
  const publicSource = Array.isArray(section?.chords)
    ? { ...section, chords: section.chords.map(sanitizePublicHooktheoryChord) }
    : section;
  const sourceSha256 = sha256(stableStringify(publicSource));
  const basePlan = createRenderPlan(section, renderOptions);
  const plan = augmentation ? augmentRenderPlan(basePlan, augmentation) : basePlan;
  const rendered = renderPlanToMidi(plan, { sourceSha256 });
  return { ...rendered, plan };
}
