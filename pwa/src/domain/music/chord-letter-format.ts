/** Source-style letter notation from Android ChordLetterFormat.kt at 801cf798. */
import type { JsonObject, KeyInfo } from '../../contracts';
import { floorMod } from './spelled-pitch';
import { getModifierValue, getNoteLabel } from './theory';
import { ints, strings, safeInt, notePitchClass } from './chord-display-support';

function number(value: string): number { return safeInt(value.replace(/[^0-9]/g, '')); }
function group(tokens: readonly string[]): string { return tokens.length === 0 ? '' : '(' + tokens.join('') + ')'; }
function flatSeventh(root: string): string {
  const name = getNoteLabel(7, root, 'major'), modifier = getModifierValue(name.slice(1)) - 1;
  return name[0] + (modifier < 0 ? 'b'.repeat(-modifier) : '#'.repeat(modifier));
}
export function formatChordLetter(chord: JsonObject, root: string, quality: string, degree: number,
  majorSeventhHint: boolean, augmentedMajorSeventhHint: boolean, triSub: boolean,
  bassName: string | null, effectiveKey: KeyInfo, customIntervals: readonly number[] | null): string {
  const type = safeInt(chord.type, 5), inversion = safeInt(chord.inversion);
  const suspensions = [...new Set(ints(chord.suspensions))], suspended = suspensions.length > 0;
  const alterations = [...new Set(strings(chord.alterations))], omits = [...new Set(ints(chord.omits))], adds = [...new Set(ints(chord.adds))];
  function symbolicNote(relativeDegree: number): string {
    return getNoteLabel(floorMod(degree + relativeDegree - 2, 7) + 1, effectiveKey.tonic, effectiveKey.scale, customIntervals ?? undefined);
  }
  function symbolicInterval(relativeDegree: number): number | null {
    const notePc = notePitchClass(symbolicNote(relativeDegree), true), rootPc = notePitchClass(root, true);
    return notePc === null || rootPc === null ? null : floorMod(notePc - rootPc, 12);
  }
  const seventhInterval = symbolicInterval(7);
  const majorSeventh = type >= 7 && !suspended && !triSub && (seventhInterval === 11 || majorSeventhHint || augmentedMajorSeventhHint);
  const diminishedSeventh = type >= 7 && !suspended && (safeInt(chord.applied) === 7 || seventhInterval === 9);
  const diminished = quality === 'diminished', halfDiminished = diminished && type >= 7 && !majorSeventh && !diminishedSeventh;
  const minor = quality === 'minor', augmented = quality === 'augmented' || quality === 'major' && alterations.includes('#5');
  const bassRole = inversion === 1 ? suspensions.includes(4) ? 4 : suspensions.includes(2) ? 2 : 3 : inversion === 2 ? 5 : inversion === 3 ? 7 : null;
  let writtenBass: string | null = null;
  if (bassRole !== null && bassName !== null) {
    if (triSub) writtenBass = getNoteLabel(bassRole === 7 ? 'b7' : String(bassRole), root, 'major');
    else if (safeInt(chord.applied) === 7 && bassRole === 7) writtenBass = getNoteLabel('bb7', root, 'major');
    else if (bassRole === 3) writtenBass = getNoteLabel(minor || diminished ? 'b3' : '3', root, 'major');
    else if (bassRole === 5 && (diminished || safeInt(chord.applied) > 0) && type >= 7 && !suspended && alterations.includes('b5')) writtenBass = getNoteLabel('b5', root, 'major');
    else writtenBass = symbolicNote(bassRole);
  } else if (bassRole !== null) writtenBass = bassName;
  if (type === 11 && !majorSeventh && quality === 'major' && (degree === 5 || triSub) && !suspended
    && alterations.length === 0 && omits.length === 0 && adds.length === 0 && inversion === 0) return flatSeventh(root) + '/' + root;
  const plainMinorSeventh = type === 7 && inversion === 1 && !suspended && !majorSeventh && !diminishedSeventh
    && (minor || halfDiminished) && adds.length === 0 && omits.length === 0 && alterations.every(alt => alt === 'b5');
  if (plainMinorSeventh && writtenBass !== null) return writtenBass.replaceAll('x', '##') + (halfDiminished ? 'm' : '') + '6';
  const thirdInversion = type === 7 && inversion === 3 && !suspended && writtenBass !== null;
  const power = type < 7 && omits.includes(3) && !omits.includes(5) && !suspended && !diminished && alterations.length === 0;
  const qualityText = power ? '5' : suspended ? '' : diminished && (thirdInversion || type < 7 || diminishedSeventh) ? '°'
    : minor || halfDiminished || diminished && majorSeventh ? 'm' : augmented && (!majorSeventh || thirdInversion) ? '+' : '';
  const implicitAlterations: string[] = [];
  if (!suspended && (halfDiminished || diminished && majorSeventh)) implicitAlterations.push('b5');
  for (const extension of [9, 11, 13].filter(extension => extension <= type)) {
    if (alterations.some(alt => number(alt) === extension)) continue;
    const interval = symbolicInterval(extension); if (interval === null) continue;
    const difference = interval - (extension === 9 ? 2 : extension === 11 ? 5 : 9);
    if (difference !== 0) implicitAlterations.push((difference > 0 ? '#'.repeat(difference) : 'b'.repeat(-difference)) + extension);
  }
  let writtenType = type;
  while (writtenType >= 9 && [...alterations, ...implicitAlterations].some(alt => number(alt) === writtenType)) writtenType -= 2;
  if (thirdInversion || type < 7) writtenType = 0;
  const additionTokens = adds.filter(add => !(add === 2 && type >= 9) && !(add === 4 && type >= 11) && !(add === 6 && type >= 13))
    .map(add => 'add' + (add === 2 ? 9 : type >= 7 && add === 4 ? 11 : type >= 7 && add === 6 ? 13 : add));
  const plainSixth = type < 7 && adds.length === 1 && adds[0] === 6 && !suspended && !diminished && omits.length === 0 && alterations.length === 0;
  const sixNine = type < 7 && adds.length === 2 && adds.includes(6) && adds.includes(9) && !suspended && omits.length === 0 && alterations.length === 0;
  const extensionText = writtenType >= 7 ? (majorSeventh ? 'maj' : '') + writtenType : sixNine ? '6/9' : plainSixth ? '6' : '';
  const omissionTokens = omits.filter(omit => !(power && omit === 3)).map(omit => 'no' + omit);
  const modifierTokens = [...new Set([...alterations, ...implicitAlterations])];
  function remove(token: string): void { const index = modifierTokens.indexOf(token); if (index >= 0) modifierTokens.splice(index, 1); }
  if (thirdInversion && diminished) remove('b5');
  if (thirdInversion && augmented) remove('#5');
  if (augmented && majorSeventh && !thirdInversion && alterations.includes('#5') && !modifierTokens.includes('#5')) modifierTokens.push('#5');
  const susText = suspensions.map(suspension => {
    const interval = symbolicInterval(suspension), difference = interval === null ? 0 : interval - (suspension === 2 ? 2 : 5);
    let accidental = difference > 0 ? '#'.repeat(difference) : 'b'.repeat(-difference);
    if (suspension === 4 && suspensions.length === 1 && alterations.includes('#11')) accidental = '#';
    return 'sus' + accidental + suspension;
  }).join('');
  return root + qualityText + extensionText + group(plainSixth || sixNine ? [] : additionTokens) + group(omissionTokens)
    + group(modifierTokens) + susText + (writtenBass !== null ? '/' + writtenBass.replaceAll('x', '##') : '');
}
