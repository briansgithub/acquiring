package com.acquiring.android

import android.content.Context
import android.content.Intent
import android.content.ActivityNotFoundException
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusTarget
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.TextAlign

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.exponentialDecay
import androidx.compose.animation.core.tween
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.input.pointer.util.addPointerInputChange
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.room.Room
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.*
import kotlin.math.min
import kotlin.math.roundToInt


private fun ExtractedSection.metadataObjects(field: String): List<JsonObject> =
    (metadata?.get(field) as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()

private fun JsonObject.num(field: String): Double? = (this[field] as? JsonPrimitive)?.doubleOrNull

private fun prettyScaleName(scale: String): String = scale
    .replace(Regex("([a-z])([A-Z])"), "$1 $2")
    .replaceFirstChar { it.uppercase() }

private fun formatBeat(beat: Double): String =
    if (beat % 1.0 == 0.0) beat.toInt().toString() else "%.2f".format(beat).trimEnd('0').trimEnd('.')

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun InfoTab(
    song: Song,
    complexityRating: Double?,
    section: ExtractedSection,
    sections: Map<String, ExtractedSection>,
    selectedId: String?,
    onSectionChange: (String) -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()

    val keys = remember(section) { section.getKeys() }
    val tempos = remember(section) { section.metadataObjects("tempos") }
    val meters = remember(section) { section.metadataObjects("meters") }
    val orderedSections = remember(sections) { sections.sectionsInSongOrder() }

    val bpm = section.getBpm()
    val beatsPerMeasure = meters.firstOrNull()?.num("numBeats")?.toInt()
    val endBeat = section.metadata?.num("endBeat")
    val totalBeats = endBeat?.let { (it - 1).coerceAtLeast(0.0) }?.takeIf { it > 0.0 }
    val durationLabel = totalBeats?.let {
        val secs = (it / bpm * 60.0).roundToInt()
        "%d:%02d".format(secs / 60, secs % 60)
    }
    val measures = totalBeats?.let { beats ->
        beatsPerMeasure?.takeIf { it > 0 }?.let { kotlin.math.ceil(beats / it).toInt() }
    }

    val melodyNotes = remember(section) {
        val raw = when (val n = section.notes) {
            is JsonArray -> n.toList()
            is JsonObject -> (n["melody1"] as? JsonArray)?.toList() ?: emptyList()
            else -> emptyList()
        }
        raw.mapNotNull { it as? JsonObject }
    }
    val soundedNotes = melodyNotes.count { note ->
        (note["isRest"] as? JsonPrimitive)?.booleanOrNull != true &&
            (note["rest"] as? JsonPrimitive)?.booleanOrNull != true
    }

    val progression = remember(section) {
        section.chords.sortedBy { it.num("beat") ?: 0.0 }
    }
    val uniqueChordCount = remember(section) {
        ChordInterpreter.getUniqueDisplayChords(section.chords, section.getParsedKey()).size
    }

    val youtubeId = (section.metadata?.get("youtube") as? JsonObject)
        ?.let { (it["id"] as? JsonPrimitive)?.contentOrNull }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 96.dp)
    ) {
        item {
            Text(
                text = song.displayTitle,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            if (!song.artist.isNullOrBlank()) {
                Text(
                    text = song.displayArtist,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            Text(
                text = section.safeSectionName.uppercase(),
                style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 10.dp)
            )
        }

        item { InfoGroup("Overview") }
        item {
            val firstKey = keys.first().key
            InfoRow("Key", "${firstKey.tonic} ${prettyScaleName(firstKey.scale)}")
            InfoRow("Tempo", "${bpm.roundToInt()} BPM")
            beatsPerMeasure?.let { InfoRow("Beats / measure", it.toString()) }
            durationLabel?.let { InfoRow("Length", it) }
            totalBeats?.let { beats ->
                InfoRow("Beats", formatBeat(beats) + (measures?.let { " · $it bars" } ?: ""))
            }
            InfoRow("Chords", "${progression.size} (${uniqueChordCount} unique)")
            complexityRating?.let { score ->
                InfoRow("Complexity score", "${"%.1f".format(score)} / 100")
            }
            if (melodyNotes.isNotEmpty()) {
                InfoRow("Melody notes", "$soundedNotes sounded / ${melodyNotes.size} total")
            } else {
                // State it rather than omitting the row: a silently missing
                // melody reads as a bug in the app instead of what it is —
                // a chord-only TheoryTab. ~1.3k songs in the catalog are
                // chord-only upstream.
                InfoRow("Melody notes", "None — chords only")
            }
        }

        if (progression.isNotEmpty()) {
            item { InfoGroup("Progression") }
            item {
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    progression.forEach { chord ->
                        val beat = chord.num("beat") ?: 1.0
                        val chordKey = section.getKeyAtBeat(beat)
                        val symbol = ChordInterpreter.getRomanSymbol(chord, chordKey)
                        val letterName = ChordInterpreter.getLetterName(chord, chordKey)
                        ChordPill(
                            display = RomanNumeralDisplay.fromChord(symbol, chord["borrowed"]),
                            letterName = letterName,
                            contentDescription = "Play $letterName at beat ${formatBeat(beat)}",
                            onClick = {
                                val notes = ChordInterpreter.getChordNotes(chord, chordKey)
                                if (notes.isNotEmpty()) {
                                    scope.launch { AudioEngine.playChord(notes) }
                                }
                            }
                        )
                    }
                }
            }
        }

        if (keys.size > 1) {
            item { InfoGroup("Key changes") }
            item {
                keys.forEach { k ->
                    InfoRow(
                        "Beat ${formatBeat(k.beat)}",
                        "${k.key.tonic} ${prettyScaleName(k.key.scale)}"
                    )
                }
            }
        }

        if (tempos.size > 1) {
            item { InfoGroup("Tempo changes") }
            item {
                tempos.forEach { t ->
                    InfoRow(
                        "Beat ${formatBeat(t.num("beat") ?: 1.0)}",
                        "${(t.num("bpm") ?: 120.0).roundToInt()} BPM"
                    )
                }
            }
        }

        if (meters.size > 1) {
            item { InfoGroup("Meter changes") }
            item {
                meters.forEach { m ->
                    InfoRow(
                        "Beat ${formatBeat(m.num("beat") ?: 1.0)}",
                        "${(m.num("numBeats") ?: 4.0).toInt()} beats / measure"
                    )
                }
            }
        }

        if (orderedSections.size > 1) {
            item { InfoGroup("Sections") }
            item {
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    orderedSections.forEach { (id, entry) ->
                        FilterChip(
                            selected = id == selectedId,
                            onClick = { onSectionChange(id) },
                            label = { Text(entry.safeSectionName) }
                        )
                    }
                }
            }
        }

        item { InfoGroup("Source") }
        item {
            section.safeNumericId.takeIf { it.isNotBlank() }?.let { InfoRow("Hooktheory ID", it) }
            InfoRow("Slug", song.slug)
            Row(modifier = Modifier.padding(top = 4.dp)) {
                TextButton(
                    onClick = { uriHandler.openUri(song.url) },
                    contentPadding = PaddingValues(horizontal = 4.dp)
                ) { Text("Open on Hooktheory ↗") }
                youtubeId?.let { id ->
                    TextButton(
                        onClick = { uriHandler.openUri("https://www.youtube.com/watch?v=$id") },
                        contentPadding = PaddingValues(horizontal = 4.dp)
                    ) { Text("YouTube ↗") }
                }
            }
        }
    }
}

