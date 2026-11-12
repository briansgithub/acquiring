package com.acquiring.android

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (!isExpanded) return
    LibrarySuggestionScroller(onLoadMore = onLoadMore, modifier = modifier) {
        if (isShowingRecent) {
            SuggestionHeading("Recent")
        } else if (suggestions.isEmpty() && searchQuery.isNotEmpty()) {
            SuggestionMessage("No results found for '$searchQuery'")
        }
        suggestions.forEach { song ->
            LibrarySongRow(
                title = song.displayTitle,
                subtitle = song.displayArtist,
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
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (!isExpanded) return
    LibrarySuggestionScroller(onLoadMore = onLoadMore, modifier = modifier) {
        if (isShowingRecentArtists) {
            SuggestionHeading("Recent")
        } else if (artistSuggestions.isEmpty() && searchArtistQuery.isNotEmpty()) {
            SuggestionMessage("No artists matching '$searchArtistQuery'")
        }
        artistSuggestions.forEach { artistName ->
            LibrarySongRow(
                title = CatalogDisplayName.artist(artistName),
                subtitle = null,
                onClick = { onArtistClick(artistName) }
            )
        }
    }
}

@Composable
private fun SuggestionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)
    )
}

@Composable
private fun SuggestionMessage(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 12.dp)
    )
}

@Composable
private fun LibrarySuggestionScroller(
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    val scrollState = rememberScrollState()
    LaunchedEffect(scrollState.value, scrollState.maxValue) {
        if (scrollState.maxValue > 0 && scrollState.value >= scrollState.maxValue - 100) {
            onLoadMore()
        }
    }
    Column(
        modifier = modifier.fillMaxWidth().verticalScroll(scrollState),
        content = content
    )
}
