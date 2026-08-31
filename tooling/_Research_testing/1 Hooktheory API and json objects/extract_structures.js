/**
 * Extract and document the JSON structure of melody and chord objects
 * for each section (Intro, Verse, Chorus, Bridge, Outro)
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'api_responses.json');
const OUTPUT_FILE = path.join(__dirname, 'structure_documentation.json');

const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

const documentation = {
  timestamp: new Date().toISOString(),
  source: 'Hooktheory API',
  url: 'https://api.hooktheory.com/v1/songs/public/{songId}?fields=ID,xmlData,song,jsonData',
  structure: {
    chordObject: null,
    melodyObject: null,
    sections: {}
  }
};

// Extract chord structure from first chord
if (data.mainParsed && data.mainParsed.chords && data.mainParsed.chords.length > 0) {
  const firstChord = data.mainParsed.chords[0];
  documentation.structure.chordObject = {
    description: 'Chord object structure',
    properties: Object.keys(firstChord).map(key => ({
      name: key,
      type: typeof firstChord[key],
      example: firstChord[key],
      description: getPropertyDescription(key, firstChord[key])
    })),
    example: firstChord,
    fullExample: data.mainParsed.chords.slice(0, 3) // First 3 chords as examples
  };
}

// Extract melody/notes structure
if (data.mainParsed && data.mainParsed.notes) {
  // Notes can be an array or object with multiple melodies
  let melodyData = data.mainParsed.notes;
  
  if (Array.isArray(melodyData) && melodyData.length > 0) {
    const firstNote = melodyData[0];
    documentation.structure.melodyObject = {
      description: 'Melody/Note object structure (array format)',
      properties: Object.keys(firstNote).map(key => ({
        name: key,
        type: typeof firstNote[key],
        example: firstNote[key],
        description: getPropertyDescription(key, firstNote[key])
      })),
      example: firstNote,
      fullExample: melodyData.slice(0, 5) // First 5 notes
    };
  } else if (typeof melodyData === 'object' && melodyData !== null) {
    // Multiple melodies (object with keys)
    const firstMelodyKey = Object.keys(melodyData)[0];
    const firstMelody = melodyData[firstMelodyKey];
    
    if (Array.isArray(firstMelody) && firstMelody.length > 0) {
      const firstNote = firstMelody[0];
      documentation.structure.melodyObject = {
        description: 'Melody/Note object structure (object with multiple melodies)',
        melodyKeys: Object.keys(melodyData),
        properties: Object.keys(firstNote).map(key => ({
          name: key,
          type: typeof firstNote[key],
          example: firstNote[key],
          description: getPropertyDescription(key, firstNote[key])
        })),
        example: firstNote,
        fullExample: firstMelody.slice(0, 5)
      };
    }
  }
}

// Extract section data
if (data.mainParsed && data.mainParsed.sections) {
  documentation.structure.sections = data.mainParsed.sections;
}

// Process each section's data
const sectionData = {
  Intro: data.sections?.Intro || [],
  Chorus: data.mainParsed ? [data.mainParsed] : [],
  Bridge: data.sections?.Bridge ? [data.sections.Bridge] : [],
  Outro: []
};

// Analyze each section
for (const [sectionName, sectionItems] of Object.entries(sectionData)) {
  if (sectionItems.length === 0) continue;
  
  documentation.structure.sections[sectionName] = sectionItems.map((item, idx) => {
    const sectionDoc = {
      songId: item.songId || item.ID || 'unknown',
      hasData: !!(item.data || item.jsonData)
    };
    
    let jsonData = null;
    if (item.data && item.data.jsonData) {
      try {
        jsonData = typeof item.data.jsonData === 'string' 
          ? JSON.parse(item.data.jsonData) 
          : item.data.jsonData;
      } catch (e) {
        jsonData = { error: 'Failed to parse jsonData' };
      }
    } else if (item.jsonData) {
      try {
        jsonData = typeof item.jsonData === 'string' 
          ? JSON.parse(item.jsonData) 
          : item.jsonData;
      } catch (e) {
        jsonData = { error: 'Failed to parse jsonData' };
      }
    }
    
    if (jsonData) {
      sectionDoc.structure = {
        hasChords: !!(jsonData.chords && jsonData.chords.length > 0),
        hasNotes: !!(jsonData.notes),
        chordCount: jsonData.chords ? jsonData.chords.length : 0,
        noteCount: jsonData.notes ? (Array.isArray(jsonData.notes) ? jsonData.notes.length : 'object') : 0,
        keys: Object.keys(jsonData),
        sampleChord: jsonData.chords && jsonData.chords.length > 0 ? jsonData.chords[0] : null,
        sampleNote: getSampleNote(jsonData.notes)
      };
    }
    
    return sectionDoc;
  });
}

function getPropertyDescription(key, value) {
  const descriptions = {
    root: 'Root note of the chord (0-11, where 0=C, 1=C#, 2=D, etc.)',
    beat: 'Beat number where the chord/note starts',
    duration: 'Duration of the chord/note in beats',
    type: 'Chord type (5=major, 7=dominant 7th, 9=9th, etc.)',
    inversion: 'Chord inversion (0=root position, 1=first inversion, etc.)',
    applied: 'Applied chord (secondary dominant)',
    adds: 'Added notes to the chord',
    omits: 'Omitted notes from the chord',
    alterations: 'Altered notes in the chord',
    suspensions: 'Suspended notes',
    pedal: 'Pedal tone',
    alternate: 'Alternate chord name',
    borrowed: 'Borrowed chord (from parallel key)',
    isRest: 'Whether this is a rest',
    recordingEndBeat: 'End beat for recording',
    pitch: 'Note pitch (MIDI note number)',
    velocity: 'Note velocity (0-127)'
  };
  
  return descriptions[key] || `Type: ${typeof value}`;
}

function getSampleNote(notes) {
  if (!notes) return null;
  
  if (Array.isArray(notes) && notes.length > 0) {
    return notes[0];
  } else if (typeof notes === 'object' && notes !== null) {
    const firstKey = Object.keys(notes)[0];
    const firstMelody = notes[firstKey];
    if (Array.isArray(firstMelody) && firstMelody.length > 0) {
      return firstMelody[0];
    }
  }
  
  return null;
}

// Save documentation
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(documentation, null, 2));

console.log('='.repeat(60));
console.log('STRUCTURE DOCUMENTATION');
console.log('='.repeat(60));

console.log('\n✓ Documentation saved to:', OUTPUT_FILE);

console.log('\n' + '='.repeat(60));
console.log('CHORD OBJECT STRUCTURE');
console.log('='.repeat(60));
if (documentation.structure.chordObject) {
  console.log('\nProperties:');
  documentation.structure.chordObject.properties.forEach(prop => {
    console.log(`  ${prop.name}: ${prop.type} - ${prop.description}`);
    if (prop.example !== null && prop.example !== undefined && prop.example !== '') {
      console.log(`    Example: ${JSON.stringify(prop.example)}`);
    }
  });
} else {
  console.log('\nNo chord structure found');
}

console.log('\n' + '='.repeat(60));
console.log('MELODY/NOTE OBJECT STRUCTURE');
console.log('='.repeat(60));
if (documentation.structure.melodyObject) {
  console.log(`\nFormat: ${documentation.structure.melodyObject.description}`);
  if (documentation.structure.melodyObject.melodyKeys) {
    console.log(`Melody Keys: ${documentation.structure.melodyObject.melodyKeys.join(', ')}`);
  }
  console.log('\nProperties:');
  documentation.structure.melodyObject.properties.forEach(prop => {
    console.log(`  ${prop.name}: ${prop.type} - ${prop.description}`);
    if (prop.example !== null && prop.example !== undefined && prop.example !== '') {
      console.log(`    Example: ${JSON.stringify(prop.example)}`);
    }
  });
} else {
  console.log('\nNo melody structure found');
}

console.log('\n' + '='.repeat(60));
console.log('SECTION DATA');
console.log('='.repeat(60));
for (const [section, items] of Object.entries(documentation.structure.sections)) {
  if (Array.isArray(items) && items.length > 0) {
    console.log(`\n${section}:`);
    items.forEach((item, idx) => {
      console.log(`  [${idx + 1}] Song ID: ${item.songId}`);
      if (item.structure) {
        console.log(`      Chords: ${item.structure.chordCount}`);
        console.log(`      Notes: ${item.structure.noteCount}`);
        console.log(`      Keys: ${item.structure.keys.join(', ')}`);
      }
    });
  }
}

