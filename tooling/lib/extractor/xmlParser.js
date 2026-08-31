/**
 * XML parser for Hooktheory XML data format
 * Converts XML format to JSON format compatible with extractChordAndMelodyObjects
 */

const xml2js = require('xml2js');

/**
 * Parse XML data and convert to JSON format
 * @param {string} xmlData - XML string from API response
 * @returns {Object} JSON structure compatible with jsonData format
 */
async function parseXmlToJson(xmlData) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    explicitCharkey: false,
    trim: true,
    normalize: true
  });
  
  const parsed = await parser.parseStringPromise(xmlData);
  
  // Extract metadata
  const meta = parsed.super?.meta || {};
  const sections = parsed.super?.sections || {};
  
  // Get the first section (usually the section name like _Solo, _Verse, etc.)
  const sectionName = Object.keys(sections).find(key => key.startsWith('_')) || Object.keys(sections)[0];
  const sectionData = sections[sectionName] || sections;
  
  // Extract chords - can be at section level or segment level
  const chords = [];
  const segment = sectionData.segment || {};
  
  // Check for chords at segment level first (most common)
  if (segment.chords && segment.chords.chord) {
    const chordArray = Array.isArray(segment.chords.chord) 
      ? segment.chords.chord 
      : [segment.chords.chord];
    
    chords.push(...chordArray.map(chordXml => convertChordXmlToJson(chordXml)));
  }
  // Fall back to section level chords
  else if (sectionData.chords && sectionData.chords.chord) {
    const chordArray = Array.isArray(sectionData.chords.chord) 
      ? sectionData.chords.chord 
      : [sectionData.chords.chord];
    
    chords.push(...chordArray.map(chordXml => convertChordXmlToJson(chordXml)));
  }
  
  // Extract notes - typically at segment level
  let notes = null;
  if (segment.notes && segment.notes.note) {
    const noteArray = Array.isArray(segment.notes.note)
      ? segment.notes.note
      : [segment.notes.note];
    
    notes = noteArray.map(noteXml => convertNoteXmlToJson(noteXml));
  }
  // Fall back to section level notes
  else if (sectionData.notes && sectionData.notes.note) {
    const noteArray = Array.isArray(sectionData.notes.note)
      ? sectionData.notes.note
      : [sectionData.notes.note];
    
    notes = noteArray.map(noteXml => convertNoteXmlToJson(noteXml));
  }
  
  // Build metadata
  const keys = [];
  if (meta.key) {
    // Convert mode number to scale name
    // Mode mapping: 1=Ionian(major), 2=Dorian, 3=Phrygian, 4=Lydian, 5=Mixolydian, 6=Aeolian(minor), 7=Locrian
    const modeToScale = {
      1: 'major',
      2: 'dorian',
      3: 'phrygian',
      4: 'lydian',
      5: 'mixolydian',
      6: 'minor',
      7: 'locrian'
    };
    
    const modeNum = meta.mode ? parseInt(meta.mode, 10) : 1; // Default to major if not specified
    const scale = modeToScale[modeNum] || 'major';
    
    keys.push({
      beat: 1,
      tonic: meta.key,
      scale: scale
    });
  }
  
  const tempos = [];
  if (meta.BPM) {
    tempos.push({
      beat: 1,
      bpm: parseInt(meta.BPM, 10),
      swingFactor: 0, // XML doesn't specify swing
      swingBeat: 0.5 // Default swing beat
    });
  }
  
  const meters = [];
  if (meta.beats_in_measure) {
    meters.push({
      beat: 1,
      numBeats: parseInt(meta.beats_in_measure, 10),
      beatUnit: 1 // JSON format uses 1, not 4
    });
  }
  
  // Calculate endBeat from the last chord or note
  let endBeat = null;
  if (chords.length > 0) {
    const lastChord = chords[chords.length - 1];
    endBeat = lastChord.beat + lastChord.duration;
  }
  if (notes && notes.length > 0) {
    const lastNote = notes[notes.length - 1];
    const noteEndBeat = lastNote.beat + lastNote.duration;
    if (!endBeat || noteEndBeat > endBeat) {
      endBeat = noteEndBeat;
    }
  }
  
  return {
    version: '2.0.0', // XML format version
    chords: chords,
    notes: notes,
    keys: keys.length > 0 ? keys : undefined,
    tempos: tempos.length > 0 ? tempos : undefined,
    meters: meters.length > 0 ? meters : undefined,
    sections: undefined, // XML doesn't have section definitions
    endBeat: endBeat || undefined
  };
}

