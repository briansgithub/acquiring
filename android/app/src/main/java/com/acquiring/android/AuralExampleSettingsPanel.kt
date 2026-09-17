package com.acquiring.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
internal fun AuralExampleSettingsPanel(settings: AuralExampleSettings, popularityAvailable: Boolean,
                                      onChange: (AuralExampleSettings) -> Unit, onBack: () -> Unit, popularityDescription: String? = null) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).testTag("AuralExampleSettingsPanel")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.testTag("AuralExampleSettingsBack")) { Icon(Icons.Default.ArrowBack, "Back") }
            Text("Examples", style = MaterialTheme.typography.titleLarge)
        }
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
