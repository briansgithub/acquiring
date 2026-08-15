package com.inquiring.android

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * Lightweight in-memory page state that stays alive while a song detail page is
 * open. Keeping the expanded rows and list position avoids snapping a deep list
 * back to its heading while the same group is reloaded on return.
 */
@Stable
class AllSongsRuntimeState internal constructor(
    val listState: LazyListState
) {
    var groupCounts by mutableStateOf<Map<String, Long>>(emptyMap())
        internal set
    var visibleSongs by mutableStateOf<List<SongBrowseRow>>(emptyList())
        internal set
    var isLoadingSongs by mutableStateOf(false)
        internal set
    var loadError by mutableStateOf<String?>(null)
        internal set
    var metadataStatus by mutableStateOf<SongBrowseMetadataStatus?>(null)
        internal set
    internal var loadedSortMode: AllSongsSortMode? = null
    internal var loadedGroupKey: String? = null
    internal var loadedFilterText: String? = null
    private var loadGeneration: Long = 0L

    internal fun invalidateLoadRequests() {
        loadGeneration += 1L
    }

    internal fun beginLoadRequest(): Long {
        invalidateLoadRequests()
        return loadGeneration
    }

    internal fun isCurrentLoadRequest(generation: Long): Boolean =
        generation == loadGeneration

    internal fun clearLoadedGroup() {
        invalidateLoadRequests()
        visibleSongs = emptyList()
        isLoadingSongs = false
        loadError = null
        loadedSortMode = null
        loadedGroupKey = null
        loadedFilterText = null
    }

    fun reset() {
        groupCounts = emptyMap()
        clearLoadedGroup()
    }
}

