package com.acquiring.android

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

@Serializable
internal data class AuralSavedSession(
    val version: Int = 1,
    val progress: AuralProgress = AuralProgress(),
    val serial: Long = 0,
    val microphoneEnabled: Boolean = true,
    val current: AuralExercise? = null,
    val exampleSettings: AuralExampleSettings = AuralExampleSettings(),
    val inversionProgress: AuralProgress = AuralProgress(),
    val sourceExposures: List<AuralSourceExposure> = emptyList(),
    val sourceHistoryReliable: Boolean = true,
)

internal interface AuralPersistence {
    fun read(): String?
    fun write(value: String): Boolean
}

internal class AuralPreferences(context: Context) : AuralPersistence {
    private val preferences = context.applicationContext.getSharedPreferences("aural_curriculum_v1", Context.MODE_PRIVATE)
    override fun read(): String? = preferences.getString("session", null)
    override fun write(value: String): Boolean = preferences.edit().putString("session", value).commit()
}

internal data class AuralLessonView(
    val exercise: AuralExercise?,
    val progress: AuralProgress,
    val heard: Boolean,
    val answered: Boolean,
    val guidanceVisible: Boolean,
    val supported: Boolean,
    val microphoneEnabled: Boolean,
    val feedback: String,
    val storageWarning: String
)

