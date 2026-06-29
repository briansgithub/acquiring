import { chordInterpreter } from '../web-player/lib/music.js';

const cases = [
  { name: 'minae bVI(min)', key: { tonic: 'Db', scale: 'major' },
    chord: { root: 6, type: 5, inversion: 0, applied: 0, borrowed: 'minor', suspensions: [], alterations: [], adds: [], omits: [] } },
  { name: 'minae bVI9(min)', key: { tonic: 'Db', scale: 'major' },
    chord: { root: 6, type: 9, inversion: 0, applied: 0, borrowed: 'minor', suspensions: [], alterations: [], adds: [], omits: [] } },
  { name: 'maxo vii/i applied7', key: { tonic: 'G#', scale: 'minor' },
    chord: { root: 1, type: 5, inversion: 0, applied: 7, borrowed: null, suspensions: [], alterations: [], adds: [], omits: [] } },
  { name: 'mars #iii7(maj)', key: { tonic: 'D#', scale: 'minor' },
    chord: { root: 3, type: 7, inversion: 0, applied: 0, borrowed: 'major', suspensions: [], alterations: [], adds: [], omits: [] } },
  { name: 'dnd V7(b5)sus2/#iii applied5', key: { tonic: 'G#', scale: 'minor' },
    chord: { root: 3, type: 7, inversion: 0, applied: 5, borrowed: 'major', suspensions: [2], alterations: ['b5'], adds: [], omits: [] } },
];

for (const c of cases) {
  try {
    const r = chordInterpreter(c.chord, c.key);
    console.log(c.name, '=>', r ? JSON.stringify(r.notes) : 'NULL');
  } catch (e) {
    console.log(c.name, '=> THREW:', e.message);
    console.log('   ', e.stack.split('\n')[1]?.trim());
  }
}
