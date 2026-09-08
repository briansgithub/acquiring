import crypto from "node:crypto";

// Presentation equivalences only. In particular naturals, quality marks,
// borrowing annotations, omissions and accidentals are never discarded.
const DIGITS = Object.fromEntries([..."⁰¹²³⁴⁵⁶⁷⁸⁹"].map((digit, index) => [digit, String(index)]));
for (const [index, digit] of [..."₀₁₂₃₄₅₆₇₈₉"].entries()) DIGITS[digit] = String(index);
export function canonicalRoman(value) {
  return String(value).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/g, digit => DIGITS[digit])
    .replace(/♭/g, "b").replace(/♯/g, "#").replace(/\s+/g, "");
}

export function canonicalLetter(value) {
  let label = canonicalRoman(value);
  // Hooktheory lowercases minor roots (normally followed by an explicit m).
  label = label.replace(/^([a-g])([#bx]*)/, (_, letter, accidental) => letter.toUpperCase() + accidental);
  label = label.replace(/\/([a-g])([#bx]*)$/, (_, letter, accidental) => "/" + letter.toUpperCase() + accidental);
  label = label.replace(/([A-G][#bx]*)/g, note => note.replace(/x/g, "##"));
  label = label.replace(/\((n[^)]*)\)/g, (_, omissions) => `(${omissions.replace(/n[°o]?(?=\d)/g, "no")})`);
  // Duplicated diminished/augmented glyphs are an established SVG capture
  // artifact. Limit the equivalence to the chord-quality position.
  label = label.replace(/^(\w[#b]*°(?:13|11|9|7)?)o/, "$1");
  label = label.replace(/^([A-G][#b]*\+)(maj)?(13|11|9|7)?\+/, "$1$2$3");
  return label;
}

export function letterSignature(value) {
  return canonicalLetter(value).split("/").map(side => {
    const annotations = [];
    const core = side.replace(/\(([^)]*)\)/g, (_, group) => {
      const tokens = group.match(/(?:no|add)?[b#♮]*(?:13|11|9|[1-7])/g);
      annotations.push(...(tokens && tokens.join("") === group ? tokens : [group]));
      return "";
    });
    return { core, annotations: annotations.sort() };
  });
}

// Linearizing a two-dimensional label may move its suspension, or split a
// modifier group into adjacent parentheses. Compare those presentation choices
// as token multisets within each side of an applied chord. Keep duplicates and
// the applied-side boundary so an extra addition or misplaced borrowing tag
// still fails. Unknown annotation text is retained verbatim.
export function romanSignature(value) {
  return canonicalRoman(value).split("/").map(side => {
    const annotations = [];
    const suspensions = [];
    const core = side.replace(/\(([^)]*)\)/g, (_, group) => {
      const tokens = group.match(/(?:no|add)?[b#♮]*(?:13|11|9|[1-7])/g);
      annotations.push(...(tokens && tokens.join("") === group ? tokens : [group]));
      return "";
    }).replace(/sus[b#♮]*[24]/g, suspension => { suspensions.push(suspension); return ""; });
    return { core, annotations: annotations.sort(), suspensions: suspensions.sort() };
  });
}

export function sourceFingerprint(cases) {
  const source = cases.map(({ id, json, key, truthRoman, truthLetter, truthPcs }) =>
    ({ id, json, key, truthRoman, truthLetter, truthPcs }));
  return crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function noteMidi(name) {
  const match = String(name).match(/^([A-Ga-g])([#bx]*)(-?\d+)$/);
  if (!match) throw new Error(`Unparseable interpreted note: ${name}`);
  let value = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[match[1].toUpperCase()];
  for (const accidental of match[2]) value += ({ "#": 1, b: -1, x: 2 })[accidental];
  return (Number(match[3]) + 1) * 12 + value;
}

// Use captured row colors, then preserve SVG element order. Screen x positions
// are rounded and cannot order figures: a lower 4 can begin left of an upper 6.
// Only join a two-line figure when its upper/lower positions prove the stack.
export function romanFromFragments(texts) {
  const roman = texts.filter(text => String(text.fill).toLowerCase() === "#ffffff").map(text => ({ ...text }));
  if (!roman.length) throw new Error("Captured Roman row is missing");
  for (let index = 0; index < roman.length - 1; index++) {
    const upper = roman[index];
    const lower = roman[index + 1];
    const upperMatch = upper.s.match(/^([°ø△∆]?)([64])((?:\([^)]*\))*)$/);
    if (!upperMatch || !/^[5432]$/.test(lower.s) || lower.y <= upper.y) continue;
    if (!new Set(["64", "65", "43", "42"]).has(upperMatch[2] + lower.s)) continue;
    if (Math.abs(lower.relX - upper.relX) > 18) continue;
    upper.s = upperMatch[1] + upperMatch[2] + lower.s + upperMatch[3];
    roman.splice(index + 1, 1);
  }
  return roman.map(text => text.s).join("");
}

export function letterFromFragments(texts) {
  const lower = texts.filter(text => String(text.fill).toLowerCase() === "#dae0e6");
  if (!lower.length) throw new Error("Captured letter row is missing");
  // An o immediately after the note name is the diminished-circle glyph. The
  // o in an omission such as (no5) is ordinary text and must stay an o.
  return lower.map(text => text.s).join("").replace(/^([A-Ga-g][#bx]*)o+/, "$1°");
}
