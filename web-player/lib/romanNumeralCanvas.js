const ROMAN_LETTERS = /[ivxIVX]/;
const ACCIDENTALS = /[♭♯#b]/;
const DIGIT = /[0-9]/;

const DEFAULT_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const SUPER_SCALE = 0.68;
const SUB_SCALE = 0.58;
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
  while (i < symbol.length && (symbol[i] === '°' || symbol[i] === 'ø' || symbol[i] === '+')) {
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
    ctx.font = partFont(parts[i], fontSize);
    const superW = ctx.measureText(parts[i].text).width;
    ctx.font = partFont(parts[i + 1], fontSize);
    const subW = ctx.measureText(parts[i + 1].text).width;
    return Math.max(superW, subW);
  }
  if (span === 3) {
    ctx.font = partFont(parts[i], fontSize);
    let topW = ctx.measureText(parts[i].text).width;
    ctx.font = partFont(parts[i + 1], fontSize);
    topW += ctx.measureText(parts[i + 1].text).width;
    ctx.font = partFont(parts[i + 2], fontSize);
    const subW = ctx.measureText(parts[i + 2].text).width;
    return Math.max(topW, subW);
  }
  return 0;
}

function drawStack(ctx, parts, i, cursor, centerY, fontSize) {
  const span = stackSpan(parts, i);
  if (span === 2) {
    const width = measureStack(ctx, parts, i, fontSize);
    ctx.font = partFont(parts[i], fontSize);
    ctx.textBaseline = 'middle';
    ctx.fillText(parts[i].text, cursor, partYOffset(parts[i], fontSize, centerY));
    ctx.font = partFont(parts[i + 1], fontSize);
    ctx.fillText(parts[i + 1].text, cursor, partYOffset(parts[i + 1], fontSize, centerY));
    return width;
  }
  if (span === 3) {
    const width = measureStack(ctx, parts, i, fontSize);
    let topX = cursor;
    ctx.font = partFont(parts[i], fontSize);
    ctx.textBaseline = 'middle';
    ctx.fillText(parts[i].text, topX, partYOffset(parts[i], fontSize, centerY));
    topX += ctx.measureText(parts[i].text).width;
    ctx.font = partFont(parts[i + 1], fontSize);
    ctx.fillText(parts[i + 1].text, topX, partYOffset(parts[i + 1], fontSize, centerY));
    ctx.font = partFont(parts[i + 2], fontSize);
    ctx.fillText(parts[i + 2].text, cursor, partYOffset(parts[i + 2], fontSize, centerY));
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
      html += `<span class="roman-stack"><sup>${parts[i].text}</sup><sub>${parts[i + 1].text}</sub></span>`;
      i += 1;
      continue;
    }
    if (span === 3) {
      html += `<span class="roman-stack"><span class="roman-stack-top"><sup>${parts[i].text}</sup><span class="roman-suffix">${parts[i + 1].text}</span></span><sub>${parts[i + 2].text}</sub></span>`;
      i += 2;
      continue;
    }
    const part = parts[i];
    if (part.kind === 'super') html += `<sup>${part.text}</sup>`;
    else if (part.kind === 'sub') html += `<sub>${part.text}</sub>`;
    else if (part.kind === 'suffix') html += `<span class="roman-suffix">${part.text}</span>`;
    else html += part.text;
  }
  return html;
}
