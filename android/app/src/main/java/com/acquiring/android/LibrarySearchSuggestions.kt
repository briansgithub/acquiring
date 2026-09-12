package com.acquiring.android

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
internal fun LibrarySongSuggestionPanel(
    isExpanded: Boolean,
    isShowingRecent: Boolean,
    searchQuery: String,
    suggestions: List<SongBrowseRow>,
    onSuggestionClick: (SongBrowseRow) -> Unit,
    onLoadMore: () -> Unit
) {
    if (!isExpanded) return
    LibrarySuggestionScroller(onLoadMore = onLoadMore) {
        if (isShowingRecent) {
            DropdownMenuItem(
                text = {
                    Text(
                        "Recent Selections",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                },
                onClick = {},
                enabled = false
            )
        } else if (suggestions.isEmpty() && searchQuery.isNotEmpty()) {
            DropdownMenuItem(
                text = {
                    Text(
                        "No results found for '$searchQuery'",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary
                    )
                },
                onClick = {},
                enabled = false
            )
        }
        suggestions.forEach { song ->
            DropdownMenuItem(
                text = {
                    Column {
                        Text(text = song.displayTitle, style = MaterialTheme.typography.bodyLarge)
                        Text(text = song.displayArtist, style = MaterialTheme.typography.bodySmall)
                    }
                },
                onClick = { onSuggestionClick(song) }
            )
        }
    }
}

@Composable
internal fun LibraryArtistSuggestionPanel(
    isExpanded: Boolean,
    isShowingRecentArtists: Boolean,
    searchArtistQuery: String,
    artistSuggestions: List<String>,
    onArtistClick: (String) -> Unit,
    onLoadMore: () -> Unit
) {
    if (!isExpanded) return
    LibrarySuggestionScroller(onLoadMore = onLoadMore) {
        if (isShowingRecentArtists) {
            DropdownMenuItem(
                text = {
                    Text(
                        "Recent Artists",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                },
                onClick = {},
                enabled = false
            )
        } else if (artistSuggestions.isEmpty() && searchArtistQuery.isNotEmpty()) {
            DropdownMenuItem(
                text = {
                    Text(
                        "No artists matching '$searchArtistQuery'",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary
                    )
                },
                onClick = {},
                enabled = false
            )
        }
        artistSuggestions.forEach { artistName ->
            DropdownMenuItem(
                text = {
                    Text(
                        text = CatalogDisplayName.artist(artistName),
                        style = MaterialTheme.typography.bodyLarge
                    )
                },
                onClick = { onArtistClick(artistName) }
            )
        }
    }
}

@Composable
private fun LibrarySuggestionScroller(
    onLoadMore: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    val scrollState = rememberScrollState()
    LaunchedEffect(scrollState.value, scrollState.maxValue) {
        if (scrollState.maxValue > 0 && scrollState.value >= scrollState.maxValue - 100) {
            onLoadMore()
        }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 400.dp)
            .verticalScroll(scrollState)
    ) {
        content()
    }
}
