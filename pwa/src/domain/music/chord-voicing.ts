import { nativeBooleanOrNull } from './native-json';
/** Ordered voicing port from Android ChordVoicing.kt at 801cf798. */
import type { JsonObject, JsonValue, KeyInfo } from '../../contracts';
import { CHORD_QUALITIES, SCALE_INTERVALS } from './tables';
import { floorMod } from './spelled-pitch';
import { getModifierValue, getNoteLabel } from './theory';

/** Harmonic role survives movement; written register and normalized shift origin stay distinct. */
export class ChordTone {
  constructor(readonly midi: number, readonly slot: number, readonly degree: number,
    readonly writtenOctave = Math.floor(midi / 12) - 1, readonly shiftMidi = midi) {}
  shifted(semitones: number): ChordTone { return new ChordTone(this.shiftMidi + semitones, this.slot, this.degree); }
  raisedOctave(): ChordTone { return new ChordTone(this.midi + 12, this.slot, this.degree, this.writtenOctave + 1, this.shiftMidi + 12); }
}
function copyTone(tone: ChordTone, changes: Partial<Pick<ChordTone, 'midi' | 'slot' | 'degree' | 'writtenOctave' | 'shiftMidi'>>): ChordTone {
  return new ChordTone(changes.midi ?? tone.midi, changes.slot ?? tone.slot, changes.degree ?? tone.degree,
    changes.writtenOctave ?? tone.writtenOctave, changes.shiftMidi ?? tone.shiftMidi);
}
export class VoicedChord {
  constructor(readonly rootName: string, readonly rootMidi: number, readonly tones: readonly ChordTone[]) {}
  get labels(): string[] {
    return this.tones.map(tone => {
      const natural = major[floorMod(tone.degree - 1, 7)];
      let alteration = floorMod(tone.midi - this.rootMidi - natural, 12);
      if (alteration > 6) alteration -= 12;
      return (alteration < 0 ? '♭'.repeat(-alteration) : '♯'.repeat(alteration)) + tone.degree + '\u0302';
    });
  }
}
const major = [0, 2, 4, 5, 7, 9, 11];
const pcs = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
function intOrNull(value: JsonValue | undefined): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?[0-9]+$/.test(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : null;
}
function int(chord: JsonObject, name: string, fallback = 0): number { return intOrNull(chord[name]) ?? fallback; }
function string(chord: JsonObject, name: string): string {
  const value = chord[name];
  return value != null && typeof value !== 'object' ? String(value) : '';
}
function flag(chord: JsonObject, name: string): boolean { return nativeBooleanOrNull(chord[name]) === true; }
function ints(chord: JsonObject, name: string): number[] {
  const value = chord[name];
  return Array.isArray(value) ? value.map(intOrNull).filter((item): item is number => item !== null) : [];
}
function strings(chord: JsonObject, name: string): string[] {
  const value = chord[name];
  return Array.isArray(value) ? value.filter(item => item != null && typeof item !== 'object').map(item => String(item)) : [];
}
function absolutePc(name: string): number {
  const natural: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (natural[name[0]?.toUpperCase()] ?? 0) + getModifierValue(name.slice(1));
}
function pc(name: string): number { return floorMod(absolutePc(name), 12); }
function note(degree: number, key: KeyInfo, custom: readonly number[] | null = null): string {
  return getNoteLabel(degree, key.tonic, key.scale, custom ?? undefined);
}
function custom(chord: JsonObject): readonly number[] | null {
  const source = chord.borrowed;
  if (!Array.isArray(source)) return null;
  if (source.length === 0) return major;
  const result: number[] = [];
  for (let index = 0; index < 7; index++) result.push(floorMod(intOrNull(source[index]) ?? ((result.at(-1) ?? 0) + 2), 12));
  return result;
}
function qualities(intervals: readonly number[]): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const third = floorMod(intervals[(i + 2) % 7] - intervals[i], 12);
    const fifth = floorMod(intervals[(i + 4) % 7] - intervals[i], 12);
    if (third === 3 && fifth === 6) return 'diminished';
    if (third === 4 && fifth === 8) return 'augmented';
    return third === 4 ? 'major' : 'minor';
  });
}
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
function hasScaleRoot(scale: string, root: number, pairs: readonly (readonly [string, number])[]): boolean {
  return pairs.some(([candidateScale, candidateRoot]) => candidateScale === scale && candidateRoot === root);
}
function removeFirstValue<T>(values: T[], value: T): void {
  const index = values.indexOf(value); if (index >= 0) values.splice(index, 1);
}

