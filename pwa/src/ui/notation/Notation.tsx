import type { CSSProperties } from 'react';
import { parseScaleDegreeLabel } from './scale-degree-label';
import type { RomanNumeralDisplay } from './roman-numeral';
import { browserTextMeasure, fitRomanDisplay, fitScaleDegree, measureRomanDisplay, measureScaleDegree, type RomanLayout, type ScaleDegreeLayout } from './notation-layout';

export interface NotationFitProps { fontSizePx?:number; minFontSizePx?:number; maxWidthPx?:number; maxHeightPx?:number; color?:string; className?:string; style?:CSSProperties }
export interface RomanNumeralProps extends NotationFitProps { display:RomanNumeralDisplay; verticalTopGapPx?:number }
export function RomanNumeral({display,fontSizePx=32,minFontSizePx=8,maxWidthPx,maxHeightPx,verticalTopGapPx=0,color='currentColor',className,style}:RomanNumeralProps) {
  const measure=(text:string,kind:Parameters<typeof browserTextMeasure>[1],size:number)=>browserTextMeasure(text,kind,size);
  const layout=(maxWidthPx!==undefined&&maxHeightPx!==undefined)?fitRomanDisplay(display,minFontSizePx,fontSizePx,maxWidthPx,maxHeightPx,measure,verticalTopGapPx):measureRomanDisplay(display,fontSizePx,measure);
  const shown=layout??measureRomanDisplay(display,minFontSizePx,measure), roman=shown as RomanLayout;
  const height=Math.max(1,roman.bottomPx-roman.topPx), width=Math.max(1,roman.widthPx), scales={BASE:1,SUPER:.68,SUB:.58,FIGURED:.58,SUFFIX:.72,DIMINISHED:.46,BORROWED:.55,DEGREE:1,ACCIDENTAL:.66}, romanWidth=roman.glyphs.reduce((m,g)=>Math.max(m,g.xPx+measure(g.text,g.style,roman.fontSizePx*scales[g.style]).width),0), left=(width-romanWidth)/2;
  const label=display.symbol+(display.borrowedLabel?` ${display.borrowedLabel}`:'');
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label} className={className} style={style} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <g aria-hidden="true" fill={color} fontFamily="serif">
      {roman.glyphs.map((g,i)=><text key={i} x={left+g.xPx} y={g.centerYPx+roman.romanCenterYPx-roman.topPx} fontSize={roman.fontSizePx*({BASE:1,SUPER:.68,SUB:.58,FIGURED:.58,SUFFIX:.72,DIMINISHED:.46,BORROWED:.55,DEGREE:1,ACCIDENTAL:.66}[g.style])} fontWeight={g.style==='SUFFIX'?'400':'700'} dominantBaseline="middle">{g.text}</text>)}
      {display.borrowedLabel&&<text x={width/2} y={roman.borrowedCenterYPx-roman.topPx} textAnchor="middle" fontSize={roman.fontSizePx*.55} fontWeight="400" dominantBaseline="middle">{display.borrowedLabel}</text>}
    </g>
  </svg>;
}

export interface ScaleDegreeProps extends NotationFitProps { label:string; fitToBounds?:boolean }
export function ScaleDegree({label,fontSizePx=48,minFontSizePx=12,maxWidthPx,maxHeightPx,color='currentColor',className,style,fitToBounds=true}:ScaleDegreeProps) {
  const measure=(text:string,kind:Parameters<typeof browserTextMeasure>[1],size:number)=>browserTextMeasure(text,kind,size);
  const layout=fitToBounds&&maxWidthPx!==undefined&&maxHeightPx!==undefined?fitScaleDegree(label,minFontSizePx,fontSizePx,maxWidthPx,maxHeightPx,measure):measureScaleDegree(label,fontSizePx,measure);
  const shown=layout??measureScaleDegree(label,minFontSizePx,measure), degree=shown as ScaleDegreeLayout;
  const height=Math.max(1,degree.bottomPx-degree.topPx), width=Math.max(1,degree.widthPx), textY=(degree.hatBaseYPx+degree.fontSizePx*.1)-degree.topPx;
  const aria=parseLabel(label);
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label={aria} className={className} style={style} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <g aria-hidden="true" fill={color} fontFamily="serif">
      {degree.label.prefix&&<text x="0" y={textY} fontSize={degree.fontSizePx*.66} fontWeight="400" dominantBaseline="middle">{degree.label.prefix}</text>}
      <text x={degree.degreeCenterXPx-degree.degreeWidthPx/2} y={textY} fontSize={degree.fontSizePx} fontWeight="700" dominantBaseline="middle">{degree.label.degree}</text>
      {degree.label.suffix&&<text x={degree.suffixXPx} y={textY} fontSize={degree.fontSizePx*.66} fontWeight="400" dominantBaseline="middle">{degree.label.suffix}</text>}
      <path d={`M ${degree.hatLeftXPx} ${degree.hatBaseYPx-degree.topPx} L ${degree.hatTipXPx} ${degree.hatTipYPx-degree.topPx} L ${degree.hatRightXPx} ${degree.hatBaseYPx-degree.topPx}`} fill="none" stroke={color} strokeWidth={Math.max(1.5,degree.fontSizePx*.07)} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}
function parseLabel(value:string){return parseScaleDegreeLabel(value).spokenText;}
