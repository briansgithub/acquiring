import type {HarvestCatalog,HarvestLedgerStore,StagedCatalog} from './harvest-ledger';
import {decodeModes,type HarvestedSong,type HarvestSongInput} from './harvested-song';

export interface MemoryCatalogSong extends HarvestSongInput {
  complexityRating: number | null;
  alphaGroup: string;
  modes: string[];
}

export class MemoryHarvestLedger implements HarvestLedgerStore {
  readonly songs = new Map<string, HarvestedSong>();
  readonly flags = new Map<string, string>();
  getAll(): HarvestedSong[] {
    return [...this.songs.values()].sort((left, right) => left.harvestedAt - right.harvestedAt || left.slug.localeCompare(right.slug));
  }
  count(): number { return this.songs.size; }
  record(song: HarvestedSong): void { this.songs.set(song.slug, song); }
  adopt(songs: HarvestedSong[]): void {
    for (const song of songs) if (!this.songs.has(song.slug)) this.songs.set(song.slug, song);
  }
  hasFlag(key: string): boolean { return this.flags.has(key); }
  setFlag(key: string, value: string): void { this.flags.set(key, value); }
}

export class MemoryHarvestCatalog implements HarvestCatalog {
  readonly songs = new Map<string, MemoryCatalogSong>();
  songExists(slug: string): boolean { return this.songs.has(slug); }
  getSongBySlug(slug: string): HarvestSongInput | null { return this.songs.get(slug) ?? null; }
  getUnratedSlugsWithChords(limit: number): string[] {
    const slugs: string[] = [];
    for (const song of this.songs.values()) {
      if (song.complexityRating !== null || !song.dataBlob) continue;
      slugs.push(song.slug);
      if (slugs.length >= limit) break;
    }
    return slugs;
  }
  getModesForSlug(slug: string): string[] { return this.songs.get(slug)?.modes ?? []; }
  insertRestored(entry: HarvestedSong): void {
    this.songs.set(entry.slug, {
      slug: entry.slug,
      artist: entry.artist,
      title: entry.title,
      url: entry.url,
      status: entry.status,
      dataBlob: entry.dataBlob,
      complexityRating: null,
      alphaGroup: entry.alphaGroup,
      modes: [...decodeModes(entry.modes)],
    });
  }
}

export class MemoryStagedCatalog implements StagedCatalog {
  constructor(private readonly slugs: ReadonlySet<string>) {}
  slugsPresent(candidates: readonly string[]): Set<string> {
    return new Set(candidates.filter(slug => this.slugs.has(slug)));
  }
}
