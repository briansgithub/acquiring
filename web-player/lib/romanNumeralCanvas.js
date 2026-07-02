const ROMAN_LETTERS = /[ivxIVX]/;
const ACCIDENTALS = /[♭♯#b]/;
const DIGIT = /[0-9]/;

const DEFAULT_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const SUPER_SCALE = 0.68;
const SUB_SCALE = 0.58;
const FIGURED_DIGIT_SCALE = 0.58;
const DIM_GLYPH_CHAR = '○';
const DIM_GLYPH_SCALE = 0.46;
const SUFFIX_SCALE = 0.72;

/** Legacy unicode super/sub digits → plain ASCII (for cached symbols). */
export function normalizeSymbolDigits(symbol) {
  if (!symbol) return '';
  return String(symbol)
    .replace(/[\u2070-\u2079]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x2070 + 0x30))
    .replace(/[\u2080-\u2089]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x2080 + 0x30));
}

function readBase(symbol, start) {
  let i = start;
  let text = '';
  while (i < symbol.length && ACCIDENTALS.test(symbol[i])) {
    text += symbol[i++];
  }
  while (i < symbol.length && ROMAN_LETTERS.test(symbol[i])) {
    text += symbol[i++];
  }
  while (i < symbol.length && symbol[i] === '+') {
    text += symbol[i++];
  }
  return { text, next: i };
}

function readDigitRun(symbol, start) {
  let i = start;
  let text = '';
  while (i < symbol.length && DIGIT.test(symbol[i])) {
    text += symbol[i++];
  }
  return { text, next: i };
}

