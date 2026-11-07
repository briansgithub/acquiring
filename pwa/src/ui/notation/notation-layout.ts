/** Pure measured geometry port of the Android Roman and scale-degree painters at 801cf798. */
import { parseScaleDegreeLabel, type ScaleDegreeLabel } from './scale-degree-label';
import { romanNumeralStackSpanAt, type RomanNumeralDisplay, tokenizeRomanNumeral } from './roman-numeral';

export type NotationTextStyle = 'BASE' | 'SUPER' | 'SUB' | 'FIGURED' | 'SUFFIX' | 'DIMINISHED' | 'BORROWED' | 'DEGREE' | 'ACCIDENTAL';
export interface TextMetrics { width: number; ascent: number; descent: number }
export interface CenteredTextBounds { baselinePx:number; topPx:number; bottomPx:number }
export function centeredTextBounds(centerYPx:number, metrics:TextMetrics):CenteredTextBounds {
  const baselinePx=centerYPx+(metrics.ascent-metrics.descent)/2;
  return {baselinePx,topPx:baselinePx-metrics.ascent,bottomPx:baselinePx+metrics.descent};
}
export type MeasureText = (text: string, style: NotationTextStyle, sizePx: number) => TextMetrics;
export interface RomanGlyph { text: string; xPx: number; centerYPx: number; style: NotationTextStyle }
export interface RomanLayout { display: RomanNumeralDisplay; fontSizePx: number; widthPx: number; topPx: number; bottomPx: number; romanCenterYPx: number; borrowedCenterYPx: number; borrowedWidthPx: number; glyphs: RomanGlyph[] }
export interface ScaleDegreeLayout { label: ScaleDegreeLabel; fontSizePx: number; widthPx: number; topPx: number; bottomPx: number; degreeCenterYPx:number; prefixWidthPx: number; degreeWidthPx: number; degreeCenterXPx: number; suffixXPx: number; suffixWidthPx: number; hatLeftXPx: number; hatTipXPx: number; hatRightXPx: number; hatTipYPx: number; hatBaseYPx: number }

export const NOTATION_STYLE_SCALE: Record<NotationTextStyle, number> = { BASE:1, SUPER:.68, SUB:.58, FIGURED:.58, SUFFIX:.72, DIMINISHED:.46, BORROWED:.55, DEGREE:1, ACCIDENTAL:.66 };
const scales = NOTATION_STYLE_SCALE;
const isRegular = (style: NotationTextStyle) => style === 'SUFFIX' || style === 'BORROWED' || style === 'ACCIDENTAL';
export function notationFontWeight(style: NotationTextStyle): '400' | '700' {
  return isRegular(style) ? '400' : '700';
}
const baselineMetrics = (measure: MeasureText, text: string, style: NotationTextStyle, size: number) => measure(text, style, size);
const widest = (...values: number[]) => Math.max(...values);