/**
 * Convert XML chord element to JSON chord object
 */
function convertChordXmlToJson(chordXml) {
  // Parse scale degree - keep as scale degree (1-7), not semitone (0-11)
  // The JSON format uses scale degrees for chord roots, matching the music.js expectations
  const sd = chordXml.sd ? parseInt(chordXml.sd, 10) : 1;
  const root = sd; // Keep as scale degree (1-7), not convert to semitone
  
  // Parse beat (use start_beat_abs if available, otherwise calculate from start_beat)
  const beat = chordXml.start_beat_abs !== undefined 
    ? parseFloat(chordXml.start_beat_abs) 
    : parseFloat(chordXml.start_beat || '1');
  
  // Parse duration
  const duration = parseFloat(chordXml.chord_duration || '1');
  
  // Determine chord type from XML attributes
  // XML has fb (flat?), sec (secondary?), sus (suspended?), etc.
  // Default to major triad (type 5) if no indication
  let type = 5; // Default: major triad
  if (chordXml.fb && chordXml.fb !== '') {
    // Has flat indication, might be minor
    type = 5; // Still major, but could be adjusted
  }
  if (chordXml.sus && chordXml.sus !== '') {
    // Suspended chord
    type = 5; // Default, sus chords might need different type
  }
  
  // Parse boolean fields
  const isRest = chordXml.isRest === '1' || chordXml.isRest === 1 || chordXml.isRest === true;
  
  return {
    root: root,
    beat: beat,
    duration: duration,
    type: type,
    inversion: 0, // XML doesn't specify inversion
    applied: 0, // XML doesn't specify applied chords
    adds: [], // XML doesn't specify added notes
    omits: [], // XML doesn't specify omitted notes
    alterations: [], // XML doesn't specify alterations
    suspensions: chordXml.sus && chordXml.sus !== '' ? [parseInt(chordXml.sus, 10)] : [],
    pedal: chordXml.pedal && chordXml.pedal !== '' ? parseInt(chordXml.pedal, 10) : null,
    alternate: chordXml.alternate || '',
    borrowed: chordXml.borrowed && chordXml.borrowed !== '' ? chordXml.borrowed : null,
    isRest: isRest,
    recordingEndBeat: null
  };
}

/**
 * Convert XML note element to JSON note object
 */
function convertNoteXmlToJson(noteXml) {
  // Parse scale degree (can be "rest" for rests)
  const scaleDegree = noteXml.scale_degree || 'rest';
  const sd = scaleDegree === 'rest' ? 'rest' : String(scaleDegree);
  
  // Parse beat (use start_beat_abs if available, otherwise calculate from start_beat)
  const beat = noteXml.start_beat_abs !== undefined
    ? parseFloat(noteXml.start_beat_abs)
    : parseFloat(noteXml.start_beat || '1');
  
  // Parse duration
  const duration = parseFloat(noteXml.note_length || '0.5');
  
  // Parse octave
  const octave = noteXml.octave !== undefined ? parseInt(noteXml.octave, 10) : 0;
  
  // Parse isRest
  const isRest = noteXml.isRest === '1' || noteXml.isRest === 1 || noteXml.isRest === true || scaleDegree === 'rest';
  
  return {
    sd: sd,
    octave: octave,
    beat: beat,
    duration: duration,
    isRest: isRest,
    recordingEndBeat: null
  };
}

module.exports = {
  parseXmlToJson
};

