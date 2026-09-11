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


// This is an external handoff, not an in-app update check. Keep the destination
// isolated until the app adopts the Play In-App Updates API.
private const val UPDATE_DISTRIBUTION_URL =
    "https://play.google.com/store/apps/details?id=com.acquiring.android"

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
internal fun AppSettingsMenu(
    catalogStatus: String,
    updateStatus: String,
    defaultInstrument: AudioEngine.Waveform,
    onDefaultInstrumentChange: (AudioEngine.Waveform) -> Unit,
    onDownloadCatalog: () -> Unit,
    onCheckForUpdates: () -> Unit
) {
    var isExpanded by rememberSaveable { mutableStateOf(false) }

    Box {
        TextButton(
            onClick = { isExpanded = true },
            modifier = Modifier.semantics { contentDescription = "Open settings menu" }
        ) {
            Text("Settings")
        }
        DropdownMenu(
            expanded = isExpanded,
            onDismissRequest = { isExpanded = false },
            modifier = Modifier.semantics { contentDescription = "Settings menu" }
        ) {
            Text(
                text = "Default Instrument",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    .semantics { heading() }
            )
            AudioEngine.Waveform.entries.groupBy(AudioEngine.Waveform::categoryName)
                .forEach { (category, instruments) ->
                    Text(
                        text = category,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    )
                    instruments.forEach { instrument ->
                        DropdownMenuItem(
                            text = { Text(instrument.displayName) },
                            leadingIcon = {
                                RadioButton(
                                    selected = instrument == defaultInstrument,
                                    onClick = null
                                )
                            },
                            onClick = {
                                onDefaultInstrumentChange(instrument)
                                isExpanded = false
                            },
                            modifier = Modifier.semantics {
                                contentDescription = "Default instrument: ${instrument.displayName}"
                                stateDescription = if (instrument == defaultInstrument) {
                                    "Selected"
                                } else {
                                    "Not selected"
                                }
                            }
                        )
                    }
                }

            Divider(modifier = Modifier.padding(vertical = 4.dp))
            DropdownMenuItem(
                text = { Text("Check for Updates") },
                onClick = onCheckForUpdates,
                modifier = Modifier.semantics { contentDescription = "Check for app updates" }
            )
            if (updateStatus.isNotEmpty()) {
                Text(
                    text = updateStatus,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (updateStatus.startsWith("No compatible") || updateStatus.startsWith("This device")) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

            Divider(modifier = Modifier.padding(vertical = 4.dp))
            Text(
                text = "Library",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )
            DropdownMenuItem(
                text = { Text("Download Full Library") },
                onClick = onDownloadCatalog,
                modifier = Modifier.semantics { contentDescription = "Download the full song library" }
            )
            if (catalogStatus.isNotEmpty()) {
                Text(
                    text = catalogStatus,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (catalogStatus.startsWith("Error:")) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

            Divider(modifier = Modifier.padding(vertical = 4.dp))
            Text(
                text = "Opens Google Play. Enrolled beta testers can see an available Update there.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )
            Text(
                text = "Version ${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
        }
    }
}

