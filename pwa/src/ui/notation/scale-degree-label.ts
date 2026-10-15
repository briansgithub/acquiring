/** Pure semantic port of ScaleDegreeLabel in Android ScaleDegreeRenderer.kt at 801cf798. */
export interface ScaleDegreeLabel { source: string; prefix: string; degree: string; suffix: string; spokenText: string }

export function parseScaleDegreeLabel(source: string): ScaleDegreeLabel {
  const plain = source.replace(/\u0302/g, '').replace(/\^/g, '');
  const start = plain.search(/\d/);
  let prefix = '', degree = plain, suffix = '';
  if (start >= 0) {
    let end = start;
    while (end < plain.length && /\d/.test(plain[end])) end++;
    prefix = plain.slice(0, start); degree = plain.slice(start, end); suffix = plain.slice(end);
  }
  const spokenText = [...prefix].map((c) => c === '♭' || c === 'b' ? 'flat ' : c === '♯' || c === '#' ? 'sharp ' : c)
    .join('') + degree + (suffix ? ` ${suffix}` : '');
  return { source, prefix, degree, suffix, spokenText: spokenText.trim() };
}