export function measureRomanDisplay(display: RomanNumeralDisplay, baseSize: number, measure: MeasureText): RomanLayout {
  const parts = tokenizeRomanNumeral(display.symbol), glyphs: RomanGlyph[] = [];
  let cursor = 0, index = 0;
  const add = (text: string, style: NotationTextStyle, x: number, y: number) => {
    if (!text) return 0;
    glyphs.push({ text: style === 'DIMINISHED' ? '○' : text, xPx:x, centerYPx:y, style });
    return measure(style === 'DIMINISHED' ? '○' : text, style, baseSize * scales[style]).width;
  };
  const quality = (text: string) => (text[0] === '°' || text[0] === 'ø') ? [text[0], text.slice(1)] as const : null;
  while (index < parts.length) {
    const span = romanNumeralStackSpanAt(parts, index), topY = -baseSize * .28, bottomY = baseSize * .16;
    if (span === 2) {
      const q = quality(parts[index].text), bottom = parts[index + 1].text;
      if (q) {
        const style = q[0] === '°' ? 'DIMINISHED' : 'SUPER';
        const markWidth = add(q[0], style, cursor, topY);
        const topWidth = add(q[1], 'FIGURED', cursor + markWidth, topY);
        const bottomWidth = add(bottom, 'FIGURED', cursor + markWidth, bottomY);
        cursor += markWidth + widest(topWidth, bottomWidth);
      } else {
        cursor += widest(add(parts[index].text, 'FIGURED', cursor, topY), add(bottom, 'FIGURED', cursor, bottomY));
      }
      index += span; continue;
    }
    if (span === 3) {
      const topWidth = add(parts[index].text, 'FIGURED', cursor, topY);
      const suffixWidth = add(parts[index + 1].text, 'SUFFIX', cursor + topWidth, topY);
      const bottomWidth = add(parts[index + 2].text, 'FIGURED', cursor, bottomY);
      cursor += widest(topWidth + suffixWidth, bottomWidth); index += span; continue;
    }
    const part = parts[index];
    const q = part.kind === 'SUPER' ? quality(part.text) : null;
    if (q) {
      const style = q[0] === '°' ? 'DIMINISHED' : 'SUPER';
      const markWidth = add(q[0], style, cursor, topY);
      cursor += markWidth + add(q[1], 'FIGURED', cursor + markWidth, topY);
    } else {
      const style: NotationTextStyle = part.kind === 'BASE' ? 'BASE' : part.kind === 'SUPER' ? 'SUPER' : part.kind === 'SUB' ? 'SUB' : 'SUFFIX';
      const y = part.kind === 'SUPER' ? topY : part.kind === 'SUB' ? bottomY : 0;
      cursor += add(part.text, style, cursor, y);
    }
    index++;
  }
  const romanTop = glyphs.length ? Math.min(...glyphs.map(g => centeredTextBounds(g.centerYPx,measure(g.text,g.style,baseSize*scales[g.style])).topPx)) : -baseSize/2;
  const romanBottom = glyphs.length ? Math.max(...glyphs.map(g => centeredTextBounds(g.centerYPx,measure(g.text,g.style,baseSize*scales[g.style])).bottomPx)) : baseSize/2;
  const borrowed = display.borrowedLabel;
  const borrowedCenter = borrowed ? baseSize * .30 : 0;
  const borrowedMetrics = borrowed ? baselineMetrics(measure, borrowed, 'BORROWED', baseSize * scales.BORROWED) : { width:0, ascent:0, descent:0 };
  const borrowedBounds=borrowed?centeredTextBounds(borrowedCenter,borrowedMetrics):null;
  const top = borrowed ? Math.min(romanTop-borrowedCenter,borrowedBounds!.topPx) : romanTop;
  const bottom = borrowed ? Math.max(romanBottom-borrowedCenter,borrowedBounds!.bottomPx) : romanBottom;
  return {
    display, fontSizePx:baseSize, widthPx:borrowed ? widest(cursor, borrowedMetrics.width) : cursor, topPx:top, bottomPx:bottom,
    romanCenterYPx:borrowed ? -borrowedCenter : 0, borrowedCenterYPx:borrowedCenter, borrowedWidthPx:borrowedMetrics.width, glyphs,
  };
}

export function fitRomanDisplay(display: RomanNumeralDisplay, minSize: number, maxSize: number, maxWidth: number, maxHeight: number, measure: MeasureText, verticalTopGap = 0): RomanLayout | null {
  if (maxWidth <= 0 || maxHeight <= 0) return null;
  const fits = (layout: RomanLayout) => layout.widthPx + Math.max(1.5, layout.fontSizePx * .06) <= maxWidth && layout.bottomPx - layout.topPx + verticalTopGap + Math.max(2, layout.fontSizePx * .06) <= maxHeight;
  const minimum = measureRomanDisplay(display, minSize, measure);
  if (!fits(minimum)) return null;
  let low = minSize, high = Math.max(minSize, maxSize), best = minimum;
  for (let i=0;i<12;i++) { const middle=(low+high)/2, next=measureRomanDisplay(display,middle,measure); if(fits(next)){best=next;low=middle;}else high=middle; }
  return best;
}

