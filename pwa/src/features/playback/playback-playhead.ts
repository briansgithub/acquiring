/** Native PlaybackPlayhead.kt at 3c887223 (N12): the last audio playhead sample, projected forward on the
 * display frame clock so the timeline moves every frame instead of only when Playback state re-renders.
 * Projection is clamped to 50 ms past the sample and stops when playback is not running.
 */
export const MAX_PLAYHEAD_PROJECTION_NANOS=50_000_000;

export function frameClockNanos():number {return performance.now()*1e6;}

export class PlaybackPlayhead {
  private sampleBeat=1;
  private sampleNanos=0;
  private playing=false;
  beatsPerSecond=0;

  sample(beat:number,playing:boolean,nowNanos=frameClockNanos()):void {
    this.sampleBeat=beat;
    this.sampleNanos=nowNanos;
    this.playing=playing;
    if(!playing)this.beatsPerSecond=0;
  }

  project(nowNanos=frameClockNanos()):number {
    const rate=this.beatsPerSecond,start=this.sampleNanos,beat=this.sampleBeat;
    if(!this.playing||rate<=0||start===0)return beat;
    const dtNanos=Math.min(Math.max(nowNanos-start,0),MAX_PLAYHEAD_PROJECTION_NANOS);
    return beat+dtNanos/1_000_000_000*rate;
  }
}
