package com.acquiring.android

internal enum class PracticeDestination {
    LIBRARY,
    SETTINGS,
    ARTIST,
    ALL_SONGS,
    QUIZ,
    SONG_DETAIL
}

internal enum class SongOrigin {
    LIBRARY,
    ARTIST,
    ALL_SONGS
}

internal fun practiceBack(
    current: PracticeDestination,
    songOrigin: SongOrigin
): PracticeDestination = when (current) {
    PracticeDestination.SETTINGS -> PracticeDestination.LIBRARY
    PracticeDestination.SONG_DETAIL -> PracticeDestination.QUIZ
    PracticeDestination.QUIZ -> when (songOrigin) {
        SongOrigin.ARTIST -> PracticeDestination.ARTIST
        SongOrigin.ALL_SONGS -> PracticeDestination.ALL_SONGS
        SongOrigin.LIBRARY -> PracticeDestination.LIBRARY
    }
    PracticeDestination.ARTIST, PracticeDestination.ALL_SONGS -> PracticeDestination.LIBRARY
    PracticeDestination.LIBRARY -> PracticeDestination.LIBRARY
}
