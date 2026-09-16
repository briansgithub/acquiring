package com.acquiring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.pow
import kotlin.random.Random

@Serializable data class AuralVariant(val id: String, val degrees: List<String>)
@Serializable data class AuralFamily(val id: String, val label: String, val description: String, val prerequisites: List<String>, val variants: List<AuralVariant>)
@Serializable data class AuralSkill(val id: String, val label: String, val description: String)
@Serializable data class AuralEvent(val notes: List<Int>, val rootMidi: Int, val bassMidi: Int, val degree: String, val functionLabel: String, val beats: Double = 2.0)
@Serializable data class AuralOption(val id: String, val label: String, val degrees: List<String>)
@Serializable data class AuralAnswer(val degrees: List<String>, val optionId: String? = null, val targetMidis: List<Int> = emptyList())
@Serializable data class AuralMicrophoneTask(val kind: String, val label: String, val eventIndices: List<Int>, val targetMidis: List<Int>, val scaleDegree: Int? = null)
@Serializable data class AuralTarget(val familyId: String, val skillId: String, val support: Int = 2, val transfer: Boolean = false, val reason: String = "", val microphoneKind: String? = null, val variantId: String? = null)
@Serializable data class AuralProvenance(val generatorVersion: String, val seed: Long, val target: AuralTarget, val variantId: String, val keyTonic: String, val tempo: Int, val instrument: String, val inversions: List<Int>, val register: Int, val spreads: List<Boolean>, val contextDegrees: List<String>)
@Serializable data class AuralExercise(
    val id: String, val familyId: String, val variantId: String, val skillId: String,
    val support: Int, val transfer: Boolean, val seed: Long, val generatorVersion: String,
    val keyTonic: String, val tempo: Int, val instrument: String, val events: List<AuralEvent>,
    val context: List<AuralEvent>, val fullDegrees: List<String>, val gapIndex: Int?,
    val options: List<AuralOption>, val answer: AuralAnswer, val responseType: String,
    val microphoneTask: AuralMicrophoneTask?, val fingerprint: String, val prompt: String,
    val referenceRequired: Boolean, val guidance: String, val provenance: AuralProvenance,
    val previouslyExposed: Boolean = false, val exposureRegistered: Boolean = false,
)
@Serializable data class AuralCell(
    val practice: Int = 0, val practiceCorrect: Int = 0, val independentAttempts: Int = 0,
    val independentCorrect: Int = 0, val transferCorrect: Int = 0, val keys: List<String> = emptyList(),
    val mastered: Boolean = false, val support: Int = 2, val lastAt: Long = 0, val dueAt: Long = 0,
    val lastCorrect: Boolean? = null, val streak: Int = 0, val recentIndependent: List<Boolean> = emptyList(),
    val microphonePractice: Map<String, Int> = emptyMap(), val microphoneIndependent: Map<String, Int> = emptyMap(),
)
@Serializable data class AuralExposure(val fingerprint: String, val id: String, val at: Long)
@Serializable data class AuralAttemptRecord(
    val id: String, val familyId: String, val skillId: String, val correct: Boolean,
    val independent: Boolean, val technicalUncertainty: Boolean, val at: Long, val seed: Long,
    val generatorVersion: String, val fingerprint: String, val key: String, val variantId: String,
    val support: Int, val transfer: Boolean, val assistance: List<String>, val plays: Int, val attempt: Int,
    val microphoneKind: String? = null,
    val requestedVariantId: String? = null,
)
@Serializable data class AuralProgress(
    val version: Int = 1, val cells: Map<String, AuralCell> = emptyMap(), val attempts: Int = 0,
    val recent: List<AuralAttemptRecord> = emptyList(), val exposures: List<AuralExposure> = emptyList(),
)

