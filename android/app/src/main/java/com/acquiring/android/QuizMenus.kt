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


internal class InertiaBoundaryReachedException : Exception()

private fun Modifier.dropdownScrollbar(
    scrollState: ScrollState,
    trackColor: Color,
    thumbColor: Color
): Modifier = drawWithContent {
    drawContent()
    val maxScroll = scrollState.maxValue
    if (maxScroll <= 0 || maxScroll == Int.MAX_VALUE || size.height <= 0f) {
        return@drawWithContent
    }

    val viewportHeight = size.height
    val contentHeight = viewportHeight + maxScroll
    val barWidth = 3.dp.toPx()
    val rightInset = 2.dp.toPx()
    val minimumThumbHeight = 24.dp.toPx()
    val thumbHeight = (viewportHeight * viewportHeight / contentHeight)
        .coerceIn(minimumThumbHeight.coerceAtMost(viewportHeight), viewportHeight)
    val thumbTravel = viewportHeight - thumbHeight
    val thumbOffset = thumbTravel * (scrollState.value.toFloat() / maxScroll.toFloat())
    val barX = size.width - rightInset - barWidth
    val cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f)

    drawRoundRect(
        color = trackColor,
        topLeft = Offset(barX, 0f),
        size = Size(barWidth, viewportHeight),
        cornerRadius = cornerRadius
    )
    drawRoundRect(
        color = thumbColor,
        topLeft = Offset(barX, thumbOffset),
        size = Size(barWidth, thumbHeight),
        cornerRadius = cornerRadius
    )
}

/** Row height for the transpose menu's single-number entries. */
private val QUIZ_TRANSPOSE_ITEM_HEIGHT = 32.dp
internal const val QUIZ_INSTRUMENT_BUTTON_TEST_TAG = "QuizInstrumentButton"
internal const val QUIZ_TRANSPOSE_BUTTON_TEST_TAG = "QuizTransposeButton"
internal val QUIZ_TRANSPOSE_RANGE = -12..12

@Composable
internal fun QuizInstrumentMenu(
    selectedInstrument: AudioEngine.Waveform,
    onInstrumentSelected: (AudioEngine.Waveform) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val selectedLabel = selectedInstrument.displayName

    Box(modifier) {
        FilledTonalIconButton(
            onClick = { expanded = true },
            modifier = Modifier
                .size(56.dp)
                .testTag(QUIZ_INSTRUMENT_BUTTON_TEST_TAG)
                .semantics {
                    contentDescription = "Instrument"
                    stateDescription = selectedLabel
                }
        ) {
            Icon(
                imageVector = ImageVector.vectorResource(R.drawable.ic_piano),
                contentDescription = null,
                modifier = Modifier.size(28.dp)
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.width(220.dp)
        ) {
            AudioEngine.Waveform.entries.groupBy(AudioEngine.Waveform::categoryName)
                .forEach { (category, instruments) ->
                    Text(
                        text = category,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                            .semantics { heading() }
                    )
                    instruments.forEach { instrument ->
                        DropdownMenuItem(
                            text = { Text(instrument.displayName, maxLines = 1) },
                            leadingIcon = {
                                RadioButton(
                                    selected = instrument == selectedInstrument,
                                    onClick = null
                                )
                            },
                            onClick = {
                                onInstrumentSelected(instrument)
                                expanded = false
                            },
                            modifier = Modifier.testTag("QuizInstrument-${instrument.name}")
                        )
                    }
                }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun QuizTransposeMenu(
    transpose: Int,
    onTransposeSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val transposeText = if (transpose > 0) "+$transpose" else "$transpose"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
        modifier = modifier.width(108.dp)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .menuAnchor()
                .testTag(QUIZ_TRANSPOSE_BUTTON_TEST_TAG)
                .semantics {
                    contentDescription = "Transpose"
                    stateDescription = transposeText
                    role = Role.Button
                },
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            tonalElevation = 1.dp
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("Transpose", style = MaterialTheme.typography.labelSmall, maxLines = 1)
                Text(transposeText, fontWeight = FontWeight.Bold)
            }
        }
        ExposedDropdownMenuWithScrollbar(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            centerScrollOnExpand = true
        ) {
            QUIZ_TRANSPOSE_RANGE.forEach { option ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = if (option > 0) "+$option" else "$option",
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center
                        )
                    },
                    onClick = {
                        // 0 is the written key; tapping it always resets transpose.
                        onTransposeSelected(option)
                        expanded = false
                    },
                    modifier = Modifier
                        .height(QUIZ_TRANSPOSE_ITEM_HEIGHT)
                        .testTag("QuizTranspose-$option"),
                    contentPadding = PaddingValues(horizontal = 8.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ExposedDropdownMenuBoxScope.ExposedDropdownMenuWithScrollbar(
    expanded: Boolean,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    onLoadMore: (() -> Unit)? = null,
    centerScrollOnExpand: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    val scrollState = rememberScrollState()

    // Opening a symmetric range (say -12..+12) at the top buries the identity
    // value. Half of maxValue centres the middle item whatever the item height
    // and menu height work out to be.
    if (centerScrollOnExpand) {
        LaunchedEffect(expanded, scrollState.maxValue) {
            if (expanded && scrollState.maxValue > 0) {
                scrollState.scrollTo(scrollState.maxValue / 2)
            }
        }
    }

    if (onLoadMore != null) {
        LaunchedEffect(scrollState.value, scrollState.maxValue) {
            if (scrollState.maxValue > 0 && scrollState.value >= scrollState.maxValue - 100) {
                onLoadMore()
            }
        }
    }

    val maximumMenuHeight = (
        androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * 0.45f
    ).dp.coerceIn(200.dp, 400.dp)
    ExposedDropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismissRequest,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = maximumMenuHeight)
                .dropdownScrollbar(
                    scrollState = scrollState,
                    trackColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.18f),
                    thumbColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f)
                )
                .verticalScroll(scrollState)
        ) {
            content()
        }
    }
}
