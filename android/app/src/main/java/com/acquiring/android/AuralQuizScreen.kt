package com.acquiring.android

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import java.io.File

/** Gates help separately from generic instructions; unrevealed answers stay out of semantics. */
internal data class AuralQuestionPresentation(val title: String, val prompt: String, val guidance: String?)
internal fun auralMicrophoneKindLabel(kind: String): String = when (kind) {
    "bass" -> "Lowest voiced bass note"
    "scaleDegree" -> "Scale degree in the key"
    "rootSequence" -> "Chord roots in sequence"
    else -> "Chord root"
}
internal fun auralQuestionPresentation(view: AuralLessonView): AuralQuestionPresentation {
    val exercise = view.exercise ?: return AuralQuestionPresentation("Aural Quiz", "Choose a family", null)
    return AuralQuestionPresentation(
        AuralPracticeModes.forSkill(exercise.skillId).label,
        auralBriefPrompt(exercise),
        when {
            view.guidanceVisible -> exercise.guidance
            exercise.support == 1 -> "A starting cue: the first exercise chord is ${exercise.fullDegrees.first()}. Hear the motion of the remaining chords before responding."
            else -> null
        }
    )
}

/** Full reference, then an exactly timed gap: the task has a defined musical answer. */
internal fun auralPromptEvents(exercise: AuralExercise): List<AuralEvent> {
    val rest = AuralEvent(emptyList(), 60, 60, "", "silence", 2.0)
    val separator = rest.copy(beats = 0.75)
    val result = exercise.context + separator + exercise.events
    val modeled = if (exercise.referenceRequired) result + separator + exercise.events.mapIndexed { index, event ->
        if (index == exercise.gapIndex) event.copy(notes = emptyList()) else event
    } else result
    return if (exercise.skillId in listOf("recall", "audiate", "reproduce")) modeled + rest else modeled
}

