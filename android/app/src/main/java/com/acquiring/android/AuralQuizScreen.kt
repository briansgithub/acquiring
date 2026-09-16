package com.acquiring.android

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Only this projection is rendered. Answer material never enters hidden UI or semantics. */
internal data class AuralQuestionPresentation(val title: String, val prompt: String, val guidance: String?)
internal fun auralMicrophoneKindLabel(kind: String): String = when (kind) {
    "bass" -> "Lowest voiced bass note"
    "scaleDegree" -> "Scale degree in the key"
    "rootSequence" -> "Chord roots in sequence"
    else -> "Chord root"
}
internal fun auralQuestionPresentation(view: AuralLessonView): AuralQuestionPresentation {
    val exercise = view.exercise ?: return AuralQuestionPresentation("Learn to hear where harmony goes",
        "Build a sense of home, departure, tension, and return. No song download is needed.", null)
    return AuralQuestionPresentation(
        AuralCurriculum.skills.first { it.id == exercise.skillId }.label,
        exercise.prompt,
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
    val result = exercise.context + rest + exercise.events
    val modeled = if (exercise.referenceRequired) result + rest + exercise.events.mapIndexed { index, event ->
        if (index == exercise.gapIndex) event.copy(notes = emptyList()) else event
    } else result
    return if (exercise.skillId in listOf("recall", "audiate", "reproduce")) modeled + rest else modeled
}

@Composable
internal fun AuralQuizScreen(
    onBack: () -> Unit,
    sessionOverride: AuralSession? = null,
    playExample: (suspend (AuralExercise) -> Unit)? = null
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val session = remember { sessionOverride ?: AuralSession(AuralPreferences(context)) }
    val audio = remember { AuralAudio(context.applicationContext) }
    val pitchSource = remember { MicrophonePitchTracker(context.applicationContext) }
    val scope = rememberCoroutineScope()
    var view by remember { mutableStateOf(session.view()) }
    var busy by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(false) }
    var permissionPending by remember { mutableStateOf(false) }
    var answer by remember { mutableStateOf(emptyList<String>()) }
    var microphoneIndex by remember { mutableStateOf(0) }
    var microphoneResults by remember { mutableStateOf(emptyList<Boolean>()) }
    var showProgress by remember { mutableStateOf(false) }
    var showPractice by remember { mutableStateOf(false) }
    var practiceFamily by remember { mutableStateOf(AuralCurriculum.families.first().id) }
    var practiceSkill by remember { mutableStateOf("guided") }
    var familyMenu by remember { mutableStateOf(false) }
    var skillMenu by remember { mutableStateOf(false) }
    var microphoneMenu by remember { mutableStateOf(false) }
    var practiceMicrophoneKind by remember { mutableStateOf("root") }
    var activityJob by remember { mutableStateOf<Job?>(null) }
    var generation by remember { mutableStateOf(0) }

    fun refresh() { view = session.view() }
    fun cancel(markInterrupted: Boolean = false) {
        generation += 1
        activityJob?.cancel(); activityJob = null
        audio.cancel(); pitchSource.stop()
        if (markInterrupted && busy) session.interrupted()
        busy = false; recording = false
        refresh()
    }
    fun resetResponse() { answer = emptyList(); microphoneIndex = 0; microphoneResults = emptyList() }
    fun next() { cancel(); session.next(); resetResponse(); showProgress = false; refresh() }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionPending = false
        session.technical(if (granted) "Microphone ready. Tap Record when you are ready to sing."
            else "Microphone permission was not granted. You can skip it and continue listening practice. No answer was graded.")
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
        session.technical("Listening… First the key reference, then a pause, then the exercise. Wait through the silence.")
        refresh()
        activityJob = scope.launch {
            try {
                if (playExample != null) playExample(exercise)
                else audio.play(auralPromptEvents(exercise), exercise.tempo, exercise.instrument)
                if (token == generation) session.played()
            } catch (cancelled: CancellationException) {
                if (token == generation) session.interrupted()
                throw cancelled
            } catch (_: Exception) {
                if (token == generation) session.interrupted("Audio was unavailable or interrupted. Check your output and listen again. No answer was graded.")
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
        session.technical("Recording for 4 seconds… Hold one steady note in a comfortable octave.")
        refresh()
        activityJob = scope.launch {
            try {
                val target = task.targetMidis[microphoneIndex]
                val frames = captureAuralPitch(pitchSource, target, durationMs = 4000)
                if (token != generation) return@launch
                val result = assessAuralPitch(frames, listOf(target))
                when (result.status) {
                    AuralPitchStatus.UNCERTAIN -> session.technical("The signal was unclear. Check the microphone and room, then try again. No musical error or mastery result was recorded.")
                    else -> {
                        microphoneResults = microphoneResults + (result.status == AuralPitchStatus.CORRECT)
                        microphoneIndex += 1
                        if (microphoneIndex == task.targetMidis.size) session.grade(microphoneResults.all { it })
                        else session.technical("Note captured. Internally hear the next root, then record it.")
                    }
                }
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (_: Exception) {
                if (token == generation) session.technical("Microphone unavailable. Check permission and try again, or skip it for now. No answer was graded.")
            } finally {
                if (token == generation) { busy = false; recording = false; refresh() }
            }
        }
    }

    val presentation = auralQuestionPresentation(view)
    val exercise = view.exercise
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).testTag("AuralQuiz"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = { cancel(); onBack() }) { Text("Back to library") }
        Text("Aural Quiz", style = MaterialTheme.typography.titleLarge, modifier = Modifier.testTag("AuralQuizTitle"))
        Text("Hear → recognize → recall → internally hear → reproduce", style = MaterialTheme.typography.labelLarge)
        Text(presentation.title, style = MaterialTheme.typography.headlineSmall)
        Text(presentation.prompt)
        if (view.storageWarning.isNotEmpty()) Text(view.storageWarning, color = MaterialTheme.colorScheme.error)
        if (exercise == null) {
            Text("Each skill grows separately. Hints and replays are welcome; fresh responses without help establish independent mastery.")
            Button(onClick = ::next, modifier = Modifier.testTag("AuralStart")) { Text("Start learning") }
        } else {
            Text(if (view.supported) "Supported practice" else if (exercise.transfer) "Transfer check · unfamiliar realization" else "Independent check · without help",
                style = MaterialTheme.typography.labelLarge, modifier = Modifier.testTag("AuralEvidence"))
            presentation.guidance?.let { guidance ->
                Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium) {
                    Text(guidance, Modifier.padding(12.dp).testTag("AuralGuidance"))
                }
            }
            if (!view.answered) {
                Button(onClick = ::listen, enabled = !busy, modifier = Modifier.testTag("AuralListen")) {
                    Text(if (view.heard) "Listen again · practice" else "Listen")
                }
                TextButton(onClick = { session.hint(); refresh() }, enabled = !busy) { Text("Show guidance · practice") }
            }
            if (view.heard && !view.answered) {
                when (exercise.responseType) {
                    "choice" -> exercise.options.forEach { option ->
                        OutlinedButton(onClick = { answer = listOf(option.id) }, enabled = !busy,
                            modifier = Modifier.fillMaxWidth().testTag("AuralChoice-${option.id}")) {
                            Text((if (answer == listOf(option.id)) "Selected: " else "") + option.label)
                        }
                    }
                    "sequence" -> {
                        Text(if (exercise.skillId == "recall") "Rebuild ${exercise.answer.degrees.size} chords in order from memory." else "Internally hear the missing chord from the model, then enter it.")
                        Text(answer.joinToString(" → ").ifEmpty { "Your answer" }, Modifier.testTag("AuralEntered"))
                        AuralCurriculum.degrees.chunked(4).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                row.forEach { degree ->
                                    OutlinedButton(onClick = { answer = answer + degree }, enabled = !busy && answer.size < exercise.answer.degrees.size,
                                        modifier = Modifier.weight(1f), contentPadding = PaddingValues(4.dp)) { Text(degree) }
                                }
                            }
                        }
                        TextButton(onClick = { answer = answer.dropLast(1) }, enabled = !busy && answer.isNotEmpty()) { Text("Undo last chord") }
                    }
                    "microphone" -> {
                        val task = requireNotNull(exercise.microphoneTask)
                        Text(task.label)
                        Text("Count chords in the exercise after the reference and pause. Sing in a comfortable octave; no pitch guide is shown.")
                        if (task.targetMidis.size > 1) Text("Root ${microphoneIndex + 1} of ${task.targetMidis.size}, in progression order")
                        Button(onClick = ::record, enabled = !busy && !permissionPending, modifier = Modifier.testTag("AuralRecord")) { Text("Record pitch") }
                        if (recording) TextButton(onClick = {
                            cancel(); session.technical("Recording cancelled. No answer was graded."); refresh()
                        }) { Text("Cancel recording") }
                        TextButton(onClick = { cancel(); session.enableMicrophone(false); resetResponse(); refresh() }, enabled = !busy) { Text("Skip microphone for now") }
                    }
                }
                if (exercise.responseType != "microphone") {
                    val responseReady = exercise.responseType == "guided" ||
                        (exercise.responseType == "choice" && answer.size == 1) ||
                        (exercise.responseType == "sequence" && answer.size == exercise.answer.degrees.size)
                    Button(onClick = { session.submit(answer); refresh() }, enabled = !busy && responseReady,
                        modifier = Modifier.testTag("AuralSubmit")) { Text(if (exercise.responseType == "guided") "I followed the harmonic motion" else "Check answer") }
                }
            }
            Text(view.feedback, Modifier.testTag("AuralFeedback").semantics { liveRegion = LiveRegionMode.Polite })
            if (view.answered) {
                Button(onClick = ::next, modifier = Modifier.testTag("AuralNext")) { Text("Next exercise") }
                TextButton(onClick = { cancel(); session.retry(); resetResponse(); refresh() }) { Text("Try this example with support") }
            }
        }
        Row {
            Switch(checked = view.microphoneEnabled, onCheckedChange = { enabled ->
                cancel(); session.enableMicrophone(enabled); resetResponse(); refresh()
            }, enabled = !busy)
            Text("Include microphone exercises when ready", Modifier.padding(8.dp))
        }
        Text("Microphone audio stays on this device. Skipping it leaves reproduction unassessed. Progress is stored separately from the song catalog.", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { showPractice = !showPractice }, enabled = !busy) { Text(if (showPractice) "Close practice chooser" else "Explore with support") }
        if (showPractice) {
            Text("Try any family or skill with guidance. These examples count as supported practice. Next exercise returns to your adaptive path.")
            Box {
                OutlinedButton(onClick = { familyMenu = true }, enabled = !busy) { Text(AuralCurriculum.families.first { it.id == practiceFamily }.label) }
                DropdownMenu(expanded = familyMenu, onDismissRequest = { familyMenu = false }) {
                    AuralCurriculum.families.forEach { family ->
                        DropdownMenuItem(text = { Text(family.label) }, onClick = { practiceFamily = family.id; familyMenu = false })
                    }
                }
            }
            Box {
                OutlinedButton(onClick = { skillMenu = true }, enabled = !busy) { Text(AuralCurriculum.skills.first { it.id == practiceSkill }.label) }
                DropdownMenu(expanded = skillMenu, onDismissRequest = { skillMenu = false }) {
                    AuralCurriculum.skills.forEach { skill ->
                        DropdownMenuItem(text = { Text(skill.label) }, onClick = { practiceSkill = skill.id; skillMenu = false })
                    }
                }
            }
            if (practiceSkill == "reproduce") Box {
                OutlinedButton(onClick = { microphoneMenu = true }, enabled = !busy) { Text(auralMicrophoneKindLabel(practiceMicrophoneKind)) }
                DropdownMenu(expanded = microphoneMenu, onDismissRequest = { microphoneMenu = false }) {
                    AuralCurriculum.microphoneKinds.forEach { kind ->
                        DropdownMenuItem(text = { Text(auralMicrophoneKindLabel(kind)) }, onClick = { practiceMicrophoneKind = kind; microphoneMenu = false })
                    }
                }
            }
            Button(onClick = {
                cancel(); session.practice(practiceFamily, practiceSkill, practiceMicrophoneKind.takeIf { practiceSkill == "reproduce" }); resetResponse(); showPractice = false; refresh()
            }, enabled = !busy, modifier = Modifier.testTag("AuralExploreStart")) { Text("Practice with guidance") }
        }
        TextButton(onClick = { showProgress = !showProgress }) { Text(if (showProgress) "Close learning map" else "Your learning map") }
        if (showProgress) {
            Text("Readiness requires fresh independent successes in several keys, including transfer. Internal hearing is assessed indirectly through recall and missing-harmony responses.")
            AuralCurriculum.families.forEach { family ->
                Text(family.label, style = MaterialTheme.typography.titleMedium)
                AuralCurriculum.skills.forEach { skill ->
                    val cell = AuralCurriculum.cell(view.progress, family.id, skill.id)
                    Text("${skill.label}: ${if (cell.mastered) "ready · " else ""}${cell.independentCorrect}/${cell.independentAttempts} independent; ${cell.practice} supported; ${cell.transferCorrect} transfer", style = MaterialTheme.typography.bodySmall)
                    if (skill.id == "reproduce" && cell.practice + cell.independentAttempts > 0) {
                        AuralCurriculum.microphoneKinds.forEach { kind ->
                            Text("${auralMicrophoneKindLabel(kind)}: ${cell.microphonePractice[kind] ?: 0} supported successes; ${cell.microphoneIndependent[kind] ?: 0} independent successes", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
