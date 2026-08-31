import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getChordSymbol, getChordLetterName } from '../../../../web/lib/jsonToSymbol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheDir = path.join(__dirname, '../../../../acquiring_data/playback/.hooktheory_cache');
const folders = fs.readdirSync(cacheDir).slice(0, 300);

function normalizeAccidentals(str) {
    if (!str) return '';
    return str.replace(/♯/g, '#').replace(/♭/g, 'b');
}

console.log(`--- Testing ${folders.length} harvested song sections for JS Letter Name Reference ---`);

let totalChords = 0;
const results = [];

for (const folder of folders) {
    const folderPath = path.join(cacheDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    
    const metaPath = path.join(folderPath, '_metadata.json');
    if (!fs.existsSync(metaPath)) continue;

    const files = fs.readdirSync(folderPath).filter(f => f !== '_metadata.json' && f.endsWith('.json'));
    for (const file of files) {
        const content = fs.readFileSync(path.join(folderPath, file), 'utf8');
        const secData = JSON.parse(content);
        const chords = secData.chords || [];
        
        const key = {
            tonic: secData.metadata?.keys?.[0]?.tonic || "C",
            scale: secData.metadata?.keys?.[0]?.scale || "major"
        };

        for (const chord of chords) {
            if (chord.isRest || chord.rest || !chord.root || chord.root <= 0) continue;
            
            const jsSymbol = getChordSymbol(chord, key);
            const jsLetter = getChordLetterName(chord, key);

            totalChords++;
            results.push({
                songInfo: secData.songInfo || secData.songId,
                key,
                chord,
                jsSymbol,
                jsLetter
            });
        }
    }
}

console.log(`Extracted ${totalChords} valid chord letter names from JS Web Player.`);
fs.writeFileSync(path.join(__dirname, 'jsLetterReference.json'), JSON.stringify(results.slice(0, 500), null, 2));
console.log(`Saved top 500 test cases to jsLetterReference.json`);
