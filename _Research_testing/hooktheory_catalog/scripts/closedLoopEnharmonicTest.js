import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getChordSymbol, getChordLetterName } from '../../../web-player/lib/jsonToSymbol.js';
import { getNoteLabel } from '../../../web-player/lib/musicScale.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keysToTest = [
    { tonic: "C", scale: "major" },
    { tonic: "G", scale: "major" },
    { tonic: "D", scale: "major" },
    { tonic: "A", scale: "major" },
    { tonic: "E", scale: "major" },
    { tonic: "B", scale: "major" },
    { tonic: "F#", scale: "major" },
    { tonic: "C#", scale: "major" },
    { tonic: "F", scale: "major" },
    { tonic: "Bb", scale: "major" },
    { tonic: "Eb", scale: "major" },
    { tonic: "Ab", scale: "major" },
    { tonic: "Db", scale: "major" },
    { tonic: "Gb", scale: "major" },
    { tonic: "Cb", scale: "major" },

    { tonic: "A", scale: "minor" },
    { tonic: "E", scale: "minor" },
    { tonic: "B", scale: "minor" },
    { tonic: "F#", scale: "minor" },
    { tonic: "C#", scale: "minor" },
    { tonic: "G#", scale: "minor" },
    { tonic: "D#", scale: "minor" },
    { tonic: "A#", scale: "minor" },
    { tonic: "D", scale: "minor" },
    { tonic: "G", scale: "minor" },
    { tonic: "C", scale: "minor" },
    { tonic: "F", scale: "minor" },
    { tonic: "Bb", scale: "minor" },
    { tonic: "Eb", scale: "minor" },
    { tonic: "Ab", scale: "minor" }
];

console.log(`--- Testing Scale Degrees for ${keysToTest.length} Keys ---`);

for (const key of keysToTest) {
    const labels = [];
    for (let sd = 1; sd <= 7; sd++) {
        labels.push(getNoteLabel(sd, key));
    }
    console.log(`Key ${key.tonic.padEnd(3)} ${key.scale.padEnd(5)} -> [${labels.join(', ')}]`);
}
