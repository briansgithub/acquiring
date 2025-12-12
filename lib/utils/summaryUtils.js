/**
 * Summary and statistics utilities
 * Calculates summaries and formats output for extracted data
 */

function calculateSummary(sections) {
  let totalChords = 0;
  let totalNotes = 0;
  
  for (const section of Object.values(sections)) {
    totalChords += (section.chords || []).length;
    if (Array.isArray(section.notes)) {
      totalNotes += section.notes.length;
    } else if (typeof section.notes === 'object' && section.notes !== null) {
      const noteCount = Object.values(section.notes).reduce((sum, melody) => 
        sum + (Array.isArray(melody) ? melody.length : 0), 0
      );
      totalNotes += noteCount;
    }
  }
  
  return {
    totalSections: Object.keys(sections).length,
    totalChords: totalChords,
    totalNotes: totalNotes,
    songIds: Object.keys(sections)
  };
}

function formatOutput(data) {
  console.log('\n' + '='.repeat(60));
  console.log('EXTRACTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nTotal Sections: ${data.summary.totalSections}`);
  console.log(`Total Chords: ${data.summary.totalChords}`);
  console.log(`Total Notes: ${data.summary.totalNotes}`);
  console.log(`\nSong IDs: ${data.summary.songIds.join(', ')}`);
  
  // Output per-section summary
  console.log(`\nSection Breakdown:`);
  for (const [songId, section] of Object.entries(data.sections)) {
    const chordCount = section.chords ? section.chords.length : 0;
    let noteCount = 0;
    if (Array.isArray(section.notes)) {
      noteCount = section.notes.length;
    } else if (typeof section.notes === 'object' && section.notes !== null) {
      noteCount = Object.values(section.notes).reduce((sum, melody) => 
        sum + (Array.isArray(melody) ? melody.length : 0), 0
      );
    }
    
    console.log(`  ${songId}:`);
    console.log(`    Song: ${section.songInfo || 'N/A'}`);
    console.log(`    Chords: ${chordCount}`);
    console.log(`    Notes: ${noteCount}`);
  }
  
  // Output sample data from first section
  const firstSection = Object.values(data.sections)[0];
  if (firstSection) {
    console.log(`\nSample Data (from first section):`);
    console.log(`\nSample chord object:`);
    if (firstSection.chords && firstSection.chords.length > 0) {
      console.log(JSON.stringify(firstSection.chords[0], null, 2));
    }
    
    if (firstSection.notes) {
      let sampleNote;
      if (Array.isArray(firstSection.notes) && firstSection.notes.length > 0) {
        sampleNote = firstSection.notes[0];
      } else if (typeof firstSection.notes === 'object') {
        const firstMelody = Object.values(firstSection.notes)[0];
        if (Array.isArray(firstMelody) && firstMelody.length > 0) {
          sampleNote = firstMelody[0];
        }
      }
      
      if (sampleNote) {
        console.log(`\nSample note object:`);
        console.log(JSON.stringify(sampleNote, null, 2));
      }
    }
  }
}

module.exports = {
  calculateSummary,
  formatOutput
};

