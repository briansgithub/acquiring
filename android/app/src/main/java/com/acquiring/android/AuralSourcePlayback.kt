package com.acquiring.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun AuralSourcePlayback(source: AuralPlaybackSource, instrument: AudioEngine.Waveform, onBack: () -> Unit) {
    val context=LocalContext.current
    val coordinator=remember { MicrophonePitchCoordinator(MicrophonePitchTracker(context.applicationContext)) }
    val pitch=remember { coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT) }
    DisposableEffect(Unit) { onDispose { coordinator.release(); PlaybackController.pause() } }
    var waveform by remember { mutableStateOf(instrument) }; var tempo by rememberSaveable { mutableStateOf(100f) }
    var transpose by rememberSaveable { mutableStateOf(0) }; var arpeggio by rememberSaveable { mutableStateOf(DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX) }
    var loop by rememberSaveable { mutableStateOf(false) }
    val transport by PlaybackController.state.collectAsState()
    LaunchedEffect(loop,transport.beat,transport.phase) {
        if(loop && transport.phase == PlaybackPhase.PLAYING && transport.beat >= source.endBeat) PlaybackController.seek(source.startBeat,resume=true)
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth()) {
            TextButton(onClick=onBack,modifier=Modifier.weight(1f).testTag("AuralReturnFromPlayback")) { Text("← Return to quiz") }
            FilterChip(selected=loop,onClick={ loop=!loop; if(loop) PlaybackController.seek(source.startBeat,resume=PlaybackController.isPlaybackRequested) },label={ Text("Loop passage") })
        }
        Text("${source.section.safeSectionName} · source key · beats ${source.startBeat}–${source.endBeat}",Modifier.padding(horizontal=12.dp),style=MaterialTheme.typography.labelSmall)
        PlaybackDestination(song=source.song,sections=mapOf(source.sectionId to source.section),selectedSectionId=source.sectionId,onSectionChange={},
            currentWaveform=waveform,onWaveformChange={ waveform=it },globalTranspose=transpose,playbackTempoPercent=tempo,onPlaybackTempoPercentChange={ tempo=it },
            playbackArpeggioOptionIndex=arpeggio,onPlaybackArpeggioOptionIndexChange={ arpeggio=it },onTransposeChange={ transpose=it },onArtistClick={},onShowSongInfo={},onSingingTargetsRequested={},
            octaveOffset=0,persistentPitchSource=pitch,isFavorite=false,onToggleFavorite={},onBack=onBack,initialPassage=source.startBeat to source.endBeat)
    }
}
