import {describe,expect,it} from 'vitest';
import {
  HELP_INTERVAL_ROWS,HELP_ROMAN_APPLIED,HELP_ROMAN_EXTENSIONS,HELP_ROMAN_FIGURES,
  HELP_ROMAN_QUALITY,HELP_ROMAN_SUSPENSIONS,HELP_TOPIC_ROMAN,HELP_TOPICS,helpTopic,
} from './help-catalog';
import {IntroductionCopy} from './introduction-copy';
import {HELP_DEGREE_CALLOUT,HELP_INTERVAL_LEGEND,HELP_SCALE_TONIC} from './notation-articles';
import {HELP_ROMAN_DOMINANT_PROSE,HELP_ROMAN_ROOT,HELP_ROMAN_TRITONE_CALLOUT} from './roman-article';

describe('native HelpCatalog', () => {
  it('lists offline articles including introduction copy', () => {
    expect(HELP_TOPICS.map(topic=>topic.title)).toEqual([
      'Instructions','Scale degrees','Intervals','Roman numerals',
    ]);
    expect(IntroductionCopy.OCTAVE).toContain('octave');
    expect(HELP_TOPICS.at(-1)?.id).toBe(HELP_TOPIC_ROMAN);
    expect(HELP_INTERVAL_ROWS).toHaveLength(14);
    expect(HELP_INTERVAL_ROWS[0]?.semitones).toBe(0);
    expect(HELP_INTERVAL_ROWS.at(-1)?.semitones).toBe(12);
    expect(HELP_INTERVAL_ROWS.find(row=>row.semitones===7)?.abbreviation).toBe('P5');
    expect(helpTopic('missing')).toBeUndefined();
  });

  it('keeps HelpNotationArticles and RomanNumeralsHelpArticle native prose', () => {
    expect(HELP_SCALE_TONIC).toContain('hat above a number');
    expect(HELP_DEGREE_CALLOUT).toContain('chord-tone degree uses the chord root');
    expect(HELP_INTERVAL_LEGEND).toBe('P = perfect, M = major, m = minor, A = augmented, and d = diminished.');
    expect(HELP_ROMAN_ROOT).toContain('They need not be the same.');
    expect(HELP_ROMAN_DOMINANT_PROSE).toContain('V/V means');
    expect(HELP_ROMAN_TRITONE_CALLOUT).toContain('(∆-sub)');
    expect(HELP_ROMAN_QUALITY.map(example=>example.symbol)).toContain('vii°7');
    expect(HELP_ROMAN_EXTENSIONS.map(example=>example.symbol)).toEqual(['I7','ii9','V11','I13']);
    expect(HELP_ROMAN_FIGURES.map(figure=>figure.symbol)).toEqual(['I6','I64','V65','V43','V42']);
    expect(HELP_ROMAN_SUSPENSIONS.map(example=>example.symbol)).toContain('I(no5no3)');
    expect(HELP_ROMAN_APPLIED.map(example=>example.symbol)).toContain('♭ii7/V(∆-sub)');
  });
});
