/**
 * Data extraction and transformation
 * Converts API responses into structured chord and melody objects
 * Supports both JSON and XML data formats
 */

const { parseXmlToJson } = require('./xmlParser');

async function extractChordAndMelodyObjects(apiResponse) {
  let jsonData;
  
  // Try JSON format first
  if (apiResponse.jsonData) {
    try {
      jsonData = typeof apiResponse.jsonData === 'string' 
        ? JSON.parse(apiResponse.jsonData) 
        : apiResponse.jsonData;
    } catch (e) {
      throw new Error(`Failed to parse jsonData: ${e.message}`);
    }
  }
  // Fall back to XML format
  else if (apiResponse.xmlData) {
    try {
      jsonData = await parseXmlToJson(apiResponse.xmlData);
    } catch (e) {
      throw new Error(`Failed to parse xmlData: ${e.message}`);
    }
  }
  else {
    throw new Error('No jsonData or xmlData in API response');
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

