package com.acquiring.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
internal fun AuralExampleSettingsPanel(settings: AuralExampleSettings, popularityAvailable: Boolean,
                                      onChange: (AuralExampleSettings) -> Unit, onBack: () -> Unit, popularityDescription: String? = null,
                                      modeAnalysisAvailable: Boolean = true) {
    Column(Modifier.fillMaxSize().testTag("AuralExampleSettingsPanel")) {
        Row(Modifier.padding(horizontal=16.dp,vertical=8.dp),verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.testTag("AuralExampleSettingsBack")) { Icon(Icons.Default.ArrowBack, "Back") }
            Text("Examples", style = MaterialTheme.typography.titleLarge)
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal=16.dp,vertical=8.dp)) {
        Text("Catalog and next example", style = MaterialTheme.typography.bodySmall)
        AuralExampleSwitch("Prefer popular songs", "AuralPopularity", settings.popularity && popularityAvailable, popularityAvailable,
            popularityDescription ?: if (!popularityAvailable) "Popularity data unavailable" else null) { onChange(settings.copy(popularity = it)) }
        AuralExampleSwitch("Keep examples varied", "AuralVariety", settings.variety) { onChange(settings.copy(variety = it)) }
        AuralExampleSwitch("Favor my favorites", "AuralFavorites", settings.favorites) { onChange(settings.copy(favorites = it)) }
        Divider(Modifier.padding(vertical = 12.dp))
        AuralExampleSwitch("Distinguish inversions", "AuralInversions", settings.distinguishInversions,
            description = "Track bass-sensitive practice separately") { onChange(settings.copy(distinguishInversions = it)) }
        AuralExampleSwitch("Flat list", "AuralFlatList", settings.flatList,
            description = "All sequences · highest combined score first") { onChange(settings.copy(flatList = it)) }
        Divider(Modifier.padding(vertical = 12.dp))
        Text("Mode handling", style = MaterialTheme.typography.titleMedium)
        Text(if (modeAnalysisAvailable) "Choose one catalog analysis" else "Update the progression catalog to enable mode analysis",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        AuralAnalysisChoice("All modes", "Original modal labels", settings.analysis == "allModes", true, "AuralAnalysisAll") {
            onChange(settings.copy(analysis = "allModes"))
        }
        AuralAnalysisChoice("Relative major", "Combine equivalent sequences across modes", settings.analysis == "relativeMajor", modeAnalysisAvailable, "AuralAnalysisRelative") {
            onChange(settings.copy(analysis = "relativeMajor"))
        }
        AuralAnalysisChoice("Filter by mode", "Only sequences from one source mode", settings.analysis == "filterMode", modeAnalysisAvailable, "AuralAnalysisFilter") {
            onChange(settings.copy(analysis = "filterMode"))
        }
        if (settings.analysis == "filterMode" && modeAnalysisAvailable) {
            var expanded by remember { mutableStateOf(false) }
            Box(Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth().testTag("AuralModeFilter")) {
                    Text(auralModeLabel(settings.modeFilter))
                }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    AURAL_MODES.forEach { mode -> DropdownMenuItem(text = { Text(auralModeLabel(mode)) }, onClick = {
                        expanded = false; onChange(settings.copy(modeFilter = mode))
                    }) }
                }
            }
        }
        }
    }
}

@Composable
private fun AuralAnalysisChoice(label: String, description: String, selected: Boolean, enabled: Boolean, tag: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().testTag(tag).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = onClick, enabled = enabled)
        Column(Modifier.weight(1f)) {
            Text(label, color = if(enabled) LocalContentColor.current else MaterialTheme.colorScheme.onSurface.copy(alpha=.38f))
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AuralExampleSwitch(label: String, tag: String, checked: Boolean, enabled: Boolean = true,
                               description: String? = null, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label)
            if (description != null) Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled, modifier = Modifier.testTag(tag))
    }
}
