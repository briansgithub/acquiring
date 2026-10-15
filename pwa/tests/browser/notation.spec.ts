import { mkdir } from 'node:fs/promises';
import { expect,test } from '@playwright/test';
for(const mode of ['','?narrow&large','?tiny'])test('native notation geometry and semantics '+(mode||'normal'),async ({page}) => {
  await page.setViewportSize({width:mode.includes('narrow')?320:900,height:800});
  await page.goto('http://127.0.0.1:5173/tests/browser/notation.html'+mode);
  await expect(page.getByRole('img')).toHaveCount(21);
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const errors=await page.locator('article').evaluateAll(cards=>cards.flatMap(card=>{
    const svg=card.querySelector('svg')!,view=svg.viewBox.baseVal,frame=card.querySelector('.notation-frame')!.getBoundingClientRect(),bounds=svg.getBoundingClientRect();
    const failures:string[]=[];
    if(!svg.getAttribute('aria-label'))failures.push('missing accessible label');
    if(bounds.width>frame.width+1||bounds.height>frame.height+1)failures.push('viewport exceeds available bounds');
    for(const child of svg.querySelectorAll<SVGGraphicsElement>('text,path')){
      const box=child.getBBox();
      if(![box.x,box.y,box.width,box.height].every(Number.isFinite))failures.push('nonfinite ink bounds');
      if(box.x < -1||box.y < -1||box.x+box.width>view.width+1||box.y+box.height>view.height+1)failures.push('clipped '+(child.textContent||child.tagName)+' '+JSON.stringify({x:box.x,y:box.y,w:box.width,h:box.height,vw:view.width,vh:view.height,font:getComputedStyle(child).fontSize}));
    }
    return failures.map(error=>card.getAttribute('data-case')+': '+error);
  }));
  await mkdir('.artifacts/pwa-port/notation',{recursive:true});
  await page.screenshot({path:'.artifacts/pwa-port/notation/diagnostic-'+(mode.includes('tiny')?'tiny':mode?'narrow-large':'normal')+'.png',fullPage:true});
  expect(errors.slice(0,8), String(errors.length)+' total ink failures').toEqual([]);
  await expect(page.getByRole('img',{name:'flat 7',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'sharp sharp 4',exact:true})).toBeVisible();
  const gaps=await page.locator('[data-case^="degree-"]').evaluateAll(cards=>cards.map(card=>{
    const svg=card.querySelector('svg')!,path=svg.querySelector('path')!.getBBox();
    const number=[...svg.querySelectorAll('text')].find(text=>/^\d+$/.test(text.textContent!))!.getBBox();
    return number.y-(path.y+path.height);
  }));
  expect(gaps.every(gap=>gap>=-1)).toBe(true);
  if(!mode.includes('tiny')){
    // SVG text getBBox includes the font em box, which overlaps for native figured rows.
    // Check painted digit ink with the same browser font and explicit alphabetic baseline.
    const rows=await page.locator('[data-case="roman-5"] text').evaluateAll(texts=>{
      const context=document.createElement('canvas').getContext('2d')!;
      return texts.map(text=>{
        const style=getComputedStyle(text),y=Number(text.getAttribute('y'));
        context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const ink=context.measureText(text.textContent!);
        return {text:text.textContent!,baseline:y,fontSize:parseFloat(style.fontSize),top:y-ink.actualBoundingBoxAscent,bottom:y+ink.actualBoundingBoxDescent};
      });
    });
    const top=rows.find(row=>row.text==='4')!,bottom=rows.find(row=>row.text==='3')!;
    expect(bottom.baseline-top.baseline).toBeCloseTo(top.fontSize*.44/.58,3);
    expect(top.bottom).toBeLessThanOrEqual(bottom.top+1);
    await mkdir('.artifacts/pwa-port/notation',{recursive:true});
    await page.screenshot({path:'.artifacts/pwa-port/notation/'+(mode?'narrow-large':'normal')+'.png',fullPage:true});
  }
});
