import {useLayoutEffect,useRef} from 'react';
import './playback-title-sheet.css';

/** Web modal bottom sheet for native ModalBottomSheet + SelectionContainer.
 * No history/audio command: opening and dismissal retain the current destination and controller.
 */
export function PlaybackTitleSheet({title,onDismiss}:{title:string;onDismiss:()=>void}){
 const ref=useRef<HTMLDialogElement|null>(null),backdropDown=useRef(false);
 useLayoutEffect(()=>{
  const dialog=ref.current!;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  dialog.showModal();
  return()=>{dialog.close();if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[]);
 function outside(x:number,y:number){const r=ref.current!.getBoundingClientRect();return x<r.left||x>r.right||y<r.top||y>r.bottom;}
 return <dialog ref={ref} className="playback-title-sheet" aria-label="Full Playback title" data-playback-title-sheet=""
  onKeyDown={event=>{
   if(event.key!=='Tab')return;
   const stops=event.currentTarget.querySelectorAll<HTMLElement>('button,[tabindex="0"]');
   const first=stops[0],last=stops[stops.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }}
  onCancel={event=>{event.preventDefault();onDismiss();}} onClose={event=>{if(!event.currentTarget.open)onDismiss();}}
  onPointerDown={event=>{backdropDown.current=event.target===event.currentTarget&&outside(event.clientX,event.clientY);}}
  onClick={event=>{if(backdropDown.current&&event.target===event.currentTarget&&outside(event.clientX,event.clientY))onDismiss();backdropDown.current=false;}}>
  <div className="playback-title-sheet__header"><h2>Full Playback title</h2><button autoFocus type="button" className="action" aria-label="Close full title" onClick={onDismiss}>Close</button></div>
  <div className="playback-title-sheet__content" tabIndex={0} aria-label="Selectable title"><p data-full-playback-title="">{title}</p></div>
 </dialog>;
}
