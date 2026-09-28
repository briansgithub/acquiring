package com.acquiring.android

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
internal fun AuralProgressionSearch(
    query: AuralProgressionQuery,
    onChange: (AuralProgressionQuery) -> Unit,
    catalog: AuralCatalog,
    settings: AuralExampleSettings,
) {
    var selected by remember { mutableStateOf<Int?>(null) }
    var showVariants by remember { mutableStateOf(false) }
    var variants by remember { mutableStateOf<List<AuralChordVariant>?>(null) }
    var visibleVariants by remember { mutableStateOf(30) }
    fun replace(index: Int, value: AuralChordConstraint) {
        onChange(query.copy(chords = query.chords.toMutableList().also { it[index] = value }))
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Find a chord progression", style = MaterialTheme.typography.titleSmall)
            if (query.chords.isNotEmpty()) TextButton(onClick = { onChange(AuralProgressionQuery()) }, modifier = Modifier.testTag("AuralSearchClear")) { Text("Clear chords") }
        }
        Text("Tap degrees in order. Tap an added chord to change its quality.", style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (query.chords.isNotEmpty()) FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            query.chords.forEachIndexed { index, chord ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (index > 0) Text("→", modifier = Modifier.padding(end = 6.dp))
                    OutlinedButton(onClick = { selected = index; showVariants = false }, modifier = Modifier.testTag("AuralSearchChord-$index")) {
                        Text(chord.label)
                    }
                }
            }
        }
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            (1..7).forEach { degree ->
                FilledTonalButton(onClick = { onChange(query.copy(chords = query.chords + AuralChordConstraint(degree))) },
                    enabled = query.chords.size < 32, modifier = Modifier.testTag("AuralSearchDegree-$degree")) {
                    Text(listOf("I", "II", "III", "IV", "V", "VI", "VII")[degree - 1])
                }
            }
        }
    }
    val index = selected
    val chord = index?.let { query.chords.getOrNull(it) }
    if (index != null && chord != null) {
        LaunchedEffect(showVariants, chord.degree, chord.accidental, settings.analysis, settings.modeFilter, settings.distinguishInversions, catalog.snapshotId) {
            if (showVariants) {
                variants = null
                variants = withContext(Dispatchers.IO) { catalog.chordVariants(settings, chord) }
                visibleVariants = 30
            }
        }
        AlertDialog(
            onDismissRequest = { selected = null; showVariants = false },
            title = { Text("Edit chord ${index + 1}") },
            text = {
                Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState())) {
                    Text("Accidental", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("♭" to "Flat", "" to "Natural", "♯" to "Sharp").forEach { (value, label) ->
                            FilterChip(selected = chord.accidental == value, onClick = { replace(index, chord.copy(accidental = value, exact = null, inversion = null)); showVariants = false }, label = { Text(label) })
                        }
                    }
                    Text("Chord family", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("any" to "Any", "major" to "Major", "minor" to "Minor", "7" to "7", "maj7" to "maj7", "m7" to "m7").forEach { (value, label) ->
                            FilterChip(selected = chord.exact == null && chord.family == value, onClick = { replace(index, chord.copy(family = value, exact = null, inversion = null)); showVariants = false }, label = { Text(label) })
                        }
                    }
                    TextButton(onClick = { showVariants = !showVariants }, modifier = Modifier.testTag("AuralSearchMore")) { Text(if (showVariants) "Hide more options" else "More options") }
                    if (showVariants) {
                        if (variants == null) LinearProgressIndicator(Modifier.fillMaxWidth())
                        else if (variants!!.isEmpty()) Text("No chord forms in this catalog")
                        else Column {
                            variants!!.take(visibleVariants).forEach { variant ->
                                TextButton(onClick = {
                                    replace(index, chord.copy(family = "any", exact = variant.root,
                                        inversion = if (settings.distinguishInversions && variant.label != variant.root) variant.label else null))
                                    selected = null
                                    showVariants = false
                                }, modifier = Modifier.fillMaxWidth()) { Text(variant.label) }
                            }
                            if (visibleVariants < variants!!.size) TextButton(onClick = { visibleVariants += 30 }) { Text("More chords") }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { selected = null; showVariants = false }) { Text("Done") } },
            dismissButton = {
                Row {
                    if (index > 0) TextButton(onClick = { onChange(query.copy(chords = query.chords.toMutableList().also { it.add(index - 1, it.removeAt(index)) })); selected = index - 1 }) { Text("Move earlier") }
                    if (index < query.chords.lastIndex) TextButton(onClick = { onChange(query.copy(chords = query.chords.toMutableList().also { it.add(index + 1, it.removeAt(index)) })); selected = index + 1 }) { Text("Move later") }
                    TextButton(onClick = { onChange(query.copy(chords = query.chords.toMutableList().also { it.removeAt(index) })); selected = null }) { Text("Remove") }
                }
            },
        )
    }
}
