/** Frozen 801cf798 HarvestedSong.kt. Ledger overlay, not a catalog row. */
export interface HarvestedSong {
  slug: string;
  artist: string | null;
  title: string | null;
  url: string;
  status: string;
  dataBlob: Uint8Array;
  alphaGroup: string;
  modes: string;
  harvestedAt: number;
}

export interface HarvestSongInput {
  slug: string;
  artist: string | null;
  title: string | null;
  url: string;
  status: string;
  dataBlob: Uint8Array | null;
}

export function encodeModes(modes: Iterable<string>): string {
  return [...new Set(modes)].sort().join('\n');
}

export function decodeModes(encoded: string): Set<string> {
  return new Set(encoded.split('\n').filter(mode => mode.length > 0));
}

export function harvestedSongEquals(left: HarvestedSong, right: HarvestedSong): boolean {
  return left.slug === right.slug;
}
