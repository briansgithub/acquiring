/** Native display interpretation from Android ChordInterpreter.kt at 801cf798. */
import type { JsonObject, KeyInfo } from '../../contracts';
import { CHORD_QUALITIES, SCALE_INTERVALS } from './tables';
import { floorMod } from './spelled-pitch';
import { getModifierValue, getNoteLabel, resolveScaleDegreePitch } from './theory';
import { canonicalScaleName, degreeInKey, relativeIonianKey } from './relative-ionian';
import { resolveChordRoot } from './chord-root';
import { buildChordVoicing, type ChordTone } from './chord-voicing';
import { formatChordLetter } from './chord-letter-format';
import { ROMAN, BORROWED_TAG, lookup, safeInt, safeString, safeBoolean, ints, strings, rawCustomBorrowedIntervals,
  customBorrowedIntervals, customArrayTriadQuality, customArrayPrefix, customArraySeventhMajor, isTriSubApplied,
  isMajorSeventh, borrowedPrefix, triadQualityWithAlts, appliedTarget } from './chord-display-support';

interface SuffixOptions { fullyDiminished?: boolean; majorSeventh?: boolean; borrowedTag?: string; keyTonic?: string; keyScale?: string; borrowed?: string; quality?: string }
function buildSuffix(chord: JsonObject, quality: string, opts: SuffixOptions = {}): string {
  const type = safeInt(chord.type, 5), inversion = safeInt(chord.inversion);
  const suspensions = ints(chord.suspensions), alterations = strings(chord.alterations), omits = ints(chord.omits), adds = ints(chord.adds);
  const fullyDiminished = opts.fullyDiminished ?? false, majorSeventh = opts.majorSeventh ?? false, suspended = suspensions.length > 0;
  const displayAlts = alterations, altInline = displayAlts.map(alt => '(' + alt + ')').join('');
  const susStr = suspensions.map(suspension => 'sus' + suspension).join('');
  const omit3Only = omits.includes(3) && !omits.includes(5), sharp5Only = displayAlts.length === 1 && displayAlts[0] === '#5';
  const applied = safeInt(chord.applied), isApplied = applied >= 1 && applied <= 7;
  const suppressPlusForSharp5 = !isApplied && type < 7 && sharp5Only && [1, 2].includes(inversion);
  const suppressDimForSharp5Inv2 = sharp5Only && quality === 'diminished' && inversion === 2 && type < 7;
  let suffix = '', alterationsEmbedded = false, susPlaced = false, omitsPlaced = false, addsPlaced = false;
  const augmented = quality === 'augmented' || quality === 'major' && !suspended && alterations.includes('#5') && !suppressPlusForSharp5;
  if (augmented) suffix += '+';
  if (!suspended) {
    if (quality === 'diminished' && !suppressDimForSharp5Inv2) {
      if (type >= 7 && !fullyDiminished) suffix += 'ø';
      else { suffix += '°'; if (majorSeventh) suffix += '△'; }
    } else if (type >= 7 && majorSeventh) suffix += '△';
  }
  if (inversion === 1) {
    if (type >= 7) { suffix += altInline ? '6' + altInline + '5' : '65'; if (altInline) alterationsEmbedded = true; }
    else if (altInline) { suffix += '6' + altInline; alterationsEmbedded = true; }
    else if (suspended) {
      const sus4Only = suspensions.includes(4) && !suspensions.includes(2);
      suffix += sus4Only && (safeString(chord.borrowed) === 'lydian' || opts.borrowedTag === '(lyd)') ? 'sus' + suspensions.join('') + '6' : '6' + susStr;
      susPlaced = true;
    } else suffix += '6';
  } else if (inversion === 2) {
    if (type >= 7) { suffix += altInline ? '4' + altInline + '3' : '43'; if (altInline) alterationsEmbedded = true; }
    else if (suspended) {
      if (adds.length > 0) {
        const addBody = adds.map(add => 'add' + (add <= 6 && type >= 7 ? add + 7 : add)).join('');
        suffix += suspensions.includes(4) && suspensions.includes(2) ? '4' + susStr + '6(' + addBody + ')' : '6(' + addBody + ')4' + susStr;
        susPlaced = true; addsPlaced = true;
      } else { suffix += isApplied ? '64' + susStr : '4' + susStr + '6'; susPlaced = true; }
    } else if (sharp5Only) {
      const iMinorTonicSharp5 = quality === 'minor' && safeInt(chord.root) === 1 && safeString(chord.borrowed) === '' && !Array.isArray(chord.borrowed);
      if (iMinorTonicSharp5) suffix += '46' + altInline;
      else if (adds.length > 0) {
        suffix += (quality === 'minor' || quality === 'diminished' || suffix.includes('+') ? '' : '+') + '6(' + adds.map(add => 'add' + add).join('') + ')' + altInline + '4';
        addsPlaced = true;
      } else suffix += (quality === 'minor' || quality === 'diminished' || suffix.includes('+') ? '' : '+') + '6' + altInline + '4';
      alterationsEmbedded = true;
    } else if (omit3Only) {
      const tonic = opts.keyTonic ?? '';
      const omit3Use46 = safeString(chord.borrowed) === '' && !Array.isArray(chord.borrowed) && (
        quality === 'minor' && safeInt(chord.root) === 4 && ['F', 'B'].includes(tonic)
        || quality === 'minor' && safeInt(chord.root) === 1 && tonic === 'C' || safeInt(chord.root) === 7 && opts.keyScale === 'phrygian');
      suffix += omit3Use46 ? '46(no3)' : '6(no3)4'; omitsPlaced = true;
    } else if (altInline) { suffix += '6' + altInline + '4'; alterationsEmbedded = true; }
    else suffix += '64';
  } else if (inversion === 3) {
    if (type >= 7 && altInline) { suffix += '4' + altInline + '2'; alterationsEmbedded = true; }
    else suffix += '42';
  }
  if (suspended && !susPlaced) {
    const hasFigured = /[0-9]/.test(suffix);
    if (type >= 7 && !hasFigured) {
      if (suspensions.length > 1) {
        if (suspensions[0] < suspensions[1]) suffix += susStr + type;
        else { suffix += type + omits.map(omit => '(no' + omit + ')').join('') + susStr; if (omits.length > 0) omitsPlaced = true; }
      } else { suffix += type + altInline + susStr; if (altInline) alterationsEmbedded = true; }
    } else suffix += susStr;
  } else if (type >= 7 && !/[0-9]/.test(suffix)) suffix += type;
  if (opts.borrowedTag) suffix += opts.borrowedTag;
  if (adds.length > 0 && !addsPlaced) suffix += '(' + adds.map(add => 'add' + (add <= 6 && type >= 7 ? add + 7 : add)).join('') + ')';
  if (omits.length > 0 && !omitsPlaced) suffix += omits.includes(3) && omits.includes(5) && quality === 'augmented' ? '(no5no3)' : omits.map(omit => '(no' + omit + ')').join('');
  if (displayAlts.length > 0 && !alterationsEmbedded) suffix += '(' + displayAlts.join('') + ')';
  return suffix;
}
function buildNumeral(degree: number, qualities: readonly string[], chord: JsonObject, prefix: string, opts: SuffixOptions = {}): string {
  const quality = triadQualityWithAlts(opts.quality ?? qualities[floorMod(degree - 1, 7)] ?? 'major', chord);
  let roman = ROMAN[degree] ?? '';
  if (quality === 'minor' || quality === 'diminished') roman = roman.toLowerCase();
  return prefix + roman + buildSuffix(chord, quality, opts);
}

