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
    
    console.log(`  ${songId} - ${section.sectionName} - ${section.songInfo || 'N/A'}:`);
    console.log(`    Notes: ${noteCount}`);
    console.log(`    Chords: ${chordCount}`);
  }
  

}

module.exports = {
  calculateSummary,
  formatOutput
};

