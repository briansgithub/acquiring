package com.acquiring.android

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal fun List<SongBrowseRow>.inFavoritesOrder(): List<SongBrowseRow> =
    sortedWith(compareBy({ it.displayTitle.lowercase() }, { it.displayArtist.lowercase() }, { it.slug.lowercase() }))

@Composable
internal fun ColumnScope.FavoritesBox(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    val outline = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .border(1.dp, outline, RoundedCornerShape(12.dp))
            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
        content = content
    )
}

@Composable
internal fun PlaylistTitleRow(
    name: String,
    count: Long?,
    headerTag: String? = null,
    onPlay: ((Boolean) -> Unit)? = null,
    topPadding: Dp = 20.dp
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = topPadding, bottom = 4.dp)
            .then(if (headerTag != null) Modifier.testTag(headerTag) else Modifier),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f)
        )
        if (count != null) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (onPlay != null) {
            PlaylistPlayButtons(name = name, onPlay = onPlay)
        }
    }
}

@Composable
internal fun OtherPlaylistRow(
    summary: PlaylistSummary,
    expanded: Boolean,
    onToggle: () -> Unit,
    onPlay: ((Boolean) -> Unit)?
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clickable(onClick = onToggle)
                .padding(vertical = 8.dp)
                .semantics(mergeDescendants = true) {
                    contentDescription = if (expanded) {
                        "Collapse ${summary.name}"
                    } else {
                        "Expand ${summary.name}"
                    }
                    stateDescription = if (expanded) "Expanded" else "Collapsed"
                    role = Role.Button
                },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = summary.name,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = summary.songCount.toString(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Icon(
                imageVector = if (expanded) {
                    Icons.Filled.KeyboardArrowUp
                } else {
                    Icons.Filled.KeyboardArrowDown
                },
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (onPlay != null) {
            PlaylistPlayButtons(name = summary.name, onPlay = onPlay)
        }
    }
}

@Composable
private fun PlaylistPlayButtons(name: String, onPlay: (Boolean) -> Unit) {
    IconButton(onClick = { onPlay(false) }, modifier = Modifier.size(40.dp)) {
        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = "Play $name"
        )
    }
    IconButton(onClick = { onPlay(true) }, modifier = Modifier.size(40.dp)) {
        Icon(
            painter = painterResource(R.drawable.ic_shuffle),
            contentDescription = "Shuffle $name"
        )
    }
}

@Composable
internal fun ColumnScope.PlaylistSongBody(
    playlistName: String,
    playlistId: String,
    songs: List<SongBrowseRow>,
    isLoadingSongs: Boolean,
    loadError: String?,
    onSongClick: (SongBrowseRow) -> Unit,
    onRemove: (String) -> Unit
) {
    when {
        loadError != null -> Text(
            text = loadError,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
        )
        isLoadingSongs -> Box(
            modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(modifier = Modifier.size(28.dp))
        }
        songs.isEmpty() -> Text(
            text = "No songs yet. Tap the star on the Playback tab to add one.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
        )
        else -> LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
            items(songs, key = { song -> "$playlistId:${song.slug}" }) { song ->
                LibrarySongRow(
                    title = song.displayTitle,
                    subtitle = song.displayArtist,
                    onClick = { onSongClick(song) },
                    trailing = {
                        IconButton(
                            onClick = { onRemove(song.slug) },
                            modifier = Modifier.size(40.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Star,
                                contentDescription = "Remove ${song.displayTitle} from $playlistName",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                )
            }
        }
    }
}
