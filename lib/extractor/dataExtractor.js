/**
 * Data extraction and transformation
 * Converts API responses into structured chord and melody objects
 */

function extractChordAndMelodyObjects(apiResponse) {
  if (!apiResponse.jsonData) {
    throw new Error('No jsonData in API response');
  }
  
  let jsonData;
  try {
    jsonData = typeof apiResponse.jsonData === 'string' 
      ? JSON.parse(apiResponse.jsonData) 
      : apiResponse.jsonData;
  } catch (e) {
    throw new Error(`Failed to parse jsonData: ${e.message}`);
  }
  
  const result = {
    songId: apiResponse.ID,
    songInfo: apiResponse.song,
    chords: jsonData.chords || [],
    notes: jsonData.notes || null,
    metadata: {
      version: jsonData.version,
      keys: jsonData.keys,
      tempos: jsonData.tempos,
      meters: jsonData.meters,
      sections: jsonData.sections,
      endBeat: jsonData.endBeat
    }
  };
  
  return result;
}

module.exports = {
  extractChordAndMelodyObjects
};

