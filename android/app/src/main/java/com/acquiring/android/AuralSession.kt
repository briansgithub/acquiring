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
    val current: AuralExercise? = null
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
    private val seedFor: (Long) -> Long = { serial -> System.nanoTime() xor serial }
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

    init {
        try {
            val raw = persistence.read()
            if (raw != null) {
                val envelope = json.parseToJsonElement(raw).jsonObject
                // Earlier/default serializers omit default-valued version fields.
                require(envelope["version"] == null || envelope["version"]?.jsonPrimitive?.intOrNull == 1)
                val decoded = AuralSavedSession(
                    progress = envelope["progress"]?.let { json.decodeFromJsonElement<AuralProgress>(it) } ?: AuralProgress(),
                    serial = (envelope["serial"]?.jsonPrimitive?.longOrNull ?: 0L).coerceAtLeast(0L),
                    microphoneEnabled = envelope["microphoneEnabled"]?.jsonPrimitive?.booleanOrNull != false
                )
                // Validate the saved target via the generator. Never trust arbitrary saved notes.
                val current = try {
                    envelope["current"]?.takeUnless { it is JsonNull }?.let { element ->
                        val old = json.decodeFromJsonElement<AuralExercise>(element)
                        val regenerated = AuralCurriculum.generate(old.provenance.target, old.seed)
                        require(old.generatorVersion == regenerated.generatorVersion)
                        regenerated.copy(previouslyExposed = true, exposureRegistered = true)
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
        return AuralLessonView(ex, saved.progress, heard, answered, guidanceVisible,
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
        val target = AuralCurriculum.selectTarget(saved.progress, seed, clock(), saved.microphoneEnabled)
        start(target, seed, serial)
    }

    fun practice(familyId: String, skillId: String, microphoneKind: String? = null, variantId: String? = null) {
        val serial = if (saved.serial == Long.MAX_VALUE) 1 else saved.serial + 1
        val support = if (variantId == null) 2 else AuralCurriculum.cell(saved.progress, familyId, skillId).support
        start(AuralTarget(familyId, skillId, support = support, microphoneKind = microphoneKind, variantId = variantId), seedFor(serial), serial)
    }

    private fun start(target: AuralTarget, seed: Long, serial: Long) {
        val (progress, exercise) = AuralCurriculum.beginExercise(saved.progress, AuralCurriculum.generate(target, seed), clock())
        saved = saved.copy(serial = serial, progress = progress, current = exercise)
        assistance = emptyList(); plays = 0; attempts = 0; heard = false; answered = false
        guidanceVisible = exercise.support == 2
        feedback = ""
        save() // Exposure survives abandoning the question or restarting the application.
    }

    fun played() {
        if (saved.current == null || answered) return
        if (plays > 0) assistance = assistance + "replay"
        plays += 1; heard = true
        feedback = ""
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
        saved = saved.copy(progress = AuralCurriculum.record(saved.progress, exercise, correct,
            assistance = assistance, plays = plays, attempt = attempts, now = clock()))
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
