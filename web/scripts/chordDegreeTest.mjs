import { chordInterpreter } from '../lib/music.js';
import { verifyInterpretedChord, formatVerifyReport } from '../lib/scaleDegreeVerifier.js';

const key = { tonic: 'G', scale: 'major' };
const chord = { root: 2, applied: 5, type: 5, inversion: 0, borrowed: null, isRest: false };
const { interpreter, verification } = verifyInterpretedChord(chord, key);
console.log('notes:', interpreter.notes);
console.log('degrees:', interpreter.chordDegrees);
console.log(formatVerifyReport(verification));
