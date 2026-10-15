import { describe,expect,it } from 'vitest';
import { centeredTextBounds,NotationTextStyle,fitRomanDisplay,fitScaleDegree,measureRomanDisplay,measureScaleDegree,type MeasureText } from './notation-layout';
import { RomanNumeral,ScaleDegree } from './Notation';

const measure:MeasureText=(text: string,_style:NotationTextStyle,size:number)=>({width:[...text].length*size*.55,ascent:size*.76,descent:size*.24});

describe('measured notation layouts',()=>{
  it('centers browser font metrics with the native baseline rule',()=>{
    expect(centeredTextBounds(10,{width:4,ascent:8,descent:2})).toEqual({baselinePx:13,topPx:5,bottomPx:15});
  });
  it('keeps Roman figured stacks aligned and borrowed labels in a separate row',()=>{
    const layout=measureRomanDisplay({symbol:'viiø65',borrowedLabel:'(min)'},40,measure);
    const upper=layout.glyphs.find(g=>g.text==='6'&&g.centerYPx<0)!;
    const lower=layout.glyphs.find(g=>g.text==='5'&&g.centerYPx>0)!;
    expect(lower.xPx).toBe(upper.xPx);
    expect(layout.borrowedCenterYPx).toBeGreaterThan(0);
    expect(layout.romanCenterYPx).toBeLessThan(0);
    expect(layout.bottomPx).toBeGreaterThan(layout.topPx);
  });
  it('keeps applied slashes and suffix glyphs horizontal in token order',()=>{
    const layout=measureRomanDisplay({symbol:'V7/vi(b9)',borrowedLabel:null},32,measure);
    expect(layout.glyphs.map(g=>g.text)).toEqual(['V','7','/','vi','(b9)']);
    expect(layout.glyphs.map(g=>g.xPx)).toEqual([...layout.glyphs.map(g=>g.xPx)].sort((a,b)=>a-b));
  });
  it('fits within narrow bounds, rejects impossible minima, and chooses large text when space allows',()=>{
    const display={symbol:'V13sus4',borrowedLabel:null};
    const small=fitRomanDisplay(display,8,64,95,68,measure)!;
    const large=fitRomanDisplay(display,8,64,900,400,measure)!;
    expect(small.widthPx).toBeLessThanOrEqual(95);
    expect(small.bottomPx-small.topPx).toBeLessThanOrEqual(68);
    expect(large.fontSizePx).toBeGreaterThan(small.fontSizePx);
    expect(fitRomanDisplay(display,40,64,1,1,measure)).toBeNull();
  });
  it('centers hats over the degree column and fits accidental labels',()=>{
    const layout=measureScaleDegree('♭7^',100,measure);
    expect(layout.hatTipXPx).toBe(layout.degreeCenterXPx);
    expect(layout.hatTipYPx).toBeLessThan(layout.hatBaseYPx);
    expect(layout.degreeCenterYPx).toBe(15);
    expect(centeredTextBounds(layout.degreeCenterYPx,{width:layout.degreeWidthPx,ascent:76,descent:24}).topPx).toBe(15-50);
    const fit=fitScaleDegree('♭7^',12,84,90,85,measure)!;
    expect(fit.widthPx).toBeLessThanOrEqual(90);
    expect(fit.bottomPx-fit.topPx).toBeLessThanOrEqual(85);
    expect(fitScaleDegree('♭7^',30,84,1,1,measure)).toBeNull();
  });
  it('exposes complete labels and hides rendered glyph groups from assistive technology',()=>{
    const roman=RomanNumeral({display:{symbol:'V7/vi',borrowedLabel:'(min)'}}) as {type:string;props:Record<string,unknown>};
    const degree=ScaleDegree({label:'♭7^'}) as {type:string;props:Record<string,unknown>};
    const romanGlyphs=roman.props.children as {type:string;props:Record<string,unknown>};
    const degreeGlyphs=degree.props.children as {type:string;props:Record<string,unknown>};
    expect(roman.type).toBe('svg'); expect(roman.props['aria-label']).toBe('V7/vi (min)');
    expect(degree.type).toBe('svg'); expect(degree.props['aria-label']).toBe('flat 7');
    expect(romanGlyphs.props['aria-hidden']).toBe('true');
    expect(degreeGlyphs.props['aria-hidden']).toBe('true');
    expect(romanGlyphs.props.children).toBeDefined();
    expect(degreeGlyphs.props.children).toBeDefined();
    const tinyRoman=RomanNumeral({display:{symbol:'V13',borrowedLabel:null},fontSizePx:40,minFontSizePx:30,maxWidthPx:1,maxHeightPx:1}) as {props:Record<string,unknown>};
    const tinyDegree=ScaleDegree({label:'♭7^',fontSizePx:40,minFontSizePx:30,maxWidthPx:1,maxHeightPx:1}) as {props:Record<string,unknown>};
    expect(tinyRoman.props.width).toBe(1); expect(tinyRoman.props.height).toBe(1);
    expect(String(tinyRoman.props.viewBox).split(' ')[2]).not.toBe('1');
    expect(tinyDegree.props.width).toBe(1); expect(tinyDegree.props.height).toBe(1);
    expect(String(tinyDegree.props.viewBox).split(' ')[3]).not.toBe('1');
    expect(tinyRoman.props.preserveAspectRatio).toBe('xMidYMid meet');
    expect(tinyDegree.props.preserveAspectRatio).toBe('xMidYMid meet');
  });
});
