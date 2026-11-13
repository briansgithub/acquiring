package com.acquiring.android

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LibraryExampleShuffleRow(onShuffle: (Int?) -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    var minimumPercent by rememberSaveable { mutableStateOf(80) }
    val cutoff = minimumPercent.takeIf { it in 0..100 }
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
                onClick = { onShuffle(cutoff) },
                modifier = Modifier
                    .testTag("ShuffleExampleSongs")
                    .semantics { contentDescription = "Shuffle example songs" }
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_shuffle),
                    contentDescription = null,
                    tint = colors.onSurface
                )
            }
            Text(
                text = "Shuffle Songs",
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = !expanded },
                modifier = Modifier.width(156.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = colors.background,
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                        .testTag("ExampleShuffleCutoff")
                        .semantics { contentDescription = "Minimum Popularity" }
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Minimum Popularity",
                            style = MaterialTheme.typography.labelSmall,
                            color = colors.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = if (cutoff == null) "Any" else "$cutoff%",
                            style = MaterialTheme.typography.labelLarge,
                            textAlign = TextAlign.Center
                        )
                    }
                }
                ExposedDropdownMenuWithScrollbar(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    (100 downTo 0).forEach { percent ->
                        DropdownMenuItem(
                            text = { Text("$percent%") },
                            onClick = {
                                minimumPercent = percent
                                expanded = false
                            },
                            modifier = Modifier.testTag("ExampleShufflePercent-$percent")
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Any") },
                        onClick = {
                            minimumPercent = -1
                            expanded = false
                        },
                        modifier = Modifier.testTag("ExampleShuffleAny")
                    )
                }
            }
        }
    }
}
