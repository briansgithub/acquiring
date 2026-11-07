import {describe,expect,it} from 'vitest';
import {
  HELP_INTERVAL_ROWS,HELP_TOPIC_ROMAN,HELP_TOPICS,helpTopic,
} from './help-catalog';
import {IntroductionCopy} from './introduction-copy';

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
});
