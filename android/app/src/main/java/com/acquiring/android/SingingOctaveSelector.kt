package com.acquiring.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
internal fun SingingOctaveSelector(
    octaveOffset: Int,
    onOctaveOffsetChange: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val label = singingOctaveOffsetLabel(octaveOffset)
    Row(
        modifier = modifier
            .testTag(SINGING_OCTAVE_SHIFTER_TEST_TAG)
            .semantics { contentDescription = "Octave offset" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        TextButton(
            onClick = { onOctaveOffsetChange(clampSingingOctaveOffset(octaveOffset - 1)) },
            enabled = octaveOffset > OCTAVE_OFFSET_MIN,
            modifier = Modifier.semantics { contentDescription = "Lower singing octave" }
        ) {
            Text("−", style = MaterialTheme.typography.titleMedium)
        }
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .widthIn(min = 24.dp)
                .semantics {
                    contentDescription = "Octave offset"
                    stateDescription = label
                }
        )
        TextButton(
            onClick = { onOctaveOffsetChange(clampSingingOctaveOffset(octaveOffset + 1)) },
            enabled = octaveOffset < OCTAVE_OFFSET_MAX,
            modifier = Modifier.semantics { contentDescription = "Raise singing octave" }
        ) {
            Text("+", style = MaterialTheme.typography.titleMedium)
        }
    }
}