@Composable
internal fun AuralQuizScreen(
    onBack: () -> Unit,
    sessionOverride: AuralSession? = null,
    defaultInstrument: AudioEngine.Waveform = AudioEngine.Waveform.CLARINET,
    settingsContent: (@Composable (() -> Unit) -> Unit)? = null,
    loadFavoriteSongs: (suspend () -> Set<String>)? = null,
    catalogEnabled: Boolean = true,
    playExample: (suspend (AuralExercise) -> Unit)? = null
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val session = remember { sessionOverride ?: AuralSession(AuralPreferences(context), exampleProvider = SqliteAuralExampleProvider(File(context.filesDir, "aural-corpus.db"))) }
    val audio = remember { AuralAudio(context.applicationContext) }
    val pitchSource = remember { MicrophonePitchTracker(context.applicationContext) }
    val scope = rememberCoroutineScope()
    var view by remember { mutableStateOf(session.view()) }
    var busy by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(false) }
    var permissionPending by remember { mutableStateOf(false) }
    var answer by rememberSaveable { mutableStateOf(session.playbackReturn?.draft.orEmpty()) }
    var microphoneIndex by rememberSaveable { mutableStateOf(0) }
    var microphoneResults by rememberSaveable { mutableStateOf(emptyList<Boolean>()) }
    var route by rememberSaveable { mutableStateOf(if(session.playbackReturn!=null) "lesson" else "families") }
    var selectedFamily by rememberSaveable { mutableStateOf(AuralCurriculum.families.first().id) }
    var showInfo by remember { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var showExampleSettings by rememberSaveable { mutableStateOf(false) }
    var exampleSettings by remember { mutableStateOf(session.exampleSettings) }
    var microphoneMenu by remember { mutableStateOf(false) }
    var practiceMicrophoneKind by rememberSaveable { mutableStateOf("auto") }
    var activityJob by remember { mutableStateOf<Job?>(null) }
    var generation by remember { mutableStateOf(0) }
    var chunkIndex by rememberSaveable { mutableStateOf(-1) }
    var catalog by remember { mutableStateOf<AuralCatalog?>(null) }
    var catalogError by remember { mutableStateOf<String?>(null) }
    var playbackSource by remember { mutableStateOf<AuralPlaybackSource?>(null) }
    var songsTab by rememberSaveable { mutableStateOf(session.playbackReturn?.fromSongs==true) }
    var reviewPool by remember { mutableStateOf(emptyList<AuralCatalogRow>()) }
    val catalogState = rememberSaveableStateHolder()
    LaunchedEffect(Unit) {
        if(!catalogEnabled) return@LaunchedEffect
        try { catalog = withContext(Dispatchers.IO) { AuralCatalog(File(context.filesDir,"aural-catalog.db")) } }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { catalogError = "Song catalog is not installed. Guided practice is available." }
    }
    DisposableEffect(catalog) { val current=catalog; onDispose { current?.close() } }
    LaunchedEffect(answer) { session.rememberDraft(answer) }
    LaunchedEffect(catalog) {
        if(catalog!=null && session.playbackReturn?.open==true) {
            try { playbackSource=withContext(Dispatchers.IO) {
                val returning=session.playbackReturn!!
                catalog!!.playback(returning.sourcePassage ?: session.view().exercise!!.provenance.corpus!!.passage,wholeSong=returning.fromSongs)
            } }
            catch (_: Exception) { session.technical("Source could not reopen. Your quiz is restored."); view=session.view() }
        }
    }

    fun refresh() { view = session.view() }
    fun cancel(markInterrupted: Boolean = false) {
        generation += 1
        activityJob?.cancel(); activityJob = null
        audio.cancel(); pitchSource.stop()
        if (markInterrupted && busy) session.interrupted()
        busy = false; recording = false
        refresh()
    }
    fun resetResponse() { answer = emptyList(); microphoneIndex = 0; microphoneResults = emptyList(); chunkIndex=-1 }
    fun patternPractice(pattern: AuralPatternTarget, mode: String, assessment: Boolean = false) {
        val currentCatalog = catalog ?: return
        cancel(); busy=true
        activityJob = scope.launch {
            try { session.practicePattern(pattern,currentCatalog,mode,practiceMicrophoneKind.takeUnless { it=="auto" },assessment); songsTab=false; route="lesson"; resetResponse(); refresh() }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { session.technical("This passage could not be prepared. Choose another sequence."); refresh() }
            finally { busy=false }
        }
    }
    fun practice(familyId: String, variantId: String, modeId: String) {
        view.exercise?.provenance?.target?.pattern?.takeIf { it.id==familyId }?.let { patternPractice(it,modeId); return }
        cancel()
        session.practiceMode(familyId, variantId, modeId, practiceMicrophoneKind.takeUnless { it == "auto" })
        selectedFamily = familyId; route = "lesson"; resetResponse(); refresh()
    }
    fun adaptive() { cancel(); session.next(); resetResponse(); route = "lesson"; refresh() }
    fun next() {
        val exercise = view.exercise
        exercise?.provenance?.target?.pattern?.let { pattern ->
            if(exercise.provenance.target.variantId==null) {
                val pool=reviewPool.filter { it.target.id!=pattern.id }
                val nextTarget=session.reviewPattern(pool)
                if(nextTarget==null) route="families" else patternPractice(nextTarget.first,nextTarget.second,true)
            } else patternPractice(pattern,AuralPracticeModes.forSkill(exercise.skillId).id)
            return
        }
        val variantId = exercise?.provenance?.target?.variantId
        if (exercise != null && variantId != null) practice(exercise.familyId, variantId, AuralPracticeModes.forSkill(exercise.skillId).id)
        else adaptive()
    }
    fun back() {
        cancel(markInterrupted = true)
        if(playbackSource != null) { playbackSource=null; session.returnFromPlayback(); return }
        when (route) {
            "lesson" -> {
                if (!view.answered) session.interrupted()
                val ex = view.exercise
                route = if (ex?.provenance?.target?.variantId != null && ex.provenance.target.pattern == null) "progressions" else "families"
                if (ex != null) selectedFamily = ex.familyId
                resetResponse(); refresh()
            }
            "progressions" -> route = "families"
            else -> onBack()
        }
    }
    fun openSong(song:AuralPatternSong) {
        val currentCatalog=catalog ?: return
        val pattern=view.exercise?.provenance?.target?.pattern ?: return
        cancel(); busy=true
        activityJob=scope.launch {
            try {
                val (passage,source)=withContext(Dispatchers.IO) {
                    val passage=currentCatalog.passage(pattern,exampleSettings,AuralSelectionContext(),0,pattern.id,song.id)
                    passage to currentCatalog.playback(passage,wholeSong=true)
                }
                session.exploringPlayback(answer,passage,fromSongs=true); playbackSource=source; refresh()
            } catch(cancelled:CancellationException) { throw cancelled }
            catch(_:Exception) { session.technical("This song could not open. Your quiz is still here."); refresh() }
            finally { busy=false }
        }
    }
    BackHandler { if (showSettings) showSettings = false else if (showExampleSettings) showExampleSettings = false else back() }

    LaunchedEffect(loadFavoriteSongs) { loadFavoriteSongs?.let { session.setFavorites(it()) } }

    LaunchedEffect(defaultInstrument) {
        cancel(markInterrupted = true)
        session.setInstrument(defaultInstrument)
        refresh()
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionPending = false
        session.technical(if (granted) "Microphone ready. Tap Record."
            else "Microphone permission needed. Try again or choose another phase. Nothing graded.")
        refresh()
    }

    DisposableEffect(lifecycleOwner, audio, pitchSource) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) cancel(markInterrupted = true)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            generation += 1; activityJob?.cancel(); audio.dispose(); pitchSource.release()
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    fun listen() {
        val exercise = view.exercise ?: return
        if (busy) return
        busy = true
        val token = generation
        session.technical("Key reference → pause → exercise")
        refresh()
        activityJob = scope.launch {
            try {
                if (playExample != null) playExample(exercise)
                else audio.play(if(chunkIndex < 0) auralPromptEvents(exercise) else exercise.context + AuralEvent(emptyList(),60,60,"","silence",.75) + exercise.events.drop(chunkIndex*4).take(4), exercise.tempo, exercise.instrument,
                    exposureStartBeat = exercise.context.sumOf { it.beats } + 0.75) {
                    if (token == generation) session.listeningStarted()
                }
                if (token == generation) session.played()
            } catch (cancelled: CancellationException) {
                if (token == generation) session.interrupted()
                throw cancelled
            } catch (_: Exception) {
                if (token == generation) session.interrupted("Audio interrupted. Listen again. Nothing graded.")
            } finally {
                if (token == generation) { busy = false; refresh() }
            }
        }
    }

    fun record() {
        val exercise = view.exercise ?: return
        val task = exercise.microphoneTask ?: return
        if (busy || permissionPending) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionPending = true; permission.launch(Manifest.permission.RECORD_AUDIO); return
        }
        audio.cancel()
        busy = true; recording = true
        val token = generation
        session.technical("Hold one steady note · 4 seconds")
        refresh()
        activityJob = scope.launch {
            try {
                val target = task.targetMidis[microphoneIndex]
                val frames = captureAuralPitch(pitchSource, target, durationMs = 4000)
                if (token != generation) return@launch
                val result = assessAuralPitch(frames, listOf(target))
                when (result.status) {
                    AuralPitchStatus.UNCERTAIN -> session.technical("Unclear signal · nothing graded. Try again in a quiet room.")
                    else -> {
                        microphoneResults = microphoneResults + (result.status == AuralPitchStatus.CORRECT)
                        microphoneIndex += 1
                        if (microphoneIndex == task.targetMidis.size) session.grade(microphoneResults.all { it })
                        else session.technical("Note captured. Imagine the next root.")
                    }
                }
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (_: Exception) {
                if (token == generation) session.technical("Microphone unavailable · nothing graded. Try again or choose another phase.")
            } finally {
                if (token == generation) { busy = false; recording = false; refresh() }
            }
        }
    }

    val presentation = auralQuestionPresentation(view)
    val exercise = view.exercise
    val exerciseMode = remember(exercise?.id) { exercise?.harmonicMode() }
    val numeralColor = auralRomanColor(exerciseMode)
    val selected = AuralCurriculum.families.firstOrNull { it.id == selectedFamily } ?: AuralCurriculum.families.first()
    val namedPractice = exercise?.provenance?.target?.variantId != null
    val inLesson = route == "lesson" && exercise != null
    if (playbackSource != null) {
        AuralSourcePlayback(playbackSource!!, defaultInstrument, returnLabel=if(songsTab) "Return to songs" else "Return to quiz",onBack={ playbackSource=null; session.returnFromPlayback() })
    } else if (showExampleSettings) {
        AuralExampleSettingsPanel(exampleSettings, session.popularityAvailable || catalog?.popularity?.isNotEmpty()==true,
            onChange = { session.setExampleSettings(it); exampleSettings = it; refresh() }, onBack = { showExampleSettings = false },popularityDescription=catalog?.popularityDescription)
    } else if (showSettings && settingsContent != null) {
        Box(Modifier.fillMaxSize().padding(16.dp)) { settingsContent { showSettings = false } }
    } else {
    Column(Modifier.fillMaxSize().testTag("AuralQuiz")) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = ::back, modifier = Modifier.testTag("AuralBack")) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back")
            }
            Text("Aural Quiz", style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f).testTag("AuralQuizTitle"))
            IconButton(onClick = { showInfo = true }) { Icon(Icons.Outlined.Info, contentDescription = "Learning help and progress") }
            IconButton(onClick = { cancel(markInterrupted = true); showExampleSettings = true },
                modifier = Modifier.testTag("AuralExampleSettings")) { Icon(painterResource(R.drawable.ic_aural_preferences), contentDescription = "Example preferences") }
            if (settingsContent != null) IconButton(onClick = {
                cancel(markInterrupted = true); showSettings = true
            }, modifier = Modifier.testTag("AuralSettings")) { Icon(Icons.Default.Settings, contentDescription = "Open settings") }
        }
        if (inLesson && namedPractice) {
            Text(if(exercise?.provenance?.target?.pattern != null) "Song progression" else selected.label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 16.dp))
            Text(if(exercise!!.provenance.target.pattern != null && !view.guidanceVisible) "${exercise.events.size} chords" else exercise.fullDegrees.joinToString(" → "), style = MaterialTheme.typography.headlineSmall,
                color=if(exercise.provenance.target.pattern != null && !view.guidanceVisible) Color.Unspecified else numeralColor,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).testTag("AuralProgressionTitle"))
            AuralModeTabs(exercise.skillId,songsSelected=songsTab && exercise.provenance.target.pattern!=null,
                onSongs=if(exercise.provenance.target.pattern!=null) ({ cancel(markInterrupted=true); songsTab=true }) else null) { mode ->
                songsTab=false
                if(mode!=AuralPracticeModes.forSkill(exercise.skillId).id) practice(exercise.familyId, exercise.variantId, mode)
            }
        }
        if(inLesson && songsTab && exercise!!.provenance.target.pattern!=null) {
            catalogState.SaveableStateProvider("songs-${exercise.familyId}") {
                AuralPatternSongs(catalog,exercise.provenance.target.pattern!!,busy,::openSong,Modifier.weight(1f))
            }
            if(view.feedback.isNotBlank()) Text(view.feedback,Modifier.padding(horizontal=16.dp),style=MaterialTheme.typography.bodySmall)
        } else if(route == "families" && catalogEnabled && catalog == null && catalogError == null) {
            Column(Modifier.weight(1f).fillMaxWidth().testTag("AuralCatalogLoading"),
                horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
                CircularProgressIndicator()
                Text("Loading progressions…",Modifier.padding(16.dp),style=MaterialTheme.typography.bodyMedium)
                if(exercise!=null) TextButton(onClick={ route="lesson" },modifier=Modifier.testTag("AuralContinue")) { Text("Continue quiz") }
            }
        } else if(route == "families" && catalog != null) {
            catalogState.SaveableStateProvider("catalog") {
                AuralCatalogScreen(catalog!!,exampleSettings,session,{ patternPractice(it,"recognize") },::adaptive,
                    if(exercise != null) ({ route="lesson" }) else null,Modifier.weight(1f),onReview={ rows -> reviewPool=rows; session.reviewPattern(rows)?.let { patternPractice(it.first,it.second,true) } })
            }
        } else {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (view.storageWarning.isNotEmpty()) Text(view.storageWarning, color = MaterialTheme.colorScheme.error)
            when {
                route == "families" || route == "lesson" && exercise == null -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = ::adaptive, modifier = Modifier.weight(1f).testTag("AuralStart")) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(8.dp)); Text("Adaptive")
                        }
                        if (exercise != null) OutlinedButton(onClick = {
                            selectedFamily = exercise.familyId
                            route = "lesson"
                        }, modifier = Modifier.testTag("AuralContinue")) { Text("Continue") }
                    }
                    catalogError?.let { Text(it,style=MaterialTheme.typography.bodySmall) }
                    Text("Families", style = MaterialTheme.typography.headlineSmall)
                    AuralCurriculum.families.forEachIndexed { index, family ->
                        AuralFamilyCard(family, index, view.progress) { selectedFamily = family.id; route = "progressions" }
                    }
                }
                route == "progressions" -> {
                    Text(selected.label, style = MaterialTheme.typography.headlineSmall)
                    Text(selected.description, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    AuralFamilyProgress(selected.id, view.progress)
                    selected.variants.forEach { variant ->
                        AuralProgressionCard(variant) { practice(selected.id, variant.id, "recognize") }
                    }
                }
                exercise != null -> {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        if (!namedPractice) Text("Adaptive · ${presentation.title}", style = MaterialTheme.typography.titleMedium)
                        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer) {
                            Text(if (view.supported) "Practice" else if (exercise.transfer) "Transfer" else "Check",
                                Modifier.padding(horizontal = 12.dp, vertical = 6.dp).testTag("AuralEvidence"), style = MaterialTheme.typography.labelLarge)
                        }
                    }
                    exercise.provenance.corpus?.passage?.let { passage ->
                        Text(listOf(passage.title,passage.artist,passage.sectionName).filter { it.isNotBlank() }.joinToString(" · "),style=MaterialTheme.typography.bodySmall,modifier=Modifier.testTag("AuralSource"))
                        TextButton(enabled=!busy && catalog != null,onClick={
                            cancel()
                            activityJob=scope.launch {
                                try { val source=withContext(Dispatchers.IO) { catalog!!.playback(passage) }; session.exploringPlayback(answer); playbackSource=source; refresh() }
                                catch (_: Exception) { session.technical("Source section could not open. Your quiz is still here."); refresh() }
                            }
                        },modifier=Modifier.testTag("AuralOpenPlayback")) { Text("Open in Playback") }
                    }
                    Text(presentation.prompt, style = MaterialTheme.typography.titleMedium)
                    if (exercise.responseType == "microphone") {
                        if (namedPractice) Box {
                            OutlinedButton(onClick = { microphoneMenu = true }, enabled = !busy) { Text(if (practiceMicrophoneKind == "auto") "Auto · singing task" else auralMicrophoneKindLabel(practiceMicrophoneKind)) }
                            DropdownMenu(expanded = microphoneMenu, onDismissRequest = { microphoneMenu = false }) {
                                (listOf("auto") + AuralCurriculum.microphoneKinds).forEach { kind ->
                                    DropdownMenuItem(text = { Text(if (kind == "auto") "Auto" else auralMicrophoneKindLabel(kind)) }, onClick = {
                                        practiceMicrophoneKind = kind; microphoneMenu = false
                                        practice(exercise.familyId, exercise.variantId, "sing")
                                    })
                                }
                            }
                        }
                        Text("Any comfortable octave", style = MaterialTheme.typography.bodySmall)
                    }
                    val cueOnly = !view.guidanceVisible && presentation.guidance != null
                    val diagram = exercise.fullDegrees.mapIndexed { index, degree ->
                        degree.takeIf { view.guidanceVisible || cueOnly && index == 0 }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = if (presentation.guidance != null) Modifier.testTag("AuralGuidance") else Modifier) {
                        AuralChordStrip(diagram,mode=exerciseMode)
                        if (view.guidanceVisible) Text(
                            AuralCurriculum.families.firstOrNull { it.id == exercise.familyId }?.description ?: "Follow the harmonic movement.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        else if (cueOnly) Text("Starting chord", style = MaterialTheme.typography.labelSmall)
                    }
                    if (!view.answered) {
                        if(exercise.events.size > 4) Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick={ chunkIndex=if(chunkIndex<0) 0 else -1; if(chunkIndex>=0) session.assistedChunk(); refresh() },enabled=!busy) { Text(if(chunkIndex<0) "Practice in chunks" else "Whole sequence") }
                            if(chunkIndex>=0) TextButton(onClick={ chunkIndex=(chunkIndex+1)%((exercise.events.size+3)/4) },enabled=!busy) { Text("Chunk ${chunkIndex+1}/${(exercise.events.size+3)/4} ›") }
                        }
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            FilledIconButton(onClick = { if (busy) cancel(markInterrupted = true) else listen() }, shape = CircleShape,
                                modifier = Modifier.size(80.dp).testTag("AuralListen")) {
                                Icon(if (busy) Icons.Default.Close else if (view.heard) Icons.Default.Refresh else Icons.Default.PlayArrow,
                                    contentDescription = if (busy) "Stop" else if (view.heard) "Replay · practice" else "Listen", modifier = Modifier.size(36.dp))
                            }
                            Text(if (recording) "Recording…" else if (busy) "Listening…" else if (view.heard) "Replay" else "Listen", style = MaterialTheme.typography.labelLarge)
                            if (!view.guidanceVisible) TextButton(onClick = { session.hint(); refresh(); listen() }, enabled = !busy,
                                modifier = Modifier.testTag("AuralHint")) { Text("Guide") }
                        }
                    }
                    if (view.heard && !view.answered) {
                        when (exercise.responseType) {
                            "choice" -> exercise.options.forEach { option ->
                                val selectedAnswer = answer == listOf(option.id)
                                OutlinedButton(onClick = { answer = listOf(option.id) }, enabled = !busy,
                                    colors = ButtonDefaults.outlinedButtonColors(containerColor = if (selectedAnswer) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface),
                                    modifier = Modifier.fillMaxWidth().testTag("AuralChoice-${option.id}").semantics { this.selected = selectedAnswer }) {
                                    if (selectedAnswer) Text("● ")
                                    Text(option.label,color=numeralColor)
                                }
                            }
                            "sequence" -> {
                                AuralChordStrip(List(exercise.answer.degrees.size) { answer.getOrNull(it) },mode=exerciseMode)
                                Text(answer.joinToString(" → ").ifEmpty { "Your answer" }, Modifier.testTag("AuralEntered"), style = MaterialTheme.typography.labelSmall,
                                    color=if(answer.isEmpty()) Color.Unspecified else numeralColor)
                                (exercise.provenance.target.pattern?.let(::auralPatternVocabulary) ?: AuralCurriculum.degrees).chunked(4).forEach { row ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        row.forEach { degree ->
                                            OutlinedButton(onClick = { answer = answer + degree }, enabled = !busy && answer.size < exercise.answer.degrees.size,
                                                modifier = Modifier.weight(1f).testTag("AuralDegree-$degree"), contentPadding = PaddingValues(4.dp)) { Text(degree,color=numeralColor) }
                                        }
                                    }
                                }
                                TextButton(onClick = { answer = answer.dropLast(1) }, enabled = !busy && answer.isNotEmpty()) { Text("Undo") }
                            }
                            "microphone" -> {
                                val task = requireNotNull(exercise.microphoneTask)
                                if (task.targetMidis.size > 1) Text("Root ${microphoneIndex + 1} / ${task.targetMidis.size}")
                                Button(onClick = ::record, enabled = !busy && !permissionPending,
                                    modifier = Modifier.fillMaxWidth().testTag("AuralRecord")) { Text("Record") }
                                if (!namedPractice) TextButton(onClick = {
                                    cancel(); session.enableMicrophone(false); resetResponse(); refresh()
                                }, enabled = !busy) { Text("Skip microphone") }
                            }
                        }
                        if (exercise.responseType != "microphone") {
                            val responseReady = exercise.responseType == "guided" ||
                                (exercise.responseType == "choice" && answer.size == 1) ||
                                (exercise.responseType == "sequence" && answer.size == exercise.answer.degrees.size)
                            Button(onClick = {
                                session.submit(answer); refresh()
                                if (namedPractice && exercise.responseType == "guided") next()
                            }, enabled = !busy && responseReady,
                                modifier = Modifier.fillMaxWidth().testTag("AuralSubmit")) { Text(if (exercise.responseType == "guided") "Start practice" else "Check") }
                        }
                    }
                    if (view.feedback.isNotBlank()) Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceVariant) {
                        Text(view.feedback, Modifier.fillMaxWidth().padding(12.dp).testTag("AuralFeedback").semantics { liveRegion = LiveRegionMode.Polite })
                    }
                    if (view.answered) {
                        Button(onClick = ::next, modifier = Modifier.fillMaxWidth().testTag("AuralNext")) { Text("Next") }
                        TextButton(onClick = { cancel(); session.retry(); resetResponse(); refresh() }) { Text("Try again") }
                    }
                }
            }
        }
    }
    }
    }
    if (showInfo) AuralInfoDialog(view,
        familyId = if (inLesson && exercise?.provenance?.target?.pattern != null) exercise.familyId
            else if (route == "progressions" || inLesson && namedPractice) selectedFamily else null,
        onDismiss = { showInfo = false },
        onMicrophone = { enabled ->
            // Preference affects Adaptive only; explicit Sing practice remains reachable.
            if (!enabled && inLesson && !namedPractice && exercise?.responseType == "microphone") {
                cancel(); session.enableMicrophone(false); resetResponse(); refresh()
            } else { session.setMicrophonePreference(enabled); refresh() }
        })
}
