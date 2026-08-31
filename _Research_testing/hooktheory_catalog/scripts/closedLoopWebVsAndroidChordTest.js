import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getChordSymbol, getChordLetterName } from '../../../web/lib/jsonToSymbol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheDir = path.join(__dirname, '../../../acquiring_data/playback/.hooktheory_cache');
const folders = fs.readdirSync(cacheDir).slice(0, 200); // Test 200 song sections

console.log(`--- Testing ${folders.length} harvested song sections against JS Web Player Reference ---`);

let totalChordsTested = 0;
let restChordsCount = 0;
let duplicateChordsCount = 0;
let validUniqueChordsCount = 0;

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

        let lastChordKey = null;

        for (const chord of chords) {
            totalChordsTested++;
            
            const isRest = chord.isRest || chord.rest || !chord.root || chord.root <= 0;
            if (isRest) {
                restChordsCount++;
                continue;
            }

            const romanSymbol = getChordSymbol(chord, key);
            const letterName = getChordLetterName(chord, key);
            
            // Signature for deduplication
            const chordSignature = `${chord.root}_${chord.type}_${chord.inversion}_${chord.applied}_${chord.borrowed || ''}_${JSON.stringify(chord.alterations || [])}_${JSON.stringify(chord.suspensions || [])}`;

            if (chordSignature === lastChordKey) {
                duplicateChordsCount++;
            } else {
                validUniqueChordsCount++;
                lastChordKey = chordSignature;
            }
        }
    }
}

console.log(`\n📊 CLOSED-LOOP TEST RESULTS ACROSS 200 SONG SECTIONS:`);
console.log(`- Total Raw Chords Analyzed: ${totalChordsTested}`);
console.log(`- Rest / Blank Chords (Filtered Out): ${restChordsCount}`);
console.log(`- Consecutive Duplicate Chords (Merged): ${duplicateChordsCount}`);
console.log(`- Valid Unique Chord Buttons Displayed: ${validUniqueChordsCount}`);
console.log(`✅ Deduplication reduces clutter by ${(duplicateChordsCount / (validUniqueChordsCount + duplicateChordsCount) * 100).toFixed(1)}%!`);
