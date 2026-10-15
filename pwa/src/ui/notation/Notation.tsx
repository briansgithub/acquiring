import type { CSSProperties } from 'react';
import { parseScaleDegreeLabel } from './scale-degree-label';
import type { RomanNumeralDisplay } from './roman-numeral';
import { browserTextMeasure, centeredTextBounds, fitRomanDisplay, fitScaleDegree, measureRomanDisplay, measureScaleDegree, type RomanLayout, type ScaleDegreeLayout } from './notation-layout';

export interface NotationFitProps { fontSizePx?:number; minFontSizePx?:number; maxWidthPx?:number; maxHeightPx?:number; color?:string; className?:string; style?:CSSProperties }
export interface RomanNumeralProps extends NotationFitProps { display:RomanNumeralDisplay; verticalTopGapPx?:number }
export function RomanNumeral({display,fontSizePx=32,minFontSizePx=8,maxWidthPx,maxHeightPx,verticalTopGapPx=0,color='currentColor',className,style}:RomanNumeralProps) {
  const measure=(text:string,kind:Parameters<typeof browserTextMeasure>[1],size:number)=>browserTextMeasure(text,kind,size);
  const layout=(maxWidthPx!==undefined&&maxHeightPx!==undefined)?fitRomanDisplay(display,minFontSizePx,fontSizePx,maxWidthPx,maxHeightPx,measure,verticalTopGapPx):measureRomanDisplay(display,fontSizePx,measure);
  const shown=layout??measureRomanDisplay(display,minFontSizePx,measure), roman=shown as RomanLayout;
  const contentHeight=Math.max(1,roman.bottomPx-roman.topPx), contentWidth=Math.max(1,roman.widthPx), height=maxHeightPx===undefined?contentHeight:Math.min(contentHeight,Math.max(0,maxHeightPx)), width=maxWidthPx===undefined?contentWidth:Math.min(contentWidth,Math.max(0,maxWidthPx)), scales={BASE:1,SUPER:.68,SUB:.58,FIGURED:.58,SUFFIX:.72,DIMINISHED:.46,BORROWED:.55,DEGREE:1,ACCIDENTAL:.66}, romanWidth=roman.glyphs.reduce((m,g)=>Math.max(m,g.xPx+measure(g.text,g.style,roman.fontSizePx*scales[g.style]).width),0), left=(contentWidth-romanWidth)/2;
  const label=display.symbol+(display.borrowedLabel?` ${display.borrowedLabel}`:'');
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label} className={className} style={style} width={width} height={height} viewBox={`0 0 ${contentWidth} ${contentHeight}`} preserveAspectRatio="xMidYMid meet">
    <g aria-hidden="true" fill={color} fontFamily="serif">
      {roman.glyphs.map((g,i)=>{const size=roman.fontSizePx*({BASE:1,SUPER:.68,SUB:.58,FIGURED:.58,SUFFIX:.72,DIMINISHED:.46,BORROWED:.55,DEGREE:1,ACCIDENTAL:.66}[g.style]),metrics=measure(g.text,g.style,size),baseline=centeredTextBounds(g.centerYPx+roman.romanCenterYPx,metrics).baselinePx-roman.topPx;return <text key={i} x={left+g.xPx} y={baseline} fontSize={size} fontWeight={g.style==='SUFFIX'?'400':'700'}>{g.text}</text>;})}
      {display.borrowedLabel&&<text x={contentWidth/2} y={centeredTextBounds(roman.borrowedCenterYPx,measure(display.borrowedLabel,'BORROWED',roman.fontSizePx*.55)).baselinePx-roman.topPx} textAnchor="middle" fontSize={roman.fontSizePx*.55} fontWeight="400">{display.borrowedLabel}</text>}
    </g>
  </svg>;
}

export interface ScaleDegreeProps extends NotationFitProps { label:string; fitToBounds?:boolean }
export function ScaleDegree({label,fontSizePx=48,minFontSizePx=12,maxWidthPx,maxHeightPx,color='currentColor',className,style,fitToBounds=true}:ScaleDegreeProps) {
  const measure=(text:string,kind:Parameters<typeof browserTextMeasure>[1],size:number)=>browserTextMeasure(text,kind,size);
  const layout=fitToBounds&&maxWidthPx!==undefined&&maxHeightPx!==undefined?fitScaleDegree(label,minFontSizePx,fontSizePx,maxWidthPx,maxHeightPx,measure):measureScaleDegree(label,fontSizePx,measure);
  const shown=layout??measureScaleDegree(label,minFontSizePx,measure), degree=shown as ScaleDegreeLayout;
  const contentHeight=Math.max(1,degree.bottomPx-degree.topPx), contentWidth=Math.max(1,degree.widthPx), height=maxHeightPx===undefined?contentHeight:Math.min(contentHeight,Math.max(0,maxHeightPx)), width=maxWidthPx===undefined?contentWidth:Math.min(contentWidth,Math.max(0,maxWidthPx));
  const degreeBaseline=centeredTextBounds(degree.degreeCenterYPx,browserTextMeasure(degree.label.degree,'DEGREE',degree.fontSizePx)).baselinePx-degree.topPx;
  const accidentalBaseline=(value:string)=>centeredTextBounds(degree.degreeCenterYPx,browserTextMeasure(value,'ACCIDENTAL',degree.fontSizePx*.66)).baselinePx-degree.topPx;
  const aria=parseLabel(label);
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label={aria} className={className} style={style} width={width} height={height} viewBox={`0 0 ${contentWidth} ${contentHeight}`} preserveAspectRatio="xMidYMid meet">
    <g aria-hidden="true" fill={color} fontFamily="serif">
      {degree.label.prefix&&<text x="0" y={accidentalBaseline(degree.label.prefix)} fontSize={degree.fontSizePx*.66} fontWeight="400">{degree.label.prefix}</text>}
      <text x={degree.degreeCenterXPx-degree.degreeWidthPx/2} y={degreeBaseline} fontSize={degree.fontSizePx} fontWeight="700">{degree.label.degree}</text>
      {degree.label.suffix&&<text x={degree.suffixXPx} y={accidentalBaseline(degree.label.suffix)} fontSize={degree.fontSizePx*.66} fontWeight="400">{degree.label.suffix}</text>}
      <path d={`M ${degree.hatLeftXPx} ${degree.hatBaseYPx-degree.topPx} L ${degree.hatTipXPx} ${degree.hatTipYPx-degree.topPx} L ${degree.hatRightXPx} ${degree.hatBaseYPx-degree.topPx}`} fill="none" stroke={color} strokeWidth={Math.max(1.5,degree.fontSizePx*.07)} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}
function parseLabel(value:string){return parseScaleDegreeLabel(value).spokenText;}
