/** Android shipping authority: 801cf798. Raw source IDs and JSON are never display-normalized. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export interface KeyInfo { tonic: string; scale: string }
export interface KeyChange extends KeyInfo { beat: number }
export interface Song { slug: string; artist: string | null; title: string | null; url: string; status: string }
export interface ExtractedSection {
  songId?: JsonValue; numericId?: JsonValue; sectionName?: string | null;
  sectionIndex?: number | null; songInfo?: string | null;
  chords: JsonObject[]; notes?: JsonValue; metadata?: JsonObject | null;
}
export interface MelodyNote { sd: string; beat: number; duration: number; octave: number; isRest: boolean }
export type Route = { kind: 'library' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'song'; slug: string } | { kind: 'playback'; slug: string } | { kind: 'not-found' };
export interface CorpusCase {
  id: string; json: string; key: KeyInfo; expectedRoman: string; expectedLetter: string;
  expectedPcs: number[]; expectedMidi: number[]; expectedRootMidi: number; expectedToneLabels: string[];
}