export function getRomanSymbol(chord: JsonObject, key: KeyInfo): string {
  const root = safeInt(chord.root);
  if (root < 1 || root > 7 || safeBoolean(chord.isRest) || safeBoolean(chord.rest)) return '';
  const applied = safeInt(chord.applied), borrowed = safeString(chord.borrowed);
  if (applied >= 1 && applied <= 7) {
    const target = appliedTarget(chord, key), numeratorKey = { tonic: target[0], scale: 'major' }, triSub = isTriSubApplied(chord);
    const type = safeInt(chord.type, 5), suspended = Array.isArray(chord.suspensions) && chord.suspensions.length > 0;
    const majorSeventh = type >= 7 && applied !== 5 && CHORD_QUALITIES.major[applied - 1] === 'major' && isMajorSeventh(applied, numeratorKey) && !suspended;
    const numerator = buildNumeral(triSub ? 2 : applied, CHORD_QUALITIES.major, chord, triSub ? '♭' : '', {
      fullyDiminished: applied === 7 && !triSub && !suspended, majorSeventh, ...(triSub ? { quality: 'major' } : {}),
    });
    const tag = lookup(BORROWED_TAG, borrowed);
    const borrowTag = Array.isArray(chord.borrowed) ? '(bor)' : tag !== undefined ? '(' + tag + ')' : '';
    const numeratorTag = !triSub && ['minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'phrygianDominant'].includes(key.scale) ? '(maj)' : '';
    return numerator + (triSub ? '(∆-sub)' : '') + numeratorTag + '/' + target[1] + borrowTag;
  }
  const raw = rawCustomBorrowedIntervals(chord.borrowed);
  if (raw) {
    const type = safeInt(chord.type, 5), quality = triadQualityWithAlts(customArrayTriadQuality(raw, root), chord);
    const hasAdds = Array.isArray(chord.adds) && chord.adds.length > 0;
    const opts: SuffixOptions = { quality, majorSeventh: type >= 7 && customArraySeventhMajor(raw, root),
      fullyDiminished: quality === 'diminished' && type >= 7 && [9, 11].includes(floorMod(raw[(root + 5) % 7] - raw[root - 1], 12)),
      ...(hasAdds ? { borrowedTag: '(bor)' } : {}),
    };
    return buildNumeral(root, CHORD_QUALITIES.major, chord, customArrayPrefix(raw, root, key), opts) + (hasAdds ? '' : '(bor)');
  }
  let scale = key.scale, tag = '', prefix = '';
  if (borrowed) {
    const borrowedTag = lookup(BORROWED_TAG, borrowed);
    if (borrowedTag !== undefined) { scale = borrowed; prefix = borrowedPrefix(root, key, borrowed); tag = '(' + borrowedTag + ')'; }
    else if (borrowed.startsWith('[')) tag = '(bor)';
  }
  const qualities = lookup(CHORD_QUALITIES, scale) ?? CHORD_QUALITIES.major;
  const quality = triadQualityWithAlts(qualities[floorMod(root - 1, 7)] ?? 'major', chord);
  const majorSeventh = safeInt(chord.type, 5) >= 7 && quality !== 'diminished' && isMajorSeventh(root, { tonic: key.tonic, scale });
  const hasAdds = Array.isArray(chord.adds) && chord.adds.length > 0;
  const opts: SuffixOptions = { majorSeventh, fullyDiminished: quality === 'diminished' && (scale === 'harmonicMinor' && root === 7 || scale === 'phrygianDominant' && root === 3), keyScale: scale, keyTonic: key.tonic, borrowed };
  if (tag && hasAdds) opts.borrowedTag = tag;
  return buildNumeral(root, qualities, chord, prefix, opts) + (tag && !hasAdds ? tag : '');
}

/** Re-label a source chord in one Ionian context without changing its quality or playback input. */
export function getRelativeIonianRomanSymbol(chord: JsonObject, key: KeyInfo, ionianContextKey: KeyInfo = relativeIonianKey(key)): string {
  const symbol = getRomanSymbol(chord, key);
  if (!symbol) return symbol;
  const sourceKey = { tonic: key.tonic, scale: canonicalScaleName(key.scale) }, displayKey = { tonic: ionianContextKey.tonic, scale: 'major' };
  const applied = safeInt(chord.applied), isApplied = applied >= 1 && applied <= 7;
  const pitch = isApplied ? resolveScaleDegreePitch('1', 0, { tonic: appliedTarget(chord, sourceKey)[0], scale: 'major' }) : resolveChordRoot(chord, sourceKey)?.pitch;
  const degree = pitch ? degreeInKey(pitch, displayKey) : null;
  if (!degree) return symbol;
  const slash = isApplied ? symbol.indexOf('/') : -1, start = slash >= 0 ? slash + 1 : 0;
  const base = /^[♭♯]*([IViv]+)/.exec(symbol.slice(start));
  if (!base) return symbol;
  const roman = /^[iv]/.test(base[1]) ? (ROMAN[degree.degree] ?? '').toLowerCase() : ROMAN[degree.degree] ?? '';
  const prefix = degree.alteration < 0 ? '♭'.repeat(-degree.alteration) : '♯'.repeat(degree.alteration);
  return symbol.slice(0, start) + prefix + roman + symbol.slice(start + base[0].length);
}

export function getLetterName(chord: JsonObject, key: KeyInfo): string {
  const root = safeInt(chord.root);
  if (safeBoolean(chord.isRest) || safeBoolean(chord.rest)) return '';
  if (root < 1 || root > 7) return letterAnchoredName(chord);
  const applied = safeInt(chord.applied), borrowed = safeString(chord.borrowed);
  const isApplied = applied >= 1 && applied <= 7, rawCustom = rawCustomBorrowedIntervals(chord.borrowed);
  const customIntervals = rawCustom ? customBorrowedIntervals(chord.borrowed) : null;
  const type = safeInt(chord.type, 5), inversion = safeInt(chord.inversion), suspensions = ints(chord.suspensions);
  let effKey = key, degree = root;
  if (isApplied) {
    const targetTonic = appliedTarget(chord, key)[0];
    if (isTriSubApplied(chord)) { effKey = { tonic: getNoteLabel('b2', targetTonic, 'major'), scale: 'major' }; degree = 1; }
    else { effKey = { tonic: targetTonic, scale: 'major' }; degree = applied; }
  } else if (rawCustom) effKey = { tonic: key.tonic, scale: 'custom' };
  else if (borrowed && lookup(BORROWED_TAG, borrowed) !== undefined) effKey = { tonic: key.tonic, scale: borrowed };
  const qualities = lookup(CHORD_QUALITIES, effKey.scale) ?? CHORD_QUALITIES.major;
  const baseQuality = rawCustom && !isApplied ? customArrayTriadQuality(rawCustom, degree) : qualities[floorMod(degree - 1, 7)] ?? 'major';
  const quality = triadQualityWithAlts(baseQuality, chord);
  const rootNoteName = getNoteLabel(degree, effKey.tonic, effKey.scale, customIntervals ?? undefined).replaceAll('x', '##');
  const augmented = quality === 'augmented', triSub = isTriSubApplied(chord), suspended = suspensions.length > 0;
  let majorSeventh = false;
  if (type >= 7 && quality !== 'diminished' && !augmented && !suspended) {
    if (isApplied) {
      if (!triSub) majorSeventh = quality === 'major' && applied !== 5 && !suspended && isMajorSeventh(applied, { tonic: appliedTarget(chord, key)[0], scale: 'major' });
    } else if (rawCustom) majorSeventh = customArraySeventhMajor(rawCustom, degree);
    else majorSeventh = isMajorSeventh(degree, effKey);
  }
  const augMaj7Letter = augmented && type >= 7 && (isApplied && !triSub
    ? isMajorSeventh(applied, { tonic: appliedTarget(chord, key)[0], scale: 'major' })
    : rawCustom ? customArraySeventhMajor(rawCustom, degree) : isMajorSeventh(degree, effKey));
  const voiced = buildChordVoicing(chord, key), bass = inversion > 0 ? voiced?.tones[0] : null;
  const bassName = bass && voiced ? spellChordTone(rootNoteName, bass, voiced.rootMidi) : null;
  return formatChordLetter(chord, rootNoteName, quality, degree, majorSeventh, augMaj7Letter, triSub, bassName, effKey, customIntervals).replaceAll('x', '##');
}
function spellChordTone(rootName: string, tone: ChordTone, rootMidi: number): string {
  const degree = floorMod(tone.degree - 1, 7) + 1, natural = SCALE_INTERVALS.major[degree - 1];
  let delta = floorMod(tone.midi - rootMidi - natural, 12);
  if (delta > 6) delta -= 12;
  const name = getNoteLabel(degree, rootName, 'major'), accidental = getModifierValue(name.slice(1)) + delta;
  return name[0] + (accidental < 0 ? 'b'.repeat(-accidental) : '#'.repeat(accidental));
}
function letterAnchoredName(chord: JsonObject): string {
  const root = safeString(chord._letterRootName);
  if (!/^[A-G][#bx]*$/.test(root) || chord.root !== undefined && safeInt(chord.root) !== 0) return '';
  const quality = safeString(chord._letterQuality, 'major'), type = safeInt(chord.type, 5);
  let suffix = quality === 'minor' ? 'm' : quality === 'diminished' ? '°' : quality === 'augmented' ? '+' : '';
  if (type >= 7) suffix += (safeBoolean(chord.useMaj7) ? 'maj' : '') + type;
  if (Array.isArray(chord.suspensions)) suffix += chord.suspensions.map(value => 'sus' + safeString(value)).join('');
  if (Array.isArray(chord.alterations)) suffix += chord.alterations.map(value => '(' + safeString(value) + ')').join('');
  if (Array.isArray(chord.adds)) suffix += chord.adds.map(value => '(add' + safeString(value) + ')').join('');
  const bass = safeString(chord._letterBassName);
  return root + suffix + (bass ? '/' + bass : '');
}

export interface ChordInterpretation { roman: string; letter: string; midi: number[]; rootMidi: number | null; toneLabels: string[] }
export function interpret(chord: JsonObject, key: KeyInfo): ChordInterpretation {
  const voiced = buildChordVoicing(chord, key);
  return { roman: getRomanSymbol(chord, key), letter: getLetterName(chord, key), midi: voiced?.tones.map(tone => tone.midi) ?? [],
    rootMidi: voiced?.rootMidi ?? null, toneLabels: voiced?.labels ?? [] };
}
