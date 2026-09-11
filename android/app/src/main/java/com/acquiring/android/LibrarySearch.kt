package com.acquiring.android

internal enum class LibrarySearchScope {
    SONGS,
    ARTISTS
}

internal fun libraryChromeVisible(searchFocused: Boolean): Boolean = !searchFocused
