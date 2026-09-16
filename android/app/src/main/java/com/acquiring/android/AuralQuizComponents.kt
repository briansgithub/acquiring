package com.acquiring.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

internal fun auralPhaseLabel(id: String): String = when (id) {
    "guided" -> "Listen"
    "compare" -> "Compare"
    "identify" -> "Identify"
    "recall" -> "Recall"
    "complete" -> "Complete"
    "audiate" -> "Audiate"
    else -> "Sing"
}

internal fun auralBriefPrompt(exercise: AuralExercise): String = when (exercise.skillId) {
    "guided" -> "Follow the tension and return."
    "compare", "identify" -> "Which progression did you hear?"
    "recall" -> "Rebuild it from memory."
    "complete" -> "Hear the model. Fill the silent chord."
    "audiate" -> "Hear the model. Imagine its silent ending."
    else -> requireNotNull(exercise.microphoneTask).let { task ->
        when (task.kind) {
            "rootSequence" -> "Sing each root in order."
            "scaleDegree" -> "Sing scale degree ${task.scaleDegree}."
            "bass" -> "Sing chord ${task.eventIndices.first() + 1}’s lowest note."
            else -> "Sing chord ${task.eventIndices.first() + 1}’s root."
        }
    }
}

/** Neutral slots carry timing/order, never hidden answer labels or answer-specific colors. */
@Composable
internal fun AuralChordStrip(degrees: List<String?>, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        degrees.forEachIndexed { index, degree ->
            if (index > 0) Text("→", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(shape = MaterialTheme.shapes.medium,
                color = if (degree == null) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.secondaryContainer,
                modifier = Modifier.weight(1f)) {
                Box(Modifier.heightIn(min = 52.dp).padding(horizontal = 4.dp, vertical = 12.dp), contentAlignment = Alignment.Center) {
                    Text(degree ?: "?", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}

@Composable
internal fun AuralFamilyProgress(familyId: String, progress: AuralProgress) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
        AuralCurriculum.skills.forEach { skill ->
            val cell = AuralCurriculum.cell(progress, familyId, skill.id)
            val started = cell.practice + cell.independentAttempts > 0
            val status = if (cell.mastered) "mastered" else if (started) "practicing" else "new"
            Surface(shape = CircleShape, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                color = if (cell.mastered) MaterialTheme.colorScheme.primary else if (started) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface,
                modifier = Modifier.size(18.dp).semantics { contentDescription = "${auralPhaseLabel(skill.id)}: $status" }) {
                if (cell.mastered) Icon(Icons.Default.Check, contentDescription = null, Modifier.padding(2.dp), tint = MaterialTheme.colorScheme.onPrimary)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AuralFamilyCard(family: AuralFamily, index: Int, progress: AuralProgress, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth().testTag("AuralFamily-${family.id}")) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer) {
                Box(Modifier.size(42.dp), contentAlignment = Alignment.Center) { Text("${index + 1}", style = MaterialTheme.typography.titleMedium) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(family.label, style = MaterialTheme.typography.titleMedium)
                Text("${family.variants.size} progressions", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                AuralFamilyProgress(family.id, progress)
            }
            Icon(Icons.Default.KeyboardArrowRight, contentDescription = null)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AuralProgressionCard(variant: AuralVariant, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth().testTag("AuralProgression-${variant.id}")) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AuralChordStrip(variant.degrees, Modifier.weight(1f))
            Icon(Icons.Default.KeyboardArrowRight, contentDescription = null)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AuralPhaseTabs(skillId: String, onSelect: (String) -> Unit) {
    ScrollableTabRow(selectedTabIndex = AuralCurriculum.skills.indexOfFirst { it.id == skillId }.coerceAtLeast(0), edgePadding = 0.dp) {
        AuralCurriculum.skills.forEachIndexed { index, skill ->
            Tab(selected = skill.id == skillId, onClick = { if (skill.id != skillId) onSelect(skill.id) },
                modifier = Modifier.testTag("AuralPhase-${skill.id}"),
                text = { Text("${index + 1}  ${auralPhaseLabel(skill.id)}") })
        }
    }
}

@Composable
internal fun AuralInfoDialog(view: AuralLessonView, familyId: String?, onDismiss: () -> Unit, onMicrophone: (Boolean) -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Your learning") },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Choose a progression to practice. Adaptive chooses what to review and hides the target for independent checks.")
                Text("Hints, replays and named progressions count as practice. Help fades as you improve; fresh checks build mastery.")
                Text("Listen for the key reference, a pause, then the exercise. In Complete and Audiate, a full model comes before the version with a silent chord.")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Microphone in Adaptive", Modifier.weight(1f))
                    Switch(checked = view.microphoneEnabled, onCheckedChange = onMicrophone)
                }
                Text("Sing in any comfortable octave. Unclear pitch is ungraded. Audio stays on this device.")
                Text("○ New   ● Practicing   ✓ Mastered\nProgress is shared across a family’s progressions.")
                familyId?.let { id ->
                    Text(AuralCurriculum.families.first { it.id == id }.label, style = MaterialTheme.typography.titleSmall)
                    AuralCurriculum.skills.forEach { skill ->
                        val cell = AuralCurriculum.cell(view.progress, id, skill.id)
                        Column {
                            Text(auralPhaseLabel(skill.id), style = MaterialTheme.typography.labelLarge)
                            Text("${cell.practice} practice · ${cell.independentCorrect}/${cell.independentAttempts} checks · ${cell.transferCorrect} transfer")
                        }
                    }
                }
            }
        })
}
