import type { CSSProperties } from 'react';
import { parseScaleDegreeLabel } from './scale-degree-label';
import type { RomanNumeralDisplay } from './roman-numeral';
import { browserTextMeasure, centeredTextBounds, fitRomanDisplay, fitScaleDegree, measureRomanDisplay, measureScaleDegree, type NotationTextStyle } from './notation-layout';

export interface NotationFitProps { fontSizePx?: number; minFontSizePx?: number; maxWidthPx?: number; maxHeightPx?: number; color?: string; className?: string; style?: CSSProperties }
export interface RomanNumeralProps extends NotationFitProps { display: RomanNumeralDisplay; verticalTopGapPx?: number }
const scales: Record<NotationTextStyle, number> = { BASE:1, SUPER:.68, SUB:.58, FIGURED:.58, SUFFIX:.72, DIMINISHED:.46, BORROWED:.55, DEGREE:1, ACCIDENTAL:.66 };
const weight = (style: NotationTextStyle) => ['SUFFIX','BORROWED','ACCIDENTAL'].includes(style) ? '400' : '700';
const bounded = (content: number, maximum?: number) => maximum === undefined ? content : Math.min(content, Math.max(0,maximum));

export function RomanNumeral({ display, fontSizePx=32, minFontSizePx=8, maxWidthPx, maxHeightPx, verticalTopGapPx=0, color='currentColor', className, style }: RomanNumeralProps) {
  const layout = maxWidthPx !== undefined && maxHeightPx !== undefined
    ? fitRomanDisplay(display,minFontSizePx,fontSizePx,maxWidthPx,maxHeightPx,browserTextMeasure,verticalTopGapPx)
    : measureRomanDisplay(display,fontSizePx,browserTextMeasure);
  const roman = layout ?? measureRomanDisplay(display,minFontSizePx,browserTextMeasure);
  // Browser glyph ink can overhang its advance. Keep ink and subpixel rounding inside the viewBox.
  const inset = Math.max(2,roman.fontSizePx*.04);
  const contentHeight = Math.max(1,Math.ceil(roman.bottomPx-roman.topPx+inset*2));
  const contentWidth = Math.max(1,Math.ceil(roman.widthPx+inset*2));
  const romanWidth = roman.glyphs.reduce((maximum,glyph) => Math.max(maximum,glyph.xPx+browserTextMeasure(glyph.text,glyph.style,roman.fontSizePx*scales[glyph.style]).width),0);
  const left = (contentWidth-romanWidth)/2;
  const label = display.symbol + (display.borrowedLabel ? ` ${display.borrowedLabel}` : '');
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label} className={className} style={style}
    width={bounded(contentWidth,maxWidthPx)} height={bounded(contentHeight,maxHeightPx)} viewBox={`0 0 ${contentWidth} ${contentHeight}`} preserveAspectRatio="xMidYMid meet" textRendering="geometricPrecision">
    <g aria-hidden="true" fill={color} fontFamily="serif">
      {roman.glyphs.map((glyph,index) => {
        const size = roman.fontSizePx*scales[glyph.style];
        const metrics = browserTextMeasure(glyph.text,glyph.style,size);
        const baseline = centeredTextBounds(glyph.centerYPx+roman.romanCenterYPx,metrics).baselinePx-roman.topPx+inset;
        return <text key={index} x={left+glyph.xPx} y={baseline} fontSize={size} fontWeight={weight(glyph.style)}>{glyph.text}</text>;
      })}
      {display.borrowedLabel && <text x={contentWidth/2}
        y={centeredTextBounds(roman.borrowedCenterYPx,browserTextMeasure(display.borrowedLabel,'BORROWED',roman.fontSizePx*.55)).baselinePx-roman.topPx+inset}
        textAnchor="middle" fontSize={roman.fontSizePx*.55} fontWeight="400">{display.borrowedLabel}</text>}
    </g>
  </svg>;
}

export interface ScaleDegreeProps extends NotationFitProps { label: string; fitToBounds?: boolean }
export function ScaleDegree({ label, fontSizePx=48, minFontSizePx=12, maxWidthPx, maxHeightPx, color='currentColor', className, style, fitToBounds=true }: ScaleDegreeProps) {
  const layout = fitToBounds && maxWidthPx !== undefined && maxHeightPx !== undefined
    ? fitScaleDegree(label,minFontSizePx,fontSizePx,maxWidthPx,maxHeightPx,browserTextMeasure)
    : measureScaleDegree(label,fontSizePx,browserTextMeasure);
  const degree = layout ?? measureScaleDegree(label,minFontSizePx,browserTextMeasure);
  const inset = Math.max(2,degree.fontSizePx*.04);
  const contentHeight = Math.max(1,Math.ceil(degree.bottomPx-degree.topPx+inset*2));
  const contentWidth = Math.max(1,Math.ceil(degree.widthPx+inset*2));
  const baseline = (text: string, style: NotationTextStyle, size: number) => centeredTextBounds(degree.degreeCenterYPx,browserTextMeasure(text,style,size)).baselinePx-degree.topPx+inset;
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label={parseScaleDegreeLabel(label).spokenText} className={className} style={style}
    width={bounded(contentWidth,maxWidthPx)} height={bounded(contentHeight,maxHeightPx)} viewBox={`0 0 ${contentWidth} ${contentHeight}`} preserveAspectRatio="xMidYMid meet" textRendering="geometricPrecision">
    <g aria-hidden="true" fill={color} fontFamily="serif">
      {degree.label.prefix && <text x={inset} y={baseline(degree.label.prefix,'ACCIDENTAL',degree.fontSizePx*.66)} fontSize={degree.fontSizePx*.66} fontWeight="400">{degree.label.prefix}</text>}
      <text x={degree.degreeCenterXPx-degree.degreeWidthPx/2+inset} y={baseline(degree.label.degree,'DEGREE',degree.fontSizePx)} fontSize={degree.fontSizePx} fontWeight="700">{degree.label.degree}</text>
      {degree.label.suffix && <text x={degree.suffixXPx+inset} y={baseline(degree.label.suffix,'ACCIDENTAL',degree.fontSizePx*.66)} fontSize={degree.fontSizePx*.66} fontWeight="400">{degree.label.suffix}</text>}
      <path d={`M ${degree.hatLeftXPx+inset} ${degree.hatBaseYPx-degree.topPx+inset} L ${degree.hatTipXPx+inset} ${degree.hatTipYPx-degree.topPx+inset} L ${degree.hatRightXPx+inset} ${degree.hatBaseYPx-degree.topPx+inset}`}
        fill="none" stroke={color} strokeWidth={Math.max(1.5,degree.fontSizePx*.07)} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}
