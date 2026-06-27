const { pathToFileURL } = require('url');
const path = require('path');

(async () => {
  const music = await import(pathToFileURL(path.join(__dirname, '../web-player/lib/music.js')).href);
  const key = { tonic: 'Ab', scale: 'major' };
  const chord = {
    root: 5, beat: 33, duration: 4, type: 7, inversion: 0, applied: 7,
    adds: [], omits: [], alterations: [], suspensions: [], borrowed: '', isRest: false,
  };
  const r = music.chordInterpreter(chord, key);
  console.log('notes:', r.notes);
  console.log('degrees:', r.chordDegrees);
})();