export function buildChordVoicing(chord: JsonObject, key: KeyInfo): VoicedChord | null {
  const root = int(chord, 'root');
  if (flag(chord, 'isRest') || flag(chord, 'rest')) return null;
  if (root < 1 || root > 7) {
    if (root !== 0) return null;
    const letterRoot = string(chord, '_letterRootName');
    if (!/^[A-G][#bx]*$/.test(letterRoot)) return null;
    const built = buildFrame(chord, key, letterRoot, string(chord, '_letterQuality') || 'major', 1, null, true,
      flag(chord, 'dimTriad') && !flag(chord, 'halfDim'));
    const slash = string(chord, '_letterBassName');
    if (!slash) return built;
    const index = built.tones.findIndex(tone => floorMod(tone.midi, 12) === pc(slash));
    if (index < 0) return built;
    const rotated = [...built.tones.slice(index), ...built.tones.slice(0, index)];
    if (rotated.length > 1) while (rotated[0].shiftMidi >= rotated[1].shiftMidi) rotated[0] = rotated[0].shifted(-12);
    return new VoicedChord(built.rootName, built.rootMidi, rotated);
  }
  const customIntervals = custom(chord);
  const borrowed = string(chord, 'borrowed');
  const hasBorrowed = borrowed !== '' || customIntervals !== null;
  const resolvedKey = { tonic: key.tonic, scale: customIntervals !== null ? 'custom' : borrowed || key.scale };
  const applied = int(chord, 'applied');
  const target = note(root, resolvedKey, customIntervals);
  const type = int(chord, 'type', 5);
  const sus = ints(chord, 'suspensions').length > 0;
  if (applied >= 1 && applied <= 7) {
    const targetKey = { tonic: target, scale: 'major' };
    const triSub = applied === 5 && strings(chord, 'substitutions').includes('tri');
    if (triSub) return buildFrame(chord, key, pcs[(pc(target) + 1) % 12], 'major', 1, null, true, false);
    const actualRoot = note(applied, targetKey);
    const quality = CHORD_QUALITIES.major[applied - 1];
    const sharp5 = strings(chord, 'alterations').includes('#5') && applied === 7;
    if (!hasBorrowed) {
      const minorSharp5 = sharp5 && type < 7;
      const effective = { ...chord, useMaj7: flag(chord, 'useMaj7') || (type >= 7 && quality === 'major' && applied !== 5 && !sus) };
      return buildFrame(effective, key, actualRoot, minorSharp5 ? 'minor' : quality, applied, null, true, !minorSharp5 && applied === 7 && !sus);
    }
    if (borrowed === 'locrian' && root === 1 && applied === 1 && type < 7) return buildFrame(chord, key, target, 'minor', 1, null, true, false);
    if (sharp5) return buildFrame(chord, key, actualRoot, 'minor', applied, null, true, false);
    if (customIntervals !== null && [1, 2].includes(int(chord, 'inversion'))) return buildFrame(chord, key, target, 'major', 1, null, true, false);
    return buildFrame(chord, targetKey, actualRoot, quality, applied, null, false, false, '');
  }
  const quality = (customIntervals !== null ? qualities(customIntervals) : lookup(CHORD_QUALITIES, resolvedKey.scale) ?? CHORD_QUALITIES.major)[root - 1];
  return buildFrame(chord, key, target, quality, root, customIntervals, false, false);
}

function buildFrame(chord: JsonObject, key: KeyInfo, rootName: string, rawQuality: string, root: number,
  customIntervals: readonly number[] | null, appliedFrame: boolean, fullyDim: boolean, borrowedOverride: string | null = null): VoicedChord {
  const type = int(chord, 'type', 5), inversion = Math.max(0, int(chord, 'inversion'));
  const suspensions = ints(chord, 'suspensions'), sus = suspensions.length > 0;
  const omits = ints(chord, 'omits'), omit35 = omits.includes(3) && omits.includes(5);
  const adds = ints(chord, 'adds');
  let alts = strings(chord, 'alterations');
  const borrowed = borrowedOverride ?? string(chord, 'borrowed');
  const scale = customIntervals !== null ? 'custom' : borrowed || key.scale;
  const halfDim = flag(chord, 'halfDim'), dimTriad = flag(chord, 'dimTriad');
  const appliedContext = chord.appliedContext;
  const hasAppliedContext = appliedContext != null && (typeof appliedContext === 'string' ? appliedContext !== ''
    : typeof appliedContext === 'boolean' ? appliedContext : typeof appliedContext === 'number' ? appliedContext !== 0 : true);
  const rawNo5ScaleSeventh = omits.includes(5) && !halfDim && !dimTriad && !hasAppliedContext && int(chord, 'applied') !== 7;
  const rawLydianFourth = string(chord, 'borrowed') === 'lydian' && root === 4 && !halfDim;
  const sharp5Minor = alts.includes('#5') && rawQuality === 'diminished';
  const halfDimIi = !sus && root === 2 && scale === 'major' && type >= 7 && halfDim;
  const customHalf = customIntervals !== null && halfDim;
  const phdmBVI = borrowed === 'phrygianDominant' && root === 6 && type >= 7 && inversion !== 3 && !alts.includes('#5');
  const phdmII = borrowed === '' && key.scale === 'phrygianDominant' && root === 2 && type >= 7 && inversion === 3;
  const quality = appliedFrame ? halfDim || dimTriad ? 'diminished' : sus && rawQuality === 'diminished' ? 'major' : rawQuality
    : halfDimIi ? 'diminished' : customHalf || sharp5Minor ? 'minor' : dimTriad || halfDim ? 'diminished'
      : phdmBVI || phdmII ? 'major' : sus && ['diminished', 'augmented'].includes(rawQuality) ? 'major' : rawQuality;
  const policyHalf = halfDim || halfDimIi || (rawQuality === 'diminished' && type >= 7 && !sharp5Minor && !customHalf);
  const augStack = !appliedFrame && quality === 'augmented' && type >= 7 && !sus && !omit35;
  const minorV13 = !appliedFrame && scale === 'minor' && root === 5 && rawQuality === 'minor' && type >= 13 && !sus;
  const minorI13 = !appliedFrame && scale === 'minor' && root === 1 && rawQuality === 'minor' && type >= 13 && !sus && !omit35;
  const hmV13 = !appliedFrame && borrowed === 'harmonicMinor' && root === 5 && type >= 13 && !sus && !omit35;
  if (!appliedFrame) {
    if (customHalf) { alts = alts.filter(alt => alt !== 'b9'); if (type >= 7 && !alts.includes('b5')) alts.push('b5'); }
    else if (halfDim && type >= 9) { if (!alts.includes('b5')) alts.push('b5'); if (omit35) removeFirstValue(alts, 'b9'); }
    if (minorV13) { if (!alts.includes('b9')) alts.push('b9'); if (!alts.includes('b13')) alts.push('b13'); }
    if (minorI13 && !alts.includes('b13')) alts.push('b13');
  }
  const flattenB5 = !customHalf && (chord.flattenHalfDimB5 !== undefined ? flag(chord, 'flattenHalfDimB5') : halfDim && alts.includes('b5') && type <= 7);
  const rootMidi = 48 + pc(rootName), rootPc = pc(rootName);
  function scaleTone(offset: number, slot: number, degree: number): ChordTone {
    const simple = floorMod(degree - 1, 7) + 1, octave = Math.floor((degree - 1) / 7);
    const natural = major[simple - 1], accidental = offset - natural - octave * 12;
    const unaltered = note(simple, { tonic: rootName, scale: 'major' });
    const modifier = getModifierValue(unaltered.slice(1)) + accidental;
    const label = unaltered[0] + (modifier < 0 ? 'b'.repeat(-modifier) : '#'.repeat(modifier));
    let octaveOffset = Math.floor((pc(rootName) + natural + accidental) / 12);
    const order = 'CDEFGAB';
    if (order.indexOf(label[0]) < order.indexOf(rootName[0]) && pc(rootName) + natural + accidental >= 0
      && pc(rootName) + natural + accidental < 12 && octaveOffset === 0) octaveOffset = 1;
    const written = 3 + octave + octaveOffset;
    return new ChordTone((written + 1) * 12 + absolutePc(label), slot, degree, written, (written + 1) * 12 + pc(label));
  }
  const tones: ChordTone[] = [];
  function tone(offset: number, slot: number, degree: number, scaleNote = false): void {
    tones.push(scaleNote ? scaleTone(offset, slot, degree) : new ChordTone(rootMidi + offset, slot, degree));
  }
  function has(offset: number): boolean { return tones.some(tone => floorMod(tone.midi - rootMidi, 12) === floorMod(offset, 12)); }
  function append(offset: number, slot: number, degree: number, scaleNote = false): void { if (!has(offset)) tone(offset, slot, degree, scaleNote); }
  function removeFirst(offset: number): void {
    const index = tones.findIndex(tone => floorMod(tone.midi - rootMidi, 12) === offset); if (index >= 0) tones.splice(index, 1);
  }
  tone(0, 0, 1, !appliedFrame);
  tone(quality === 'minor' || quality === 'diminished' ? 3 : 4, 1, 3, !appliedFrame);
  if (!(augStack && inversion !== 3)) tone(quality === 'diminished' ? 6 : quality === 'augmented' ? 8 : 7, 2, 5, !appliedFrame);
  const dimScale = rawQuality === 'diminished' && (scale === 'custom' || hasScaleRoot(scale, root,
    [['dorian', 6], ['lydian', 4], ['minor', 2], ['harmonicMinor', 2], ['major', 7], ['phrygian', 5], ['locrian', 1]]));
  const m6Stack = !appliedFrame && halfDim && type >= 7 && inversion === 1 && !sus && !omit35
    && (borrowed === 'mixolydian' || hasScaleRoot(scale, root, [['harmonicMinor', 2], ['major', 7], ['mixolydian', 3]]));
  const intervals = customIntervals ?? lookup(SCALE_INTERVALS, scale) ?? major;
  const seventhInterval = floorMod(intervals[(root + 5) % 7] - intervals[root - 1], 12);
  const diatonic7 = seventhInterval === 11 ? 11 : seventhInterval === 9 ? 9 : 10;
  if (type >= 7) {
    if (augStack && inversion !== 3) { tone(11, 3, 7); if (!omits.includes(5)) tone(7, 2, 5); }
    else {
      const seventh = appliedFrame ? fullyDim ? 9 : halfDim ? 10 : dimTriad ? 9
        : rawQuality === 'diminished' && alts.includes('#5') ? 10 : flag(chord, 'useMaj7') ? 11 : 10
        : omit35 ? halfDim ? 9 : sus ? 10 : rawNo5ScaleSeventh ? diatonic7 : dimScale ? 9 : diatonic7
          : augStack ? 11 : m6Stack ? 9 : phdmII && suspensions.includes(2) && !suspensions.includes(4) ? 11
            : sus || int(chord, 'applied') === 5 && !flag(chord, 'useMaj7') ? 10
              : borrowed === 'minor' && key.scale === 'harmonicMinor' && root === 1 ? 10
                : customHalf ? 9 : sharp5Minor ? 10 : dimTriad ? 9 : customIntervals !== null && rawQuality === 'diminished' ? diatonic7
                  : phdmII ? 11 : rawNo5ScaleSeventh ? diatonic7 : dimScale ? 9 : diatonic7;
      tone(seventh, m6Stack ? 9 : 3, m6Stack ? 6 : 7, !appliedFrame && omit35);
    }
  }
  const customHalf11 = !appliedFrame && customHalf && type >= 11;
  const dimNatural11 = !appliedFrame && type >= 11 && (customIntervals !== null && dimTriad && !halfDim
    || ['harmonicMinor', 'phrygianDominant'].includes(borrowed) && quality === 'diminished');
  const skipNine = !appliedFrame && (borrowed === 'lydian' && (halfDim || quality === 'diminished') && type >= 11
    || ['harmonicMinor', 'phrygianDominant'].includes(borrowed) && type >= 11 && quality === 'diminished' || omit35 && (halfDim || policyHalf));
  if (type >= 9 && !skipNine && !customHalf11) append(14, 4, 9, true);
  if (customHalf11 && quality === 'minor') append(1, 4, 9);
  else if (dimNatural11 && quality === 'diminished') { append(1, 4, 9); append(5, 5, 11); }
  else if (type >= 11) { if (policyHalf && skipNine && borrowed !== 'lydian') append(1, 4, 9); else append(5, 5, 11); }
  if (type >= 13) append(21, 6, 13, true);
  else if (type >= 11 && appliedFrame && alts.includes('b5') && !has(9)) { removeFirst(5); tone(21, 6, 13, true); }
  // Captured minor ii and raw borrowed Lydian #iv elevenths retain b7, b9 and 11.
  if (!appliedFrame && type === 11 && (scale === 'minor' && root === 2 || rawLydianFourth) && !dimTriad && !sus) {
    const rootTone = tones.find(tone => tone.slot === 0)!;
    for (const [role, semitones] of [[3, 10], [4, 1], [5, 5]]) {
      const index = tones.findIndex(tone => tone.slot === role);
      if (index < 0) tones.push(copyTone(rootTone.shifted(role === 4 ? 13 : semitones), { slot: role, degree: role === 3 ? 7 : role === 4 ? 9 : 11 }));
      else {
        let shift = floorMod(rootPc + semitones, 12) - floorMod(tones[index].midi, 12);
        while (shift > 6) shift -= 12;
        while (shift < -6) shift += 12;
        if (shift !== 0) tones[index] = tones[index].shifted(shift);
      }
    }
  }
  // Implicit extensions follow the prevailing scale before explicit modifiers.
  if (!appliedFrame && type < 13 && !halfDim && !dimTriad && !sus) {
    const customExtensions = Array.isArray(chord.borrowed);
    for (let index = 0; index < tones.length; index++) {
      const role = tones[index].slot;
      if (role !== 4 && role !== 5) continue;
      if (!customExtensions && role === 5 && scale !== 'lydian') continue;
      const minorSupertonicNinth = role === 4 && scale === 'minor' && root === 2;
      if (!customExtensions && quality === 'diminished' && !minorSupertonicNinth && !rawLydianFourth) continue;
      const extension = role === 4 ? 9 : 11, targetDegree = floorMod(root + extension - 2, 7) + 1;
      const desired = pc(note(targetDegree, { tonic: key.tonic, scale }, customIntervals));
      let shift = desired - floorMod(tones[index].midi, 12);
      while (shift > 6) shift -= 12;
      while (shift < -6) shift += 12;
      if (shift !== 0) tones[index] = tones[index].shifted(shift);
    }
  }
  if (suspensions.includes(4) || suspensions.includes(2)) {
    const index = tones.findIndex(tone => tone.slot === 1), degree = suspensions.includes(4) ? 4 : 2;
    if (index >= 0) {
      tones[index] = scaleTone(degree === 4 ? 5 : 2, degree === 4 ? 8 : 7, degree);
      if (degree === 2 && !appliedFrame && phdmII) tones[index] = tones[index].shifted(1);
      if (suspensions.includes(2) && suspensions.includes(4)) {
        tones.push(scaleTone(2, 7, 2));
        if (!appliedFrame && scale === 'harmonicMinor' && root === 6) {
          for (let toneIndex = 0; toneIndex < tones.length; toneIndex++) {
            if ([3, 7, 8].includes(tones[toneIndex].slot)) tones[toneIndex] = tones[toneIndex].shifted(1);
          }
        }
      }
    }
  }
  if (!appliedFrame && rawQuality === 'diminished' && omits.includes(5) && suspensions.includes(2)
    && !halfDim && !dimTriad && !hasAppliedContext && int(chord, 'applied') === 0) {
    const index = tones.findIndex(tone => tone.slot === 7);
    if (index >= 0) {
      const desired = pc(note(root % 7 + 1, { tonic: key.tonic, scale }, customIntervals));
      let shift = desired - floorMod(tones[index].midi, 12);
      while (shift > 6) shift -= 12;
      while (shift < -6) shift += 12;
      tones[index] = tones[index].shifted(shift);
    }
  }
  const modifierHalf = appliedFrame ? halfDim : !dimTriad && (halfDim || policyHalf);
  let effectiveOmits = omits;
  const retainOmittedFifth = appliedFrame ? nativeBooleanOrNull(chord.retainHalfDimOmittedFifth) ?? (!dimTriad && halfDim) : !dimTriad && halfDim;
  if (retainOmittedFifth && omits.includes(5)) effectiveOmits = omits.filter(omit => omit !== 5);
  if (omits.includes(3) && (suspensions.includes(2) || suspensions.includes(4))) effectiveOmits = omits.filter(omit => omit !== 3);
  if (!appliedFrame && quality === 'augmented' && omits.includes(5) && (!omits.includes(3) && type < 7 || omits.includes(3))) effectiveOmits = omits.filter(omit => omit !== 5);
  for (let index = tones.length - 1; index >= 0; index--) {
    if (tones[index].slot === 1 && effectiveOmits.includes(3) || tones[index].slot === 2 && effectiveOmits.includes(5)) tones.splice(index, 1);
  }
  function shiftFirst(offset: number, delta: number, degree: number | null = null): boolean {
    const index = tones.findIndex(tone => floorMod(tone.midi - rootMidi, 12) === offset);
    if (index < 0) return false;
    const changed = tones[index].shifted(delta);
    tones[index] = degree === null ? changed : copyTone(changed, { degree, slot: degree === 9 ? 4 : degree === 11 ? 5 : degree === 13 ? 6 : changed.slot });
    return true;
  }
  for (const raw of alts) {
    const alt = raw.toLowerCase().replaceAll('♭', 'b').replaceAll('♯', '#');
    if (alt === 'b5' || alt === '#5') {
      const delta = alt === 'b5' ? -1 : 1;
      if (alt === 'b5' && customHalf && !appliedFrame) {
        const index = tones.findIndex(tone => tone.slot === 2);
        if (index >= 0) tones[index] = new ChordTone(tones[0].shiftMidi + 6, 2, 5);
        continue;
      }
      if (alt === 'b5' && modifierHalf && flattenB5) { shiftFirst(7, -1); shiftFirst(10, -1); continue; }
      if (alt === 'b5' && type >= 13) removeFirst(5);
      if (alt === 'b5' && (modifierHalf || dimTriad || !appliedFrame && quality === 'diminished')) continue;
      if (alt === '#5' && int(chord, 'applied') === 7 && type >= 7) {
        for (let index = 0; index < tones.length; index++) {
          const offset = floorMod(tones[index].midi - rootMidi, 12);
          if (offset === 6 || offset === 9) tones[index] = new ChordTone(tones[0].shiftMidi + (offset === 6 ? 8 : 10), tones[index].slot, tones[index].degree);
        }
        continue;
      }
      if (alt === 'b5' && !appliedFrame && quality === 'augmented' && shiftFirst(8, -2)) continue;
      const index = tones.findIndex(tone => {
        const offset = floorMod(tone.midi - rootMidi, 12); return offset === 7 || alt === '#5' && offset === 6;
      });
      if (index >= 0) tones[index] = tones[index].shifted(delta);
      else if (!has(6 + delta)) tone(alt === 'b5' ? 6 : 8, 2, 5, true);
      continue;
    }
    const spec = lookup({
      b9: [2, -1, 9], '#9': [2, 1, 9], '9': [2, 0, 9], b11: [5, -1, 11], '#11': [5, 1, 11], '11': [5, 0, 11],
      b13: [9, -1, 13], '#13': [9, 1, 13],
    } as Readonly<Record<string, readonly [number, number, number]>>, alt);
    if (!spec) continue;
    const [offset, delta, degree] = spec;
    const ninthIndex = degree === 9 && type >= 9 && type <= 11 ? tones.findIndex(tone => tone.slot === 4) : -1;
    if (ninthIndex >= 0) {
      const desiredPc = floorMod(rootPc + 2 + delta, 12);
      let shift = desiredPc - floorMod(tones[ninthIndex].midi, 12);
      while (shift > 6) shift -= 12;
      while (shift < -6) shift += 12;
      if (shift !== 0) tones[ninthIndex] = tones[ninthIndex].shifted(shift);
      continue;
    }
    if (alt === '#9' && type >= 13) append(6, 5, 11);
    if (alt === 'b13' && (minorV13 || minorI13 || hmV13)) { append(20, 6, 13, true); continue; }
    if (alt === '#11' && suspensions.includes(4)) { append(18, 5, 11, true); continue; }
    if (!shiftFirst(offset, delta, degree) && delta !== 0) append(offset + delta + 12, degree === 9 ? 4 : degree === 11 ? 5 : 6, degree, true);
  }
  const hasSeventh = tones.some(tone => tone.slot === 3);
  for (const add of adds) {
    const degree = add <= 6 && hasSeventh ? add + 7 : add;
    const spec: readonly [number, number, number] | undefined = ({
      2: [14, 4, 9], 9: [14, 4, 9], 4: [5, 8, 4], 6: [9, 9, 6], 11: [17, 5, 11], 13: [21, 6, 13],
    } as Readonly<Record<number, readonly [number, number, number]>>)[degree];
    if (spec) append(spec[0], spec[1], spec[2], true);
  }
  if (adds.includes(6) && type < 7 && !adds.includes(9)) {
    // Native indexOfLast: ES2022 target has no findLastIndex.
    for (let index = tones.length - 1; index >= 0; index--) {
      if (tones[index].slot === 2 && floorMod(tones[index].midi - rootMidi, 12) === 7) { tones.splice(index, 1); break; }
    }
  }
  const hasFifthAlteration = strings(chord, 'alterations').some(alt => ['b5', '#5', '♭5', '♯5'].includes(alt));
  if (type >= 9 && sus && !omits.includes(5) && !hasFifthAlteration) {
    const index = tones.findIndex(tone => tone.slot === 2 && floorMod(tone.midi - rootMidi, 12) === 7);
    if (index >= 0) tones.splice(index, 1);
  }
  if (type === 11 && inversion === 0 && !hasFifthAlteration) {
    for (let index = tones.length - 1; index >= 0; index--) if (tones[index].slot === 1 || tones[index].slot === 2) tones.splice(index, 1);
  }
  if (tones.length > 0 && inversion > 0) {
    if (appliedFrame) {
      const rotation = inversion % tones.length;
      const rotated = [...tones.slice(rotation), ...tones.slice(0, rotation)];
      const bassOctave = Math.max(1, rotated[0].writtenOctave - 1);
      const upperOctave = Math.max(rotated.length > 1 ? Math.max(...rotated.slice(1).map(tone => tone.writtenOctave)) : 0, bassOctave + 1);
      tones.length = 0;
      rotated.forEach((tone, index) => {
        // Cb/B# retain literal written pitch offset across an octave change.
        const writtenPitch = tone.midi - (tone.writtenOctave + 1) * 12;
        tones.push(new ChordTone((index === 0 ? bassOctave + 1 : upperOctave + 1) * 12 + writtenPitch, tone.slot, tone.degree));
      });
    } else {
      const seventhIndex = inversion === 3 && omits.includes(5) && !halfDim && !dimTriad ? tones.findIndex(tone => tone.slot === 3) : -1;
      for (let count = 0; count < (seventhIndex >= 0 ? seventhIndex : inversion); count++) tones.push(tones.shift()!.raisedOctave());
    }
  }
  if (!appliedFrame && type < 7 && inversion === 2 && omits.includes(3) && !omits.includes(5) && tones.length === 2) {
    const rootTone = tones.find(tone => tone.slot === 0), fifth = tones.find(tone => tone.slot === 2);
    if (rootTone && fifth) {
      let bass = fifth.midi;
      while (bass >= rootTone.midi) bass -= 12;
      tones.length = 0; tones.push(copyTone(fifth, { midi: bass }), rootTone);
    }
  }
  if (inversion === 0) {
    const spread = appliedFrame ? type >= 7 && (fullyDim || quality === 'diminished')
      : type >= 7 && !customHalf && !sharp5Minor && (rawQuality === 'diminished' || halfDimIi || dimScale);
    if (spread && tones.length >= 4) {
      const rootOctave = tones[0].writtenOctave;
      for (const index of [1, 2]) if (tones[index].writtenOctave === rootOctave) tones[index] = tones[index].shifted(12);
    }
    tones.sort((a, b) => a.midi - b.midi);
  }
  return new VoicedChord(rootName, 48 + rootPc, tones);
}

export function getChordNotes(chord: JsonObject, key: KeyInfo): number[] { return buildChordVoicing(chord, key)?.tones.map(tone => tone.midi) ?? []; }
export function getResolvedRootMidi(chord: JsonObject, key: KeyInfo): number | null { return buildChordVoicing(chord, key)?.rootMidi ?? null; }
export function getChordToneLabels(chord: JsonObject, key: KeyInfo): string[] { return buildChordVoicing(chord, key)?.labels ?? []; }
export function getRootPositionChordNotes(chord: JsonObject, key: KeyInfo): number[] { return getChordNotes({ ...chord, inversion: 0 }, key); }
