import { chordInterpreter } from "./music.js";
import { getChordSymbol, getChordLetterName } from "./jsonToSymbol.js";
import { noteToMidi } from "./chordVoicing.js";

// Platform-neutral values; native clients keep their existing public APIs.
export function interpretChordContract(chord, key, options = {}) {
  const interpreted = chordInterpreter(chord, key, options);
  const midi = interpreted.notes.map(noteToMidi);
  return {
    roman: getChordSymbol(chord, key),
    letter: getChordLetterName(chord, key),
    midi,
    pcs: [...new Set(midi.map((note) => ((note % 12) + 12) % 12))].sort((a, b) => a - b),
    rootMidi: interpreted.rootMidi,
    toneLabels: interpreted.chordDegrees.map((role) => `${role.replace(/b/g, "♭").replace(/#/g, "♯")}̂`),
  };
}