function readParen(symbol, start) {
  let i = start;
  let text = '';
  let depth = 0;
  while (i < symbol.length) {
    const ch = symbol[i++];
    text += ch;
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return { text, next: i };
}

function readPlainRun(symbol, start) {
  let i = start;
  let text = '';
  while (i < symbol.length) {
    const ch = symbol[i];
    if (ch === '(' || ch === '/' || ch === '△' || DIGIT.test(ch)) break;
    text += symbol[i++];
  }
  return { text, next: i };
}

function readSusModifier(symbol, start) {
  const m = symbol.slice(start).match(/^sus\d+/);
  if (!m) return null;
  return { text: m[0], next: start + m[0].length };
}

function trySusCluster(symbol, start) {
  const rest = symbol.slice(start);
  const leadingExt = rest.match(/^([79]|1[13])/);
  if (leadingExt) {
    let pos = leadingExt[1].length;
    const parts = [{ kind: 'super', text: leadingExt[1] }];
    const omit = rest.slice(pos).match(/^\(no\d+\)/);
    if (omit) {
      parts.push({ kind: 'suffix', text: omit[0] });
      pos += omit[0].length;
    }
    const sus = rest.slice(pos).match(/^sus\d+sus\d/) || rest.slice(pos).match(/^sus\d+/);
    if (sus) {
      parts.push({ kind: 'sub', text: sus[0] });
      return { parts, next: start + pos + sus[0].length };
    }
  }
  const trailing = rest.match(/^sus(\d)sus(\d)([79]|1[13])(?![0-9])/);
  if (trailing) {
    const body = `sus${trailing[1]}sus${trailing[2]}`;
    return {
      parts: [
        { kind: 'super', text: trailing[3] },
        { kind: 'sub', text: body },
      ],
      next: start + trailing[0].length,
    };
  }
  return null;
}

/** Consecutive super (+ optional suffix) + sub render as one vertical stack at a single x. */
function stackSpan(parts, i) {
  if (parts[i]?.kind !== 'super') return 0;
  if (parts[i + 1]?.kind === 'sub') return 2;
  if (parts[i + 1]?.kind === 'suffix' && parts[i + 2]?.kind === 'sub') return 3;
  return 0;
}

function measureStack(ctx, parts, i, fontSize) {
  const span = stackSpan(parts, i);
  if (span === 2) {
    const q = splitQualitySuper(parts[i].text);
    if (q) {
      const glyphW = measureQualityGlyph(ctx, q.glyph, fontSize);
      ctx.font = figuredDigitFont(fontSize);
      const superW = ctx.measureText(q.digit).width;
      ctx.font = figuredDigitFont(fontSize);
      const subW = ctx.measureText(parts[i + 1].text).width;
      return glyphW + Math.max(superW, subW);
    }
    ctx.font = figuredDigitFont(fontSize);
    const superW = ctx.measureText(parts[i].text).width;
    ctx.font = figuredDigitFont(fontSize);
    const subW = ctx.measureText(parts[i + 1].text).width;
    return Math.max(superW, subW);
  }
  if (span === 3) {
    ctx.font = figuredDigitFont(fontSize);
    let topW = ctx.measureText(parts[i].text).width;
    ctx.font = partFont(parts[i + 1], fontSize);
    topW += ctx.measureText(parts[i + 1].text).width;
    ctx.font = figuredDigitFont(fontSize);
    const subW = ctx.measureText(parts[i + 2].text).width;
    return Math.max(topW, subW);
  }
  return 0;
}

function drawStack(ctx, parts, i, cursor, centerY, fontSize) {
  const span = stackSpan(parts, i);
  if (span === 2) {
    const q = splitQualitySuper(parts[i].text);
    if (q) {
      const width = measureStack(ctx, parts, i, fontSize);
      ctx.textBaseline = 'middle';
      const superY = partYOffset({ kind: 'super' }, fontSize, centerY);
      const subY = partYOffset({ kind: 'sub' }, fontSize, centerY);
      const glyphW = drawQualityGlyph(ctx, q.glyph, cursor, superY, fontSize);
      const digitX = cursor + glyphW;
      ctx.font = figuredDigitFont(fontSize);
      ctx.fillText(q.digit, digitX, superY);
      ctx.fillText(parts[i + 1].text, digitX, subY);
      return width;
    }
    const width = measureStack(ctx, parts, i, fontSize);
    ctx.textBaseline = 'middle';
    const superY = partYOffset({ kind: 'super' }, fontSize, centerY);
    const subY = partYOffset({ kind: 'sub' }, fontSize, centerY);
    ctx.font = figuredDigitFont(fontSize);
    ctx.fillText(parts[i].text, cursor, superY);
    ctx.fillText(parts[i + 1].text, cursor, subY);
    return width;
  }
  if (span === 3) {
    const width = measureStack(ctx, parts, i, fontSize);
    let topX = cursor;
    ctx.textBaseline = 'middle';
    ctx.font = figuredDigitFont(fontSize);
    const topY = partYOffset({ kind: 'super' }, fontSize, centerY);
    ctx.fillText(parts[i].text, topX, topY);
    topX += ctx.measureText(parts[i].text).width;
    ctx.font = partFont(parts[i + 1], fontSize);
    // In the HTML layout, the suffix lives on the "top row" next to the super digit.
    // Canvas used to draw the suffix at centerY which is visually "middle-row" and
    // can overlap/clutter in tight timeline rectangles.
    ctx.fillText(parts[i + 1].text, topX, topY);
    ctx.font = figuredDigitFont(fontSize);
    ctx.fillText(parts[i + 2].text, cursor, partYOffset({ kind: 'sub' }, fontSize, centerY));
    return width;
  }
  return 0;
}

/** Hooktheory figured-bass pairs → superscript digit + subscript digit (y-order from scrape). */
const FIGURED_BASS = {
  64: ['6', '4'],
  46: ['6', '4'],
  65: ['6', '5'],
  43: ['4', '3'],
  42: ['4', '2'],
};

function digitParts(digits) {
  const pair = FIGURED_BASS[digits];
  if (pair) {
    return [
      { kind: 'super', text: pair[0] },
      { kind: 'sub', text: pair[1] },
    ];
  }
  if (digits) return [{ kind: 'super', text: digits }];
  return [];
}

function pushQualityGlyphParts(parts, glyph, digits) {
  const pair = FIGURED_BASS[digits];
  if (pair) {
    parts.push({ kind: 'super', text: glyph + pair[0] });
    parts.push({ kind: 'sub', text: pair[1] });
    return;
  }
  if (digits) parts.push({ kind: 'super', text: glyph + digits });
  else parts.push({ kind: 'super', text: glyph });
}

/** Split leading °/ø from a figured-bass superscript (e.g. ø4 → { glyph, digit }). */
function splitQualitySuper(text) {
  const m = text.match(/^([°ø])(.*)$/);
  if (!m) return null;
  return { glyph: m[1], digit: m[2] };
}

function qualityGlyphHtml(glyph) {
  if (glyph === '°') {
    return `<span class="roman-quality roman-quality--dim">${DIM_GLYPH_CHAR}</span>`;
  }
  return `<span class="roman-quality">${glyph}</span>`;
}

function stackHtml(superDigit, subDigit) {
  return `<span class="roman-stack"><sup class="roman-figured-digit">${superDigit}</sup><sub class="roman-figured-digit">${subDigit}</sub></span>`;
}

function qualityStackHtml(glyph, superDigit, subDigit) {
  return `<span class="roman-stack roman-stack--quality">${qualityGlyphHtml(glyph)}<sup class="roman-figured-digit">${superDigit}</sup><sub class="roman-figured-digit">${subDigit}</sub></span>`;
}

function renderSuperHtml(text) {
  if (text === '°' || text === 'ø') {
    return `<sup class="roman-quality-inline">${qualityGlyphHtml(text)}</sup>`;
  }
  const q = splitQualitySuper(text);
  if (q) {
    return `<sup class="roman-quality-inline">${qualityGlyphHtml(q.glyph)}<span class="roman-figured-digit">${q.digit}</span></sup>`;
  }
  return `<sup>${text}</sup>`;
}

function figuredDigitFont(fontSize) {
  return `bold ${fontSize * FIGURED_DIGIT_SCALE}px ${DEFAULT_FONT}`;
}

function dimGlyphFont(fontSize) {
  return `bold ${fontSize * DIM_GLYPH_SCALE}px ${DEFAULT_FONT}`;
}

function measureQualityGlyph(ctx, glyph, fontSize) {
  if (glyph === '°') {
    ctx.font = dimGlyphFont(fontSize);
    return ctx.measureText(DIM_GLYPH_CHAR).width;
  }
  ctx.font = partFont({ kind: 'super', text: glyph }, fontSize);
  return ctx.measureText(glyph).width;
}

function drawQualityGlyph(ctx, glyph, x, y, fontSize) {
  if (glyph === '°') {
    ctx.font = dimGlyphFont(fontSize);
    ctx.fillText(DIM_GLYPH_CHAR, x, y);
    return ctx.measureText(DIM_GLYPH_CHAR).width;
  }
  ctx.font = partFont({ kind: 'super', text: glyph }, fontSize);
  ctx.fillText(glyph, x, y);
  return ctx.measureText(glyph).width;
}

function measureQualitySuperText(ctx, text, fontSize) {
  if (text === '°' || text === 'ø') return measureQualityGlyph(ctx, text, fontSize);
  const q = splitQualitySuper(text);
  if (!q) {
    ctx.font = partFont({ kind: 'super', text }, fontSize);
    return ctx.measureText(text).width;
  }
  const glyphW = measureQualityGlyph(ctx, q.glyph, fontSize);
  if (!q.digit) return glyphW;
  ctx.font = figuredDigitFont(fontSize);
  return glyphW + ctx.measureText(q.digit).width;
}

function drawQualitySuperText(ctx, text, cursor, centerY, fontSize) {
  if (text === '°' || text === 'ø') {
    const y = partYOffset({ kind: 'super' }, fontSize, centerY);
    return drawQualityGlyph(ctx, text, cursor, y, fontSize);
  }
  const q = splitQualitySuper(text);
  if (!q) {
    ctx.font = partFont({ kind: 'super', text }, fontSize);
    ctx.fillText(text, cursor, partYOffset({ kind: 'super' }, fontSize, centerY));
    return ctx.measureText(text).width;
  }
  const superY = partYOffset({ kind: 'super' }, fontSize, centerY);
  const glyphW = drawQualityGlyph(ctx, q.glyph, cursor, superY, fontSize);
  if (!q.digit) return glyphW;
  ctx.font = figuredDigitFont(fontSize);
  ctx.fillText(q.digit, cursor + glyphW, superY);
  return glyphW + ctx.measureText(q.digit).width;
}

/** Split a roman numeral symbol into base / superscript / subscript / suffix segments. */
export function tokenizeRomanNumeral(symbol) {
  const normalized = normalizeSymbolDigits(symbol);
  if (!normalized) return [];
  const parts = [];
  let i = 0;

  const firstBase = readBase(normalized, i);
  if (firstBase.text) {
    parts.push({ kind: 'base', text: firstBase.text });
    i = firstBase.next;
  }

  while (i < normalized.length) {
    const ch = normalized[i];
    const susCluster = trySusCluster(normalized, i);
    if (susCluster) {
      parts.push(...susCluster.parts);
      i = susCluster.next;
      continue;
    }
    if (ch === '°' || ch === 'ø') {
      const glyph = ch;
      i += 1;
      const digits = readDigitRun(normalized, i);
      pushQualityGlyphParts(parts, glyph, digits.text);
      i = digits.next;
      continue;
    }
    if (ch === '△') {
      i += 1;
      const digits = readDigitRun(normalized, i);
      if (FIGURED_BASS[digits.text]) {
        parts.push({ kind: 'super', text: '△' });
        parts.push(...digitParts(digits.text));
      } else if (digits.text) {
        parts.push({ kind: 'super', text: `△${digits.text}` });
      } else {
        parts.push({ kind: 'super', text: '△' });
      }
      i = digits.next;
      continue;
    }
    if (DIGIT.test(ch)) {
      const digits = readDigitRun(normalized, i);
      parts.push(...digitParts(digits.text));
      i = digits.next;
      continue;
    }
    if (ch === '/') {
      const slashBase = readBase(normalized, i);
      if (slashBase.text) {
        parts.push({ kind: 'base', text: slashBase.text });
        i = slashBase.next;
        continue;
      }
    }
    if (ch === '(') {
      const tag = readParen(normalized, i);
      if (tag.text) {
        parts.push({ kind: 'suffix', text: tag.text });
        i = tag.next;
        continue;
      }
    }
    const susMod = readSusModifier(normalized, i);
    if (susMod) {
      parts.push({ kind: 'sub', text: susMod.text });
      i = susMod.next;
      continue;
    }
    const plain = readPlainRun(normalized, i);
    if (plain.text) {
      parts.push({ kind: 'base', text: plain.text });
      i = plain.next;
      continue;
    }
    parts.push({ kind: 'base', text: normalized[i] });
    i += 1;
  }

  return parts;
}

function partFont(part, fontSize) {
  if (part.kind === 'super') return `bold ${fontSize * SUPER_SCALE}px ${DEFAULT_FONT}`;
  if (part.kind === 'sub') return `bold ${fontSize * SUB_SCALE}px ${DEFAULT_FONT}`;
  if (part.kind === 'suffix') return `500 ${fontSize * SUFFIX_SCALE}px ${DEFAULT_FONT}`;
  return `bold ${fontSize}px ${DEFAULT_FONT}`;
}

function partYOffset(part, fontSize, centerY) {
  if (part.kind === 'super') return centerY - fontSize * 0.28;
  if (part.kind === 'sub') return centerY + fontSize * 0.16;
  return centerY;
}

/** Vertical extent above/below centerY for timeline layout padding. */
export function romanNumeralVerticalExtents(symbol, fontSize) {
  const parts = tokenizeRomanNumeral(symbol);
  let above = fontSize * 0.5;
  let below = fontSize * 0.5;
  for (let i = 0; i < parts.length; i++) {
    const span = stackSpan(parts, i);
    if (span === 2) {
      above = Math.max(above, fontSize * 0.28 + fontSize * SUPER_SCALE * 0.55);
      below = Math.max(below, fontSize * 0.16 + fontSize * SUB_SCALE * 0.55);
      i += 1;
      continue;
    }
    if (span === 3) {
      above = Math.max(above, fontSize * 0.28 + fontSize * FIGURED_DIGIT_SCALE * 0.55);
      // span===3 is super + suffix + sub; the suffix is on the top row (not centerY),
      // so include its height in "above" to prevent oversizing inside tight rectangles.
      above = Math.max(above, fontSize * 0.28 + fontSize * SUFFIX_SCALE * 0.55);
      below = Math.max(below, fontSize * 0.16 + fontSize * FIGURED_DIGIT_SCALE * 0.55);
      i += 2;
      continue;
    }
    const part = parts[i];
    if (part.kind === 'super') {
      above = Math.max(above, fontSize * 0.28 + fontSize * SUPER_SCALE * 0.55);
    } else if (part.kind === 'sub') {
      below = Math.max(below, fontSize * 0.16 + fontSize * SUB_SCALE * 0.55);
    } else if (part.kind === 'suffix') {
      above = Math.max(above, fontSize * SUFFIX_SCALE * 0.45);
    }
  }
  return { above, below };
}

export function measureRomanNumeral(ctx, symbol, fontSize) {
  const parts = tokenizeRomanNumeral(symbol);
  let width = 0;
  for (let i = 0; i < parts.length; i++) {
    const span = stackSpan(parts, i);
    if (span) {
      width += measureStack(ctx, parts, i, fontSize);
      i += span - 1;
      continue;
    }
    if (parts[i].kind === 'super') {
      width += measureQualitySuperText(ctx, parts[i].text, fontSize);
      continue;
    }
    ctx.font = partFont(parts[i], fontSize);
    width += ctx.measureText(parts[i].text).width;
  }
  return width;
}

export function drawRomanNumeral(ctx, symbol, centerX, centerY, fontSize, options = {}) {
  const parts = tokenizeRomanNumeral(symbol);
  const width = measureRomanNumeral(ctx, symbol, fontSize);
  const align = options.align || 'center';
  let cursor = align === 'center' ? centerX - width / 2 : centerX;

  ctx.save();
  ctx.textAlign = 'left';
  for (let i = 0; i < parts.length; i++) {
    const span = stackSpan(parts, i);
    if (span) {
      cursor += drawStack(ctx, parts, i, cursor, centerY, fontSize);
      i += span - 1;
      continue;
    }
    const part = parts[i];
    if (part.kind === 'super') {
      cursor += drawQualitySuperText(ctx, part.text, cursor, centerY, fontSize);
      continue;
    }
    ctx.font = partFont(part, fontSize);
    ctx.textBaseline = 'middle';
    const y = partYOffset(part, fontSize, centerY);
    ctx.fillText(part.text, cursor, y);
    cursor += ctx.measureText(part.text).width;
  }
  ctx.restore();
  return width;
}

/** HTML display for DOM elements (Now Playing chord label). */
export function romanNumeralToHtml(symbol) {
  const parts = tokenizeRomanNumeral(symbol);
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    const span = stackSpan(parts, i);
    if (span === 2) {
      const q = splitQualitySuper(parts[i].text);
      if (q) {
        html += qualityStackHtml(q.glyph, q.digit, parts[i + 1].text);
      } else {
        html += stackHtml(parts[i].text, parts[i + 1].text);
      }
      i += 1;
      continue;
    }
    if (span === 3) {
      html += `<span class="roman-stack"><span class="roman-stack-top"><sup class="roman-figured-digit">${parts[i].text}</sup><span class="roman-suffix">${parts[i + 1].text}</span></span><sub class="roman-figured-digit">${parts[i + 2].text}</sub></span>`;
      i += 2;
      continue;
    }
    const part = parts[i];
    if (part.kind === 'super') html += renderSuperHtml(part.text);
    else if (part.kind === 'sub') html += `<sub>${part.text}</sub>`;
    else if (part.kind === 'suffix') html += `<span class="roman-suffix">${part.text}</span>`;
    else html += part.text;
  }
  return html;
}
