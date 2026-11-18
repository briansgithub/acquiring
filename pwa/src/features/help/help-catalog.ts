/** Frozen 801cf798 HelpContent.kt HelpCatalog. Offline card-notation reference. */
export const HELP_TOPIC_INSTRUCTIONS = 'help.topic.instructions';
export const HELP_TOPIC_SCALE_DEGREES = 'help.topic.scaleDegrees';
export const HELP_TOPIC_INTERVALS = 'help.topic.intervals';
export const HELP_TOPIC_ROMAN = 'help.topic.romanNumerals';
export const HELP_TOPIC_MELODY_FUNCTION = 'help.topic.melodyFunction';

export interface HelpTopic {readonly id:string;readonly title:string;readonly detail:string}
export interface IntervalHelpRow {readonly abbreviation:string;readonly meaning:string;readonly semitones:number}
export interface RomanHelpExample {readonly symbol:string;readonly meaning:string;readonly borrowedLabel?:string}
export interface RomanFigureExample {readonly symbol:string;readonly bass:string;readonly meaning:string}

const topic=(id:string,title:string,detail:string):HelpTopic=>Object.freeze({id,title,detail});
const interval=(abbreviation:string,meaning:string,semitones:number):IntervalHelpRow=>
  Object.freeze({abbreviation,meaning,semitones});
const roman=(symbol:string,meaning:string,borrowedLabel?:string):RomanHelpExample=>
  Object.freeze(borrowedLabel===undefined?{symbol,meaning}:{symbol,meaning,borrowedLabel});
const figure=(symbol:string,bass:string,meaning:string):RomanFigureExample=>Object.freeze({symbol,bass,meaning});

export const HELP_TOPICS:readonly HelpTopic[]=Object.freeze([
  topic(HELP_TOPIC_INSTRUCTIONS,'Instructions','How to use playback cards and singing practice'),
  topic(HELP_TOPIC_SCALE_DEGREES,'Scale degrees','Numbers, accidentals, and chord-tone reference'),
  topic(HELP_TOPIC_INTERVALS,'Intervals','Abbreviations, names, and semitone distances'),
  topic(HELP_TOPIC_ROMAN,'Roman numerals','Chord quality, figures, alterations, and applied chords'),
  topic(HELP_TOPIC_MELODY_FUNCTION,'Melody function','The one- or two-word role on the melody card'),
]);

export const HELP_INTERVAL_ROWS:readonly IntervalHelpRow[]=Object.freeze([
  interval('P1','Perfect unison',0),interval('m2','Minor second',1),interval('M2','Major second',2),
  interval('m3','Minor third',3),interval('M3','Major third',4),interval('P4','Perfect fourth',5),
  interval('A4','Augmented fourth',6),interval('d5','Diminished fifth',6),interval('P5','Perfect fifth',7),
  interval('m6','Minor sixth',8),interval('M6','Major sixth',9),interval('m7','Minor seventh',10),
  interval('M7','Major seventh',11),interval('P8','Perfect octave',12),
]);

export const HELP_SCALE_DEGREES:readonly string[]=Object.freeze(['1','2','3','4','5','6','7']);
export const HELP_C_MAJOR_NOTES:readonly string[]=Object.freeze(['C','D','E','F','G','A','B']);

