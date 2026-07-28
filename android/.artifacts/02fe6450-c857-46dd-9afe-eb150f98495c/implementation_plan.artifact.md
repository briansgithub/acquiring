# Implementation Plan - Song Search Suggestions

Implement real-time search suggestions as the user types in the search bar. This will help users find songs quickly without typing the full title.

## Proposed Changes

### Data Layer

#### [MODIFY] [SongDao.kt](file:///H:/Desktop/3_sacred_ring/android/app/src/main/java/com/sacredring/android/SongDao.kt)
- Add a query to fetch a limited number of song suggestions based on a partial title or artist.
```kotlin
@Query("SELECT * FROM songs WHERE title LIKE '%' || :query || '%' OR artist LIKE '%' || :query || '%' LIMIT 10")
suspend fun getSearchSuggestions(query: String): List<Song>
```

### UI Layer

#### [MODIFY] [MainActivity.kt](file:///H:/Desktop/3_sacred_ring/android/app/src/main/java/com/sacredring/android/MainActivity.kt)
- Update `MainScreen` to include a suggestions state.
- Use `ExposedDropdownMenuBox` (Material 3) around the search `OutlinedTextField` to display suggestions.
- Implement a `LaunchedEffect` or character-change logic to fetch suggestions from the database as the user types.
- Add a small delay (debounce) before querying the database to avoid excessive searches on every keystroke.
- Handle selecting a suggestion to auto-fill the search query and trigger the search.

## Verification Plan

### Automated Tests
- Build the project to ensure `SongDao` and `MainActivity` compile correctly.

### Manual Verification
1. Open the app.
2. Start typing a song title in the "Search by Title or Slug" field.
3. Verify that a dropdown menu appears with up to 10 song suggestions.
4. Verify that suggestions include both matching titles and artists.
5. Click on a suggestion and verify that the search query is updated and the song details are displayed (or the search is triggered).
6. Verify that the suggestions disappear when the text field loses focus or is cleared.
