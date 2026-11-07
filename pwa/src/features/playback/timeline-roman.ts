/** Frozen 801cf798 PlaybackView.kt chord-lane Roman 1304-1311 + RomanNumeralPainter.draw. CSS px = dp. */
import {
  browserTextMeasure,
  centeredTextBounds,
  fitRomanDisplay,
  notationFontWeight,
  NOTATION_STYLE_SCALE,
  type RomanLayout,
} from '../../ui/notation/notation-layout';
import type {RomanNumeralDisplay} from '../../ui/notation/roman-numeral';
import {TIMELINE_CHORD_LANE_PX,TIMELINE_MELODY_LANE_PX} from './timeline-layout';

export const CHORD_LANE_ROMAN_PAD_X_PX = 14;
export const CHORD_LANE_ROMAN_PAD_Y_PX = 8;
export const CHORD_LANE_ROMAN_MIN_INNER_PX = 12;
export const CHORD_LANE_ROMAN_MIN_FONT_PX = 8;
export const CHORD_LANE_ROMAN_VERTICAL_GAP_PX = 4;
export const CHORD_LANE_ROMAN_CENTER_Y_BUMP = 0.035;

export function chordLaneRomanFit(display: RomanNumeralDisplay, widthPx: number, heightPx: number): RomanLayout | null {
  const innerWidth = widthPx - CHORD_LANE_ROMAN_PAD_X_PX;
  const innerHeight = heightPx - CHORD_LANE_ROMAN_PAD_Y_PX;
  if (innerWidth <= CHORD_LANE_ROMAN_MIN_INNER_PX || innerHeight <= CHORD_LANE_ROMAN_MIN_INNER_PX) return null;
  return fitRomanDisplay(
    display,
    CHORD_LANE_ROMAN_MIN_FONT_PX,
    Math.min(innerHeight * 0.9, innerWidth * 0.58),
    innerWidth,
    innerHeight,
    browserTextMeasure,
    CHORD_LANE_ROMAN_VERTICAL_GAP_PX,
  );
}

export function chordLaneRomanCenterY(fontSizePx: number): number {
  return TIMELINE_MELODY_LANE_PX + TIMELINE_CHORD_LANE_PX / 2 + fontSizePx * CHORD_LANE_ROMAN_CENTER_Y_BUMP;
}

function romanContentWidth(layout: RomanLayout): number {
  if (!layout.glyphs.length) return 0;
  return Math.max(...layout.glyphs.map((glyph) => {
    const size = layout.fontSizePx * NOTATION_STYLE_SCALE[glyph.style];
    return glyph.xPx + browserTextMeasure(glyph.text, glyph.style, size).width;
  }));
}

export function paintChordLaneRoman(
  ctx: CanvasRenderingContext2D,
  layout: RomanLayout,
  centerX: number,
  centerY: number,
): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const left = centerX - romanContentWidth(layout) / 2;
  const romanCenterY = centerY + layout.romanCenterYPx;
  for (const glyph of layout.glyphs) {
    const size = layout.fontSizePx * NOTATION_STYLE_SCALE[glyph.style];
    const metrics = browserTextMeasure(glyph.text, glyph.style, size);
    ctx.font = `${notationFontWeight(glyph.style)} ${size}px serif`;
    ctx.fillText(glyph.text, left + glyph.xPx, centeredTextBounds(romanCenterY + glyph.centerYPx, metrics).baselinePx);
  }
  const borrowed = layout.display.borrowedLabel;
  if (borrowed) {
    const size = layout.fontSizePx * NOTATION_STYLE_SCALE.BORROWED;
    const metrics = browserTextMeasure(borrowed, 'BORROWED', size);
    ctx.font = `${notationFontWeight('BORROWED')} ${size}px serif`;
    ctx.fillText(
      borrowed,
      centerX - layout.borrowedWidthPx / 2,
      centeredTextBounds(centerY + layout.borrowedCenterYPx, metrics).baselinePx,
    );
  }
  ctx.restore();
}