@Composable
fun rememberAllSongsRuntimeState(): AllSongsRuntimeState {
    val listState = rememberLazyListState()
    return remember(listState) { AllSongsRuntimeState(listState) }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun AllSongsView(
    songDao: SongDao,
    runtimeState: AllSongsRuntimeState,
    onSongClick: (SongBrowseRow) -> Unit,
    onBack: () -> Unit
) {
    var sortModeName by rememberSaveable {
        mutableStateOf(AllSongsSortMode.ALPHABETICAL.name)
    }
    val sortMode = remember(sortModeName) { AllSongsSortMode.valueOf(sortModeName) }
    var isSortMenuExpanded by remember { mutableStateOf(false) }
    var expandedGroupKey by rememberSaveable { mutableStateOf<String?>(null) }
    var filterText by rememberSaveable { mutableStateOf("") }
    var appliedFilterText by rememberSaveable { mutableStateOf("") }
    var scrollAnchorSortModeName by rememberSaveable { mutableStateOf<String?>(null) }
    var scrollAnchorGroupKey by rememberSaveable { mutableStateOf<String?>(null) }
    var scrollAnchorFilterText by rememberSaveable { mutableStateOf<String?>(null) }
    var savedScrollIndex by rememberSaveable { mutableStateOf(0) }
    var savedScrollOffset by rememberSaveable { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    val groups = remember(sortMode) { AllSongsGrouping.groupsFor(sortMode) }

    LaunchedEffect(filterText) {
        delay(250)
        appliedFilterText = filterText.trim()
    }

    LaunchedEffect(runtimeState.listState, sortMode, expandedGroupKey, appliedFilterText) {
        snapshotFlow {
            runtimeState.listState.firstVisibleItemIndex to
                runtimeState.listState.firstVisibleItemScrollOffset
        }.collect { (index, offset) ->
            val canSaveCurrentPosition = expandedGroupKey == null ||
                (
                    !runtimeState.isLoadingSongs &&
                        runtimeState.loadedSortMode == sortMode &&
                        runtimeState.loadedGroupKey == expandedGroupKey &&
                        runtimeState.loadedFilterText == appliedFilterText
                    )
            if (canSaveCurrentPosition) {
                scrollAnchorSortModeName = sortMode.name
                scrollAnchorGroupKey = expandedGroupKey
                scrollAnchorFilterText = appliedFilterText
                savedScrollIndex = index
                savedScrollOffset = offset
            }
        }
    }

    LaunchedEffect(
        sortMode,
        expandedGroupKey,
        runtimeState.loadedSortMode,
        runtimeState.loadedGroupKey,
        runtimeState.loadedFilterText,
        runtimeState.visibleSongs.size
    ) {
        val shouldRestorePosition = expandedGroupKey != null &&
            runtimeState.loadedSortMode == sortMode &&
            runtimeState.loadedGroupKey == expandedGroupKey &&
            runtimeState.loadedFilterText == appliedFilterText &&
            scrollAnchorSortModeName == sortMode.name &&
            scrollAnchorGroupKey == expandedGroupKey &&
            scrollAnchorFilterText == appliedFilterText
        if (shouldRestorePosition) {
            val groupContentItems = maxOf(runtimeState.visibleSongs.size, 1)
            val lastItemIndex = (groups.size + groupContentItems - 1).coerceAtLeast(0)
            runtimeState.listState.scrollToItem(
                index = savedScrollIndex.coerceIn(0, lastItemIndex),
                scrollOffset = savedScrollOffset
            )
        }
    }

    LaunchedEffect(songDao) {
        runtimeState.metadataStatus = try {
            songDao.getBrowseMetadataStatus()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            null
        }
    }

    LaunchedEffect(songDao, sortMode, appliedFilterText) {
        runtimeState.groupCounts = try {
            val counts = when (sortMode) {
                AllSongsSortMode.ALPHABETICAL ->
                    songDao.getAlphabeticalGroupCounts(appliedFilterText)
                AllSongsSortMode.COMPLEXITY ->
                    songDao.getComplexityGroupCounts(appliedFilterText)
                AllSongsSortMode.MODE -> songDao.getModeGroupCounts(appliedFilterText)
            }
            counts.associate { it.groupKey to it.songCount }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            emptyMap()
        }
    }

    LaunchedEffect(songDao, sortMode, expandedGroupKey, appliedFilterText) {
        val requestedGroup = expandedGroupKey
        if (requestedGroup == null) {
            runtimeState.invalidateLoadRequests()
            runtimeState.isLoadingSongs = false
            runtimeState.loadError = null
            return@LaunchedEffect
        }

        val isCachedGroup = runtimeState.loadedSortMode == sortMode &&
            runtimeState.loadedGroupKey == requestedGroup &&
            runtimeState.loadedFilterText == appliedFilterText
        if (!isCachedGroup) {
            runtimeState.clearLoadedGroup()
            runtimeState.isLoadingSongs = true
        }
        val loadGeneration = runtimeState.beginLoadRequest()
        runtimeState.loadError = null
        try {
            val result = when (sortMode) {
                AllSongsSortMode.ALPHABETICAL ->
                    songDao.getSongsInAlphabeticalGroup(requestedGroup, appliedFilterText)

                AllSongsSortMode.COMPLEXITY ->
                    if (requestedGroup == AllSongsGrouping.UNRATED_KEY) {
                        songDao.getUnratedSongs(appliedFilterText)
                    } else {
                        songDao.getSongsInComplexityGroup(
                            requestedGroup.toInt(),
                            appliedFilterText
                        )
                    }

                AllSongsSortMode.MODE ->
                    songDao.getSongsInMode(requestedGroup, appliedFilterText)
            }
            if (runtimeState.isCurrentLoadRequest(loadGeneration)) {
                runtimeState.visibleSongs = result
                runtimeState.loadedSortMode = sortMode
                runtimeState.loadedGroupKey = requestedGroup
                runtimeState.loadedFilterText = appliedFilterText
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            if (runtimeState.isCurrentLoadRequest(loadGeneration)) {
                runtimeState.loadError = error.message ?: "Unable to load this group"
            }
        } finally {
            if (runtimeState.isCurrentLoadRequest(loadGeneration)) {
                runtimeState.isLoadingSongs = false
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
        ) {
            TextButton(onClick = onBack) { Text("< Back") }
            Text(
                text = "All Songs",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 8.dp)
            )
        }

        ExposedDropdownMenuBox(
            expanded = isSortMenuExpanded,
            onExpandedChange = { isSortMenuExpanded = !isSortMenuExpanded },
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
        ) {
            OutlinedTextField(
                value = sortMode.displayName,
                onValueChange = {},
                readOnly = true,
                label = { Text("Sort by") },
                trailingIcon = {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = isSortMenuExpanded)
                },
                modifier = Modifier.fillMaxWidth().menuAnchor()
            )
            ExposedDropdownMenu(
                expanded = isSortMenuExpanded,
                onDismissRequest = { isSortMenuExpanded = false }
            ) {
                AllSongsSortMode.entries.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option.displayName) },
                        onClick = {
                            if (sortModeName != option.name) {
                                sortModeName = option.name
                                expandedGroupKey = null
                                scrollAnchorSortModeName = null
                                scrollAnchorGroupKey = null
                                scrollAnchorFilterText = null
                                savedScrollIndex = 0
                                savedScrollOffset = 0
                                runtimeState.reset()
                                scope.launch { runtimeState.listState.scrollToItem(0) }
                            }
                            isSortMenuExpanded = false
                        }
                    )
                }
            }
        }

        OutlinedTextField(
            value = filterText,
            onValueChange = { newFilterText ->
                if (newFilterText != filterText) {
                    filterText = newFilterText
                    scrollAnchorSortModeName = null
                    scrollAnchorGroupKey = null
                    scrollAnchorFilterText = null
                    val headingIndex = groups.indexOfFirst { it.key == expandedGroupKey }
                        .coerceAtLeast(0)
                    scope.launch { runtimeState.listState.scrollToItem(headingIndex) }
                }
            },
            label = { Text("Filter songs") },
            placeholder = { Text("Title or artist") },
            singleLine = true,
            trailingIcon = if (filterText.isNotEmpty()) {
                {
                    IconButton(
                        onClick = {
                            filterText = ""
                            scrollAnchorSortModeName = null
                            scrollAnchorGroupKey = null
                            scrollAnchorFilterText = null
                            val headingIndex = groups.indexOfFirst {
                                it.key == expandedGroupKey
                            }.coerceAtLeast(0)
                            scope.launch {
                                runtimeState.listState.scrollToItem(headingIndex)
                            }
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear song filter"
                        )
                    }
                }
            } else {
                null
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp)
                .testTag("AllSongsFilter")
        )

        val metadataStatus = runtimeState.metadataStatus
        val missingMetadataMessage = when {
            metadataStatus == null || metadataStatus.browseCount == 0L -> null
            sortMode == AllSongsSortMode.COMPLEXITY && metadataStatus.ratedSongCount == 0L ->
                "Complexity data requires the latest song catalog. Return to Library to update it."
            sortMode == AllSongsSortMode.MODE && metadataStatus.modeMembershipCount == 0L ->
                "Mode data requires the latest song catalog. Return to Library to update it."
            else -> null
        }
        missingMetadataMessage?.let { message ->
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
            ) {
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }

        key(sortMode, expandedGroupKey) {
            LazyColumn(
                state = runtimeState.listState,
                modifier = Modifier.fillMaxSize()
            ) {
                groups.forEach { group ->
                    val isExpanded = expandedGroupKey == group.key
                    val hasLoadedThisGroup = runtimeState.loadedSortMode == sortMode &&
                        runtimeState.loadedGroupKey == group.key &&
                        runtimeState.loadedFilterText == appliedFilterText
                    stickyHeader(key = "${sortMode.name}:heading:${group.key}") {
                    Surface(
                        onClick = {
                            val nextGroup = AllSongsGrouping.toggledExpandedGroup(
                                currentGroup = expandedGroupKey,
                                selectedGroup = group.key
                            )
                            runtimeState.invalidateLoadRequests()
                            val hasCachedGroup = nextGroup != null &&
                                runtimeState.loadedSortMode == sortMode &&
                                runtimeState.loadedGroupKey == nextGroup &&
                                runtimeState.loadedFilterText == appliedFilterText
                            if (nextGroup != null && !hasCachedGroup) {
                                scrollAnchorSortModeName = null
                                scrollAnchorGroupKey = null
                                scrollAnchorFilterText = null
                                runtimeState.clearLoadedGroup()
                            }
                            expandedGroupKey = nextGroup
                            runtimeState.loadError = null
                            runtimeState.isLoadingSongs = nextGroup != null && !hasCachedGroup
                        },
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics(mergeDescendants = true) {
                                contentDescription = if (isExpanded) {
                                    "Collapse ${group.label}"
                                } else {
                                    "Expand ${group.label}"
                                }
                                stateDescription = if (isExpanded) "Expanded" else "Collapsed"
                                role = Role.Button
                            }
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp, horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = group.label,
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.weight(1f)
                            )
                            runtimeState.groupCounts[group.key]?.let { count ->
                                Text(
                                    text = count.toString(),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Icon(
                                imageVector = if (isExpanded) {
                                    Icons.Default.KeyboardArrowUp
                                } else {
                                    Icons.Default.KeyboardArrowDown
                                },
                                contentDescription = null
                            )
                        }
                    }
                }

                if (isExpanded && runtimeState.loadError != null) {
                    item(key = "${sortMode.name}:error:${group.key}") {
                        Text(
                            text = runtimeState.loadError ?: "Unable to load this group",
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.fillMaxWidth().padding(12.dp)
                        )
                    }
                } else if (
                    isExpanded && (runtimeState.isLoadingSongs || !hasLoadedThisGroup)
                ) {
                    item(key = "${sortMode.name}:loading:${group.key}") {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(20.dp),
                            horizontalArrangement = Arrangement.Center
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(28.dp))
                        }
                    }
                } else if (isExpanded && runtimeState.visibleSongs.isEmpty()) {
                    item(key = "${sortMode.name}:empty:${group.key}") {
                        Text(
                            text = if (appliedFilterText.isBlank()) {
                                "No songs in this group"
                            } else {
                                "No songs match this filter"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(12.dp)
                        )
                    }
                } else if (isExpanded) {
                    items(
                        items = runtimeState.visibleSongs,
                        key = { song -> "${sortMode.name}:${group.key}:${song.slug}" }
                    ) { song ->
                        Card(
                            onClick = { onSongClick(song) },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp, horizontal = 8.dp)
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(
                                    text = song.title ?: "Unknown Title",
                                    style = MaterialTheme.typography.bodyLarge
                                )
                                Text(
                                    text = song.artist ?: "Unknown Artist",
                                    style = MaterialTheme.typography.bodyMedium
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
