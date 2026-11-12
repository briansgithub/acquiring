package com.acquiring.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

internal const val PLAYLISTS_SECTION_TEST_TAG = "PlaylistsSection"
internal const val PLAYLISTS_SECTION_HEADER_TEST_TAG = "PlaylistsSectionHeader"

/**
 * Favorites is the library body. Other saved playlists stay as quiet rows
 * under that list so a generated queue is still reachable.
 */
@Composable
fun PlaylistsSection(
    playlistDao: PlaylistDao,
    songDao: SongDao,
    onSongClick: (SongBrowseRow) -> Unit,
    onPlayPlaylist: (String, Boolean) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier
) {
    var expandedPlaylistId by rememberSaveable(key = "expandedPlaylistIdFavoritesDefault") {
        mutableStateOf(PlaylistIds.FAVORITES)
    }
    var summaries by remember { mutableStateOf<List<PlaylistSummary>>(emptyList()) }
    var summariesLoaded by remember { mutableStateOf(false) }
    var songs by remember { mutableStateOf<List<SongBrowseRow>>(emptyList()) }
    var isLoadingSongs by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var revision by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(playlistDao, revision) {
        summaries = try {
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
        summariesLoaded = true
    }

    LaunchedEffect(playlistDao, songDao, expandedPlaylistId, revision) {
        songs = emptyList()
        isLoadingSongs = true
        loadError = null
        try {
            val slugs = playlistDao.getSlugsIn(expandedPlaylistId)
            songs = if (slugs.isEmpty()) {
                emptyList()
            } else {
                val bySlug = songDao.getBrowseSongsBySlugs(slugs).associateBy { it.slug }
                val loaded = slugs.mapNotNull(bySlug::get)
                if (expandedPlaylistId == PlaylistIds.FAVORITES) loaded.inFavoritesOrder() else loaded
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
        if (!summariesLoaded) {
            FavoritesBox(modifier = Modifier.weight(1f)) {
                PlaylistTitleRow(
                    name = PlaylistIds.FAVORITES_NAME,
                    count = null,
                    headerTag = PLAYLISTS_SECTION_HEADER_TEST_TAG,
                    topPadding = 8.dp
                )
                Box(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp))
                }
            }
        } else {
            val favorites = summaries.firstOrNull { it.id == PlaylistIds.FAVORITES }
            val others = summaries.filter { it.id != PlaylistIds.FAVORITES }
            val showingFavorites = expandedPlaylistId == PlaylistIds.FAVORITES
            FavoritesBox(modifier = if (showingFavorites) Modifier.weight(1f) else Modifier) {
                PlaylistTitleRow(
                    name = favorites?.name ?: PlaylistIds.FAVORITES_NAME,
                    count = favorites?.songCount,
                    headerTag = PLAYLISTS_SECTION_HEADER_TEST_TAG,
                    topPadding = 8.dp,
                    onPlay = favorites?.let { summary ->
                        if (summary.songCount > 0) {
                            { shuffle -> onPlayPlaylist(summary.id, shuffle) }
                        } else {
                            null
                        }
                    }
                )
                if (showingFavorites) {
                    PlaylistSongBody(
                        playlistName = favorites?.name ?: PlaylistIds.FAVORITES_NAME,
                        playlistId = PlaylistIds.FAVORITES,
                        songs = songs,
                        isLoadingSongs = isLoadingSongs,
                        loadError = loadError,
                        onSongClick = onSongClick,
                        onRemove = { slug ->
                            scope.launch {
                                playlistDao.removeEntry(PlaylistIds.FAVORITES, slug)
                                revision += 1
                            }
                        }
                    )
                }
            }
            others.forEach { summary ->
                val expanded = expandedPlaylistId == summary.id
                OtherPlaylistRow(
                    summary = summary,
                    expanded = expanded,
                    onToggle = {
                        expandedPlaylistId = if (expanded) PlaylistIds.FAVORITES else summary.id
                    },
                    onPlay = if (expanded && summary.songCount > 0) {
                        { shuffle -> onPlayPlaylist(summary.id, shuffle) }
                    } else {
                        null
                    }
                )
                if (expanded) {
                    PlaylistSongBody(
                        playlistName = summary.name,
                        playlistId = summary.id,
                        songs = songs,
                        isLoadingSongs = isLoadingSongs,
                        loadError = loadError,
                        onSongClick = onSongClick,
                        onRemove = { slug ->
                            scope.launch {
                                playlistDao.removeEntry(summary.id, slug)
                                revision += 1
                            }
                        }
                    )
                }
            }
            if (!showingFavorites && others.none { it.id == expandedPlaylistId }) {
                Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}