export const HELP_ROMAN_QUALITY:readonly RomanHelpExample[]=Object.freeze([
  roman('I','major one'),roman('ii','minor two'),roman('♭VII','flat seven'),roman('♯♯IV','double sharp four'),
  roman('V+','augmented five'),roman('vii°7','fully diminished seven'),roman('iiø7','half-diminished two seven'),
  roman('I△7','one major seventh'),
]);
export const HELP_ROMAN_EXTENSIONS:readonly RomanHelpExample[]=Object.freeze([
  roman('I7','one with a seventh'),roman('ii9','minor two with a ninth'),
  roman('V11','five with an eleventh'),roman('I13','one with a thirteenth'),
]);
export const HELP_ROMAN_FIGURES:readonly RomanFigureExample[]=Object.freeze([
  figure('I6','third in bass','first inversion triad'),
  figure('I64','fifth in bass','second inversion triad'),
  figure('V65','third in bass','first inversion seventh chord'),
  figure('V43','fifth in bass','second inversion seventh chord'),
  figure('V42','seventh in bass','third inversion seventh chord'),
]);
export const HELP_ROMAN_SUSPENSIONS:readonly RomanHelpExample[]=Object.freeze([
  roman('Vsus2','five with suspended second'),roman('Vsus4','five with suspended fourth'),
  roman('I(add2)','one with added second'),roman('I(add6)','one with added sixth'),
  roman('I(add13)','one with added thirteenth'),roman('I(no5no3)','one without fifth and third'),
]);
export const HELP_ROMAN_ALTERATIONS:readonly RomanHelpExample[]=Object.freeze([
  roman('V7(♭9♯11)','five seven with flat nine and sharp eleven'),roman('♭VI','flat six'),roman('iv','minor four'),
]);
export const HELP_ROMAN_APPLIED:readonly RomanHelpExample[]=Object.freeze([
  roman('V/V','dominant of five'),roman('V7/vi','dominant seventh of six'),
  roman('vii°7/V','leading-tone seventh of five'),roman('♭ii7/V(∆-sub)','tritone substitution for five seven'),
]);

export function helpTopic(id:string):HelpTopic|undefined {
  return HELP_TOPICS.find(topic=>topic.id===id);
}

/** Native HelpCatalog melody-function tables (Android b5febe0f, N08). */
export interface MelodyFunctionHelpEntry {readonly word:string;readonly definition:string}
const entry=(word:string,definition:string):MelodyFunctionHelpEntry=>Object.freeze({word,definition});
export const MELODY_FUNCTION_CHORD_TONES:readonly MelodyFunctionHelpEntry[]=Object.freeze([
  entry('Root','Sit. This is the chord’s root.'),entry('Third','Sit. A stable tone of the chord.'),entry('Fifth','Sit. A stable tone of the chord.'),
  entry('Second','Lean. It belongs to the chord.'),entry('Fourth','Lean. It belongs to the chord and wants to fall to the third.'),
  entry('Sixth','Lean. It belongs to the chord.'),entry('Seventh','Lean. It belongs to the chord and wants to move.'),
  entry('Ninth','Lean. It belongs to the chord and wants to move.'),entry('Eleventh','Lean. It belongs to the chord and wants to move.'),
  entry('Thirteenth','Lean. It belongs to the chord and wants to move.'),
]);
export const MELODY_FUNCTION_SCALE_DEGREES:readonly MelodyFunctionHelpEntry[]=Object.freeze([
  entry('One','Sit. Scale degree 1, and no chord is under the note.'),entry('Two','Keep moving. Scale degree 2, and no chord is under the note.'),
  entry('Three','Sit. Scale degree 3, and no chord is under the note.'),entry('Four','Keep moving. Scale degree 4, and no chord is under the note.'),
  entry('Five','Sit. Scale degree 5, and no chord is under the note.'),entry('Six','Keep moving. Scale degree 6, and no chord is under the note.'),
  entry('Seven','Keep moving. Scale degree 7, and no chord is under the note.'),
]);
export const MELODY_FUNCTION_MOTION:readonly MelodyFunctionHelpEntry[]=Object.freeze([
  entry('Passing','Step between two chord tones in the same direction. Keep going.'),entry('Chromatic passing','A passing step on a note outside the key.'),
  entry('Upper neighbor','Step up and come back. Do not settle here.'),entry('Lower neighbor','Step down and come back. Do not settle here.'),
  entry('Anticipation','You are early. This note belongs to the next chord.'),entry('Suspension','The note was in the previous chord. Let it fall by step.'),
  entry('Retardation','The note was in the previous chord. Let it rise by step.'),entry('Held over','The chord changed under a note you are still holding.'),
  entry('Appoggiatura','You leapt onto a tension. Step off it onto a chord tone.'),entry('Escape','A short step off the chord, then a leap onward.'),
  entry('Leading','A half step under the next note. Let it rise.'),entry('Pedal','The melody holds still while the chords move.'),
]);
export const MELODY_FUNCTION_OUTSIDE:readonly MelodyFunctionHelpEntry[]=Object.freeze([
  entry('Color','Outside the chord, with no prepared path. Hear it against the root, then follow the melody.'),
  entry('Chromatic color','A color tone that is also outside the key.'),
]);
