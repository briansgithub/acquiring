/** Frozen PlaybackView pointer: tap + live drag. CSS px = dp. Cancel Chrome canvas bitmap-drag on mousedown. */
import {useEffect,useRef,type RefObject} from 'react';
import {TIMELINE_TAP_SLOP_PX,timelineDragBeat,timelineTapBeat} from './timeline-layout';

export interface TimelineScrub {
  tap(beat:number):void;
  dragTo(beat:number):void;
  end():void;
}

interface Origin {x:number;y:number;beat:number;dragging:boolean}

export function useTimelineScrub(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  beat: number,
  endBeat: number,
  onScrub: TimelineScrub | undefined,
  enabled: boolean,
): void {
  const origin = useRef<Origin | null>(null);
  const beatRef = useRef(beat);
  const endRef = useRef(endBeat);
  const scrubRef = useRef(onScrub);
  beatRef.current = beat;
  endRef.current = endBeat;
  scrubRef.current = onScrub;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const arm = (x: number, y: number) => { origin.current = {x, y, beat: beatRef.current, dragging: false}; };
    const drag = (clientX: number, clientY: number) => {
      const held = origin.current, scrub = scrubRef.current;
      if (!held || !scrub) return;
      const dx = clientX - held.x;
      if (!held.dragging) {
        if (Math.hypot(dx, clientY - held.y) <= TIMELINE_TAP_SLOP_PX) return;
        held.dragging = true;
      }
      scrub.dragTo(timelineDragBeat(held.beat, dx, endRef.current));
    };
    const finish = (clientX: number) => {
      const held = origin.current, scrub = scrubRef.current;
      origin.current = null;
      if (!held || !scrub) return;
      if (held.dragging) { scrub.end(); return; }
      const rect = canvas.getBoundingClientRect();
      scrub.tap(timelineTapBeat(held.beat, clientX - rect.left, rect.width, endRef.current));
    };
    const cancel = () => {
      const held = origin.current; origin.current = null;
      if (held?.dragging) scrubRef.current?.end();
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try { canvas.setPointerCapture(event.pointerId); } catch { /* CDP / synthetic */ }
      arm(event.clientX, event.clientY);
    };
    const pointerMove = (event: PointerEvent) => { if (origin.current) drag(event.clientX, event.clientY); };
    const pointerUp = (event: PointerEvent) => {
      if (!origin.current) return;
      if (event.button !== 0 && !origin.current.dragging) return;
      finish(event.clientX);
    };
    const mouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      if (!origin.current) arm(event.clientX, event.clientY);
    };
    const mouseMove = (event: MouseEvent) => {
      if (!(event.buttons & 1) || !origin.current) return;
      drag(event.clientX, event.clientY);
    };
    const mouseUp = (event: MouseEvent) => {
      if (event.button !== 0 || !origin.current) return;
      finish(event.clientX);
    };
    const dragStart = (event: Event) => event.preventDefault();
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('mousedown', mouseDown);
    canvas.addEventListener('mousemove', mouseMove);
    canvas.addEventListener('mouseup', mouseUp);
    canvas.addEventListener('dragstart', dragStart);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mouseup', mouseUp);
    return () => {
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('mousedown', mouseDown);
      canvas.removeEventListener('mousemove', mouseMove);
      canvas.removeEventListener('mouseup', mouseUp);
      canvas.removeEventListener('dragstart', dragStart);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', mouseUp);
    };
  }, [canvasRef, enabled]);
}
