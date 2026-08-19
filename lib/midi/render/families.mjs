export const RENDERER_FAMILY_IDS = Object.freeze({
  CANONICAL: "canonical-v1",
  CUSTOM: "custom-texture-v1",
  OCTAVE: "octave-texture-v1",
  VOICING: "voicing-texture-v1",
  ARPEGGIO_STRUM: "arpeggio-strum-v1",
  BASS: "bass-split-v1",
  SUSTAIN: "sustain-pedal-v1",
  SYNCOPATION: "syncopation-v1",
  HUMANIZE: "humanize-v1",
  TRACK_LAYOUT: "track-layout-v1",
  INSTRUMENTATION: "instrumentation-v1",
  COMPOSITE: "composite-texture-v1",
});

const RECIPES = {
  [RENDERER_FAMILY_IDS.OCTAVE]: {
    octaveShiftOctaves: "seeded",
    octaveDoubling: "seeded",
  },
  [RENDERER_FAMILY_IDS.VOICING]: {
    voicingVariant: "seeded",
  },
  [RENDERER_FAMILY_IDS.ARPEGGIO_STRUM]: {
    strumTicks: 12,
    strumDirection: "seeded",
  },
  [RENDERER_FAMILY_IDS.BASS]: {
    bassSplit: true,
    bassMode: "move",
    bassOctaveShift: -1,
    bassProgram: 32,
  },
  [RENDERER_FAMILY_IDS.SUSTAIN]: {
    sustainPedal: true,
    sustainTargets: ["harmony", "bass"],
  },
  [RENDERER_FAMILY_IDS.SYNCOPATION]: {
    syncopationTicks: 24,
    syncopationProbability: 0.75,
  },
  [RENDERER_FAMILY_IDS.HUMANIZE]: {
    velocityJitter: 0.05,
    timingJitterTicks: 4,
    durationJitterTicks: 3,
  },
  [RENDERER_FAMILY_IDS.TRACK_LAYOUT]: {
    layoutVariant: "seeded",
    trackDropoutProbability: 0.5,
  },
  [RENDERER_FAMILY_IDS.INSTRUMENTATION]: {
    instrumentPrograms: "seeded",
  },
  [RENDERER_FAMILY_IDS.COMPOSITE]: {
    octaveDoubling: "seeded",
    voicingVariant: "seeded",
    strumTicks: 9,
    strumDirection: "seeded",
    bassSplit: true,
    bassMode: "move",
    bassOctaveShift: -1,
    bassProgram: 32,
    sustainPedal: true,
    sustainTargets: ["harmony", "bass"],
    syncopationTicks: 18,
    syncopationProbability: 0.5,
    velocityJitter: 0.04,
    timingJitterTicks: 3,
    durationJitterTicks: 2,
    permuteTracks: true,
    instrumentPrograms: "seeded",
  },
};

export const AUGMENTATION_RECIPES = Object.freeze(Object.fromEntries(
  Object.entries(RECIPES).map(([id, recipe]) => [id, Object.freeze({ ...recipe })]),
));

export const AUGMENTATION_FAMILY_IDS = Object.freeze(Object.keys(AUGMENTATION_RECIPES));

export function resolveAugmentationFamily(config = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("augmentation config must be an object");
  }
  if (Object.hasOwn(config, "rendererFamilyId") || Object.hasOwn(config, "familyId")) {
    throw new Error("renderer family IDs are assigned by recipes and cannot be overridden");
  }
  const recipeId = config.recipe == null ? null : String(config.recipe);
  if (recipeId && !Object.hasOwn(AUGMENTATION_RECIPES, recipeId)) {
    throw new RangeError(`Unknown augmentation recipe ${JSON.stringify(recipeId)}; expected one of ${AUGMENTATION_FAMILY_IDS.join(", ")}`);
  }
  return {
    rendererFamilyId: recipeId || RENDERER_FAMILY_IDS.CUSTOM,
    recipeId,
    config: {
      ...(recipeId ? AUGMENTATION_RECIPES[recipeId] : {}),
      ...config,
    },
  };
}
