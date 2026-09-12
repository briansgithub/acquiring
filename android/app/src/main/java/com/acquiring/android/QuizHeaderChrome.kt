package com.acquiring.android

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal const val QUIZ_MONITOR_PITCH_TEST_TAG = "quiz.monitorPitch"
internal const val QUIZ_HELP_BUTTON_TEST_TAG = "quiz.help"
internal const val QUIZ_LOCK_IN_MAJOR_TEST_TAG = "quiz.lockInMajor"

@Composable
internal fun QuizScreenHeader(
    titleText: String?,
    onBack: () -> Unit,
    onTitleClick: () -> Unit,
    useRelativeIonianContext: Boolean,
    onLockInMajorChange: (Boolean) -> Unit,
    keyDisplay: QuizKeyDisplay?,
    isMonitoring: Boolean,
    onToggleMonitoring: () -> Unit,
    onShowHelp: () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .padding(horizontal = 8.dp)
        ) {
            TextButton(
                onClick = onBack,
                contentPadding = PaddingValues(horizontal = 8.dp),
                modifier = Modifier.align(Alignment.CenterStart).height(48.dp)
            ) { Text("< Back") }

            if (titleText != null) {
                Text(
                    text = titleText,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(horizontal = 56.dp)
                        .clickable { onTitleClick() }
                        .semantics { contentDescription = "Quiz title" }
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .padding(horizontal = 8.dp)
        ) {
            Row(
                modifier = Modifier
                    .align(Alignment.Center)
                    .offset(x = (-22).dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = { onLockInMajorChange(!useRelativeIonianContext) },
                    modifier = Modifier
                        .size(44.dp)
                        .testTag(QUIZ_LOCK_IN_MAJOR_TEST_TAG)
                        .semantics {
                            contentDescription = "Lock in Major"
                            stateDescription = if (useRelativeIonianContext) "On" else "Off"
                        }
                ) {
                    Icon(
                        imageVector = ImageVector.vectorResource(
                            if (useRelativeIonianContext) {
                                R.drawable.ic_lock
                            } else {
                                R.drawable.ic_lock_open
                            }
                        ),
                        contentDescription = null,
                        tint = if (useRelativeIonianContext) {
                            Color.Red
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.size(22.dp)
                    )
                }
                keyDisplay?.let { display ->
                    Text(
                        text = display.label,
                        textAlign = TextAlign.Center,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = display.color,
                        maxLines = 1,
                        modifier = if (display.isLockedToMajor) {
                            Modifier
                                .border(1.dp, Color.Red, RoundedCornerShape(4.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        } else {
                            Modifier
                        }
                    )
                }
            }
            Row(
                modifier = Modifier.align(Alignment.CenterEnd),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    onClick = onToggleMonitoring,
                    modifier = Modifier
                        .size(44.dp)
                        .testTag(QUIZ_MONITOR_PITCH_TEST_TAG)
                        .semantics {
                            contentDescription = "Pitch monitoring"
                            stateDescription = if (isMonitoring) "On" else "Off"
                        },
                    shape = RoundedCornerShape(8.dp),
                    color = if (isMonitoring) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        Color.Transparent
                    },
                    contentColor = if (isMonitoring) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    }
                ) {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(44.dp)) {
                        Icon(
                            imageVector = ImageVector.vectorResource(R.drawable.ic_mic),
                            contentDescription = null,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
                IconButton(
                    onClick = onShowHelp,
                    modifier = Modifier
                        .size(44.dp)
                        .testTag(QUIZ_HELP_BUTTON_TEST_TAG)
                        .semantics { contentDescription = "Quiz help" }
                ) {
                    Text("?", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}
