/** Frozen 801cf798 HelpNotationArticles.kt */
import {
  HELP_C_MAJOR_NOTES,HELP_INTERVAL_ROWS,HELP_SCALE_DEGREES,
} from './help-catalog';

export const HELP_SCALE_TONIC =
  'A scale is an ordered set of notes, with its home note called the tonic. '+
  'Scale degrees 1 through 7 count from that home note: 1 is the tonic, 2 is the next '+
  'scale note, and so on. The hat above a number identifies it as a scale degree, '+
  'not a fixed note name.';
export const HELP_SCALE_ACCIDENTALS =
  'A flat (♭) lowers a degree by one semitone, the smallest step between neighboring '+
  'piano keys. A sharp (♯) raises it by one. Double flats (♭♭) and double sharps (♯♯) '+
  'change it by two semitones.';
export const HELP_CHORD_TONES =
  'On chord-tone cards, degrees are measured from the chord’s root using a major-scale '+
  'reference. G–B–D is 5–7–2 in C major, but 1–3–5 within the G-major chord. '+
  'A–C–E is 1–♭3–5 within the A-minor chord.';
export const HELP_DEGREE_CALLOUT =
  'Read the surrounding label first: a melody degree uses its section context; '+
  'a chord-tone degree uses the chord root.';
export const HELP_INTERVAL_LEGEND =
  'P = perfect, M = major, m = minor, A = augmented, and d = diminished.';

export function ScaleDegreesHelpArticle(){
  return <>
    <section>
      <h3>A position in a scale</h3>
      <p>{HELP_SCALE_TONIC}</p>
      <p>{HELP_SCALE_ACCIDENTALS}</p>
      <div className="help-degree-row" data-help-degrees={HELP_SCALE_DEGREES.join('')}
        aria-label="Scale positions one through seven">
        {HELP_SCALE_DEGREES.map(degree=><span key={degree} className="help-degree">{degree}</span>)}
      </div>
      <div className="help-panel" aria-label="C major: C D E F G A B align with scale degrees one through seven">
        <div className="help-degree-row">
          {HELP_C_MAJOR_NOTES.map((note,index)=>
            <span key={note} className="help-align"><strong>{note}</strong><span className="help-degree">{HELP_SCALE_DEGREES[index]}</span></span>)}
        </div>
      </div>
    </section>
    <section>
      <h3>Chord tones use the chord root</h3>
      <p>{HELP_CHORD_TONES}</p>
      <div className="help-chord-row" aria-label="G B D is five seven two in C major and one three five inside G chord. A C E is one flat three five inside A minor chord">
        <p><code>G–B–D</code> → <code>5–7–2</code> <span>in C major</span></p>
        <p><code>G–B–D</code> → <code>1–3–5</code> <span>inside G chord</span></p>
        <p><code>A–C–E</code> → <code>1–♭3–5</code> <span>inside A minor chord</span></p>
      </div>
      <aside className="help-callout">{HELP_DEGREE_CALLOUT}</aside>
    </section>
  </>;
}

export function IntervalsHelpArticle(){
  return <>
    <p>{HELP_INTERVAL_LEGEND}</p>
    <table className="help-intervals">
      <thead><tr><th>Abbrev.</th><th>Meaning</th><th>Semitones</th></tr></thead>
      <tbody>{HELP_INTERVAL_ROWS.map(row=>
        <tr key={row.abbreviation+row.semitones} aria-label={`${row.abbreviation}, ${row.meaning}, ${row.semitones} semitones`}>
          <th>{row.abbreviation}</th><td>{row.meaning}</td><td>{row.semitones}</td>
        </tr>)}
      </tbody>
    </table>
  </>;
}
