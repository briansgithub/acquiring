package com.acquiring.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LibraryExampleShuffleRow(onShuffle: (Int?) -> Unit) {
    var any by rememberSaveable { mutableStateOf(false) }
    var digits by rememberSaveable { mutableStateOf("80") }
    val cutoff = digits.toIntOrNull()?.takeIf { it in 0..100 }
    val ready = any || cutoff != null
    val colors = MaterialTheme.colorScheme
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = colors.surfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .testTag("ExampleShuffleRow")
    ) {
        Row(
            modifier = Modifier.padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = { onShuffle(if (any) null else cutoff) },
                enabled = ready,
                modifier = Modifier
                    .testTag("ShuffleExampleSongs")
                    .semantics { contentDescription = "Shuffle example songs" }
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_shuffle),
                    contentDescription = null,
                    tint = if (ready) colors.onSurface else colors.onSurface.copy(alpha = 0.38f)
                )
            }
            Text(
                text = "Shuffle",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "Popularity",
                style = MaterialTheme.typography.labelLarge,
                color = colors.onSurfaceVariant,
                modifier = Modifier.padding(end = 8.dp)
            )
            FilterChip(
                selected = any,
                onClick = { any = !any },
                label = { Text("Any") },
                modifier = Modifier.testTag("ExampleShuffleAny")
            )
            Row(
                modifier = Modifier
                    .padding(start = 8.dp)
                    .height(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.background)
                    .padding(horizontal = 8.dp)
                    .semantics { contentDescription = "Minimum popularity" },
                verticalAlignment = Alignment.CenterVertically
            ) {
                BasicTextField(
                    value = digits,
                    onValueChange = { raw ->
                        val next = raw.filter { it.isDigit() }.take(3)
                        val parsed = next.toIntOrNull()
                        digits = next
                        if (parsed != null && parsed in 0..100) any = false
                    },
                    enabled = !any,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        textAlign = TextAlign.Center,
                        color = if (any) colors.onSurface.copy(alpha = 0.38f) else colors.onSurface
                    ),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier
                        .width(36.dp)
                        .testTag("ExampleShuffleCutoff"),
                    decorationBox = { inner ->
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { inner() }
                    }
                )
                Text(
                    text = "%",
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (any) colors.onSurface.copy(alpha = 0.38f) else colors.onSurface
                )
            }
        }
    }
}
