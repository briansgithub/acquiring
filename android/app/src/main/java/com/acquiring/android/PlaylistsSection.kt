package com.acquiring.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

internal const val PLAYLISTS_SECTION_TEST_TAG = "PlaylistsSection"
internal const val PLAYLISTS_SECTION_HEADER_TEST_TAG = "PlaylistsSectionHeader"

/** Keeps a long playlist from pushing the search results off the screen. */
private val PLAYLIST_SONGS_MAX_HEIGHT = 280.dp

/**
 * The Playlists accordion on the search screen.
 *
 * Self-contained the way [AllSongsView] is: it owns its expansion state and
 * runs its own queries, so LibraryView's parameter list only grows by what
 * this cannot supply itself.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistsSection(
    playlistDao: PlaylistDao,
    songDao: SongDao,
    onSongClick: (SongBrowseRow) -> Unit,
    modifier: Modifier = Modifier
) {
    var isSectionExpanded by rememberSaveable { mutableStateOf(false) }
    var expandedPlaylistId by rememberSaveable { mutableStateOf<String?>(null) }
    var summaries by remember { mutableStateOf<List<PlaylistSummary>>(emptyList()) }
    var songs by remember { mutableStateOf<List<SongBrowseRow>>(emptyList()) }
    var isLoadingSongs by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    // Bumped after a write so the effects below re-read what changed.
    var revision by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(playlistDao, isSectionExpanded, revision) {
        if (!isSectionExpanded) return@LaunchedEffect
        summaries = try {
            // Favorites should be listed before anything has ever been starred.
            playlistDao.ensureBuiltInPlaylist(
                id = PlaylistIds.FAVORITES,
                name = PlaylistIds.FAVORITES_NAME,
                createdAt = System.currentTimeMillis()
            )
            playlistDao.getPlaylistSummaries()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            emptyList()
        }
    }

    LaunchedEffect(playlistDao, songDao, expandedPlaylistId, revision) {
        val playlistId = expandedPlaylistId
        if (playlistId == null) {
            songs = emptyList()
            isLoadingSongs = false
            loadError = null
            return@LaunchedEffect
        }
        isLoadingSongs = true
        loadError = null
        try {
            val slugs = playlistDao.getSlugsIn(playlistId)
            // Room cannot join across databases, so hydrate the way the
            // recent-selections list already does: fetch the rows, then restore
            // the playlist's own order. A slug the current catalog no longer
            // carries returns no row and drops out until the catalog has it.
            songs = if (slugs.isEmpty()) {
                emptyList()
            } else {
                val bySlug = songDao.getBrowseSongsBySlugs(slugs).associateBy { it.slug }
                slugs.mapNotNull(bySlug::get)
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            loadError = error.message ?: "Unable to load this playlist"
            songs = emptyList()
        } finally {
            isLoadingSongs = false
        }
    }

    Column(modifier = modifier.fillMaxWidth().testTag(PLAYLISTS_SECTION_TEST_TAG)) {
        Surface(
            onClick = {
                isSectionExpanded = !isSectionExpanded
                if (!isSectionExpanded) expandedPlaylistId = null
            },
            modifier = Modifier
                .fillMaxWidth()
                .testTag(PLAYLISTS_SECTION_HEADER_TEST_TAG)
                .semantics(mergeDescendants = true) {
                    contentDescription =
                        if (isSectionExpanded) "Collapse Playlists" else "Expand Playlists"
                    stateDescription = if (isSectionExpanded) "Expanded" else "Collapsed"
                    role = Role.Button
                }
        ) {
            Row(
                modifier = Modifier.padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Playlists",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    imageVector = if (isSectionExpanded) {
                        Icons.Default.KeyboardArrowUp
                    } else {
                        Icons.Default.KeyboardArrowDown
                    },
                    contentDescription = null
                )
            }
        }

        if (isSectionExpanded) {
            Column(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                summaries.forEach { summary ->
                    val isPlaylistExpanded = expandedPlaylistId == summary.id
                    Surface(
                        onClick = {
                            expandedPlaylistId = AllSongsGrouping.toggledExpandedGroup(
                                currentGroup = expandedPlaylistId,
                                selectedGroup = summary.id
                            )
                        },
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics(mergeDescendants = true) {
                                contentDescription = if (isPlaylistExpanded) {
                                    "Collapse ${summary.name}"
                                } else {
                                    "Expand ${summary.name}"
                                }
                                stateDescription =
                                    if (isPlaylistExpanded) "Expanded" else "Collapsed"
                                role = Role.Button
                            }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp, horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = summary.name,
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = summary.songCount.toString(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Icon(
                                imageVector = if (isPlaylistExpanded) {
                                    Icons.Default.KeyboardArrowUp
                                } else {
                                    Icons.Default.KeyboardArrowDown
                                },
                                contentDescription = null
                            )
                        }
                    }

                    if (isPlaylistExpanded) {
                        when {
                            loadError != null -> Text(
                                text = loadError ?: "Unable to load this playlist",
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.fillMaxWidth().padding(12.dp)
                            )

                            isLoadingSongs -> Row(
                                modifier = Modifier.fillMaxWidth().padding(20.dp),
                                horizontalArrangement = Arrangement.Center
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(28.dp))
                            }

                            songs.isEmpty() -> Text(
                                text = "No songs yet. Tap the star on the Quiz tab to add one.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.fillMaxWidth().padding(12.dp)
                            )

                            else -> LazyColumn(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = PLAYLIST_SONGS_MAX_HEIGHT)
                            ) {
                                items(
                                    items = songs,
                                    key = { song -> "${summary.id}:${song.slug}" }
                                ) { song ->
                                    Card(
                                        onClick = { onSongClick(song) },
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp, horizontal = 8.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = song.title ?: "Unknown Title",
                                                    style = MaterialTheme.typography.bodyLarge
                                                )
                                                Text(
                                                    text = song.artist ?: "Unknown Artist",
                                                    style = MaterialTheme.typography.bodyMedium
                                                )
                                            }
                                            IconButton(
                                                onClick = {
                                                    scope.launch {
                                                        playlistDao.removeEntry(
                                                            summary.id,
                                                            song.slug
                                                        )
                                                        revision += 1
                                                    }
                                                },
                                                modifier = Modifier.size(36.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Filled.Star,
                                                    contentDescription = "Remove " +
                                                        (song.title ?: song.slug) +
                                                        " from ${summary.name}",
                                                    tint = MaterialTheme.colorScheme.primary,
                                                    modifier = Modifier.size(20.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
