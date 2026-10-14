/** Display-only Android CatalogDisplayName port; IDs, URLs and stored names stay raw. */
const entities: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…',
  eacute: 'é', Eacute: 'É', aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À',
  egrave: 'è', Egrave: 'È', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó',
  uacute: 'ú', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', auml: 'ä', Auml: 'Ä',
  ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
  szlig: 'ß', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å', aelig: 'æ', AElig: 'Æ',
};

function decodeEntities(value: string): string {
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    value = value.replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);/g, (whole, token: string) => {
      let replacement: string | undefined = Object.hasOwn(entities, token) ? entities[token] : undefined;
      if (token.startsWith('#')) {
        const hex = /^#x/i.test(token);
        const code = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
        replacement = code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code) : undefined;
      }
      if (replacement === undefined) return whole;
      changed = true;
      return replacement;
    });
    if (!changed) break;
  }
  return value;
}

/** Java Character.isWhitespace || isSpaceChar (FEFF and NEL are not spaces). */
function isNativeSpace(code: number): boolean {
  return code >= 9 && code <= 13 || code >= 0x1c && code <= 0x20 ||
    code === 0xa0 || code === 0x1680 || code >= 0x2000 && code <= 0x200a ||
    code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000;
}

export function cleanDisplayName(value: string): string {
  let mapped = '';
  for (const scalar of decodeEntities(value).normalize('NFC')) {
    const code = scalar.codePointAt(0)!;
    if (isNativeSpace(code)) mapped += ' ';
    else if (!(code < 0x20 || code >= 0x7f && code <= 0x9f)) mapped += scalar;
  }
  return mapped.split(/ +/).filter(Boolean).join(' ');
}

export function formatDisplayName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = cleanDisplayName(value);
  if (!text) return null;
  if (!/^[a-z0-9]+(?:[-_]+[a-z0-9]+)+$/.test(text)) return text;
  return text.replace(/[-_]+/g, ' ').split(' ').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

export function displayTitle(value: string | null | undefined): string {
  return formatDisplayName(value) ?? 'Unknown Title';
}

export function displayArtist(value: string | null | undefined): string {
  if (value != null) {
    const text = cleanDisplayName(value);
    if (/^[a-z]+-[0-9]+$/.test(text)) return text;
  }
  return formatDisplayName(value) ?? 'Unknown Artist';
}