export function measureScaleDegree(source: string | ScaleDegreeLabel, fontSize: number, measure: MeasureText): ScaleDegreeLayout {
  const label = typeof source === 'string' ? parseScaleDegreeLabel(source) : source;
  const degree = measure(label.degree,'DEGREE',fontSize), accidentalSize=fontSize*.66;
  const prefix=measure(label.prefix,'ACCIDENTAL',accidentalSize), suffix=measure(label.suffix,'ACCIDENTAL',accidentalSize);
  const hatWidth=fontSize*.52, hatHeight=fontSize*.20, gap=fontSize*.10;
  const degreeColumn=widest(degree.width,hatWidth), prefixGap=label.prefix ? fontSize*.04 : 0, suffixGap=label.suffix ? fontSize*.04 : 0;
  const width=prefix.width+prefixGap+degreeColumn+suffixGap+suffix.width, degreeCenter=prefix.width+prefixGap+degreeColumn/2;
  const blockTop=-(hatHeight+gap+fontSize)/2, hatTip=blockTop, hatBase=blockTop+hatHeight, degreeCenterY=blockTop+hatHeight+gap+fontSize/2;
  const degreeBounds=centeredTextBounds(degreeCenterY,degree);
  let top=Math.min(hatTip,degreeBounds.topPx), bottom=Math.max(hatBase,degreeBounds.bottomPx);
  if(label.prefix||label.suffix){const accidentalBounds=centeredTextBounds(degreeCenterY,prefix);top=Math.min(top,accidentalBounds.topPx);bottom=Math.max(bottom,accidentalBounds.bottomPx);}
  return { label,fontSizePx:fontSize,widthPx:width,topPx:top,bottomPx:bottom,prefixWidthPx:prefix.width,degreeWidthPx:degree.width,degreeCenterXPx:degreeCenter,suffixXPx:prefix.width+prefixGap+degreeColumn+suffixGap,suffixWidthPx:suffix.width,hatLeftXPx:degreeCenter-hatWidth/2,hatTipXPx:degreeCenter,hatRightXPx:degreeCenter+hatWidth/2,hatTipYPx:hatTip,hatBaseYPx:hatBase,degreeCenterYPx:degreeCenterY };
}

export function fitScaleDegree(source: string, minSize: number, maxSize: number, maxWidth: number, maxHeight: number, measure: MeasureText): ScaleDegreeLayout | null {
  if(maxWidth<=0||maxHeight<=0)return null;
  const fits=(layout:ScaleDegreeLayout)=>layout.widthPx+Math.max(2,layout.fontSizePx*.04)<=maxWidth&&layout.bottomPx-layout.topPx+Math.max(2,layout.fontSizePx*.04)<=maxHeight;
  const minimum=measureScaleDegree(source,minSize,measure);if(!fits(minimum))return null;
  let low=minSize,high=Math.max(minSize,maxSize),best=minimum;
  for(let i=0;i<12;i++){const middle=(low+high)/2,next=measureScaleDegree(source,middle,measure);if(fits(next)){best=next;low=middle;}else high=middle;}
  return best;
}

let canvasContext: CanvasRenderingContext2D | null | undefined;
export function browserTextMeasure(text: string, style: NotationTextStyle, sizePx: number): TextMetrics {
  if (typeof document !== 'undefined') {
    canvasContext ??= document.createElement('canvas').getContext('2d');
    const context=canvasContext;
    if(context){const weight=isRegular(style)?'400':'700',size=sizePx;context.font=`${weight} ${size}px serif`;const m=context.measureText(text);return {width:m.width,ascent:m.fontBoundingBoxAscent||size*.8,descent:m.fontBoundingBoxDescent||size*.2};}
  }
  const size=sizePx;
  return {width:Array.from(text).length*size*.6,ascent:size*.8,descent:size*.2};
}
