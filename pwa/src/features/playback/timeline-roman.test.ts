import {describe,expect,it} from 'vitest';
import {romanNumeralDisplayFromChord} from '../../ui/notation/roman-numeral';
import {
  CHORD_LANE_ROMAN_CENTER_Y_BUMP,
  chordLaneRomanCenterY,
  chordLaneRomanFit,
} from './timeline-roman';
import {TIMELINE_CHORD_LANE_PX,TIMELINE_MELODY_LANE_PX,TIMELINE_PIXELS_PER_BEAT} from './timeline-layout';

describe('native chord-lane Roman fit, CSS px = dp', () => {
  it('fits a one-beat I and refuses inner boxes at or below 12', () => {
    const display = romanNumeralDisplayFromChord('I', undefined);
    const fitted = chordLaneRomanFit(display, TIMELINE_PIXELS_PER_BEAT, TIMELINE_CHORD_LANE_PX);
    expect(fitted).not.toBeNull();
    expect(fitted!.fontSizePx).toBeGreaterThanOrEqual(8);
    expect(fitted!.glyphs.some((glyph) => glyph.text === 'I')).toBe(true);
    expect(chordLaneRomanFit(display, 26, TIMELINE_CHORD_LANE_PX)).toBeNull();
    expect(chordLaneRomanFit(display, TIMELINE_PIXELS_PER_BEAT, 20)).toBeNull();
  });

  it('places the numeral at melody + chord/2 + 0.035*font', () => {
    expect(chordLaneRomanCenterY(20)).toBe(TIMELINE_MELODY_LANE_PX + TIMELINE_CHORD_LANE_PX / 2 + 20 * CHORD_LANE_ROMAN_CENTER_Y_BUMP);
  });
});
