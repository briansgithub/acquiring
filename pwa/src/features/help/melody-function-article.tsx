import {
  MELODY_FUNCTION_CHORD_TONES,MELODY_FUNCTION_MOTION,MELODY_FUNCTION_OUTSIDE,MELODY_FUNCTION_SCALE_DEGREES,type MelodyFunctionHelpEntry,
} from './help-catalog';

function FunctionTable({entries}:{entries:readonly MelodyFunctionHelpEntry[]}){
  return <dl className="help-panel melody-function-table">
    {entries.map(entry=><div key={entry.word} aria-label={`${entry.word}. ${entry.definition}`}>
      <dt>{entry.word}</dt><dd>{entry.definition}</dd>
    </div>)}
  </dl>;
}

/** Native MelodyFunctionHelpArticle (Android b5febe0f, N08). */
export function MelodyFunctionHelpArticle(){
  return <>
    <p>During playback, the melody card names the current note’s job in one or two words. The color tells you what to do with it.</p>
    <p className="help-callout">Green means sit. Blue means lean. Amber means keep moving. Red means the note is outside the chord.</p>
    <section><h3>Chord tones</h3><FunctionTable entries={MELODY_FUNCTION_CHORD_TONES}/></section>
    <section><h3>No chord under the note</h3><FunctionTable entries={MELODY_FUNCTION_SCALE_DEGREES}/></section>
    <section><h3>Tones that keep moving</h3>
      <p>These notes are not at rest in the chord. A neighbor outside the key still reads Upper neighbor or Lower neighbor.</p>
      <FunctionTable entries={MELODY_FUNCTION_MOTION}/></section>
    <section><h3>Outside the chord</h3><FunctionTable entries={MELODY_FUNCTION_OUTSIDE}/></section>
  </>;
}
