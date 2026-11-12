package com.acquiring.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp

internal const val LIBRARY_TITLE_SEARCH_TEST_TAG = "LibraryTitleSearch"
internal const val LIBRARY_SETTINGS_TEST_TAG = "LibrarySettings"

@Suppress("UNUSED_PARAMETER")
@Composable
fun LibraryView(
    activeDb: AppDatabase,
    playlistDao: PlaylistDao,
    urlToHarvest: String,
    onUrlChange: (String) -> Unit,
    harvestStatus: String,
    onHarvest: () -> Unit,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onSearchTitleFocusChanged: (Boolean) -> Unit,
    onExitSearch: () -> Unit,
    isExpanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    suggestions: List<SongBrowseRow>,
    isShowingRecent: Boolean,
    searchArtistQuery: String,
    onSearchArtistQueryChange: (String) -> Unit,
    onSearchArtistFocusChanged: (Boolean) -> Unit,
    isArtistExpanded: Boolean,
    onArtistExpandedChange: (Boolean) -> Unit,
    artistSuggestions: List<String>,
    isShowingRecentArtists: Boolean,
    onArtistClick: (String) -> Unit,
    onSearchArtist: () -> Unit,
    onSuggestionClick: (SongBrowseRow) -> Unit,
    onSearchTitle: () -> Unit,
    onLoadMoreTitle: () -> Unit,
    onLoadMoreArtist: () -> Unit,
    onAllSongs: () -> Unit,
    searchResult: String?,
    allSongs: List<SongBrowseRow>,
    onSongClick: (SongBrowseRow) -> Unit,
    onOpenSettings: () -> Unit,
    settingsUpdateAvailable: Boolean = false,
    onOpenAuralQuiz: () -> Unit = {},
    onPlayPlaylist: (String, Boolean) -> Unit = { _, _ -> },
    onShuffleExamples: (Int?) -> Unit = {}
) {
    var searchScope by rememberSaveable { mutableStateOf(LibrarySearchScope.SONGS) }
    var searchFocused by remember { mutableStateOf(false) }
    var hooktheoryFocused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val showChrome = libraryChromeVisible(searchFocused)
    val songsScope = searchScope == LibrarySearchScope.SONGS
    val activeQuery = if (songsScope) searchQuery else searchArtistQuery
    val executeSearch = { if (songsScope) onSearchTitle() else onSearchArtist() }
    BackHandler(enabled = searchFocused || hooktheoryFocused) {
        focusManager.clearFocus(force = true)
        if (searchFocused) onExitSearch()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp)
            .pointerInput(Unit) {
                detectTapGestures { focusManager.clearFocus(force = true) }
            }
    ) {
        LibraryTopBar(
            updateAvailable = settingsUpdateAvailable,
            onOpenSettings = onOpenSettings
        )
        LibrarySearchHeader(
            query = activeQuery,
            onQueryChange = { raw ->
                val next = raw.replace("\n", "")
                if (songsScope) onSearchQueryChange(next) else onSearchArtistQueryChange(next)
            },
            onFocusChanged = { focused ->
                searchFocused = focused
                if (songsScope) onSearchTitleFocusChanged(focused) else onSearchArtistFocusChanged(focused)
            },
            onSearch = executeSearch,
            scope = searchScope,
            onScopeChange = { searchScope = it }
        )
        if (showChrome) {
            LibraryAuralQuizRow(onClick = {
                focusManager.clearFocus(force = true)
                onOpenAuralQuiz()
            })
            LibraryExampleShuffleRow(onShuffle = {
                focusManager.clearFocus(force = true)
                onShuffleExamples(it)
            })
        }

        val suggestionsOpen = if (songsScope) isExpanded else isArtistExpanded
        when {
            !showChrome && suggestionsOpen && songsScope -> LibrarySongSuggestionPanel(
                isExpanded = true,
                isShowingRecent = isShowingRecent,
                searchQuery = searchQuery,
                suggestions = suggestions,
                onSuggestionClick = onSuggestionClick,
                onLoadMore = onLoadMoreTitle,
                modifier = Modifier.weight(1f)
            )
            !showChrome && suggestionsOpen -> LibraryArtistSuggestionPanel(
                isExpanded = true,
                isShowingRecentArtists = isShowingRecentArtists,
                searchArtistQuery = searchArtistQuery,
                artistSuggestions = artistSuggestions,
                onArtistClick = onArtistClick,
                onLoadMore = onLoadMoreArtist,
                modifier = Modifier.weight(1f)
            )
            !showChrome -> Spacer(modifier = Modifier.weight(1f))
            allSongs.isNotEmpty() -> {
                searchResult?.let { LibrarySearchCaption(it) }
                LibrarySongResultList(
                    songs = allSongs,
                    onSongClick = onSongClick,
                    modifier = Modifier.weight(1f)
                )
            }
            else -> {
                searchResult?.let { LibrarySearchCaption(it) }
                PlaylistsSection(
                    playlistDao = playlistDao,
                    songDao = activeDb.songDao(),
                    onSongClick = onSongClick,
                    onPlayPlaylist = onPlayPlaylist,
                    modifier = Modifier.weight(1f).fillMaxWidth()
                )
            }
        }

        if (showChrome) {
            LibraryAllSongsRow(onClick = onAllSongs)
            LibraryHooktheorySection(
                urlToHarvest = urlToHarvest,
                onUrlChange = onUrlChange,
                harvestStatus = harvestStatus,
                onHarvest = onHarvest,
                onFocusChanged = { hooktheoryFocused = it }
            )
        }
    }
}

@Composable
private fun LibraryTopBar(
    updateAvailable: Boolean,
    onOpenSettings: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(56.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Library",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.weight(1f).semantics { heading() }
        )
        IconButton(
            onClick = onOpenSettings,
            modifier = Modifier
                .testTag(LIBRARY_SETTINGS_TEST_TAG)
                .semantics {
                    contentDescription = "Open settings"
                    stateDescription = if (updateAvailable) "Update available" else "No update"
                }
        ) {
            Box {
                Icon(Icons.Default.Settings, contentDescription = null)
                if (updateAvailable) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(8.dp)
                            .background(Color(0xFFFF9800), CircleShape)
                    )
                }
            }
        }
    }
}
