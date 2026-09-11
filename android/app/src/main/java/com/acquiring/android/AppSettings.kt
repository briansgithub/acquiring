package com.acquiring.android

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp

internal const val SETTINGS_SCREEN_TEST_TAG = "SettingsScreen"
internal const val SETTINGS_BACK_TEST_TAG = "SettingsBack"

// This is an external handoff, not an in-app update check. Keep the destination
// isolated until the app adopts the Play In-App Updates API.
private const val UPDATE_DISTRIBUTION_URL =
    "https://play.google.com/store/apps/details?id=com.acquiring.android"

internal enum class SettingsPlaceholderSection(val title: String, val body: String) {
    TIMELINE_FPS("Timeline", "Frame rate options will appear here."),
    DIAGNOSTICS("Audio diagnostics", "Diagnostics export will appear here.");
}

internal fun openUpdateDistribution(context: Context): String? {
    val playStoreIntent = Intent(Intent.ACTION_VIEW, Uri.parse(UPDATE_DISTRIBUTION_URL))
        .setPackage("com.android.vending")

    return try {
        context.startActivity(playStoreIntent)
        null
    } catch (_: ActivityNotFoundException) {
        openUpdateDistributionInBrowser(context)
    } catch (_: SecurityException) {
        openUpdateDistributionInBrowser(context)
    }
}

private fun openUpdateDistributionInBrowser(context: Context): String? {
    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(UPDATE_DISTRIBUTION_URL))
    return try {
        context.startActivity(browserIntent)
        null
    } catch (_: ActivityNotFoundException) {
        "No compatible app is available to open Google Play for updates."
    } catch (_: SecurityException) {
        "This device does not allow opening Google Play for updates."
    }
}

@Composable
internal fun AppSettingsScreen(
    defaultInstrument: AudioEngine.Waveform,
    onDefaultInstrumentChange: (AudioEngine.Waveform) -> Unit,
    catalogStatus: String,
    catalogFreshness: String,
    onUpdateCatalog: () -> Unit,
    playUpdateStatus: PlayUpdateStatus,
    onOpenPlayUpdate: () -> Unit,
    onBack: () -> Unit
) {
    var openHelpTopicId by rememberSaveable { mutableStateOf<String?>(null) }
    val openHelpTopic = openHelpTopicId?.let(HelpCatalog::topic)
    if (openHelpTopic != null) {
        HelpArticleScreen(
            topic = openHelpTopic,
            onBack = { openHelpTopicId = null }
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag(SETTINGS_SCREEN_TEST_TAG)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            TextButton(
                onClick = onBack,
                modifier = Modifier.testTag(SETTINGS_BACK_TEST_TAG)
            ) { Text("< Back") }
            Text(
                text = "Settings",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .semantics { heading() }
            )
        }

        SettingsSectionHeading("Default Instrument")
        AudioEngine.Waveform.entries.groupBy(AudioEngine.Waveform::categoryName)
            .forEach { (category, instruments) ->
                Text(
                    text = category,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
                instruments.forEach { instrument ->
                    val selected = instrument == defaultInstrument
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = selected,
                                onClick = { onDefaultInstrumentChange(instrument) }
                            )
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                            .semantics {
                                contentDescription = "Default instrument: ${instrument.displayName}"
                                stateDescription = if (selected) "Selected" else "Not selected"
                            }
                    ) {
                        RadioButton(selected = selected, onClick = null)
                        Text(
                            text = instrument.displayName,
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }
                }
            }

        Divider(modifier = Modifier.padding(vertical = 12.dp))
        HelpIndex(onOpenTopic = { openHelpTopicId = it.id })

        Divider(modifier = Modifier.padding(vertical = 12.dp))
        SettingsSectionHeading("Privacy")
        PrivacyPolicyLink()

        Divider(modifier = Modifier.padding(vertical = 12.dp))
        SettingsSectionHeading("Catalog")
        Text(
            text = catalogFreshness,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
        if (catalogStatus.isNotEmpty()) {
            Text(
                text = catalogStatus,
                style = MaterialTheme.typography.bodyMedium,
                color = if (catalogStatus.startsWith("Error:")) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }
        TextButton(
            onClick = onUpdateCatalog,
            modifier = Modifier.semantics { contentDescription = "Update catalog" }
        ) {
            Text("Update catalog")
        }

        Divider(modifier = Modifier.padding(vertical = 12.dp))
        SettingsSectionHeading(
            if (playUpdateStatus == PlayUpdateStatus.UPDATE_AVAILABLE) "Updates •" else "Updates"
        )
        Text(
            text = playUpdateStatus.label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
        TextButton(
            onClick = onOpenPlayUpdate,
            modifier = Modifier.semantics { contentDescription = "Open Play Store for updates" }
        ) {
            Text("Open Play")
        }

        SettingsPlaceholderSection.entries.forEach { section ->
            Divider(modifier = Modifier.padding(vertical = 12.dp))
            SettingsSectionHeading(section.title)
            Text(
                text = section.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        Divider(modifier = Modifier.padding(vertical = 12.dp))
        Text(
            text = "Version ${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp)
        )
    }
}

@Composable
internal fun SettingsSectionHeading(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .semantics { heading() }
    )
}
