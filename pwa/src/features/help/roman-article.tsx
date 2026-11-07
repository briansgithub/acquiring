/** Frozen 801cf798 HelpRomanArticle.kt */
import {
  HELP_ROMAN_ALTERATIONS,HELP_ROMAN_APPLIED,HELP_ROMAN_EXTENSIONS,HELP_ROMAN_FIGURES,
  HELP_ROMAN_QUALITY,HELP_ROMAN_SUSPENSIONS,type RomanFigureExample,type RomanHelpExample,
} from './help-catalog';

export const HELP_ROMAN_ROOT =
  'Roman numerals name the chord root’s scale position: I = 1, II = 2, III = 3, '+
  'IV = 4, V = 5, VI = 6, VII = 7. The root is the note from which the chord is '+
  'built; the bass is the lowest sounding note. They need not be the same.';
export const HELP_ROMAN_QUALITY_PROSE =
  'Uppercase normally marks a major chord and lowercase a minor chord. ♭, ♯, ♭♭, and ♯♯ '+
  'before the numeral alter its root. + marks an augmented triad (1–3–♯5); ° a '+
  'diminished triad (1–♭3–♭5). °7 adds a diminished seventh (♭♭7), while ø adds a '+
  'minor seventh (♭7). △ marks a major seventh (7), not merely a major triad.';
export const HELP_ROMAN_EXTENSION_PROSE =
  '7, 9, 11, and 13 count chord extensions above the root: a seventh, ninth, '+
  'eleventh, or thirteenth.';
export const HELP_ROMAN_FIGURE_PROSE =
  '6 and 64 are triad inversions; 65, 43, and 42 are seventh-chord inversions. '+
  'These figures describe intervals above the bass, not literal fractions or exponents.';
export const HELP_ROMAN_SUSPENSION_PROSE =
  'sus2 and sus4 replace the third; sus2sus4 combines both labels. add2, add4, add6, '+
  'add9, add11, and add13 add tones; no3, no5, and grouped (no5no3) omit tones.';
export const HELP_ROMAN_ALTERATION_PROSE =
  'Alterations appear in parentheses: (♭5), (♯5), (♭9), (♯9), (♯11), (♭13), or '+
  'combinations. A mode tag below the numeral marks borrowing: min minor, dor Dorian, '+
  'phr Phrygian, lyd Lydian, mix Mixolydian, loc Locrian, maj major, hmin harmonic '+
  'minor, phdm Phrygian dominant, or bor for a grouped source.';
export const HELP_ROMAN_DOMINANT_PROSE =
  'A dominant is the chord built on degree 5. A secondary dominant temporarily treats '+
  'another chord as home: V/V means “five of five.” In C major, D7 can lead to G, '+
  'so D7 is V7/V. V7/vi similarly points toward the minor chord on degree 6.';
export const HELP_ROMAN_LEADING_PROSE =
  'A leading tone lies one semitone below its target. vii°7/V is a diminished '+
  'leading-tone seventh chord pointing toward V. Read the slash as “of”: the numeral '+
  'to its right supplies a temporary reference. A Roman slash therefore does not '+
  'always mean a secondary dominant, and it is different from a bass-note slash in '+
  'a letter-name symbol such as C/E.';
export const HELP_ROMAN_TRITONE_CALLOUT =
  'A tritone substitution replaces a dominant chord with a chord whose root is a '+
  'tritone away; (∆-sub) names that substitution and is separate from △. (maj) can '+
  'label borrowing or appear in an applied context such as V7/vi(maj); it does not '+
  'change vi into a major chord.';

function RomanGrid({examples,kind}:{examples:readonly RomanHelpExample[];kind:string}){
  return <div className="help-roman-grid" data-help-roman={kind}>
    {examples.map(example=>
      <figure key={example.symbol+example.meaning} className="help-roman-card"
        aria-label={`${example.symbol}: ${example.meaning}`}>
        <span className="help-roman-symbol">{example.symbol}</span>
        {example.borrowedLabel?<span className="help-roman-borrowed">{example.borrowedLabel}</span>:null}
        <figcaption>{example.meaning}</figcaption>
      </figure>)}
  </div>;
}

function FigureRow({figure}:{figure:RomanFigureExample}){
  return <div className="help-roman-figure">
    <span className="help-roman-symbol">{figure.symbol}</span>
    <span>
      <strong>{figure.bass}</strong>
      <span className="help-roman-meaning">{figure.meaning}</span>
    </span>
  </div>;
}

export function RomanNumeralsHelpArticle(){
  return <>
    <section>
      <h3>Root, quality &amp; extensions</h3>
      <p>{HELP_ROMAN_ROOT}</p>
      <p>{HELP_ROMAN_QUALITY_PROSE}</p>
      <RomanGrid examples={HELP_ROMAN_QUALITY} kind="quality"/>
      <p>{HELP_ROMAN_EXTENSION_PROSE}</p>
      <RomanGrid examples={HELP_ROMAN_EXTENSIONS} kind="extensions"/>
    </section>
    <section>
      <h3>Figures, suspensions &amp; added tones</h3>
      <p>{HELP_ROMAN_FIGURE_PROSE}</p>
      <div className="help-roman-figures" data-help-roman="figures">
        {HELP_ROMAN_FIGURES.map(figure=><FigureRow key={figure.symbol} figure={figure}/>)}
      </div>
      <p>{HELP_ROMAN_SUSPENSION_PROSE}</p>
      <RomanGrid examples={HELP_ROMAN_SUSPENSIONS} kind="suspensions"/>
    </section>
    <section>
      <h3>Alterations, borrowing &amp; applied chords</h3>
      <p>{HELP_ROMAN_ALTERATION_PROSE}</p>
      <RomanGrid examples={HELP_ROMAN_ALTERATIONS} kind="alterations"/>
      <figure className="help-roman-card" data-help-roman-borrowed="iv"
        aria-label="Minor four, borrowed from minor">
        <span className="help-roman-symbol">iv</span>
        <span className="help-roman-borrowed">(min)</span>
      </figure>
      <p>{HELP_ROMAN_DOMINANT_PROSE}</p>
      <p>{HELP_ROMAN_LEADING_PROSE}</p>
      <RomanGrid examples={HELP_ROMAN_APPLIED} kind="applied"/>
      <aside className="help-callout">{HELP_ROMAN_TRITONE_CALLOUT}</aside>
    </section>
  </>;
}
