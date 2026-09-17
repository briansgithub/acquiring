package com.acquiring.android

/** Presentation groups only: existing skill cells and saved attempts remain separate. */
internal data class AuralPracticeMode(val id: String, val label: String, val skills: List<String>)

internal object AuralPracticeModes {
    val modes = listOf(
        AuralPracticeMode("recognize", "Recognize", listOf("compare", "identify")),
        AuralPracticeMode("recall", "Recall", listOf("recall", "complete", "audiate")),
        AuralPracticeMode("sing", "Sing", listOf("reproduce"))
    )

    fun forSkill(skillId: String): AuralPracticeMode =
        if (skillId == "guided") modes.first() else modes.first { skillId in it.skills }

    /** Named practice can develop readiness, but cannot unlock independent mastery. */
    fun selectSkill(progress: AuralProgress, familyId: String, variantId: String, modeId: String): String {
        val mode = requireNotNull(modes.find { it.id == modeId }) { "Unknown quiz mode" }
        val history = progress.recent.filter { it.familyId == familyId && !it.technicalUncertainty }
        if (modeId == "recognize" && history.none { it.variantId == variantId && it.correct } &&
            AuralCurriculum.cell(progress, familyId, "identify").independentCorrect == 0) return "guided"
        val recent = history.lastOrNull { it.skillId in mode.skills }
        if (recent != null && !recent.correct) return recent.skillId
        return mode.skills.firstOrNull { skill ->
            val cell = AuralCurriculum.cell(progress, familyId, skill)
            cell.practiceCorrect + cell.independentCorrect < 4
        } ?: mode.skills.minBy { skill -> history.indexOfLast { it.skillId == skill } }
    }

    fun selectMicrophoneKind(progress: AuralProgress, familyId: String): String {
        val cell = AuralCurriculum.cell(progress, familyId, "reproduce")
        val recent = progress.recent.lastOrNull { it.familyId == familyId && it.skillId == "reproduce" && !it.technicalUncertainty }
        if (recent != null && !recent.correct && recent.microphoneKind in AuralCurriculum.microphoneKinds) return recent.microphoneKind!!
        return AuralCurriculum.microphoneKinds.minBy { (cell.microphonePractice[it] ?: 0) + (cell.microphoneIndependent[it] ?: 0) }
    }

    fun mastered(progress: AuralProgress, familyId: String, mode: AuralPracticeMode): Boolean =
        mode.skills.all { AuralCurriculum.cell(progress, familyId, it).mastered }
}