/** One place owns evidence eligibility; UI rendering and audio callbacks cannot grade twice. */
internal class AuralSession(
    private val persistence: AuralPersistence,
    private val clock: () -> Long = System::currentTimeMillis,
    private val seedFor: (Long) -> Long = { serial -> System.nanoTime() xor serial },
    private val exampleProvider: AuralExampleProvider? = null,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private var saved = AuralSavedSession()
    private var assistance = emptyList<String>()
    private var plays = 0
    private var attempts = 0
    private var heard = false
    private var answered = false
    private var guidanceVisible = false
    private var feedback = ""
    private var storageWarning = ""
    private var preferredInstrument: String? = null
    private var favoriteSongIds = emptySet<String>()
    val exampleSettings get() = saved.exampleSettings
    val popularityAvailable get() = exampleProvider?.popularityAvailable == true
    fun setFavorites(ids: Set<String>) { favoriteSongIds = ids }
    fun setExampleSettings(settings: AuralExampleSettings) { saved = saved.copy(exampleSettings = settings); save() }
    private fun progressFor(settings: AuralExampleSettings = saved.exampleSettings) = if (settings.distinguishInversions) saved.inversionProgress else saved.progress
    private fun withProgress(progress: AuralProgress, settings: AuralExampleSettings = saved.exampleSettings) =
        if (settings.distinguishInversions) saved.copy(inversionProgress = progress) else saved.copy(progress = progress)

    init {
        try {
            val raw = persistence.read()
            if (raw != null) {
                val envelope = json.parseToJsonElement(raw).jsonObject
                // Earlier/default serializers omit default-valued version fields.
                require(envelope["version"] == null || envelope["version"]?.jsonPrimitive?.intOrNull == 1)
                var recoveredMetadata = false
                var damagedExposure = false
                fun <T> readField(name: String, default: T, onFailure: () -> Unit = {}, decode: (JsonElement) -> T): T {
                    val element = envelope[name] ?: return default
                    return try { decode(element) } catch (_: Exception) {
                        recoveredMetadata = true; onFailure(); default
                    }
                }
                val reliableHistory = readField("sourceHistoryReliable", true, { damagedExposure = true }) {
                    requireNotNull(it.jsonPrimitive.booleanOrNull)
                }
                val exposures = readField("sourceExposures", emptyList<AuralSourceExposure>(), { damagedExposure = true }) { element ->
                    element.jsonArray.mapNotNull { item ->
                        try {
                            json.decodeFromJsonElement<AuralSourceExposure>(item).also {
                                require(it.at >= 0 && it.sourceId.length in 1..1000 && it.songId.isNotBlank())
                            }
                        } catch (_: Exception) { recoveredMetadata = true; damagedExposure = true; null }
                    }.asReversed().distinctBy { it.sourceId }.asReversed()
                }
                val decoded = AuralSavedSession(
                    progress = readField("progress", AuralProgress()) { json.decodeFromJsonElement<AuralProgress>(it) },
                    serial = readField("serial", 0L) { requireNotNull(it.jsonPrimitive.longOrNull).coerceAtLeast(0L) },
                    microphoneEnabled = readField("microphoneEnabled", true) { requireNotNull(it.jsonPrimitive.booleanOrNull) },
                    exampleSettings = readField("exampleSettings", AuralExampleSettings()) { json.decodeFromJsonElement<AuralExampleSettings>(it) },
                    inversionProgress = readField("inversionProgress", AuralProgress()) { AuralCurriculum.normalize(json.decodeFromJsonElement<AuralProgress>(it)) },
                    sourceExposures = exposures,
                    sourceHistoryReliable = reliableHistory && !damagedExposure,
                )
                if (recoveredMetadata) storageWarning = "Some saved settings or history could not be read. Valid learning progress has been kept."
                if (!decoded.sourceHistoryReliable) storageWarning = "Some listening history could not be restored. Your progress has been kept; song examples count as supported practice."
                // Validate the saved target via the generator. Never trust arbitrary saved notes.
                val current = try {
                    envelope["current"]?.takeUnless { it is JsonNull }?.let { element ->
                        val old = json.decodeFromJsonElement<AuralExercise>(element)
                        val base = AuralCurriculum.generate(old.provenance.target, old.seed)
                        val regenerated = old.provenance.corpus?.let { auralWithCorpus(base, it) } ?: base
                        require(old.generatorVersion == regenerated.generatorVersion)
                        regenerated.copy(previouslyExposed = true, exposureRegistered = true,
                            provenance = regenerated.provenance.copy(exampleSettings = old.provenance.corpus?.settings ?: old.provenance.exampleSettings,
                                fallbackReason = old.provenance.fallbackReason))
                    }
                } catch (_: Exception) {
                    storageWarning = "The unfinished example could not be restored. Your learning progress has been kept."
                    null
                }
                saved = decoded.copy(progress = AuralCurriculum.normalize(decoded.progress), current = current)
                if (current != null) {
                    assistance = listOf("resumed-example")
                    guidanceVisible = current.support == 2
                    feedback = "Resumed example. Listen again; this counts as supported practice."
                }
            }
        } catch (_: Exception) {
            saved = AuralSavedSession()
            storageWarning = "Saved progress could not be read. Starting fresh for this session."
        }
    }

    fun view(): AuralLessonView {
        val ex = saved.current
        return AuralLessonView(ex, progressFor(ex?.provenance?.exampleSettings ?: saved.exampleSettings), heard, answered, guidanceVisible,
            ex == null || ex.support > 0 || ex.provenance.target.variantId != null || ex.previouslyExposed || assistance.isNotEmpty() || plays > 1 || attempts > 1,
            saved.microphoneEnabled, feedback, storageWarning)
    }

    private fun save() {
        try {
            check(persistence.write(json.encodeToString(saved)))
        } catch (_: Exception) {
            storageWarning = "Progress could not be saved. You can continue for this visit."
        }
    }

    fun next() {
        val serial = if (saved.serial == Long.MAX_VALUE) 1 else saved.serial + 1
        val seed = seedFor(serial)
        val target = AuralCurriculum.selectTarget(progressFor(), seed, clock(), saved.microphoneEnabled)
        start(target, seed, serial)
    }

    fun practice(familyId: String, skillId: String, microphoneKind: String? = null, variantId: String? = null) {
        val serial = if (saved.serial == Long.MAX_VALUE) 1 else saved.serial + 1
        val support = if (variantId == null) 2 else AuralCurriculum.cell(progressFor(), familyId, skillId).support
        start(AuralTarget(familyId, skillId, support = support, microphoneKind = microphoneKind, variantId = variantId), seedFor(serial), serial)
    }

    fun practiceMode(familyId: String, variantId: String, modeId: String, microphoneKind: String? = null) {
        val skill = AuralPracticeModes.selectSkill(progressFor(), familyId, variantId, modeId)
        val kind = if (skill == "reproduce") microphoneKind ?: AuralPracticeModes.selectMicrophoneKind(progressFor(), familyId) else null
        practice(familyId, skill, kind, variantId)
    }

    private fun start(target: AuralTarget, seed: Long, serial: Long) {
        val settings = saved.exampleSettings.copy(popularity = saved.exampleSettings.popularity && popularityAvailable)
        val base = AuralCurriculum.generate(target.copy(instrumentOverride = preferredInstrument, octaveShift = 1), seed)
        val prior = saved.current
        val source = try { exampleProvider?.example(base, settings, AuralSelectionContext(
            recentSongIds = saved.sourceExposures.asReversed().map { it.songId }.distinct().take(10),
            heardSourceIds = saved.sourceExposures.map { it.sourceId }.toSet(), favoriteSongIds = favoriteSongIds,
            assessment = target.support == 0 && target.variantId == null,
            supportedOccurrenceId = prior?.provenance?.corpus?.takeIf { target.support > 0 && prior.familyId == target.familyId && prior.variantId == base.variantId && prior.skillId != target.skillId }?.passage?.occurrenceId,
        )) } catch (_: Exception) { null }
        val generated = try { source?.let { auralWithCorpus(base, it.copy(sourceHistoryReliable = saved.sourceHistoryReliable)) } } catch (_: Exception) { null }
        val selected = (generated ?: base).let { it.copy(provenance = it.provenance.copy(exampleSettings = settings,
            fallbackReason = if (generated == null) "No eligible corpus passage; generated example for the same target." else null)) }
        val (progress, exercise) = if (generated == null) AuralCurriculum.beginExercise(progressFor(), selected, clock())
            else progressFor() to selected.copy(exposureRegistered = true)
        saved = withProgress(progress).copy(serial = serial, current = exercise)
        assistance = emptyList(); plays = 0; attempts = 0; heard = false; answered = false
        guidanceVisible = exercise.support == 2
        feedback = ""
        save() // Exposure survives abandoning the question or restarting the application.
    }

    /** Keep the musical question, but persist the sound actually requested in Settings. */
    fun setInstrument(instrument: AudioEngine.Waveform) {
        preferredInstrument = instrument.name
        val old = saved.current ?: return
        if (answered || old.instrument == instrument.name && old.provenance.target.octaveShift == 1) return
        val base = AuralCurriculum.generate(old.provenance.target.copy(instrumentOverride = instrument.name, octaveShift = 1), old.seed)
        val replacement = old.provenance.corpus?.let { auralWithCorpus(base, it.copy(semitoneShift = 12)) } ?: base
        val settings = old.provenance.exampleSettings ?: saved.exampleSettings
        val (progress, updated) = if (old.provenance.corpus == null) AuralCurriculum.beginExercise(progressFor(settings), replacement, clock())
            else progressFor(settings) to replacement.copy(previouslyExposed = old.previouslyExposed, exposureRegistered = true)
        val exercise = updated.copy(provenance = updated.provenance.copy(exampleSettings = old.provenance.exampleSettings, fallbackReason = old.provenance.fallbackReason))
        if (heard || plays > 0) assistance = assistance + "instrument-change"
        saved = withProgress(progress, settings).copy(current = exercise)
        heard = false
        feedback = ""
        save()
    }

    fun played() {
        if (saved.current == null || answered) return
        listeningStarted()
        if (plays > 0) assistance = assistance + "replay"
        plays += 1; heard = true
        feedback = ""
    }

    /** Record actual exposure as sound starts, including playback interrupted before completion. */
    fun listeningStarted() {
        val passage = saved.current?.provenance?.corpus?.passage ?: return
        saved = saved.copy(sourceExposures = saved.sourceExposures.filter { it.sourceId != passage.sourceId } + AuralSourceExposure(passage.sourceId, passage.songId, clock()))
        save()
    }

    fun hint() {
        if (saved.current == null || answered) return
        assistance = assistance + "guidance"
        guidanceVisible = true
    }

    fun interrupted(message: String = "Playback or recording stopped. Listen again; this counts as supported practice.") {
        if (saved.current == null || answered) return
        assistance = assistance + "interruption"
        heard = false
        feedback = message
    }

    fun technical(message: String) { feedback = message }

    fun submit(response: List<String>) {
        val exercise = saved.current ?: return
        if (!heard || answered) return
        grade(exercise.responseType == "guided" || AuralCurriculum.evaluate(exercise, response))
    }

    fun grade(correct: Boolean) {
        val exercise = saved.current ?: return
        if (!heard || answered) return
        attempts += 1
        val independent = !view().supported && exercise.responseType != "guided"
        val settings = exercise.provenance.exampleSettings ?: saved.exampleSettings
        saved = withProgress(AuralCurriculum.record(progressFor(settings), exercise, correct,
            assistance = assistance, plays = plays, attempt = attempts, now = clock()), settings)
        answered = true; guidanceVisible = true
        feedback = when {
            exercise.responseType == "guided" -> "Listening complete."
            correct -> "Correct."
            else -> "Not quite. Hear the model again."
        } + if (independent) " Check saved." else " Practice saved."
        save()
    }

    fun retry() {
        if (!answered) return
        assistance = assistance + "assisted-retry"
        answered = false; heard = false
        feedback = "Listen again and try with support."
    }

    fun enableMicrophone(enabled: Boolean) {
        setMicrophonePreference(enabled)
        if (!enabled && saved.current?.responseType == "microphone") next()
    }

    fun setMicrophonePreference(enabled: Boolean) {
        saved = saved.copy(microphoneEnabled = enabled)
        save()
    }
}
