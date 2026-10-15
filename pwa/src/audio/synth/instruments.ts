/** Native enum identifiers and declaration/menu order (Android AudioEngine). */
export enum Waveform {
  CHURCH_ORGAN = 'CHURCH_ORGAN',
  ELECTRIC_PIANO = 'ELECTRIC_PIANO',
  MARIMBA = 'MARIMBA',
  REED_ORGAN = 'REED_ORGAN',
  STRINGS = 'STRINGS',
  CLARINET = 'CLARINET',
  FLUTE = 'FLUTE',
  VIBRAPHONE = 'VIBRAPHONE',
  WARM_ORGAN = 'WARM_ORGAN',
  SAWTOOTH = 'SAWTOOTH',
  SINE = 'SINE',
  SQUARE = 'SQUARE',
  TRIANGLE = 'TRIANGLE',
}

export interface InstrumentMetadata {
  readonly waveform: Waveform;
  readonly displayName: string;
  readonly categoryName: 'Synths' | 'Waveforms';
  readonly gain: number;
  readonly isPlucked: boolean;
}

function preset(waveform: Waveform, displayName: string, gain: number,
  categoryName: InstrumentMetadata['categoryName'] = 'Synths'): InstrumentMetadata {
  return Object.freeze({ waveform, displayName, gain, categoryName,
    isPlucked: waveform === Waveform.STRINGS });
}

/** Per-voice compensation is applied exactly once by SynthVoice. */
export const INSTRUMENTS: readonly InstrumentMetadata[] = Object.freeze([
  preset(Waveform.CHURCH_ORGAN, 'Church Organ', 1.57),
  preset(Waveform.ELECTRIC_PIANO, 'Electric Piano', 0.61),
  preset(Waveform.MARIMBA, 'Marimba', 1.31),
  preset(Waveform.REED_ORGAN, 'Reed Organ', 1.26),
  preset(Waveform.STRINGS, 'Strings', 1.74),
  preset(Waveform.CLARINET, 'Synth Clarinet', 1.13),
  preset(Waveform.FLUTE, 'Synth Flute', 1.09),
  preset(Waveform.VIBRAPHONE, 'Vibraphone', 0.65),
  preset(Waveform.WARM_ORGAN, 'Warm Organ', 1.22),
  preset(Waveform.SAWTOOTH, 'Sawtooth', 0.74, 'Waveforms'),
  preset(Waveform.SINE, 'Sine', 1.00, 'Waveforms'),
  preset(Waveform.SQUARE, 'Square', 0.49, 'Waveforms'),
  preset(Waveform.TRIANGLE, 'Triangle', 1.18, 'Waveforms'),
]);

export const DEFAULT_WAVEFORM = Waveform.CLARINET;

export function instrumentMetadata(waveform: Waveform): InstrumentMetadata {
  const value = INSTRUMENTS.find((instrument) => instrument.waveform === waveform);
  if (!value) throw new RangeError('Unknown instrument identifier');
  return value;
}

/** Exact native saved-name decoding: unknown, differently cased or missing -> clarinet. */
export function decodeInstrument(identifier: string | null | undefined): Waveform {
  return INSTRUMENTS.find((instrument) => instrument.waveform === identifier)?.waveform
    ?? DEFAULT_WAVEFORM;
}
