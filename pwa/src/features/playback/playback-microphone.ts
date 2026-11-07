import {useEffect, useMemo} from 'react';
import {
  BrowserMicrophoneCapture, MicrophonePitchCoordinator, MicrophonePitchOwner,
  type ExclusivePitchSource,
} from '../../audio/capture';

/** One capture + coordinator for PLAYBACK_PERSISTENT and SINGING_TOOL. Native MainActivity 363-374. */
export function usePlaybackMicrophone(): {
  capture: BrowserMicrophoneCapture;
  persistent: ExclusivePitchSource;
  singing: ExclusivePitchSource;
} {
  const capture = useMemo(() => new BrowserMicrophoneCapture(), []);
  const coordinator = useMemo(() => new MicrophonePitchCoordinator(capture), [capture]);
  const persistent = useMemo(
    () => coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT),
    [coordinator],
  );
  const singing = useMemo(
    () => coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL),
    [coordinator],
  );
  useEffect(() => {
    const hide=()=>coordinator.stopAll();
    window.addEventListener('pagehide',hide);
    return()=>{window.removeEventListener('pagehide',hide);coordinator.release();};
  }, [coordinator]);
  return {capture, persistent, singing};
}
