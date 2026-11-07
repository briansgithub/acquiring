import type { PitchSource } from './pitch-publisher';
import { PitchTrackingMode } from './pitch-smoother';
import type { PitchResult } from './pitch-results';

export enum MicrophonePitchOwner {
  PLAYBACK_PERSISTENT = 'PLAYBACK_PERSISTENT',
  SINGING_TOOL = 'SINGING_TOOL',
}

export interface ExclusivePitchSource extends PitchSource {
  readonly ownsMicrophone: boolean;
  claim(trackingMode?: PitchTrackingMode): void;
}

/** Serializes playback/singing microphone leases over one PitchSource. */
export class MicrophonePitchCoordinator {
  private owner: MicrophonePitchOwner | null = null;
  private ownerTrackingMode = PitchTrackingMode.STANDARD;
  private released = false;
  private readonly ownership = new Map<MicrophonePitchOwner, boolean>(
    Object.values(MicrophonePitchOwner).map((owner) => [owner, false]),
  );

  constructor(private readonly delegate: PitchSource) {}

  sourceFor(requestedOwner: MicrophonePitchOwner): ExclusivePitchSource {
    return new OwnedPitchSource(this, requestedOwner);
  }

  /** True page departure revokes both leases without permanently disposing the owner. */
  stopAll(): void {
    if(this.released)return;
    this.delegate.stop();
    this.owner=null;
    this.ownerTrackingMode=PitchTrackingMode.STANDARD;
    for(const owner of this.ownership.keys())this.ownership.set(owner,false);
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.delegate.release();
    this.owner = null;
    this.ownerTrackingMode = PitchTrackingMode.STANDARD;
    for (const owner of this.ownership.keys()) this.ownership.set(owner, false);
  }

  claim(requestedOwner: MicrophonePitchOwner, trackingMode: PitchTrackingMode): void {
    if (this.released) return;
    this.ownerTrackingMode = trackingMode;
    if (this.owner === requestedOwner) return;
    this.delegate.stop();
    if (this.owner != null) this.ownership.set(this.owner, false);
    this.owner = requestedOwner;
    this.ownership.set(requestedOwner, true);
  }

  start(requestedOwner: MicrophonePitchOwner, targetMidi: number): void {
    if (this.released || this.owner !== requestedOwner) return;
    this.delegate.start(targetMidi, this.ownerTrackingMode);
  }

  retarget(requestedOwner: MicrophonePitchOwner, targetMidi: number): void {
    if (this.released || this.owner !== requestedOwner) return;
    this.delegate.retarget(targetMidi);
  }

  stop(requestedOwner: MicrophonePitchOwner): void {
    if (this.released || this.owner !== requestedOwner) return;
    this.delegate.stop();
    this.owner = null;
    this.ownerTrackingMode = PitchTrackingMode.STANDARD;
    this.ownership.set(requestedOwner, false);
  }

  current(): PitchResult { return this.delegate.current; }
  owns(requestedOwner: MicrophonePitchOwner): boolean {
    return this.ownership.get(requestedOwner) === true;
  }
}

class OwnedPitchSource implements ExclusivePitchSource {
  constructor(
    private readonly coordinator: MicrophonePitchCoordinator,
    private readonly requestedOwner: MicrophonePitchOwner,
  ) {}
  get current(): PitchResult { return this.coordinator.current(); }
  get ownsMicrophone(): boolean { return this.coordinator.owns(this.requestedOwner); }
  claim(trackingMode = PitchTrackingMode.STANDARD): void {
    this.coordinator.claim(this.requestedOwner, trackingMode);
  }
  start(targetMidi: number): void { this.coordinator.start(this.requestedOwner, targetMidi); }
  retarget(targetMidi: number): void { this.coordinator.retarget(this.requestedOwner, targetMidi); }
  stop(): void { this.coordinator.stop(this.requestedOwner); }
  release(): void { this.stop(); }
}
