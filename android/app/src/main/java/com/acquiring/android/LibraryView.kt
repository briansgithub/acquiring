package com.acquiring.android

import android.content.Context
import android.content.Intent
import android.content.ActivityNotFoundException
import android.graphics.Paint
import android.graphics.Typeface
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.ImeAction
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


internal const val LIBRARY_TITLE_SEARCH_TEST_TAG = "LibraryTitleSearch"

@OptIn(ExperimentalMaterial3Api::class)
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
    onSongClick: (SongBrowseRow) -> Unit
) {
    var searchScope by rememberSaveable { mutableStateOf(LibrarySearchScope.SONGS) }
    var searchFocused by remember { mutableStateOf(false) }
    var hooktheoryFocused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val showChrome = libraryChromeVisible(searchFocused)
    val activeQuery = if (searchScope == LibrarySearchScope.SONGS) searchQuery else searchArtistQuery
    val executeSearch = {
        if (searchScope == LibrarySearchScope.SONGS) {
            onSearchTitle()
        } else {
            onSearchArtist()
        }
    }
    BackHandler(enabled = searchFocused || hooktheoryFocused) {
        focusManager.clearFocus(force = true)
        if (searchFocused) onExitSearch()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures { focusManager.clearFocus(force = true) }
            }
    ) {
        if (showChrome) {
            PlaylistsSection(
                playlistDao = playlistDao,
                songDao = activeDb.songDao(),
                onSongClick = onSongClick
            )
            Text(
                text = "Search Library",
                style = MaterialTheme.typography.titleMedium
            )
        }
        
        OutlinedTextField(
            value = activeQuery,
            onValueChange = { raw ->
                val next = raw.replace("\n", "")
                if (searchScope == LibrarySearchScope.SONGS) {
                    onSearchQueryChange(next)
                } else {
                    onSearchArtistQueryChange(next)
                }
            },
            label = { Text("Search Library") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { executeSearch() }),
            modifier = Modifier
                .fillMaxWidth()
                .testTag(LIBRARY_TITLE_SEARCH_TEST_TAG)
                .onFocusChanged { focused ->
                    searchFocused = focused.isFocused
                    if (searchScope == LibrarySearchScope.SONGS) {
                        onSearchTitleFocusChanged(focused.isFocused)
                    } else {
                        onSearchArtistFocusChanged(focused.isFocused)
                    }
                },
            trailingIcon = {
                IconButton(
                    onClick = {
                        if (searchScope == LibrarySearchScope.SONGS) {
                            onExpandedChange(!isExpanded)
                        } else {
                            onArtistExpandedChange(!isArtistExpanded)
                        }
                    }
                ) {
                    ExposedDropdownMenuDefaults.TrailingIcon(
                        expanded = if (searchScope == LibrarySearchScope.SONGS) isExpanded else isArtistExpanded
                    )
                }
            },
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
        )
        if (searchScope == LibrarySearchScope.SONGS) {
            LibrarySongSuggestionPanel(
                isExpanded = isExpanded,
                isShowingRecent = isShowingRecent,
                searchQuery = searchQuery,
                suggestions = suggestions,
                onSuggestionClick = onSuggestionClick,
                onLoadMore = onLoadMoreTitle
            )
        } else {
            LibraryArtistSuggestionPanel(
                isExpanded = isArtistExpanded,
                isShowingRecentArtists = isShowingRecentArtists,
                searchArtistQuery = searchArtistQuery,
                artistSuggestions = artistSuggestions,
                onArtistClick = onArtistClick,
                onLoadMore = onLoadMoreArtist
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(
                selected = searchScope == LibrarySearchScope.SONGS,
                onClick = { searchScope = LibrarySearchScope.SONGS },
                label = { Text("Songs") },
                modifier = Modifier.testTag("LibrarySearchScopeSongs")
            )
            FilterChip(
                selected = searchScope == LibrarySearchScope.ARTISTS,
                onClick = { searchScope = LibrarySearchScope.ARTISTS },
                label = { Text("Artists") },
                modifier = Modifier.testTag("LibrarySearchScopeArtists")
            )
        }

        Button(
            onClick = executeSearch,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
        ) {
            Text("Search")
        }

        searchResult?.let {
            Text(
                text = it,
                modifier = Modifier.padding(top = 8.dp),
                color = if (it.startsWith("✅") || it.contains("Found")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
        }

        Divider(modifier = Modifier.padding(vertical = 12.dp))

        LazyColumn(modifier = Modifier.weight(1f)) {
            items(allSongs) { song ->
                Card(
                    onClick = { onSongClick(song) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                ) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        Text(text = song.displayTitle, style = MaterialTheme.typography.bodyLarge)
                        Text(text = song.displayArtist, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        if (showChrome) {
        Divider(modifier = Modifier.padding(vertical = 8.dp))

        LibraryHooktheorySection(
            urlToHarvest = urlToHarvest,
            onUrlChange = onUrlChange,
            harvestStatus = harvestStatus,
            onHarvest = onHarvest,
            onFocusChanged = { hooktheoryFocused = it }
        )

        Surface(
            onClick = onAllSongs,
            modifier = Modifier
                .fillMaxWidth()
                .semantics(mergeDescendants = true) {
                    contentDescription = "All Songs"
                    role = Role.Button
                }
        ) {
            Row(
                modifier = Modifier.padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "All Songs",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f)
                )
            }
        }
        }

    }
}