/** Pure curriculum and evidence engine. Song/example selection is a separate future adapter. */
object AuralCurriculum {
    const val GENERATOR_VERSION = "android-aural-1"
    private const val DAY = 86_400_000L
    private const val MAX_RECENT = 120
    private const val MAX_EXPOSURES = 512
    private const val RECENT_WINDOW = 8
    val microphoneKinds = listOf("root", "bass", "scaleDegree", "rootSequence")
    val degrees = listOf("I", "ii", "iii", "IV", "V", "vi", "vii°", "V/V")
    private val keys = listOf("C", "G", "F", "D", "Bb", "A", "Eb", "E", "Ab", "B", "Db", "Gb")
    private fun variant(id: String, vararg degrees: String) = AuralVariant(id, degrees.toList())
    val families = listOf(
        AuralFamily("dominant-return", "Dominant return", "Hear dominant tension return to tonic.", emptyList(), listOf(variant("direct", "V", "I"), variant("departure", "I", "V", "I"))),
        AuralFamily("plagal-return", "Plagal return", "Compare a gentler subdominant return with the dominant return.", listOf("dominant-return"), listOf(variant("direct", "IV", "I"), variant("departure", "I", "IV", "I"))),
        AuralFamily("predominant-cadence", "Preparing the dominant", "Add a predominant before the familiar dominant–tonic fragment.", listOf("dominant-return", "plagal-return"), listOf(variant("supertonic", "ii", "V", "I"), variant("subdominant", "IV", "V", "I"), variant("departure", "I", "ii", "V", "I"))),
        AuralFamily("deceptive-return", "Deceptive return", "Hear dominant arrive at relative minor instead of tonic.", listOf("dominant-return"), listOf(variant("direct", "V", "vi"), variant("prepared", "ii", "V", "vi"), variant("departure", "I", "V", "vi"))),
        AuralFamily("relative-motion", "Relative motion", "Connect tonic and relative minor, then return through familiar functions.", listOf("plagal-return", "deceptive-return"), listOf(variant("direct", "I", "vi"), variant("return", "I", "vi", "IV", "I"), variant("cadence", "vi", "ii", "V", "I"))),
        AuralFamily("secondary-dominant", "A dominant of the dominant", "Hear an altered chord intensify the approach to dominant.", listOf("predominant-cadence", "relative-motion"), listOf(variant("direct", "V/V", "V", "I"), variant("departure", "I", "V/V", "V", "I"))),
    )
    val skills = listOf(
        AuralSkill("guided", "Hear with guidance", "Follow sound and function, then listen with less help."),
        AuralSkill("compare", "Distinguish", "Choose between similar harmonic relationships."),
        AuralSkill("identify", "Identify", "Identify the relationship without example previews."),
        AuralSkill("recall", "Recall", "Rebuild the progression after listening."),
        AuralSkill("complete", "Complete", "Recall a modeled progression and restore a missing chord."),
        AuralSkill("audiate", "Internally hear", "Carry the modeled progression through a silent ending."),
        AuralSkill("reproduce", "Reproduce", "Sing a specified root, bass, scale degree, or root sequence."),
    )
    private val familyIds get() = families.map { it.id }
    private val skillIds get() = skills.map { it.id }
    private fun accuracy(cell: AuralCell): Double = if (cell.recentIndependent.isEmpty()) 0.0 else cell.recentIndependent.count { it }.toDouble() / cell.recentIndependent.size
    private fun support(cell: AuralCell) = if (cell.practiceCorrect < 2) 2 else if (cell.practiceCorrect < 4) 1 else 0
    private fun mastery(cell: AuralCell, skillId: String) = cell.independentCorrect >= 6 && cell.recentIndependent.size >= 6 && accuracy(cell) >= .8 && cell.keys.size >= 3 && cell.transferCorrect >= 2 && (skillId != "reproduce" || microphoneKinds.all { (cell.microphoneIndependent[it] ?: 0) > 0 })
    private fun cleanCell(c: AuralCell, skillId: String): AuralCell {
        val attempts = c.independentAttempts.coerceIn(0, 1_000_000)
        val correct = c.independentCorrect.coerceIn(0, attempts)
        val practice = c.practice.coerceIn(0, 1_000_000)
        val cleaned = c.copy(practice = practice, practiceCorrect = c.practiceCorrect.coerceIn(0, practice), independentAttempts = attempts, independentCorrect = correct,
            transferCorrect = c.transferCorrect.coerceIn(0, correct), keys = c.keys.filter { it in keys }.distinct().take(correct.coerceAtMost(keys.size)),
            lastAt = c.lastAt.coerceAtLeast(0), dueAt = c.dueAt.coerceAtLeast(0), streak = c.streak.coerceIn(0, correct), recentIndependent = c.recentIndependent.takeLast(attempts.coerceAtMost(RECENT_WINDOW)),
            microphonePractice = c.microphonePractice.filterKeys { it in microphoneKinds }.mapValues { it.value.coerceIn(0, practice) },
            microphoneIndependent = c.microphoneIndependent.filterKeys { it in microphoneKinds }.mapValues { it.value.coerceIn(0, correct) })
        return cleaned.copy(mastered = mastery(cleaned, skillId), support = support(cleaned))
    }
    fun normalize(progress: AuralProgress): AuralProgress {
        if (progress.version != 1) return AuralProgress()
        val allowed = families.flatMap { f -> skills.map { "${f.id}:${it.id}" } }.toSet()
        return progress.copy(cells = progress.cells.filterKeys { it in allowed }.mapValues { cleanCell(it.value, it.key.substringAfter(':')) }, attempts = progress.attempts.coerceIn(0, 1_000_000),
            exposures = progress.exposures.filter { it.fingerprint.length in 1..200 && it.id.length in 1..200 && it.at >= 0 }.takeLast(MAX_EXPOSURES),
            recent = progress.recent.filter { it.familyId in familyIds && it.skillId in skillIds && it.key in keys && it.id.length in 1..200 && it.support in 0..2 && (it.microphoneKind == null || it.microphoneKind in microphoneKinds) }.takeLast(MAX_RECENT).map { it.copy(at = it.at.coerceAtLeast(0), generatorVersion = it.generatorVersion.take(40), fingerprint = it.fingerprint.take(200), variantId = it.variantId.take(50), assistance = it.assistance.take(20).map { a -> a.take(80) }, plays = it.plays.coerceIn(0, 1000), attempt = it.attempt.coerceIn(0, 1000)) })
    }
    fun cell(progress: AuralProgress, familyId: String, skillId: String) = cleanCell(progress.cells["$familyId:$skillId"] ?: AuralCell(), skillId)
    private fun evidenced(progress: AuralProgress, familyId: String, skillId: String): Boolean {
        val c = cell(progress, familyId, skillId)
        return c.independentCorrect >= 2 && accuracy(c) >= .6
    }
    fun familyUnlocked(progress: AuralProgress, familyId: String): Boolean = families.find { it.id == familyId }?.prerequisites?.all { evidenced(progress, it, "identify") } == true
    fun skillUnlocked(progress: AuralProgress, familyId: String, skillId: String): Boolean {
        if (!familyUnlocked(progress, familyId)) return false
        val index = skillIds.indexOf(skillId)
        return when {
            index < 0 -> false
            index == 0 -> true
            index == 1 -> cell(progress, familyId, "guided").practiceCorrect >= 4
            else -> evidenced(progress, familyId, skills[index - 1].id)
        }
    }
    private data class Candidate(val familyId: String, val skillId: String, val cell: AuralCell)
    /** Fixed review and introduction lanes stop either old or new material starving. */
    fun selectTarget(progress: AuralProgress, seed: Long, now: Long = System.currentTimeMillis(), microphoneEnabled: Boolean = true): AuralTarget {
        val p = normalize(progress)
        val rng = Random(seed xor p.attempts.toLong())
        val available = families.flatMap { f -> skills.filter { (microphoneEnabled || it.id != "reproduce") && skillUnlocked(p, f.id, it.id) }.map { Candidate(f.id, it.id, cell(p, f.id, it.id)) } }
        val pending = available.filter { !it.cell.mastered && it.skillId != "guided" }
        val unstarted = available.filter { it.skillId == "guided" && it.cell.practiceCorrect < 4 }
        val due = available.filter { it.skillId != "guided" && it.cell.independentAttempts > 0 && it.cell.dueAt <= now }
        val weak = available.filter { it.skillId != "guided" && it.cell.lastCorrect == false }
        val selection = when {
            p.attempts % 5 == 0 && due.isNotEmpty() -> due.minBy { it.cell.dueAt } to "Revisit an older or uncertain skill."
            p.attempts % 4 == 0 && unstarted.isNotEmpty() -> unstarted.first() to "Introduce a related family with guidance."
            p.attempts % 3 == 0 && weak.isNotEmpty() -> weak.random(rng) to "Strengthen a weak prerequisite before building on it."
            pending.isNotEmpty() -> {
                val frontiers = pending.filter { t -> pending.none { it.familyId == t.familyId && skillIds.indexOf(it.skillId) > skillIds.indexOf(t.skillId) } }
                (if (p.attempts % 3 == 1) pending else frontiers).random(rng) to "Build the next aural skill with gradually fading help."
            }
            unstarted.isNotEmpty() -> unstarted.first() to "Establish the sound of a new relationship."
            else -> available.filter { it.skillId != "guided" }.ifEmpty { available }.random(rng) to "Maintain fluent hearing with spaced review."
        }
        val chosen = selection.first
        val microphoneKind = if (chosen.skillId == "reproduce") microphoneKinds.firstOrNull { (chosen.cell.microphonePractice[it] ?: 0) == 0 }
            ?: microphoneKinds.shuffled(rng).minBy { chosen.cell.microphoneIndependent[it] ?: 0 } else null
        val needsIntroduction = microphoneKind != null && (chosen.cell.microphonePractice[microphoneKind] ?: 0) == 0
        val support = if (needsIntroduction) chosen.cell.support.coerceAtLeast(1) else chosen.cell.support
        val transfer = support == 0 && chosen.cell.independentCorrect >= 2 && (p.attempts % 3 == 0 || chosen.cell.independentCorrect >= 4 && chosen.cell.transferCorrect < 2)
        return AuralTarget(chosen.familyId, chosen.skillId, support, transfer, if (needsIntroduction) "Learn this singing task with support before testing it independently." else if (transfer) "Test the relationship in an unfamiliar realization." else selection.second, microphoneKind)
    }
    private fun buildEvent(degree: String, key: KeyInfo, inversion: Int = 0, register: Int = 0, spread: Boolean = false): AuralEvent {
        require(degree in degrees)
        val chord = buildJsonObject {
            put("root", if (degree == "V/V") 5 else degrees.indexOf(degree) + 1)
            if (degree == "V/V") put("applied", 5)
            put("type", 5); put("inversion", inversion)
        }
        val interpreted = ChordInterpreter.interpret(chord, key)
        require(interpreted.midi.isNotEmpty() && interpreted.rootMidi != null) { "The theory engine could not realize this chord" }
        val notes = interpreted.midi.mapIndexed { index, midi -> midi + register * 12 + if (spread && index == interpreted.midi.lastIndex) 12 else 0 }.sorted()
        val function = when (degree) { "V/V" -> "secondary dominant"; "V", "vii°" -> "dominant"; "ii", "IV" -> "predominant"; else -> "tonic" }
        return AuralEvent(notes, interpreted.rootMidi + register * 12, notes.first(), degree, function)
    }
    private fun alternatives(degrees: List<String>, familyId: String): List<List<String>> {
        val choices = families.flatMap { f -> f.variants.map { it.degrees } }.filter { it.size == degrees.size }.toMutableList()
        degrees.indices.forEach { index -> choices.add(degrees.toMutableList().also { it[index] = when (it[index]) { "V/V" -> "ii"; "V" -> "IV"; "I" -> "vi"; "vi" -> "I"; else -> "V" } }) }
        return choices.distinct().filter { it != degrees && (familyId == "secondary-dominant" || "V/V" !in it) }
    }
    /** The target decides pedagogy; the seed only decides its musical realization. */
    fun generate(target: AuralTarget, seed: Long): AuralExercise {
        val family = requireNotNull(families.find { it.id == target.familyId }) { "Unknown harmonic family" }
        require(target.skillId in skillIds) { "Unknown aural skill" }
        require(target.support in 0..2) { "Support must be 0, 1, or 2" }
        require(target.microphoneKind == null || target.microphoneKind in microphoneKinds) { "Unknown microphone task" }
        val rng = Random(seed)
        val support = target.support
        val transfer = support == 0 && target.transfer
        // Consume the original random draw so existing seed-only examples remain reproducible.
        val randomVariant = (if (support == 2) family.variants.take(1) else family.variants).random(rng)
        val selected = if (target.variantId == null) randomVariant else
            requireNotNull(family.variants.find { it.id == target.variantId }) { "Unknown progression in this family" }
        val key = KeyInfo((if (support == 2) keys.take(3) else if (support == 1) keys.take(6) else keys).random(rng), "major")
        val tempo = (if (support == 2) listOf(66, 72) else if (support == 1) listOf(66, 72, 80) else if (transfer) listOf(60, 84, 96) else listOf(66, 72, 80, 88)).random(rng)
        val instrument = (if (support == 2) listOf("sine") else if (support == 1) listOf("sine", "triangle") else listOf("sine", "triangle", "soft")).random(rng)
        val register = if (support == 2) 0 else if (support == 1) listOf(0, 0, 1).random(rng) else listOf(-1, 0, 1).random(rng)
        val inversions = selected.degrees.map { if (support == 2) 0 else if (support == 1) listOf(0, 0, 1).random(rng) else rng.nextInt(3) }
        val spreads = selected.degrees.map { support == 0 && (transfer || rng.nextDouble() > .65) }
        val events = selected.degrees.mapIndexed { i, d -> buildEvent(d, key, inversions[i], register, spreads[i]) }
        val contextDegrees = if (support > 0) listOf("I") else if (transfer) listOf(listOf("I", "IV", "V", "I"), listOf("I", "ii", "V", "I")).random(rng) else listOf(listOf("I"), listOf("I", "V", "I")).random(rng)
        val context = contextDegrees.map { buildEvent(it, key, register = register) }
        val skill = target.skillId
        val gapIndex = if (skill == "audiate") events.lastIndex else if (skill == "complete") rng.nextInt(events.size) else null
        val answerDegrees = if (gapIndex == null) selected.degrees else listOf(selected.degrees[gapIndex])
        val responseType = when (skill) { "guided" -> "guided"; "reproduce" -> "microphone"; "compare", "identify" -> "choice"; else -> "sequence" }
        val options = if (responseType == "choice") {
            val count = if (skill == "compare" || support == 2) 1 else if (support == 1) 2 else 3
            (listOf(selected.degrees) + alternatives(selected.degrees, family.id).shuffled(rng).take(count)).shuffled(rng).mapIndexed { i, d -> AuralOption("option-${i + 1}", d.joinToString(" → "), d) }
        } else emptyList()
        val microphoneTask = if (skill == "reproduce") {
            val kind = target.microphoneKind ?: (if (support == 2) listOf("root") else microphoneKinds).random(rng)
            val index = rng.nextInt(events.size)
            val indices = if (kind == "rootSequence") events.indices.toList() else listOf(index)
            val scaleDegree = listOf(1, 3, 5).random(rng)
            val midis = if (kind == "scaleDegree") listOf(48 + MusicTheory.NOTE_TO_PC.getValue(key.tonic) + MusicTheory.SCALE_INTERVALS.getValue("major")[scaleDegree - 1]) else indices.map { if (kind == "bass") events[it].bassMidi else events[it].rootMidi }
            val label = when (kind) {
                "rootSequence" -> "Sing the chord roots in order. Any comfortable octave is accepted."
                "scaleDegree" -> "Sing scale degree $scaleDegree in the established key. Any comfortable octave is accepted."
                else -> "Sing the ${if (kind == "bass") "lowest sounding note (bass)" else "chord root"} of chord ${index + 1}. Any comfortable octave is accepted."
            }
            AuralMicrophoneTask(kind, label, if (kind == "scaleDegree") emptyList() else indices, midis, if (kind == "scaleDegree") scaleDegree else null)
        } else null
        val answer = AuralAnswer(answerDegrees, options.find { it.degrees == selected.degrees }?.id, microphoneTask?.targetMidis.orEmpty())
        // Musical content rather than the seed determines familiarity, including across skill phases.
        val fingerprint = "realization-" + listOf(family.id, selected.id, key.tonic, tempo, instrument, events.map { it.notes }, context.map { it.notes }).joinToString("|").hashCode().toUInt().toString(16)
        val selectionIdentity = target.variantId?.let { ":selected-$it" }.orEmpty()
        val id = "aural-" + "$GENERATOR_VERSION:${family.id}:$skill:$support:$transfer:${microphoneTask?.kind}:$seed$selectionIdentity".hashCode().toUInt().toString(16)
        val prompt = when (skill) {
            "guided" -> "Listen for the changing feeling of tension and arrival."
            "compare" -> "Which relationship matches what you heard?"
            "identify" -> "Identify the progression you heard."
            "recall" -> "Listen once, then rebuild the progression from memory."
            "complete" -> "Learn the complete model, then restore the missing chord from memory."
            "audiate" -> "Learn the complete model. Internally hear its silent ending before answering."
            else -> microphoneTask!!.label
        }
        return AuralExercise(id, family.id, selected.id, skill, support, transfer, seed, GENERATOR_VERSION, key.tonic, tempo, instrument, events, context, selected.degrees, gapIndex, options, answer, responseType, microphoneTask, fingerprint, prompt, skill in listOf("complete", "audiate"), "${selected.degrees.joinToString(" → ")}. ${family.description}", AuralProvenance(GENERATOR_VERSION, seed, target.copy(transfer = transfer, reason = ""), selected.id, key.tonic, tempo, instrument, inversions, register, spreads, contextDegrees))
    }
    /** Register before playback: abandonment and reloading cannot turn familiarity into mastery. */
    fun beginExercise(progress: AuralProgress, exercise: AuralExercise, now: Long = System.currentTimeMillis()): Pair<AuralProgress, AuralExercise> {
        val p = normalize(progress)
        return p.copy(exposures = (p.exposures + AuralExposure(exercise.fingerprint, exercise.id, now)).takeLast(MAX_EXPOSURES)) to exercise.copy(previouslyExposed = p.exposures.any { it.fingerprint == exercise.fingerprint }, exposureRegistered = true)
    }
    fun evaluate(exercise: AuralExercise, response: List<String>): Boolean = when (exercise.responseType) {
        "choice" -> response.size == 1 && response.first() == exercise.answer.optionId
        "sequence" -> response == exercise.answer.degrees
        else -> false // Guided listening and confidence-aware microphone grading use separate UI paths.
    }
    /** Practice grows readiness; only unfamiliar first-pass performance grows mastery. */
    fun record(progress: AuralProgress, exercise: AuralExercise, correct: Boolean, assistance: List<String> = emptyList(), plays: Int = 1, attempt: Int = 1, technicalUncertainty: Boolean = false, now: Long = System.currentTimeMillis()): AuralProgress {
        require(exercise.familyId in familyIds && exercise.skillId in skillIds) { "Unknown curriculum exercise" }
        val p = normalize(progress)
        val old = cell(p, exercise.familyId, exercise.skillId)
        val alreadyGraded = p.recent.any { it.id == exercise.id && !it.technicalUncertainty }
        val exposed = if (exercise.exposureRegistered) exercise.previouslyExposed else p.exposures.any { it.fingerprint == exercise.fingerprint }
        val microphoneKind = exercise.microphoneTask?.kind
        val microphoneReady = exercise.skillId != "reproduce" || microphoneKind != null && (old.microphonePractice[microphoneKind] ?: 0) > 0
        val independent = !technicalUncertainty && exercise.provenance.target.variantId == null && exercise.skillId != "guided" && exercise.support == 0 && assistance.isEmpty() && plays == 1 && attempt == 1 && !exposed && !alreadyGraded && microphoneReady
        val updated = when {
            technicalUncertainty -> old
            independent -> {
                val streak = if (correct) old.streak + 1 else 0
                val interval = if (correct) (2.0.pow((streak - 1).coerceAtMost(5)).toLong().coerceAtMost(30) * DAY) else DAY / 25
                cleanCell(old.copy(independentAttempts = old.independentAttempts + 1, independentCorrect = old.independentCorrect + if (correct) 1 else 0,
                    transferCorrect = old.transferCorrect + if (correct && exercise.transfer) 1 else 0,
                    keys = if (correct) (old.keys + exercise.keyTonic).distinct() else old.keys, lastCorrect = correct, lastAt = now, dueAt = now + interval, streak = streak,
                    recentIndependent = (old.recentIndependent + correct).takeLast(RECENT_WINDOW),
                    microphoneIndependent = if (correct && microphoneKind != null) old.microphoneIndependent + (microphoneKind to (1 + (old.microphoneIndependent[microphoneKind] ?: 0))) else old.microphoneIndependent), exercise.skillId)
            }
            // Help and successful retries never hide an independent failure or postpone its review.
            else -> {
                val success = correct && !alreadyGraded && attempt == 1
                cleanCell(old.copy(practice = old.practice + 1, practiceCorrect = old.practiceCorrect + if (success) 1 else 0,
                    microphonePractice = if (success && microphoneKind != null) old.microphonePractice + (microphoneKind to (1 + (old.microphonePractice[microphoneKind] ?: 0))) else old.microphonePractice), exercise.skillId)
            }
        }
        val exposures = if (!exercise.exposureRegistered && p.exposures.none { it.fingerprint == exercise.fingerprint }) (p.exposures + AuralExposure(exercise.fingerprint, exercise.id, now)).takeLast(MAX_EXPOSURES) else p.exposures
        // Preserve the generator's input, including null (seed-selected subtype).
        // Substituting the chosen kind would consume the random stream differently on replay.
        val record = AuralAttemptRecord(exercise.id, exercise.familyId, exercise.skillId, correct, independent, technicalUncertainty, now, exercise.seed, exercise.generatorVersion, exercise.fingerprint, exercise.keyTonic, exercise.variantId, exercise.support, exercise.transfer, assistance, plays, attempt, exercise.provenance.target.microphoneKind, exercise.provenance.target.variantId)
        return p.copy(cells = if (technicalUncertainty) p.cells else p.cells + ("${exercise.familyId}:${exercise.skillId}" to updated), attempts = p.attempts + if (technicalUncertainty) 0 else 1, recent = (p.recent + record).takeLast(MAX_RECENT), exposures = exposures)
    }
}