@Composable
private fun InfoGroup(title: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 22.dp)) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
        Divider(
            modifier = Modifier.padding(top = 6.dp),
            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 7.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(start = 16.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChordPill(
    display: RomanNumeralDisplay,
    letterName: String,
    contentDescription: String,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        modifier = Modifier
            .padding(bottom = 6.dp)
            .semantics { this.contentDescription = contentDescription }
    ) {
        Column(
            modifier = Modifier
                .widthIn(min = 54.dp)
                .padding(horizontal = 10.dp, vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            RomanNumeralText(display = display, fontSize = 16.sp)
            Text(
                text = letterName,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
                maxLines = 1
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChordsTab(
    section: ExtractedSection,
    showLetterNames: Boolean,
    onShowLetterNamesChange: (Boolean) -> Unit,
    isArpeggiated: Boolean,
    onArpeggiatedChange: (Boolean) -> Unit,
    arpeggioStepMs: Float,
    onArpeggioStepMsChange: (Float) -> Unit
) {
    val key = section.getParsedKey()
    val scope = rememberCoroutineScope()
    val displayChords = remember(section, key) {
        ChordInterpreter.getUniqueDisplayChords(section.chords, key)
    }
    val scaleNotes = remember(key) {
        val intervals = MusicTheory.SCALE_INTERVALS[key.scale] ?: MusicTheory.SCALE_INTERVALS["major"]!!
        MusicTheory.generateScaleLabels(key.tonic, intervals)
    }

    Column(modifier = Modifier.padding(16.dp)) {
        // Current Scale Header
        Text(
            text = "Scale: ${scaleNotes.joinToString(", ")}",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Key: ${key.tonic} ${key.scale}", style = MaterialTheme.typography.titleMedium)
            
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Letters", style = MaterialTheme.typography.bodySmall)
                    Switch(
                        checked = showLetterNames,
                        onCheckedChange = onShowLetterNamesChange,
                        modifier = Modifier.scale(0.7f)
                    )
                }

                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text("Arpeggiate", style = MaterialTheme.typography.bodySmall)
                    Switch(
                        checked = isArpeggiated,
                        onCheckedChange = onArpeggiatedChange,
                        modifier = Modifier.scale(0.7f)
                    )
                }
            }
        }
        
        if (isArpeggiated) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Speed: ${arpeggioStepMs.toInt()} ms",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.width(90.dp)
                )
                Slider(
                    value = arpeggioStepMs,
                    onValueChange = onArpeggioStepMsChange,
                    valueRange = 30f..1000f,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        
        LazyVerticalGrid(
            columns = GridCells.Adaptive(100.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(displayChords) { chord ->
                val symbol = ChordInterpreter.getRomanSymbol(chord, key)
                val romanDisplay = RomanNumeralDisplay.fromChord(symbol, chord["borrowed"])
                val letterName = ChordInterpreter.getLetterName(chord, key)

                Card(
                    onClick = {
                        val notes = ChordInterpreter.getChordNotes(chord, key)
                        if (notes.isNotEmpty()) {
                            scope.launch {
                                AudioEngine.playChord(notes, arpeggiate = isArpeggiated, stepMs = arpeggioStepMs.toInt())
                            }
                        }
                    },
                    modifier = Modifier.height(80.dp)
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            RomanNumeralText(
                                display = romanDisplay,
                                fontSize = 20.sp,
                                modifier = Modifier.fillMaxWidth()
                            )
                            if (showLetterNames) {
                                Text(
                                    text = letterName,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.secondary,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
