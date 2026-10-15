import { createRoot } from 'react-dom/client';
import { RomanNumeral, ScaleDegree } from '../../src/ui/notation/Notation';
const params=new URLSearchParams(location.search),large=params.has('large'),tiny=params.has('tiny');
const width=tiny?6:params.has('narrow')?96:180,height=tiny?6:100,size=large?96:48;
const romans=['V7/vi','vii°7/V','I64','I46','ii65','V43','V42','viiø65','i°65','I△42','Isus4','V7(b9)','I△9(no3)(no5)','I7(no3)sus4','sus2sus47','V7(maj)/♯iii','N.C.'];
const degrees=['♭7̂','♯♯4̂','1̂','♭7alt'];
document.documentElement.style.fontSize=large?'32px':'16px';
document.body.style.cssText='margin:0;padding:8px;background:#1c1b1f;color:#e6e1e5;font-family:system-ui';
createRoot(document.getElementById('root')!).render(<main>
  <h1 style={{fontSize:'1rem'}}>Musical notation</h1>
  <div style={{display:'flex',flexWrap:'wrap',gap:12}}>{romans.map((symbol,index)=><article key={symbol} data-case={'roman-'+index} style={{width:Math.max(width,80),maxWidth:'100%',border:'1px solid #605d62',padding:4}}>
    <p style={{fontSize:'.7rem',overflowWrap:'anywhere',margin:0}}>{symbol}</p>
    <div className="notation-frame" style={{width,height,display:'grid',placeItems:'center'}}><RomanNumeral display={{symbol,borrowedLabel:index===15?'(maj)':null}} fontSizePx={size} minFontSizePx={8} maxWidthPx={width} maxHeightPx={height}/></div>
  </article>)}{degrees.map((label,index)=><article key={label} data-case={'degree-'+index} style={{width:Math.max(width,80),maxWidth:'100%',border:'1px solid #605d62',padding:4}}>
    <p style={{fontSize:'.7rem',overflowWrap:'anywhere',margin:0}}>{label}</p>
    <div className="notation-frame" style={{width,height,display:'grid',placeItems:'center'}}><ScaleDegree label={label} fontSizePx={size} minFontSizePx={8} maxWidthPx={width} maxHeightPx={height}/></div>
  </article>)}</div>
</main>);
