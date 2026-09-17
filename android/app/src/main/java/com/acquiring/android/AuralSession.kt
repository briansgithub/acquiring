package com.acquiring.android

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

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
    val playbackReturn: AuralPlaybackReturn? = null,
)
@Serializable internal data class AuralPlaybackReturn(val exerciseId: String,val draft: List<String>,val heard: Boolean,val answered: Boolean,
    val guidanceVisible: Boolean,val plays: Int,val attempts: Int,val assistance: List<String>,val feedback: String,val open: Boolean = true)

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
    val playbackReturn get() = saved.playbackReturn?.takeIf { it.exerciseId == saved.current?.id }
    fun rememberDraft(draft: List<String>) { playbackReturn?.let { saved=saved.copy(playbackReturn=it.copy(draft=draft)); save() } }
    fun returnFromPlayback() { playbackReturn?.let { saved=saved.copy(playbackReturn=it.copy(open=false)); save() } }
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
                    playbackReturn = readField<AuralPlaybackReturn?>("playbackReturn",null) { if(it is JsonNull) null else json.decodeFromJsonElement<AuralPlaybackReturn>(it) },
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
                    decoded.playbackReturn?.takeIf { it.exerciseId==current.id && it.plays in 0..1000 && it.attempts in 0..1000 }?.let {
                        assistance=it.assistance+"source-playback"; heard=it.heard; answered=it.answered; guidanceVisible=it.guidanceVisible
                        plays=it.plays; attempts=it.attempts; feedback=it.feedback
                    }
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
        playbackReturn?.let { saved=saved.copy(playbackReturn=it.copy(heard=heard,answered=answered,guidanceVisible=guidanceVisible,
            plays=plays,attempts=attempts,assistance=assistance,feedback=feedback)) }
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

    val recentSongs: List<String> get() = saved.sourceExposures.asReversed().map { it.songId }.distinct().take(10)
    val favorites: Set<String> get() = favoriteSongIds.toSet()
    suspend fun practicePattern(pattern: AuralPatternTarget, catalog: AuralCatalog, mode: String, microphoneKind: String? = null, assessment: Boolean = false) {
        val serial = saved.serial + 1; val seed = seedFor(serial)
        val skills = when(mode) { "recognize" -> listOf("guided","compare","identify"); "recall" -> listOf("recall","complete","audiate"); else -> listOf("reproduce") }
        val skill = skills.firstOrNull { AuralCurriculum.cell(progressFor(),pattern.id,it).practiceCorrect < 4 } ?: skills[(serial % skills.size).toInt()]
        val cell = AuralCurriculum.cell(progressFor(),pattern.id,skill)
        val target = AuralTarget(pattern.id,skill,cell.support,cell.support == 0,microphoneKind=microphoneKind,variantId=if(assessment) null else pattern.id,instrumentOverride=preferredInstrument,octaveShift=1,pattern=pattern)
        val base = AuralCurriculum.generate(target,seed)
        val settings = saved.exampleSettings.copy(distinguishInversions=pattern.view == "harmony_bass")
        val context = AuralSelectionContext(recentSongs,saved.sourceExposures.map { it.sourceId }.toSet(),favoriteSongIds,assessment=cell.support == 0,
            supportedOccurrenceId=saved.current?.takeIf { cell.support > 0 && it.familyId == pattern.id && it.skillId != skill }?.provenance?.corpus?.passage?.occurrenceId)
        val passage = withContext(Dispatchers.IO) { catalog.passage(pattern,settings,context,seed,pattern.id) }
        val source = AuralCorpusProvenance(catalog.snapshotId,catalog.popularityVersion,"structural-patterns-1",passage,settings,seed=seed and 0xffffffffL,semitoneShift=12,
            recentSongIds=recentSongs,favoriteSongIds=favoriteSongIds.sorted(),heardSourceIds=context.heardSourceIds.toList(),
            familiar=AuralExposureIndex(context.heardSourceIds).contains(passage.sourceId),assessment=context.assessment,playbackTempo=base.tempo,sourceHistoryReliable=saved.sourceHistoryReliable)
        val exercise = auralWithCorpus(base,source).let { it.copy(provenance=it.provenance.copy(exampleSettings=settings)) }
        saved = saved.copy(serial=serial,current=exercise)
        assistance = if(assessment) emptyList() else listOf("selected-pattern"); plays=0; attempts=0; heard=false; answered=false; guidanceVisible=exercise.support == 2; feedback=""
        save()
    }
    fun exploringPlayback(draft: List<String> = emptyList()) {
        val current=saved.current ?: return
        assistance = assistance + "source-playback"; listeningStarted()
        saved=saved.copy(playbackReturn=AuralPlaybackReturn(current.id,draft,heard,answered,guidanceVisible,plays,attempts,assistance,feedback)); save()
    }
    fun assistedChunk() { assistance = assistance + "chunked-listening"; save() }
    fun reviewPattern(rows: List<AuralCatalogRow>): Pair<AuralPatternTarget,String>? {
        val modes=listOf("recognize","recall","sing").filter { saved.microphoneEnabled || it!="sing" }
        val candidates=rows.flatMap { row -> modes.map { mode ->
            val skill=when(mode) { "recognize" -> "identify"; "recall" -> "recall"; else -> "reproduce" }
            Triple(row.target,mode,AuralCurriculum.cell(progressFor(),row.target.id,skill))
        } }
        val eligible=candidates.filter { (p,mode,_) -> mode=="recognize" || AuralCurriculum.cell(progressFor(),p.id,"identify").independentCorrect>=2 }
        val chosen=eligible.filter { it.third.independentAttempts>0 && it.third.dueAt<=clock() }.minByOrNull { it.third.dueAt }
            ?: eligible.firstOrNull { it.third.lastCorrect==false }
            ?: eligible.filter { !it.third.mastered }.let { if(it.isEmpty()) null else it[(saved.serial%it.size).toInt()] }
        return chosen?.let { it.first to it.second }
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
