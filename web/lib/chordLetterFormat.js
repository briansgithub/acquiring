import { getNoteLabel } from "./musicScale.js";

const numberOf = value => Number(String(value).replace(/[^0-9]/g, ""));
const accidentalOf = value => String(value).replace(/[0-9]/g, "");
const unique = values => [...new Set(values)];
const pc = value => {
  const match = String(value).match(/^([A-Ga-g])([#bx]*)/);
  if (!match) return null;
  let result = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[match[1].toUpperCase()];
  for (const accidental of match[2]) result += ({ "#": 1, b: -1, x: 2 })[accidental];
  return ((result % 12) + 12) % 12;
};

/** Format the already-resolved chord without independently choosing pitches. */
export function formatChordLetter(chord, key, context) {
  if (!chord || chord.isRest || chord.rest || !context.rootNoteName) return "";
  const { rootNoteName, quality, degree, effKey, triSub, interpreted } = context;
  const type = Number(chord.type) || 5;
  const inversion = Number(chord.inversion) || 0;
  const suspensions = unique(chord.suspensions || []);
  const suspended = suspensions.length > 0;
  const alterations = unique((chord.alterations || []).map(String));
  const omits = unique((chord.omits || []).map(Number));
  const adds = unique((chord.adds || []).map(Number));
  const roles = interpreted?.chordDegrees || [];
  const symbolicNote = relativeDegree => {
    if (!effKey || !Number.isInteger(degree)) return null;
    const scaleDegree = ((degree + relativeDegree - 2) % 7 + 7) % 7 + 1;
    return getNoteLabel(scaleDegree, effKey, context.customIntervals);
  };
  const symbolicInterval = relativeDegree => {
    const note = symbolicNote(relativeDegree);
    const notePc = pc(note);
    const rootPc = pc(rootNoteName);
    if (notePc === null || rootPc === null) return null;
    return ((notePc - rootPc) % 12 + 12) % 12;
  };
  const seventhInterval = symbolicInterval(7);
  const majorSeventh = type >= 7 && !suspended && !triSub && (seventhInterval === 11 || context.majorSeventh || context.augMaj7Letter);
  const diminishedSeventh = type >= 7 && !suspended && (chord.applied === 7 || seventhInterval === 9);
  const diminished = quality === "diminished";
  const halfDiminished = diminished && type >= 7 && !majorSeventh && !diminishedSeventh;
  const minor = quality === "minor";
  const augmented = quality === "augmented" || (quality === "major" && alterations.includes("#5"));
  const rootKey = { tonic: rootNoteName, scale: "major" };
  // Source slash notation names the original harmonic slot. Added/omitted
  // tones and altered fifths may change the first sounding note independently.
  const bassRole = inversion === 1 ? (suspensions.includes(4) ? 4 : suspensions.includes(2) ? 2 : 3)
    : inversion === 2 ? 5 : inversion === 3 ? 7 : null;
  let bassName = context.bassNoteName;
  if (bassRole && bassName) {
    bassName = triSub ? getNoteLabel(bassRole === 7 ? "b7" : bassRole, rootKey)
      : chord.applied === 7 && bassRole === 7 ? getNoteLabel("bb7", rootKey)
        : bassRole === 3 ? getNoteLabel(minor || diminished ? "b3" : "3", rootKey)
        : bassRole === 5 && type >= 7 && !suspended && alterations.includes("b5") ? getNoteLabel("b5", rootKey)
        : symbolicNote(bassRole) || bassName;
  }

  // Hooktheory displays unmodified dominant elevenths as a major triad over
  // the root bass. This is a naming convention; the interpreter owns voicing.
  if (type === 11 && !majorSeventh && quality === "major" && (degree === 5 || triSub)
      && !suspended && !alterations.length && !omits.length && !adds.length && inversion === 0) {
    return `${getNoteLabel("b7", rootKey)}/${rootNoteName}`;
  }

  // First-inversion minor sevenths and half-diminished sevenths are the same
  // notes as a sixth chord on their third. Preserve source shorthand.
  const plainMinorSeventh = type === 7 && inversion === 1 && !suspended && !majorSeventh && !diminishedSeventh
    && (minor || halfDiminished) && !adds.length && !omits.length
    && alterations.every(alteration => alteration === "b5");
  if (plainMinorSeventh && bassName) return `${bassName}${halfDiminished ? "m" : ""}6`;

  const thirdInversion = type === 7 && inversion === 3 && !suspended && bassName;
  const power = type < 7 && omits.includes(3) && !omits.includes(5) && !suspended
    && !diminished && !alterations.length;
  let qualityText = "";
  if (power) qualityText = "5";
  else if (!suspended) {
    if (diminished && (thirdInversion || type < 7 || diminishedSeventh)) qualityText = "°";
    else if (minor || halfDiminished || (diminished && majorSeventh)) qualityText = "m";
    else if (augmented && (!majorSeventh || thirdInversion)) qualityText = "+";
  }

  // An altered highest extension is written above the seventh in the source
  // (Cmaj7(#9#11), Fm7(b9)); the unaltered extension keeps its number.
  const implicitAlterations = [];
  if (!suspended && (halfDiminished || (diminished && majorSeventh))) implicitAlterations.push("b5");
  for (const role of roles) {
    if (numberOf(role) >= 9 && accidentalOf(role)) implicitAlterations.push(String(role));
  }
  let writtenType = type;
  if (type >= 9 && implicitAlterations.some(alteration => numberOf(alteration) === type)) writtenType = 7;
  if (thirdInversion || type < 7) writtenType = 0;

  const additionTokens = adds.filter(add => !(add === 2 && type >= 9) && !(add === 4 && type >= 11) && !(add === 6 && type >= 13))
    .map(add => `add${add === 2 ? 9 : type >= 7 && add === 4 ? 11 : type >= 7 && add === 6 ? 13 : add}`);
  // A triad plus only its sixth uses the familiar sixth suffix.
  const plainSixth = type < 7 && adds.length === 1 && adds[0] === 6 && !suspended && !diminished && !omits.length && !alterations.length;
  const sixNine = type < 7 && adds.length === 2 && adds.includes(6) && adds.includes(9)
    && !suspended && !omits.length && !alterations.length;
  const extensionText = writtenType >= 7 ? `${majorSeventh ? "maj" : ""}${writtenType}` : sixNine ? "6/9" : plainSixth ? "6" : "";

  const omissionTokens = omits.filter(omit => !(power && omit === 3)).map(omit => `no${omit}`);
  const modifierTokens = unique([...alterations, ...implicitAlterations]);
  if (thirdInversion && diminished) {
    const fifth = modifierTokens.indexOf("b5");
    if (fifth >= 0) modifierTokens.splice(fifth, 1);
  }
  if (thirdInversion && augmented) {
    const fifth = modifierTokens.indexOf("#5");
    if (fifth >= 0) modifierTokens.splice(fifth, 1);
  }
  // Source quality already supplies #5 on an augmented major seventh, but its
  // letter name still states that alteration explicitly.
  if (augmented && majorSeventh && !thirdInversion && alterations.includes("#5") && !modifierTokens.includes("#5")) modifierTokens.push("#5");

  const susText = suspensions.map(suspension => {
    const interval = symbolicInterval(Number(suspension));
    const difference = interval == null ? 0 : interval - (Number(suspension) === 2 ? 2 : 5);
    let accidental = difference > 0 ? "#".repeat(difference) : "b".repeat(-difference);
    if (Number(suspension) === 4 && alterations.includes("#11")) accidental = "#";
    return `sus${accidental}${suspension}`;
  }).join("");
  const group = tokens => tokens.length ? `(${tokens.join("")})` : "";
  const additions = plainSixth || sixNine ? [] : additionTokens;
  return rootNoteName + qualityText + extensionText + group(additions) + group(omissionTokens)
    + group(modifierTokens) + susText + (bassName ? `/${bassName}` : "");
}
