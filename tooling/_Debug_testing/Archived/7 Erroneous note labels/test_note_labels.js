import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseKey, sdToToneJSNoteName, scaleDegreeToSpecificInterval } from '../../../web-player/lib/music.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test files
const testFiles = [
  {
    name: 'Lady Gaga - Bad Romance (Verse)',
    path: join(__dirname, '../../.hooktheory_cache/lady-gaga - Bad_Romance/Verse - 1469809 - lamkrayYoDM.json')
  },
  {
    name: 'Scott Joplin - Maple Leaf Rag (Intro)',
    path: join(__dirname, '../../.hooktheory_cache/scott-joplin - Maple_Leaf_Rag/Intro - 785200 - nvgy-kVrgkA.json')
  }
];

// Helper to extract note label and octave (testing internal logic)
function testNoteLabelAndOctave(sd, octave, key) {
  // We'll test through the public API sdToToneJSNoteName
  // and also test scaleDegreeToSpecificInterval to understand the semitone calculation
  const fullNoteName = sdToToneJSNoteName(sd, octave, key);
  const specificInterval = scaleDegreeToSpecificInterval(sd, key);
  
  // Extract note label and octave from the full note name
  // Handle double sharps/flats and various formats
  const match = fullNoteName.match(/^([A-G][#bx]*|bb[A-G])(\d+)$/);
  const noteLabel = match ? match[1] : fullNoteName;
  const absoluteOctave = match ? parseInt(match[2], 10) : null;
  
  return {
    noteLabel,
    absoluteOctave,
    specificInterval,
    fullNoteName,
    relativeOctave: octave
  };
}

function runTests() {
  console.log('='.repeat(80));
  console.log('Testing getNoteLabel and getAbsoluteOctave Functions');
  console.log('='.repeat(80));
  console.log();

  const results = {
    totalNotes: 0,
    notesByOctave: {},
    notesByScaleDegree: {},
    potentialIssues: []
  };

  for (const testFile of testFiles) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${testFile.name}`);
    console.log('='.repeat(80));
    
    try {
      const data = JSON.parse(readFileSync(testFile.path, 'utf8'));
      // Keys are nested under metadata.keys in these JSON files
      const metadata = data.metadata || data;
      const key = parseKey(metadata);
      const notes = Array.isArray(data.notes) ? data.notes : [];
      
      console.log(`Key: ${key.tonic} ${key.scale}`);
      console.log(`Total notes: ${notes.length}`);
      console.log();

      // Test first 50 notes and any with interesting octave values
      const testNotes = notes
        .filter(note => !note.isRest)
        .slice(0, 50)
        .concat(
          notes
            .filter(note => !note.isRest && (note.octave < -1 || note.octave > 1))
            .slice(0, 20)
        );

      console.log(`Testing ${testNotes.length} notes...\n`);

      for (let i = 0; i < testNotes.length; i++) {
        const note = testNotes[i];
        const result = testNoteLabelAndOctave(note.sd, note.octave, key);
        
        results.totalNotes++;
        
        // Track statistics
        if (!results.notesByOctave[result.absoluteOctave]) {
          results.notesByOctave[result.absoluteOctave] = 0;
        }
        results.notesByOctave[result.absoluteOctave]++;
        
        if (!results.notesByScaleDegree[note.sd]) {
          results.notesByScaleDegree[note.sd] = [];
        }
        results.notesByScaleDegree[note.sd].push({
          octave: note.octave,
          absoluteOctave: result.absoluteOctave,
          noteLabel: result.noteLabel
        });

        // Check for potential issues
        if (result.absoluteOctave < 2 || result.absoluteOctave > 7) {
          results.potentialIssues.push({
            file: testFile.name,
            note: note,
            result: result,
            issue: `Octave ${result.absoluteOctave} is outside typical range (2-7)`
          });
        }

        // Display first 20 notes in detail
        if (i < 20) {
          console.log(
            `  SD: ${note.sd.padEnd(4)} | ` +
            `Rel Oct: ${String(note.octave).padStart(3)} | ` +
            `Abs Oct: ${result.absoluteOctave} | ` +
            `Semitone: ${String(result.specificInterval).padStart(2)} | ` +
            `Label: ${result.noteLabel.padEnd(4)} | ` +
            `Full: ${result.fullNoteName}`
          );
        }
      }

      // Show statistics for this file
      console.log(`\nOctave distribution for ${testFile.name}:`);
      Object.keys(results.notesByOctave)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(octave => {
          console.log(`  Octave ${octave}: ${results.notesByOctave[octave]} notes`);
        });

    } catch (error) {
      console.error(`Error processing ${testFile.name}:`, error.message);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total notes tested: ${results.totalNotes}`);
  console.log(`Potential issues found: ${results.potentialIssues.length}`);
  
  if (results.potentialIssues.length > 0) {
    console.log('\nPotential Issues:');
    results.potentialIssues.slice(0, 20).forEach((issue, i) => {
      console.log(`\n${i + 1}. ${issue.issue}`);
      console.log(`   File: ${issue.file}`);
      console.log(`   Scale Degree: ${issue.note.sd}, Relative Octave: ${issue.note.octave}`);
      console.log(`   Result: ${issue.result.fullNoteName} (Absolute Octave: ${issue.result.absoluteOctave})`);
    });
  }

  // Show scale degree patterns
  console.log(`\n${'='.repeat(80)}`);
  console.log('Scale Degree Patterns:');
  console.log('='.repeat(80));
  Object.keys(results.notesByScaleDegree)
    .sort()
    .forEach(sd => {
      const examples = results.notesByScaleDegree[sd].slice(0, 5);
      console.log(`\nSD "${sd}":`);
      examples.forEach(ex => {
        console.log(`  Rel Oct ${ex.octave} → Abs Oct ${ex.absoluteOctave} (${ex.noteLabel})`);
      });
    });
}

runTests();
