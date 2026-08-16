package com.inquiring.android

import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
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
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
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
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.IntOffset
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

private enum class SongParentPage {
    LIBRARY,
    ARTIST,
    ALL_SONGS
}

private const val ROOT_INTERVAL_PREVIEW_DURATION_MS = 450
private const val ALL_SONGS_STATE_KEY = "all-songs"

private class InertiaBoundaryReachedException : Exception()

private fun Modifier.dropdownScrollbar(
    scrollState: ScrollState,
    trackColor: Color,
    thumbColor: Color
): Modifier = drawWithContent {
    drawContent()
    val maxScroll = scrollState.maxValue
    if (maxScroll <= 0 || maxScroll == Int.MAX_VALUE || size.height <= 0f) {
        return@drawWithContent
    }

    val viewportHeight = size.height
    val contentHeight = viewportHeight + maxScroll
    val barWidth = 3.dp.toPx()
    val rightInset = 2.dp.toPx()
    val minimumThumbHeight = 24.dp.toPx()
    val thumbHeight = (viewportHeight * viewportHeight / contentHeight)
        .coerceIn(minimumThumbHeight.coerceAtMost(viewportHeight), viewportHeight)
    val thumbTravel = viewportHeight - thumbHeight
    val thumbOffset = thumbTravel * (scrollState.value.toFloat() / maxScroll.toFloat())
    val barX = size.width - rightInset - barWidth
    val cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f)

    drawRoundRect(
        color = trackColor,
        topLeft = Offset(barX, 0f),
        size = Size(barWidth, viewportHeight),
        cornerRadius = cornerRadius
    )
    drawRoundRect(
        color = thumbColor,
        topLeft = Offset(barX, thumbOffset),
        size = Size(barWidth, thumbHeight),
        cornerRadius = cornerRadius
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExposedDropdownMenuBoxScope.ExposedDropdownMenuWithScrollbar(
    expanded: Boolean,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    onLoadMore: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val scrollState = rememberScrollState()
    
    if (onLoadMore != null) {
        LaunchedEffect(scrollState.value, scrollState.maxValue) {
            if (scrollState.maxValue > 0 && scrollState.value >= scrollState.maxValue - 100) {
                onLoadMore()
            }
        }
    }

    val maximumMenuHeight = (
        androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * 0.45f
    ).dp.coerceIn(200.dp, 400.dp)
    ExposedDropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismissRequest,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = maximumMenuHeight)
                .dropdownScrollbar(
                    scrollState = scrollState,
                    trackColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.18f),
                    thumbColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f)
                )
                .verticalScroll(scrollState)
        ) {
            content()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
class MainActivity : ComponentActivity() {
    private lateinit var db: AppDatabase
    private val tessituraSessionViewModel by viewModels<TessituraSessionViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        db = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java, AppDatabase.DB_NAME
        ).addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3).build()

        val neutralContainer = Color(0xFF3A3A3A)
        val neutralOnContainer = Color(0xFFE6E6E6)
        val darkColorScheme = darkColorScheme(
            primary = Color(0xFFA8C7FA),
            secondary = Color(0xFFBAC8DB),
            tertiary = Color(0xFFEFB8C8),
            primaryContainer = neutralContainer,
            secondaryContainer = neutralContainer,
            tertiaryContainer = neutralContainer,
            background = Color(0xFF1C1B1F),
            surface = Color(0xFF1C1B1F),
            surfaceVariant = Color(0xFF343434),
            onPrimary = Color(0xFF00315C),
            onSecondary = Color(0xFF263141),
            onTertiary = Color(0xFF492532),
            onPrimaryContainer = neutralOnContainer,
            onSecondaryContainer = neutralOnContainer,
            onTertiaryContainer = neutralOnContainer,
            onBackground = Color(0xFFE6E1E5),
            onSurface = Color(0xFFE6E1E5),
            onSurfaceVariant = Color(0xFFD0D0D0),
        )

        setContent {
            MaterialTheme(colorScheme = darkColorScheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(db, tessituraSessionViewModel)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MainScreen(
    db: AppDatabase,
    tessituraSessionViewModel: TessituraSessionViewModel
) {
    var activeDb by remember { mutableStateOf(db) }
    var urlToHarvest by remember { mutableStateOf("") }
    var harvestStatus by remember { mutableStateOf("") }
    var searchQuery by remember { mutableStateOf("") }
    var searchArtistQuery by remember { mutableStateOf("") }
    var searchResult by remember { mutableStateOf<String?>(null) }
    var catalogStatus by remember { mutableStateOf("") }
    var allSongs by remember { mutableStateOf(listOf<SongBrowseRow>()) }
    var suggestions by remember { mutableStateOf(listOf<SongBrowseRow>()) }
    var artistSuggestions by remember { mutableStateOf(listOf<String>()) }
    var isExpanded by remember { mutableStateOf(false) }
    var isArtistExpanded by remember { mutableStateOf(false) }
    // Recent-selections suggestions should only appear once the user actually
    // focuses the field — not automatically on launch.
    var hasSearchTitleFocus by remember { mutableStateOf(false) }
    var hasSearchArtistFocus by remember { mutableStateOf(false) }
    var selectedArtistName by remember { mutableStateOf<String?>(null) }
    var selectedArtistSongs by remember { mutableStateOf<List<SongBrowseRow>?>(null) }
    var selectedSong by remember { mutableStateOf<Song?>(null) }
    var selectedSongSections by remember { mutableStateOf<Map<String, ExtractedSection>?>(null) }
    var selectedSectionId by remember { mutableStateOf<String?>(null) }
    var isShowingAllSongs by rememberSaveable { mutableStateOf(false) }
    var currentTab by remember { mutableStateOf(2) }
    var songParentPage by remember { mutableStateOf(SongParentPage.LIBRARY) }
    var showLetterNames by remember { mutableStateOf(false) }
    var isArpeggiated by remember { mutableStateOf(false) }
    var arpeggioStepMs by remember { mutableStateOf(80f) }
    var isShowingRecent by remember { mutableStateOf(false) }
    var isShowingRecentArtists by remember { mutableStateOf(false) }
    var currentWaveform by remember { mutableStateOf(AudioEngine.Waveform.SAWTOOTH) }
    var globalTranspose by remember { mutableStateOf(AudioEngine.globalTranspose) }
    var quizPlayButtonXFraction by rememberSaveable { mutableStateOf(Float.NaN) }
    var quizPlayButtonYFraction by rememberSaveable { mutableStateOf(Float.NaN) }
    var singingTargetRequest by remember { mutableStateOf<SingingTargetRequest?>(null) }
    var singingTargetRequestId by remember { mutableStateOf(0) }
    val tessituraShiftOctaves = tessituraSessionViewModel.shiftOctaves
    
    var titleOffset by remember { mutableStateOf(0) }
    var artistOffset by remember { mutableStateOf(0) }
    var isTitlePaging by remember { mutableStateOf(false) }
    var isArtistPaging by remember { mutableStateOf(false) }
    var browseOpenJob by remember { mutableStateOf<Job?>(null) }
    
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val microphonePitchCoordinator = remember(context.applicationContext) {
        MicrophonePitchCoordinator(MicrophonePitchTracker(context.applicationContext))
    }
    val persistentQuizPitchSource = remember(microphonePitchCoordinator) {
        microphonePitchCoordinator.sourceFor(MicrophonePitchOwner.QUIZ_PERSISTENT)
    }
    val singingToolPitchSource = remember(microphonePitchCoordinator) {
        microphonePitchCoordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL)
    }
    val tessituraCalibrationPitchSource = remember(microphonePitchCoordinator) {
        microphonePitchCoordinator.sourceFor(MicrophonePitchOwner.TESSITURA_CALIBRATION)
    }
    DisposableEffect(microphonePitchCoordinator) {
        onDispose { microphonePitchCoordinator.release() }
    }
    // Steals Android's default initial focus away from the search field so the
    // keyboard doesn't auto-show on launch; the field only focuses (and shows
    // the keyboard) once the user actually taps it.
    val initialFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { initialFocusRequester.requestFocus() }
    val allSongsStateHolder = rememberSaveableStateHolder()
    val allSongsRuntimeState = rememberAllSongsRuntimeState()

    val harvestService = remember(activeDb) { HarvestService(activeDb) }
    val json = remember { Json { ignoreUnknownKeys = true } }
    val singingSessionKey = selectedSong?.slug?.let { slug -> "$slug:${selectedSectionId.orEmpty()}" }
    val selectedSectionRootMidis = remember(selectedSongSections, selectedSectionId) {
        val sections = selectedSongSections ?: return@remember emptyList()
        val section = selectedSectionId?.let(sections::get)
            ?: sections.sectionsInSongOrder().firstOrNull()?.value
            ?: sections.values.firstOrNull()
            ?: return@remember emptyList()
        section.tessituraReferenceRootMidis()
    }

    LaunchedEffect(singingSessionKey) {
        singingSessionKey?.let(tessituraSessionViewModel::enterSession)
        singingTargetRequest = null
    }
    val returnToParent = {
        browseOpenJob?.cancel()
        browseOpenJob = null
        if (selectedArtistSongs != null && selectedSongSections == null) {
            // Close the artist detail page.
            selectedArtistName = null
            selectedArtistSongs = null
        } else if (selectedSongSections != null && currentTab == 2) {
            // The quiz always hands back to this song's info page, however it
            // was opened.
            currentTab = 0
        } else if (selectedSongSections != null) {
            // Return to the page that opened the song.
            tessituraSessionViewModel.clearSession()
            selectedSongSections = null
            selectedSong = null
            if (songParentPage == SongParentPage.LIBRARY) {
                selectedArtistName = null
                selectedArtistSongs = null
            }
        } else if (isShowingAllSongs) {
            selectedSong = null
            allSongsStateHolder.removeState(ALL_SONGS_STATE_KEY)
            allSongsRuntimeState.reset()
            isShowingAllSongs = false
        }
    }

    // Match the visible Back control while a selected song or artist is open.
    BackHandler(
        enabled = selectedSongSections != null || selectedArtistSongs != null || isShowingAllSongs
    ) {
        returnToParent()
    }

    LaunchedEffect(searchQuery, selectedSong, selectedArtistSongs, hasSearchTitleFocus) {
        if (searchQuery.isNotEmpty() && hasSearchTitleFocus) {
            delay(300) // Debounce
            titleOffset = 0
            suggestions = activeDb.songDao().getSearchSuggestions(searchQuery, limit = 20, offset = 0)
            isExpanded = true // Always expand when typing to show suggestions or "No results"
            isShowingRecent = false
        } else if (!hasSearchTitleFocus) {
            // Field hasn't been touched yet — stay collapsed, no auto-shown recents.
            suggestions = emptyList()
            isShowingRecent = false
            isExpanded = false
        } else if (selectedSong == null && selectedArtistSongs == null) {
            // Show recent songs when empty from SharedPreferences
            val slugs = HistoryManager.getRecentSlugs(context)
            if (slugs.isNotEmpty()) {
                val recentSongs = activeDb.songDao().getBrowseSongsBySlugs(slugs)
                // Sort by the order in the slugs list (most recent first)
                suggestions = slugs.mapNotNull { slug -> recentSongs.find { it.slug == slug } }
                isShowingRecent = suggestions.isNotEmpty()
                isExpanded = suggestions.isNotEmpty()
            } else {
                suggestions = emptyList()
                isShowingRecent = false
                isExpanded = false
            }
        }
    }

    LaunchedEffect(searchArtistQuery, selectedSong, selectedArtistSongs, hasSearchArtistFocus) {
        if (searchArtistQuery.isNotEmpty() && hasSearchArtistFocus) {
            isShowingRecentArtists = false
            delay(300) // Debounce
            artistOffset = 0
            artistSuggestions = activeDb.songDao().getArtistSuggestions(searchArtistQuery, limit = 20, offset = 0)
            isArtistExpanded = true
        } else if (!hasSearchArtistFocus) {
            artistSuggestions = emptyList()
            isShowingRecentArtists = false
            isArtistExpanded = false
        } else if (selectedSong == null && selectedArtistSongs == null) {
            artistSuggestions = HistoryManager.getRecentArtists(context)
            isShowingRecentArtists = artistSuggestions.isNotEmpty()
            isArtistExpanded = false
        }
    }

    val decodeSongSections: suspend (ByteArray) -> Map<String, ExtractedSection> = { blob ->
        withContext(Dispatchers.Default) {
            val dataStr = DataUtils.decompress(blob)
            HooktheoryDataCompat.migrateSections(
                json.decodeFromString<Map<String, ExtractedSection>>(dataStr)
            )
        }
    }

    val openSong: (Song) -> Unit = { song ->
        // Opening a song is a new load even if it happens to be the song that
        // was open previously, so its tessitura session starts unadjusted.
        tessituraSessionViewModel.clearSession()
        HistoryManager.addSong(context, song.slug)
        HistoryManager.addArtist(context, song.artist)
        isExpanded = false
        songParentPage = when {
            selectedArtistSongs != null -> SongParentPage.ARTIST
            isShowingAllSongs -> SongParentPage.ALL_SONGS
            else -> SongParentPage.LIBRARY
        }
        selectedSong = song

        val storedBlob = song.dataBlob
        if (storedBlob != null) {
            scope.launch {
                try {
                    val sections = decodeSongSections(storedBlob)
                    if (selectedSong?.slug != song.slug) return@launch
                    selectedSongSections = sections
                    selectedSectionId = sections.sectionsInSongOrder().firstOrNull()?.key ?: sections.keys.firstOrNull()
                    currentTab = 2 // Open Quiz; SongDetailView starts in Simple mode
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (e: Exception) {
                    if (selectedSong?.slug == song.slug) {
                        selectedSong = null
                        searchResult = "❌ Error loading song: ${e.message}"
                    }
                }
            }
        } else {
            // Auto-harvest on demand if dataBlob is missing
            scope.launch {
                harvestStatus = "Fetching chords for ${song.title ?: song.slug}..."
                val result = harvestService.harvest(song.url) { harvestStatus = it }
                val harvestedSong = result.getOrNull()
                if (harvestedSong != null) {
                    val blob = harvestedSong.dataBlob
                    if (blob != null) {
                        try {
                            val sections = decodeSongSections(blob)
                            if (selectedSong?.slug != song.slug) return@launch
                            HistoryManager.addArtist(context, harvestedSong.artist)
                            selectedSong = harvestedSong
                            selectedSongSections = sections
                            selectedSectionId = sections.sectionsInSongOrder().firstOrNull()?.key ?: sections.keys.firstOrNull()
                            currentTab = 2 // Open Quiz; SongDetailView starts in Simple mode
                            harvestStatus = "Loaded chords for ${song.title ?: song.slug}!"
                        } catch (cancellation: CancellationException) {
                            throw cancellation
                        } catch (e: Exception) {
                            if (selectedSong?.slug == song.slug) {
                                selectedSong = null
                                harvestStatus = "❌ Error loading harvested song: ${e.message}"
                            }
                        }
                    } else if (selectedSong?.slug == song.slug) {
                        selectedSong = null
                        harvestStatus = "❌ Harvest completed without song data"
                    }
                } else if (selectedSong?.slug == song.slug) {
                    selectedSong = null
                    harvestStatus = "❌ Error fetching song: ${result.exceptionOrNull()?.message}"
                }
            }
        }
    }

    val openBrowseSong: (SongBrowseRow) -> Unit = { browseRow ->
        browseOpenJob?.cancel()
        browseOpenJob = scope.launch {
            try {
                val song = activeDb.songDao().getSongBySlug(browseRow.slug)
                if (song != null) {
                    openSong(song)
                } else {
                    searchResult = "Unable to find '${browseRow.title ?: browseRow.slug}'"
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                searchResult = "Unable to open '${browseRow.title ?: browseRow.slug}': ${error.message}"
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Invisible target that owns the default initial focus on launch, so the
        // search field starts genuinely unselected instead of grabbing focus itself.
        Box(
            modifier = Modifier
                .size(1.dp)
                .focusRequester(initialFocusRequester)
                .focusTarget()
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .padding(bottom = 32.dp) // Room for collapsed popup handle
        ) {
            if (selectedSongSections == null) {
                if (selectedArtistSongs != null) {
                    ArtistSongsView(
                        artistName = selectedArtistName ?: "Unknown Artist",
                        songs = selectedArtistSongs!!,
                        onSongClick = openBrowseSong,
                        onBack = {
                            browseOpenJob?.cancel()
                            browseOpenJob = null
                            selectedArtistSongs = null
                            selectedArtistName = null
                        }
                    )
                } else if (isShowingAllSongs) {
                    allSongsStateHolder.SaveableStateProvider(ALL_SONGS_STATE_KEY) {
                        AllSongsView(
                            songDao = activeDb.songDao(),
                            runtimeState = allSongsRuntimeState,
                            onSongClick = openBrowseSong,
                            onBack = {
                                browseOpenJob?.cancel()
                                browseOpenJob = null
                                selectedSong = null
                                allSongsStateHolder.removeState(ALL_SONGS_STATE_KEY)
                                allSongsRuntimeState.reset()
                                isShowingAllSongs = false
                            }
                        )
                    }
                } else {
                    // Library/Search View
                    LibraryView(
                    activeDb = activeDb,
                    urlToHarvest = urlToHarvest,
                    onUrlChange = { urlToHarvest = it },
                    harvestStatus = harvestStatus,
                    onHarvest = {
                        scope.launch {
                            harvestStatus = "Starting..."
                            val result = harvestService.harvest(urlToHarvest) { harvestStatus = it }
                            result.onFailure { harvestStatus = "Error: ${it.message}" }
                        }
                    },
                    searchQuery = searchQuery,
                    onSearchQueryChange = {
                        searchQuery = it
                        if (it.isNotEmpty()) isArtistExpanded = false
                    },
                    onSearchTitleFocusChanged = { focused -> hasSearchTitleFocus = focused },
                    isExpanded = isExpanded,
                    onExpandedChange = { expanded ->
                        isExpanded = expanded
                        if (expanded) isArtistExpanded = false
                    },
                    suggestions = suggestions,
                    isShowingRecent = isShowingRecent,
                    onSearchTitle = {
                        if (searchQuery.isBlank()) {
                            allSongs = emptyList()
                            searchResult = "Enter a title to search"
                            isExpanded = false
                        } else {
                            scope.launch {
                                val results = activeDb.songDao().searchBrowseSongsByTitle(searchQuery)
                                allSongs = results
                                searchResult = if (results.isNotEmpty()) "Found ${results.size} matches" else "No titles matching '$searchQuery'"
                                isExpanded = false
                            }
                        }
                    },
                    onLoadMoreTitle = {
                        if (!isTitlePaging && searchQuery.isNotEmpty() && suggestions.size >= 20) {
                            isTitlePaging = true
                            val requestedQuery = searchQuery
                            scope.launch {
                                try {
                                    val nextOffset = titleOffset + 20
                                    val nextSuggestions = activeDb.songDao().getSearchSuggestions(
                                        requestedQuery,
                                        limit = 20,
                                        offset = nextOffset
                                    )
                                    if (searchQuery == requestedQuery && nextSuggestions.isNotEmpty()) {
                                        suggestions = suggestions + nextSuggestions
                                        titleOffset = nextOffset
                                    }
                                } finally {
                                    isTitlePaging = false
                                }
                            }
                        }
                    },
                    onLoadMoreArtist = {
                        if (!isArtistPaging && searchArtistQuery.isNotEmpty() && artistSuggestions.size >= 20) {
                            isArtistPaging = true
                            val requestedQuery = searchArtistQuery
                            scope.launch {
                                try {
                                    val nextOffset = artistOffset + 20
                                    val nextSuggestions = activeDb.songDao().getArtistSuggestions(
                                        requestedQuery,
                                        limit = 20,
                                        offset = nextOffset
                                    )
                                    if (searchArtistQuery == requestedQuery && nextSuggestions.isNotEmpty()) {
                                        artistSuggestions = artistSuggestions + nextSuggestions
                                        artistOffset = nextOffset
                                    }
                                } finally {
                                    isArtistPaging = false
                                }
                            }
                        }
                    },
                    searchArtistQuery = searchArtistQuery,
                    onSearchArtistQueryChange = {
                        searchArtistQuery = it
                        if (it.isNotEmpty()) isExpanded = false
                    },
                    onSearchArtistFocusChanged = { focused -> hasSearchArtistFocus = focused },
                    isArtistExpanded = isArtistExpanded,
                    onArtistExpandedChange = { expanded ->
                        isArtistExpanded = expanded
                        if (expanded) isExpanded = false
                    },
                    artistSuggestions = artistSuggestions,
                    isShowingRecentArtists = isShowingRecentArtists,
                    onArtistClick = { artistName ->
                        tessituraSessionViewModel.clearSession()
                        HistoryManager.addArtist(context, artistName)
                        scope.launch {
                            val results = activeDb.songDao().getBrowseSongsByArtist(artistName)
                            selectedArtistName = canonicalArtistName(artistName)
                            selectedArtistSongs = results
                            isArtistExpanded = false
                        }
                    },
                    onSearchArtist = {
                        scope.launch {
                            val results = activeDb.songDao().getBrowseSongsByArtist(searchArtistQuery)
                            if (results.isNotEmpty()) {
                                val canonicalArtist = results.first().artist
                                    ?.let(::canonicalArtistName)
                                    ?: canonicalArtistName(searchArtistQuery)
                                HistoryManager.addArtist(context, canonicalArtist)
                                selectedArtistName = canonicalArtist
                                selectedArtistSongs = results
                            } else {
                                searchResult = "No artists matching '$searchArtistQuery'"
                            }
                            isArtistExpanded = false
                        }
                    },
                    onSuggestionClick = openBrowseSong,
                    onAllSongs = {
                        browseOpenJob?.cancel()
                        browseOpenJob = null
                        allSongsStateHolder.removeState(ALL_SONGS_STATE_KEY)
                        allSongsRuntimeState.reset()
                        scope.launch { allSongsRuntimeState.listState.scrollToItem(0) }
                        isShowingAllSongs = true
                    },
                    searchResult = searchResult,
                    allSongs = allSongs,
                    onSongClick = openBrowseSong,

                    catalogStatus = catalogStatus,
                    onDownloadCatalog = {
                        scope.launch {
                            catalogStatus = "Starting download..."
                            val result = DatabaseDownloader.downloadAndInstallCatalog(
                                context = context,
                                currentDb = activeDb
                            ) { catalogStatus = it }
                            
                            if (result.isSuccess) {
                                // Re-open DB
                                activeDb = Room.databaseBuilder(
                                    context.applicationContext,
                                    AppDatabase::class.java, AppDatabase.DB_NAME
                                ).addMigrations(
                                    AppDatabase.MIGRATION_1_2,
                                    AppDatabase.MIGRATION_2_3
                                ).build()
                                catalogStatus = "Database Refreshed!"
                            } else {
                                // A validated install closes Room only immediately
                                // before the atomic swap. If that final swap fails,
                                // reopen the preserved catalog before reporting it.
                                if (!activeDb.isOpen) {
                                    activeDb = Room.databaseBuilder(
                                        context.applicationContext,
                                        AppDatabase::class.java, AppDatabase.DB_NAME
                                    ).addMigrations(
                                        AppDatabase.MIGRATION_1_2,
                                        AppDatabase.MIGRATION_2_3
                                    ).build()
                                }
                                catalogStatus = "Error: ${result.exceptionOrNull()?.message}"
                            }
                        }
                    }
                )
                }
            } else {
                // Song Detail View with Tabs
                SongDetailView(
                    song = selectedSong!!,
                    sections = selectedSongSections!!,
                    selectedSectionId = selectedSectionId,
                    onSectionChange = { selectedSectionId = it },
                    currentTab = currentTab,
                    onTabChange = { currentTab = it },
                    showLetterNames = showLetterNames,
                    onShowLetterNamesChange = { showLetterNames = it },
                    isArpeggiated = isArpeggiated,
                    onArpeggiatedChange = { isArpeggiated = it },
                    arpeggioStepMs = arpeggioStepMs,
                    onArpeggioStepMsChange = { arpeggioStepMs = it },
                    currentWaveform = currentWaveform,
                    onWaveformChange = { 
                        currentWaveform = it
                        AudioEngine.currentWaveform = it
                    },
                    globalTranspose = globalTranspose,
                    onTransposeChange = {
                        globalTranspose = it
                        AudioEngine.globalTranspose = it
                    },
                    quizPlayButtonXFraction = quizPlayButtonXFraction,
                    quizPlayButtonYFraction = quizPlayButtonYFraction,
                    onQuizPlayButtonPositionChange = { xFraction, yFraction ->
                        quizPlayButtonXFraction = xFraction
                        quizPlayButtonYFraction = yFraction
                    },
                    onArtistClick = { artistName ->
                        tessituraSessionViewModel.clearSession()
                        HistoryManager.addArtist(context, artistName)
                        scope.launch {
                            val results = activeDb.songDao().getBrowseSongsByArtist(artistName)
                            selectedArtistName = canonicalArtistName(artistName)
                            selectedArtistSongs = results
                            selectedSongSections = null
                            selectedSong = null
                        }
                    },
                    onSingingTargetsRequested = { request ->
                        singingTargetRequestId++
                        singingTargetRequest = request.copy(requestId = singingTargetRequestId)
                    },
                    tessituraShiftOctaves = tessituraShiftOctaves,
                    tessituraControl = {
                        TessituraControl(
                            octaveShift = tessituraShiftOctaves,
                            canCalibrate = selectedSectionRootMidis.isNotEmpty(),
                            onCalibrationCaptured = { hummedMidi ->
                                calculateSingingTessituraShift(
                                    comfortableMidi = hummedMidi,
                                    targetRequest = singingTargetRequest,
                                    sectionRootMidis = selectedSectionRootMidis,
                                    globalTranspose = globalTranspose
                                )?.let(tessituraSessionViewModel::updateShift)
                            },
                            onOctaveShiftChange = { tessituraSessionViewModel.updateShift(it) },
                            pitchSource = tessituraCalibrationPitchSource
                        )
                    },
                    persistentPitchSource = persistentQuizPitchSource,
                    onBack = returnToParent
                )
            }

        }

        HummingIntervalPopup(
            modifier = Modifier.align(Alignment.BottomCenter),
            sectionSessionKey = singingSessionKey,
            targetRequest = singingTargetRequest,
            globalTranspose = globalTranspose,
            octaveShift = tessituraShiftOctaves,
            pitchSource = singingToolPitchSource
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryView(
    activeDb: AppDatabase,
    urlToHarvest: String,
    onUrlChange: (String) -> Unit,
    harvestStatus: String,
    onHarvest: () -> Unit,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onSearchTitleFocusChanged: (Boolean) -> Unit,
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
    catalogStatus: String,
    onDownloadCatalog: () -> Unit
) {
    var isHarvestExpanded by remember { mutableStateOf(false) }
    var isDownloadCatalogExpanded by remember { mutableStateOf(false) }
    val uriHandler = LocalUriHandler.current

    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(modifier = Modifier.weight(0.3f))
        // Search Section
        Text(text = "Song Database Search", style = MaterialTheme.typography.titleMedium)
        
        // Search by Title/Slug
        ExposedDropdownMenuBox(
            expanded = isExpanded,
            onExpandedChange = { onExpandedChange(!isExpanded) },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                label = { Text("Search by Title") },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor()
                    .onFocusChanged { onSearchTitleFocusChanged(it.isFocused) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isExpanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )

            if (isExpanded) {
                ExposedDropdownMenuWithScrollbar(
                    expanded = isExpanded,
                    onDismissRequest = { onExpandedChange(false) },
                    onLoadMore = onLoadMoreTitle,
                    modifier = Modifier.heightIn(max = 400.dp)
                ) {
                    if (isShowingRecent) {
                        DropdownMenuItem(
                            text = { Text("Recent Selections", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) },
                            onClick = {},
                            enabled = false
                        )
                    } else if (suggestions.isEmpty() && searchQuery.isNotEmpty()) {
                        DropdownMenuItem(
                            text = { Text("No results found for '$searchQuery'", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary) },
                            onClick = {},
                            enabled = false
                        )
                    }

                    suggestions.forEach { song ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(text = song.title ?: "Unknown Title", style = MaterialTheme.typography.bodyLarge)
                                    Text(text = song.artist ?: "Unknown Artist", style = MaterialTheme.typography.bodySmall)
                                }
                            },
                            onClick = { onSuggestionClick(song) }
                        )
                    }
                }
            }
        }

        Button(onClick = onSearchTitle, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Text("Search Title")
        }

        OutlinedButton(
            onClick = { uriHandler.openUri("https://www.hooktheory.com/theorytab/search?q=${Uri.encode(searchQuery)}") },
            enabled = searchQuery.isNotBlank(),
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
        ) {
            Text("Search Hooktheory.com ↗")
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Search by Artist Section
        ExposedDropdownMenuBox(
            expanded = isArtistExpanded,
            onExpandedChange = { onArtistExpandedChange(!isArtistExpanded) },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = searchArtistQuery,
                onValueChange = onSearchArtistQueryChange,
                label = { Text("Search by Artist") },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor()
                    .onFocusChanged { onSearchArtistFocusChanged(it.isFocused) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isArtistExpanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )

            if (isArtistExpanded) {
                ExposedDropdownMenuWithScrollbar(
                    expanded = isArtistExpanded,
                    onDismissRequest = { onArtistExpandedChange(false) },
                    onLoadMore = onLoadMoreArtist,
                    modifier = Modifier.heightIn(max = 400.dp)
                ) {
                    if (isShowingRecentArtists) {
                        DropdownMenuItem(
                            text = { Text("Recent Artists", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) },
                            onClick = {},
                            enabled = false
                        )
                    } else if (artistSuggestions.isEmpty() && searchArtistQuery.isNotEmpty()) {
                        DropdownMenuItem(
                            text = { Text("No artists matching '$searchArtistQuery'", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary) },
                            onClick = {},
                            enabled = false
                        )
                    }

                    artistSuggestions.forEach { artistName ->
                        DropdownMenuItem(
                            text = { Text(text = artistName, style = MaterialTheme.typography.bodyLarge) },
                            onClick = { onArtistClick(artistName) }
                        )
                    }
                }
            }
        }

        Button(
            onClick = onSearchArtist,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
        ) {
            Text("Search Artist")
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
                        Text(text = song.title ?: "Unknown Title", style = MaterialTheme.typography.bodyLarge)
                        Text(text = song.artist ?: "Unknown Artist", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        Divider(modifier = Modifier.padding(vertical = 8.dp))

        Button(
            onClick = onAllSongs,
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
        ) {
            Text("All Songs")
        }

        // Expandable Harvest Section
        Column(modifier = Modifier.fillMaxWidth()) {
            Surface(
                onClick = { isHarvestExpanded = !isHarvestExpanded },
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Harvest Individual Song",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.weight(1f)
                    )
                    Icon(
                        imageVector = if (isHarvestExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = if (isHarvestExpanded) "Collapse" else "Expand"
                    )
                }
            }

            if (isHarvestExpanded) {
                Column(modifier = Modifier.padding(bottom = 8.dp)) {
                    OutlinedTextField(
                        value = urlToHarvest,
                        onValueChange = onUrlChange,
                        label = { Text("Hooktheory URL") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(onClick = onHarvest, modifier = Modifier.padding(top = 8.dp)) {
                        Text("Harvest & Save")
                    }
                    if (harvestStatus.isNotEmpty()) {
                        Text(text = harvestStatus, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }

        // Download Catalog Section
        Column(modifier = Modifier.fillMaxWidth()) {
            Surface(
                onClick = { isDownloadCatalogExpanded = !isDownloadCatalogExpanded },
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Download Full Library",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.weight(1f)
                    )
                    Icon(
                        imageVector = if (isDownloadCatalogExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = if (isDownloadCatalogExpanded) "Collapse" else "Expand"
                    )
                }
            }

            if (isDownloadCatalogExpanded) {
                Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                    Button(
                        onClick = onDownloadCatalog,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Download Full Library")
                    }
                    
                    if (catalogStatus.isNotEmpty()) {
                        Text(
                            text = catalogStatus,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 8.dp),
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongDetailView(
    song: Song,
    sections: Map<String, ExtractedSection>,
    selectedSectionId: String?,
    onSectionChange: (String) -> Unit,
    currentTab: Int,
    onTabChange: (Int) -> Unit,
    showLetterNames: Boolean,
    onShowLetterNamesChange: (Boolean) -> Unit,
    isArpeggiated: Boolean,
    onArpeggiatedChange: (Boolean) -> Unit,
    arpeggioStepMs: Float,
    onArpeggioStepMsChange: (Float) -> Unit,
    currentWaveform: AudioEngine.Waveform,
    onWaveformChange: (AudioEngine.Waveform) -> Unit,
    globalTranspose: Int,
    onTransposeChange: (Int) -> Unit,
    quizPlayButtonXFraction: Float,
    quizPlayButtonYFraction: Float,
    onQuizPlayButtonPositionChange: (Float, Float) -> Unit,
    onArtistClick: (String) -> Unit,
    onSingingTargetsRequested: (SingingTargetRequest) -> Unit,
    tessituraShiftOctaves: Int,
    tessituraControl: @Composable () -> Unit,
    persistentPitchSource: PitchSource,
    onBack: () -> Unit
) {
    val sectionsInSongOrder = remember(sections) { sections.sectionsInSongOrder() }
    val selectedSectionKey = selectedSectionId
        ?.takeIf { selectedId -> sectionsInSongOrder.any { it.key == selectedId } }
        ?: sectionsInSongOrder.firstOrNull()?.key
        ?: sections.keys.firstOrNull()
    val selectedSection = sections[selectedSectionKey] ?: sectionsInSongOrder.firstOrNull()?.value ?: sections.values.first()
    var isSectionExpanded by remember { mutableStateOf(false) }
    var isTransposeExpanded by remember { mutableStateOf(false) }
    var isSimpleMode by remember { mutableStateOf(false) }
    var useRelativeIonianContext by remember { mutableStateOf(false) }
    // The quiz's key/scale readout is rendered by the song header rather than by
    // QuizTab itself, so QuizTab publishes it up here as playback moves through
    // key changes.
    var quizKeyDisplay by remember { mutableStateOf<QuizKeyDisplay?>(null) }
    val uriHandler = LocalUriHandler.current

    val transposePickerComposable: @Composable () -> Unit = {
        val transposeText = if (globalTranspose > 0) "+$globalTranspose" else "$globalTranspose"
        ExposedDropdownMenuBox(
            expanded = isTransposeExpanded,
            onExpandedChange = { isTransposeExpanded = !isTransposeExpanded },
            modifier = Modifier.width(84.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outline,
                        shape = RoundedCornerShape(4.dp)
                    )
                    .menuAnchor()
                    .semantics { contentDescription = "Transpose: $transposeText" }
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = 4.dp, bottom = 4.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Transpose",
                        maxLines = 1,
                        style = MaterialTheme.typography.labelSmall.copy(lineHeight = 12.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().padding(end = 28.dp)
                    )
                    Text(
                        text = transposeText,
                        maxLines = 1,
                        style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 18.sp),
                        modifier = Modifier.padding(start = 10.dp)
                    )
                }
                Box(modifier = Modifier.align(Alignment.CenterEnd)) {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = isTransposeExpanded)
                }
            }

            ExposedDropdownMenuWithScrollbar(
                expanded = isTransposeExpanded,
                onDismissRequest = { isTransposeExpanded = false }
            ) {
                (-12..12).forEach { transpose ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = if (transpose > 0) "+$transpose" else "$transpose",
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center
                            )
                        },
                        onClick = {
                            onTransposeChange(transpose)
                            isTransposeExpanded = false
                        }
                    )
                }
            }
        }
    }

    val sectionPickerComposable: @Composable () -> Unit = {
        if (sectionsInSongOrder.size > 1) {
            ExposedDropdownMenuBox(
                expanded = isSectionExpanded,
                onExpandedChange = { isSectionExpanded = !isSectionExpanded },
                modifier = Modifier.width(180.dp)
            ) {
                OutlinedTextField(
                    value = selectedSection.safeSectionName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Section") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isSectionExpanded) },
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                    modifier = Modifier.fillMaxWidth().height(64.dp).menuAnchor()
                )

                ExposedDropdownMenuWithScrollbar(
                    expanded = isSectionExpanded,
                    onDismissRequest = { isSectionExpanded = false }
                ) {
                    sectionsInSongOrder.forEach { (id, section) ->
                        DropdownMenuItem(
                            text = { Text(section.safeSectionName) },
                            onClick = {
                                onSectionChange(id)
                                isSectionExpanded = false
                            }
                        )
                    }
                }
            }
        }
    }
    
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
        if (currentTab != 2) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                TextButton(onClick = onBack) { Text("< Back") }
                Text(
                    text = selectedSection.safeSongInfo,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).padding(start = 8.dp)
                )
                // The source link lives on the song info page only; the quiz header
                // stays clear of navigation.
                if (currentTab == 0) {
                    TextButton(onClick = { uriHandler.openUri(song.url) }) { Text("URL") }
                }
            }
        } else {
            val canonicalArtist = song.artist
                ?.takeIf { it.isNotBlank() }
                ?.let(::canonicalArtistName)
            Column(modifier = Modifier.fillMaxWidth()) {
                // Back shares the title line: it sits at the start while the
                // "song by artist" string stays centred on the screen.
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp)
                        .padding(horizontal = 8.dp)
                ) {
                    TextButton(
                        onClick = onBack,
                        contentPadding = PaddingValues(horizontal = 8.dp),
                        modifier = Modifier.align(Alignment.CenterStart).height(32.dp)
                    ) { Text("< Back") }

                    Row(
                        // Symmetric inset keeps the string centred on the screen
                        // while stopping a long title from running under Back.
                        modifier = Modifier.align(Alignment.Center).padding(horizontal = 72.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (!isSimpleMode) {
                            Text(
                                text = song.title ?: "Unknown Title",
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1
                            )
                            canonicalArtist?.let { artist ->
                                Text(" by ", style = MaterialTheme.typography.bodySmall)
                                TextButton(
                                    onClick = { onArtistClick(artist) },
                                    contentPadding = PaddingValues(0.dp),
                                    modifier = Modifier.height(28.dp)
                                ) {
                                    Text(text = artist, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                                }
                            }
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp)
                        .padding(horizontal = 16.dp)
                ) {
                    Row(
                        modifier = Modifier.align(Alignment.CenterStart),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Lock in Major",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Start
                        )
                        Checkbox(
                            checked = useRelativeIonianContext,
                            onCheckedChange = { useRelativeIonianContext = it },
                            modifier = Modifier
                                .scale(0.85f)
                                .semantics { contentDescription = "Lock in Major" }
                        )
                    }

                    quizKeyDisplay?.let { keyDisplay ->
                        Text(
                            text = keyDisplay.label,
                            textAlign = TextAlign.Center,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            color = keyDisplay.color,
                            maxLines = 1,
                            modifier = if (keyDisplay.isLockedToMajor) {
                                Modifier
                                    .align(Alignment.Center)
                                    .border(1.dp, Color.Red, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            } else {
                                Modifier.align(Alignment.Center)
                            }
                        )
                    }
                }
            }
        }

        if (currentTab != 2) {
            ScrollableTabRow(
                selectedTabIndex = currentTab,
                edgePadding = 0.dp
            ) {
                Tab(selected = currentTab == 0, onClick = { onTabChange(0) }) {
                    Text("Info", modifier = Modifier.padding(16.dp))
                }
                Tab(selected = currentTab == 1, onClick = { onTabChange(1) }) {
                    Text("Chords", modifier = Modifier.padding(16.dp))
                }
                Tab(selected = currentTab == 2, onClick = { onTabChange(2) }) {
                    Text("Quiz", modifier = Modifier.padding(16.dp))
                }
            }
        }

        when (currentTab) {
            0 -> InfoTab(song, selectedSection, sections, selectedSectionKey, onSectionChange)
            1 -> ChordsTab(
                section = selectedSection,
                showLetterNames = showLetterNames,
                onShowLetterNamesChange = onShowLetterNamesChange,
                isArpeggiated = isArpeggiated,
                onArpeggiatedChange = onArpeggiatedChange,
                arpeggioStepMs = arpeggioStepMs,
                onArpeggioStepMsChange = onArpeggioStepMsChange
            )
            2 -> QuizTab(
                section = selectedSection,
                isSimpleMode = isSimpleMode,
                onSimpleModeChange = { isSimpleMode = it },
                useRelativeIonianContext = useRelativeIonianContext,
                currentWaveform = currentWaveform,
                onWaveformChange = onWaveformChange,
                sectionPicker = sectionPickerComposable,
                transposePicker = transposePickerComposable,
                tessituraControl = tessituraControl,
                onKeyDisplayChange = { quizKeyDisplay = it },
                globalTranspose = globalTranspose,
                quizPlayButtonXFraction = quizPlayButtonXFraction,
                quizPlayButtonYFraction = quizPlayButtonYFraction,
                onQuizPlayButtonPositionChange = onQuizPlayButtonPositionChange,
                onSingingTargetsRequested = onSingingTargetsRequested,
                tessituraShiftOctaves = tessituraShiftOctaves,
                sessionKey = "${song.slug}:${selectedSectionKey.orEmpty()}",
                persistentPitchSource = persistentPitchSource
            )
        }
        }

        // Section selector overlay for non-Quiz tabs
        if (currentTab != 2 && sectionsInSongOrder.size > 1) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
            ) {
                sectionPickerComposable()
            }
        }
    }
}

/** The quiz's live key/scale readout, hoisted so the song header can render it. */
data class QuizKeyDisplay(
    val label: String,
    val color: Color,
    val isLockedToMajor: Boolean
)

private fun ringModeColor(scale: String): Color = when (scale) {
    "major", "ionian" -> Color(0xFFFF0000)
    "dorian" -> Color(0xFFFFB014)
    "phrygian", "phrygianDominant" -> Color(0xFFEFE600)
    "lydian" -> Color(0xFF00D300)
    "mixolydian" -> Color(0xFF4800FF)
    "minor", "aeolian", "harmonicMinor" -> Color(0xFFB800E5)
    "locrian" -> Color(0xFFFF00CB)
    else -> Color(0xFFE6E1E5)
}

@Composable
internal fun DraggableQuizPlayPauseButton(
    isPlaying: Boolean,
    enabled: Boolean,
    xFraction: Float,
    yFraction: Float,
    onPositionChange: (Float, Float) -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val buttonWidth = 180.dp
    val buttonHeight = 64.dp
    val defaultBottomClearance = 72.dp

    BoxWithConstraints(modifier = modifier) {
        val density = androidx.compose.ui.platform.LocalDensity.current
        val maxX = with(density) { (maxWidth - buttonWidth).toPx().coerceAtLeast(0f) }
        val maxY = with(density) { (maxHeight - buttonHeight).toPx().coerceAtLeast(0f) }
        val defaultY = (maxY - with(density) { defaultBottomClearance.toPx() }).coerceAtLeast(0f)
        val resolvedX = if (xFraction.isFinite()) xFraction.coerceIn(0f, 1f) * maxX else maxX
        val resolvedY = if (yFraction.isFinite()) yFraction.coerceIn(0f, 1f) * maxY else defaultY
        val latestXFraction by rememberUpdatedState(xFraction)
        val latestYFraction by rememberUpdatedState(yFraction)
        val latestOnPositionChange by rememberUpdatedState(onPositionChange)
        val actionLabel = if (isPlaying) "Pause" else "Play"

        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier
                .offset { IntOffset(resolvedX.roundToInt(), resolvedY.roundToInt()) }
                .width(buttonWidth)
                .height(buttonHeight)
                .semantics { contentDescription = "$actionLabel. Drag to move." }
                .pointerInput(maxX, maxY, defaultY) {
                    var dragX = 0f
                    var dragY = 0f
                    detectDragGestures(
                        onDragStart = {
                            dragX = if (latestXFraction.isFinite()) {
                                latestXFraction.coerceIn(0f, 1f) * maxX
                            } else {
                                maxX
                            }
                            dragY = if (latestYFraction.isFinite()) {
                                latestYFraction.coerceIn(0f, 1f) * maxY
                            } else {
                                defaultY
                            }
                        },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            dragX = (dragX + dragAmount.x).coerceIn(0f, maxX)
                            dragY = (dragY + dragAmount.y).coerceIn(0f, maxY)
                            latestOnPositionChange(
                                if (maxX > 0f) dragX / maxX else 0f,
                                if (maxY > 0f) dragY / maxY else 0f
                            )
                        }
                    )
                }
        ) {
            if (isPlaying) {
                Text("Ⅱ", fontSize = 28.sp)
            } else {
                Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(28.dp))
            }
            Spacer(Modifier.width(8.dp))
            Text(actionLabel)
        }
    }
}


private data class QuizTimelineChordVisual(
    val beat: Double,
    val duration: Double,
    val display: RomanNumeralDisplay?
)

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun QuizTab(
    section: ExtractedSection,
    isSimpleMode: Boolean,
    onSimpleModeChange: (Boolean) -> Unit,
    useRelativeIonianContext: Boolean,
    currentWaveform: AudioEngine.Waveform,
    onWaveformChange: (AudioEngine.Waveform) -> Unit,
    sectionPicker: @Composable () -> Unit,
    transposePicker: @Composable () -> Unit,
    tessituraControl: @Composable () -> Unit,
    onKeyDisplayChange: (QuizKeyDisplay?) -> Unit,
    globalTranspose: Int,
    quizPlayButtonXFraction: Float,
    quizPlayButtonYFraction: Float,
    onQuizPlayButtonPositionChange: (Float, Float) -> Unit,
    onSingingTargetsRequested: (SingingTargetRequest) -> Unit,
    tessituraShiftOctaves: Int,
    sessionKey: String,
    persistentPitchSource: PitchSource
) {
    val exclusivePersistentPitchSource = persistentPitchSource as? ExclusivePitchSource
        ?: error("QuizTab requires an exclusive persistent pitch source")
    val baseBpm = section.getBpm().toFloat().coerceIn(40f, 240f)
    val isTessituraAdjusted = tessituraShiftOctaves != 0
    var tempoPercent by remember(section) { mutableStateOf(100f) }
    val bpm = (baseBpm * tempoPercent / 100f).toDouble()

    val notesJson = when (val rawNotes = section.notes) {
        is JsonArray -> rawNotes
        is JsonObject -> (rawNotes["melody1"] as? JsonArray) ?: emptyList()
        else -> emptyList()
    }
    
    val melody = remember(notesJson) {
        notesJson.mapNotNull { el ->
            try {
                val obj = el as? JsonObject ?: return@mapNotNull null
                val rawBeat = (obj["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                MelodyNote(
                    sd = (obj["sd"] as? JsonPrimitive)?.contentOrNull ?: "1",
                    beat = normalizePlaybackBeat(rawBeat),
                    duration = (obj["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0,
                    octave = (obj["octave"] as? JsonPrimitive)?.intOrNull ?: 0,
                    isRest = (obj["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                        (obj["rest"] as? JsonPrimitive)?.booleanOrNull == true
                )
            } catch (_: Exception) { null }
        }
    }
    val sectionKeys = remember(section) { section.getKeys() }
    val activeEventIndex = remember(section, melody) {
        QuizActiveEventIndex(section, melody)
    }

    var melodyChordBalance by remember { mutableStateOf(0.5f) }
    val melodyVolume = melodyChordBalance
    val chordVolume = 1f - melodyChordBalance
    var inertiaJob by remember { mutableStateOf<Job?>(null) }
    var inertiaGeneration by remember { mutableStateOf(0L) }
    var isScrubbing by remember { mutableStateOf(false) }
    var wasPlayingBeforeScrub by remember { mutableStateOf(false) }
    var scrubBeat by remember(section) { mutableStateOf(1.0) }
    var intervalPreviewJob by remember { mutableStateOf<Job?>(null) }
    var isWaveformExpanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val endBeat = remember(section, melody) {
        val metadataEndBeat = (section.metadata?.get("endBeat") as? JsonPrimitive)?.doubleOrNull
        val audibleEventEndBeats = buildList {
            melody.forEach { note ->
                playbackEventEndBeat(note.beat, note.duration, note.isRest)?.let(::add)
            }
            section.chords.forEach { chord ->
                val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                    (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                val beat = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                playbackEventEndBeat(beat, duration, isRest)?.let(::add)
            }
        }
        resolvePlaybackEndBeat(metadataEndBeat, audibleEventEndBeats)
    }
    val timeline = remember(section, melody, endBeat) {
        buildQuizTimeline(section, melody, endBeat)
    }
    val playbackConfig = QuizPlaybackConfig(
        bpm = bpm,
        transpose = globalTranspose,
        waveform = currentWaveform,
        chordMode = if (isSimpleMode) QuizChordMode.ROOT_ONLY else QuizChordMode.FULL,
        melodyGain = melodyVolume,
        chordGain = chordVolume
    )
    val quizPlaybackEngine = remember {
        QuizPlaybackEngine(playbackConfig)
    }
    val playbackState by quizPlaybackEngine.state.collectAsState()
    val isPlaying = playbackState.phase == QuizPlaybackPhase.BUFFERING ||
        playbackState.phase == QuizPlaybackPhase.PLAYING
    val currentBeat = if (isScrubbing) {
        scrubBeat
    } else {
        playbackState.beat.coerceIn(1.0, endBeat)
    }
    // Timeline gesture detectors live inside pointerInput(endBeat), so they are not
    // recreated for every played-frame state update. Keep the rapidly changing
    // transport values behind stable State objects instead of capturing the values
    // from the composition that created the gesture coroutine.
    val latestCurrentBeat by rememberUpdatedState(currentBeat)
    val latestIsPlaying by rememberUpdatedState(isPlaying)
    val latestBpm by rememberUpdatedState(bpm)

    val pixelsPerBeat = 60f
    val chordLaneHeight = 40.dp
    val melodyLaneHeight = 88.dp

    fun playbackBeat(): Double = latestCurrentBeat.coerceIn(1.0, endBeat)

    fun cancelInertia() {
        inertiaGeneration++
        inertiaJob?.cancel()
        inertiaJob = null
    }

    fun updatePlaybackBeat(beat: Double) {
        val boundedBeat = beat.coerceIn(1.0, endBeat)
        if (isScrubbing) {
            scrubBeat = boundedBeat
        } else {
            quizPlaybackEngine.seek(boundedBeat, resume = latestIsPlaying)
        }
    }

    fun beginScrubbing() {
        cancelInertia()
        if (isScrubbing) return
        wasPlayingBeforeScrub = quizPlaybackEngine.pauseForScrub()
        scrubBeat = playbackBeat()
        isScrubbing = true
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
    }

    fun scrubTo(beat: Double) {
        beginScrubbing()
        scrubBeat = beat.coerceIn(1.0, endBeat)
    }

    fun finishScrubbing() {
        if (!isScrubbing) return
        val targetBeat = scrubBeat
        val shouldResume = wasPlayingBeforeScrub && latestBpm > 0.0
        isScrubbing = false
        wasPlayingBeforeScrub = false
        quizPlaybackEngine.seek(targetBeat, resume = shouldResume)
    }

    fun skipBack(seconds: Double) {
        cancelInertia()
        if (isScrubbing || bpm <= 0.0) return
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        val beatsToSkip = seconds * (bpm / 60.0)
        quizPlaybackEngine.seek(playbackBeat() - beatsToSkip, resume = isPlaying)
    }

    LaunchedEffect(timeline) {
        cancelInertia()
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        isScrubbing = false
        wasPlayingBeforeScrub = false
        scrubBeat = timeline.startBeat
        quizPlaybackEngine.load(timeline, continuePlaying = isPlaying)
    }

    LaunchedEffect(playbackConfig) {
        quizPlaybackEngine.updateConfig(playbackConfig)
    }

    DisposableEffect(quizPlaybackEngine) {
        onDispose {
            intervalPreviewJob?.cancel()
            quizPlaybackEngine.release()
            AudioEngine.stopAllPlayback()
        }
    }

    val waveformPickerComposable: @Composable () -> Unit = {
        val waveformLabel = currentWaveform.name.lowercase().split("_").joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
        ExposedDropdownMenuBox(expanded = isWaveformExpanded, onExpandedChange = { isWaveformExpanded = !isWaveformExpanded }, modifier = Modifier.width(128.dp)) {
            Box(modifier = Modifier.fillMaxWidth().height(48.dp).border(width = 1.dp, color = MaterialTheme.colorScheme.outline, shape = RoundedCornerShape(4.dp)).menuAnchor().semantics { contentDescription = "Sound: $waveformLabel" }, contentAlignment = Alignment.Center) {
                Text(text = waveformLabel, maxLines = 1, textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall.copy(lineHeight = 12.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)), modifier = Modifier.fillMaxWidth())
                Box(modifier = Modifier.align(Alignment.CenterEnd)) { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isWaveformExpanded) }
            }
            ExposedDropdownMenuWithScrollbar(expanded = isWaveformExpanded, onDismissRequest = { isWaveformExpanded = false }) {
                AudioEngine.Waveform.entries.forEach { waveform -> DropdownMenuItem(text = { Text(waveform.name.lowercase().split("_").joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }, style = MaterialTheme.typography.bodySmall, maxLines = 1) }, onClick = { onWaveformChange(waveform); isWaveformExpanded = false }) }
            }
        }
    }

    val ionianSourceKey = remember(sectionKeys) { sectionKeys.keyAtBeat(1.0) }
    val ionianContextKey = remember(ionianSourceKey) { relativeIonianKey(ionianSourceKey) }
    val timelineMelodyVisuals = remember(
        melody,
        sectionKeys,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        melody.mapNotNull { note ->
            if (note.isRest) {
                null
            } else {
                val rawStaffDegree = MusicTheory.getRawDegree(note.sd) + note.octave * 7
                val sourceKey = sectionKeys.keyAtBeat(note.beat)
                val resolvedPitch = MusicTheory.resolveScaleDegreePitch(
                    sd = note.sd,
                    relativeOctave = note.octave,
                    key = sourceKey
                )
                MelodyTimelinePitchVisual(
                    beat = note.beat,
                    duration = note.duration,
                    staffDegree = if (useRelativeIonianContext) {
                        ionianContextStaffDegree(
                            note.sd,
                            note.octave,
                            sourceKey,
                            ionianContextKey
                        ) ?: rawStaffDegree
                    } else {
                        rawStaffDegree
                    },
                    sourceMidi = resolvedPitch?.let { pitch ->
                        if (useRelativeIonianContext) {
                            ionianContextPreviewAudioNote(pitch, ionianContextKey)
                                ?: pitch.toAudioNoteNumber()
                        } else {
                            pitch.toAudioNoteNumber()
                        }
                    }
                )
            }
        }
    }
    val timelineMelodyPitchRuns = remember(timelineMelodyVisuals) {
        buildMelodyTimelinePitchRuns(timelineMelodyVisuals)
    }
    val timelineMelodyPitchRunsById = remember(timelineMelodyPitchRuns) {
        timelineMelodyPitchRuns.associateBy(MelodyTimelinePitchRun::id)
    }
    val timelineChordVisuals = remember(
        section.chords,
        sectionKeys,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        section.chords.map { chord ->
            val beat = normalizePlaybackBeat(
                (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            )
            val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
            val display = if (isRest) {
                null
            } else {
                val chordKey = sectionKeys.keyAtBeat(beat)
                val symbol = if (useRelativeIonianContext) {
                    ChordInterpreter.getRelativeIonianRomanSymbol(
                        chord,
                        chordKey,
                        ionianContextKey
                    )
                } else {
                    ChordInterpreter.getRomanSymbol(chord, chordKey)
                }
                RomanNumeralDisplay.fromChord(symbol, chord["borrowed"])
            }
            QuizTimelineChordVisual(beat, duration, display)
        }
    }
    val activeKey = remember(sectionKeys, currentBeat) {
        sectionKeys.keyAtBeat(currentBeat)
    }
    val currentChord = remember(activeEventIndex, currentBeat) {
        activeEventIndex.chordAtBeat(currentBeat)
    }
    val chordRootIntervalState = remember(section, currentChord, isSimpleMode) {
        if (!isSimpleMode || currentChord == null) null
        else resolveChordRootIntervalState(
            section,
            normalizePlaybackBeat((currentChord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0)
        )
    }
    val currentRootDegreeLabel = remember(
        chordRootIntervalState,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        chordRootIntervalState?.let { state ->
            if (useRelativeIonianContext) {
                ionianContextDegreeLabel(state.current.pitch, ionianContextKey)
            } else {
                state.currentDegreeLabel
            }
        }.orEmpty()
    }
    val currentRootPreviewAudioNote = remember(
        chordRootIntervalState,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        chordRootIntervalState?.currentIntervalPitch?.let { pitch ->
            if (useRelativeIonianContext) {
                ionianContextPreviewAudioNote(pitch, ionianContextKey)
                    ?: pitch.toAudioNoteNumber()
            } else {
                pitch.toAudioNoteNumber()
            }
        } ?: 0
    }
    val currentChordToneTargets = remember(
        currentChord,
        activeKey,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        val chord = currentChord ?: return@remember emptyList()
        val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
            (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
        if (isRest) return@remember emptyList()

        val notes = ChordInterpreter.getChordNotes(chord, activeKey)
        val rootMidi = ChordInterpreter.getRootPositionChordNotes(chord, activeKey).firstOrNull()
            ?: return@remember emptyList()
        val spelledRoot = ChordInterpreter.resolveChordRoot(chord, activeKey)?.pitch
        notes.map { note ->
            val previewNote = if (useRelativeIonianContext) {
                (spelledRoot?.let { ionianContextPreviewAudioNote(note, it, ionianContextKey) }
                    ?: ionianContextPreviewAudioNote(note, ionianContextKey)) ?: note
            } else {
                note
            }
            QuizPitchCardTarget(
                sourceMidi = previewNote,
                label = MusicTheory.getRelativeDegreeLabel(note, rootMidi)
            )
        }
    }
    val currentMelodyNote = remember(activeEventIndex, currentBeat, isSimpleMode) {
        if (isSimpleMode) null else activeEventIndex.melodyNoteAtBeat(currentBeat)
    }
    val melodyIntervalState = remember(section, melody, currentMelodyNote, isSimpleMode) {
        if (isSimpleMode || currentMelodyNote == null) null
        else resolveMelodyIntervalState(melody, currentMelodyNote.beat, section::getKeyAtBeat)
    }
    val currentMelodyPitch = remember(section, currentMelodyNote, isSimpleMode) {
        currentMelodyNote
            ?.takeIf { note -> !isSimpleMode && !note.isRest && note.duration > 0.0 }
            ?.let { note ->
                MusicTheory.resolveScaleDegreePitch(
                    sd = note.sd,
                    relativeOctave = note.octave,
                    key = section.getKeyAtBeat(normalizePlaybackBeat(note.beat))
                )
            }
    }
    val melodyPreviousTargetLabel = remember(
        melodyIntervalState,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        melodyIntervalState?.let { state ->
            if (useRelativeIonianContext) {
                ionianContextDegreeLabel(state.previous, ionianContextKey)
            } else {
                state.previousDegreeLabel
            }
        }.orEmpty()
    }
    val melodyCurrentTargetLabel = remember(
        melodyIntervalState,
        currentMelodyPitch,
        currentMelodyNote,
        section,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        currentMelodyPitch?.let { pitch ->
            if (useRelativeIonianContext) {
                ionianContextDegreeLabel(pitch, ionianContextKey)
            } else {
                melodyIntervalState?.currentDegreeLabel
                    ?: currentMelodyNote?.let { note ->
                        MusicTheory.getDegreeLabelFromSpelling(
                            pitch,
                            section.getKeyAtBeat(normalizePlaybackBeat(note.beat))
                        )
                    }.orEmpty()
            }
        }.orEmpty()
    }
    val melodyPitchCards = remember(
        melodyIntervalState,
        melodyPreviousTargetLabel,
        melodyCurrentTargetLabel
    ) {
        melodyIntervalState?.let { state ->
            buildMelodyPitchCards(
                state = state,
                previousLabel = melodyPreviousTargetLabel,
                currentLabel = melodyCurrentTargetLabel
            )
        }.orEmpty()
    }
    val melodyCardDisplayMode = remember(currentMelodyPitch, melodyIntervalState) {
        melodyPitchCardDisplayMode(currentMelodyPitch, melodyIntervalState)
    }
    val singleMelodyPitchCard = remember(
        melodyCardDisplayMode,
        currentMelodyPitch,
        melodyCurrentTargetLabel
    ) {
        if (melodyCardDisplayMode == MelodyPitchCardDisplayMode.SINGLE) {
            currentMelodyPitch?.let { pitch ->
                MelodyPitchCard(
                    role = MelodyPitchCardRole.CURRENT,
                    pitch = pitch,
                    scaleDegreeLabel = melodyCurrentTargetLabel,
                    verticalPosition = MelodyPitchCardVerticalPosition.TOP
                )
            }
        } else {
            null
        }
    }

    val density = androidx.compose.ui.platform.LocalDensity.current

    fun intervalPreviewNote(pitch: SpelledPitch): Int {
        return if (useRelativeIonianContext) {
            ionianContextPreviewAudioNote(pitch, ionianContextKey) ?: pitch.toAudioNoteNumber()
        } else {
            pitch.toAudioNoteNumber()
        }
    }

    fun playIntervalPreview(previous: SpelledPitch, current: SpelledPitch) {
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        intervalPreviewJob = scope.launch {
            rootIntervalPreviewSteps(
                previousAudioNote = previous.toAudioNoteNumber(),
                currentAudioNote = current.toAudioNoteNumber(),
                octaveShiftSemitones = 0,
                durationMs = ROOT_INTERVAL_PREVIEW_DURATION_MS
            ).forEach { step ->
                AudioEngine.playChord(
                    step.audioNotes,
                    durationMs = step.durationMs,
                    channel = AudioEngine.PlaybackChannel.PREVIEW
                )
                if (step.delayAfterMs > 0L) delay(step.delayAfterMs)
            }
        }
    }

    fun playSingleNotePreview(pitch: SpelledPitch) {
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        intervalPreviewJob = scope.launch {
            AudioEngine.playChord(
                listOf(pitch.toAudioNoteNumber()),
                durationMs = ROOT_INTERVAL_PREVIEW_DURATION_MS,
                channel = AudioEngine.PlaybackChannel.PREVIEW
            )
        }
    }

    val simpleRootPitchTarget = remember(currentRootPreviewAudioNote, currentRootDegreeLabel) {
        currentRootPreviewAudioNote.takeIf { it > 0 }?.let {
            QuizPitchCardTarget(it, currentRootDegreeLabel)
        }
    }
    val melodyPersistentPitchTarget = remember(
        currentMelodyPitch,
        melodyCurrentTargetLabel,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        currentMelodyPitch?.let { pitch ->
            QuizPitchCardTarget(
                sourceMidi = if (useRelativeIonianContext) {
                    ionianContextPreviewAudioNote(pitch, ionianContextKey)
                        ?: pitch.toAudioNoteNumber()
                } else {
                    pitch.toAudioNoteNumber()
                },
                label = melodyCurrentTargetLabel
            )
        }
    }

    val persistentPitchController = remember(sessionKey, exclusivePersistentPitchSource) {
        PersistentQuizPitchController(exclusivePersistentPitchSource)
    }
    // Declared out here rather than beside the timeline because the Reset control at the
    // bottom of the tab has to clear them too.
    val melodyRunScoreAccumulator = remember(sessionKey) {
        MelodyTimelinePitchScoreAccumulator()
    }
    var fixedMelodyPitchScores by remember(sessionKey) {
        mutableStateOf<Map<Int, MelodyRunScoreOutcome>>(emptyMap())
    }
    val persistentPitchResult by exclusivePersistentPitchSource.pitchFlow.collectAsState()
    val ownsPersistentMicrophone by exclusivePersistentPitchSource.ownsMicrophone.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val persistentPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { granted ->
        persistentPitchController.onPermissionResult(granted)
    }
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    val latestPersistentPhase by rememberUpdatedState(persistentPitchController.phase)

    DisposableEffect(lifecycleOwner, persistentPitchController) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_PAUSE -> {
                    if (latestPersistentPhase == PersistentPitchPhase.LISTENING) {
                        persistentPitchController.cancel()
                    }
                }

                androidx.lifecycle.Lifecycle.Event.ON_STOP -> {
                    if (latestPersistentPhase != PersistentPitchPhase.IDLE) {
                        persistentPitchController.cancel()
                    }
                }

                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            persistentPitchController.cancel()
        }
    }

    LaunchedEffect(ownsPersistentMicrophone) {
        persistentPitchController.onOwnershipChanged(ownsPersistentMicrophone)
    }

    LaunchedEffect(persistentPitchResult) {
        val error = persistentPitchResult as? MicrophonePitchTracker.PitchResult.Error
        if (
            error != null &&
            persistentPitchController.phase == PersistentPitchPhase.LISTENING
        ) {
            persistentPitchController.fail(error.message)
        }
    }

    LaunchedEffect(persistentPitchController.errorMessage) {
        if (persistentPitchController.errorMessage != null) {
            delay(4000)
            persistentPitchController.clearError()
        }
    }

    val resolvedPersistentPitchTarget = resolvePersistentPitchTarget(
        selection = persistentPitchController.selection,
        simpleRoot = simpleRootPitchTarget,
        chordTones = currentChordToneTargets,
        melody = melodyPersistentPitchTarget
    )
    val persistentPitchGaugeResult = resolvedPersistentPitchTarget
        ?.takeIf {
            persistentPitchController.phase == PersistentPitchPhase.LISTENING &&
                ownsPersistentMicrophone
        }
        ?.let { target ->
            retargetPitchResult(
                persistentPitchResult,
                target.effectiveTargetMidi(globalTranspose, tessituraShiftOctaves)
            )
        }

    fun togglePersistentPitch(
        selection: PersistentPitchSelection,
        isDisplayedTargetActive: Boolean,
        target: QuizPitchCardTarget?
    ) {
        if (isDisplayedTargetActive) {
            persistentPitchController.cancel()
            return
        }
        val initialTarget = target ?: return
        val effectiveTargetMidi = initialTarget.sourceMidi +
            globalTranspose + tessituraShiftOctaves * 12
        val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.RECORD_AUDIO
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val needsPermission = persistentPitchController.activate(
            newSelection = selection,
            targetMidi = effectiveTargetMidi,
            hasRecordPermission = hasPermission
        )
        if (needsPermission) {
            persistentPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO)
        }
    }

    fun requestSingingTargets(request: SingingTargetRequest) {
        persistentPitchController.cancel()
        onSingingTargetsRequested(request)
    }

    fun openSingleMelodySingingTarget(pitch: SpelledPitch, label: String) {
        requestSingingTargets(
            SingingTargetRequest(
                first = SingingTargetNote(intervalPreviewNote(pitch), label),
                second = null,
                requestId = 0
            )
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                val displayScale = if (useRelativeIonianContext) {
                    "Major"
                } else {
                    activeKey.scale.replace(Regex("([a-z])([A-Z])"), "$1 $2").replaceFirstChar { it.titlecase() }
                }
                val activeModeColor = ringModeColor(activeKey.scale)
                // The key/scale readout itself is drawn by the song header above the
                // quiz, so publish it from here instead of rendering it inline.
                val keyDisplay = QuizKeyDisplay(
                    label = if (isSimpleMode) displayScale
                        else if (useRelativeIonianContext) "${ionianContextKey.tonic} $displayScale"
                        else "${activeKey.tonic} $displayScale",
                    color = activeModeColor,
                    isLockedToMajor = useRelativeIonianContext
                )
                val latestOnKeyDisplayChange by rememberUpdatedState(onKeyDisplayChange)
                LaunchedEffect(keyDisplay) { latestOnKeyDisplayChange(keyDisplay) }
                DisposableEffect(Unit) {
                    onDispose { latestOnKeyDisplayChange(null) }
                }
                Column(modifier = Modifier.fillMaxWidth()) {
                    // "Lock in Major" now sits beside the key/scale readout in the
                    // song header, so this row only carries the pitch controls.
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        Column(horizontalAlignment = Alignment.End) {
                            tessituraControl()
                            if (!isSimpleMode) {
                                Spacer(modifier = Modifier.height(4.dp))
                                transposePicker()
                            }
                        }
                    }
                    Row(modifier = Modifier.height(34.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.width(104.dp), contentAlignment = Alignment.CenterStart) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    "Chord / Melody", 
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 1
                                )
                                Text(
                                    "Vol.", 
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 1
                                )
                            }
                        }
                        Slider(value = melodyChordBalance, onValueChange = { melodyChordBalance = it }, modifier = Modifier.weight(1f))
                    }
                    Row(modifier = Modifier.height(34.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Tempo", style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Start, maxLines = 1, modifier = Modifier.width(40.dp))
                        Text(text = "${tempoPercent.roundToInt()}%", style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center, maxLines = 1, modifier = Modifier.width(44.dp))
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clickable { tempoPercent = 100f }
                                .semantics { contentDescription = "Reset tempo to 100%" },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(imageVector = Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                        }
                        Slider(value = tempoPercent, onValueChange = { tempoPercent = it }, valueRange = 0f..200f, modifier = Modifier.weight(1f))
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                val primaryColor = MaterialTheme.colorScheme.primary; val secondaryColor = MaterialTheme.colorScheme.secondary
                val romanNumeralPainter = remember { RomanNumeralPainter() }; val pixelsPerBeatPx = with(density) { pixelsPerBeat.dp.toPx() }
                val timelineContentDescription = remember(
                    currentChord,
                    sectionKeys,
                    useRelativeIonianContext,
                    ionianContextKey
                ) {
                    if (currentChord == null) "Chord timeline" else {
                        val beat = normalizePlaybackBeat(
                            (currentChord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                        )
                        val isRest = (currentChord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                            (currentChord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                        val chordKey = sectionKeys.keyAtBeat(beat)
                        val label = if (isRest) {
                            "rest"
                        } else if (useRelativeIonianContext) {
                            ChordInterpreter.getRelativeIonianRomanSymbol(
                                currentChord,
                                chordKey,
                                ionianContextKey
                            )
                        } else {
                            ChordInterpreter.getRomanSymbol(currentChord, chordKey)
                        }
                        "Chord timeline, current chord $label"
                    }
                }
                val melodyTimelinePitchEstimate = melodyTimelinePitchEstimate(
                    selection = persistentPitchController.selection,
                    resolvedTarget = resolvedPersistentPitchTarget,
                    pitchResult = persistentPitchGaugeResult
                )
                val activeMelodyPitchRun = remember(timelineMelodyPitchRuns, currentBeat) {
                    melodyTimelinePitchRunAtBeat(timelineMelodyPitchRuns, currentBeat)
                }
                val melodyRunScoringEnabled =
                    persistentPitchController.selection == PersistentPitchSelection.Melody &&
                        persistentPitchController.phase == PersistentPitchPhase.LISTENING &&
                        ownsPersistentMicrophone
                val latestMelodyTimelinePitchEstimate by rememberUpdatedState(
                    melodyTimelinePitchEstimate
                )

                DisposableEffect(
                    melodyRunScoringEnabled,
                    activeMelodyPitchRun?.id,
                    melodyRunScoreAccumulator
                ) {
                    val scoringRun = activeMelodyPitchRun.takeIf { melodyRunScoringEnabled }
                    if (!melodyRunScoringEnabled) {
                        melodyRunScoreAccumulator.clear()
                        fixedMelodyPitchScores = emptyMap()
                    } else if (scoringRun != null) {
                        melodyRunScoreAccumulator.begin(scoringRun.id)
                        fixedMelodyPitchScores = fixedMelodyPitchScores - scoringRun.id
                    }

                    onDispose {
                        if (scoringRun != null) {
                            melodyRunScoreAccumulator.finish(scoringRun.id)?.let { outcome ->
                                fixedMelodyPitchScores = fixedMelodyPitchScores +
                                    (outcome.runId to outcome)
                            }
                        }
                    }
                }

                LaunchedEffect(
                    melodyRunScoringEnabled,
                    activeMelodyPitchRun?.id,
                    melodyRunScoreAccumulator
                ) {
                    val scoringRun = activeMelodyPitchRun.takeIf { melodyRunScoringEnabled }
                        ?: return@LaunchedEffect
                    // This effect restarts as the playhead enters each run, so the sampler's
                    // default settle detector is built fresh per run and its elapsed clock
                    // starts at the moment the note starts sounding.
                    accumulateMelodyRunPitchSamples(
                        runId = scoringRun.id,
                        accumulator = melodyRunScoreAccumulator,
                        latestCentsError = { latestMelodyTimelinePitchEstimate?.centsError }
                    )
                }
                val animatedMelodyTimelineCents by animateFloatAsState(
                    targetValue = melodyTimelinePitchEstimate?.centsError?.toFloat() ?: 0f,
                    animationSpec = tween(durationMillis = 32),
                    label = "melody timeline pitch"
                )
                val sampledMelodyTimelineCents = rememberSampledPitchErrorCents(
                    melodyTimelinePitchEstimate?.centsError
                ).takeIf { melodyTimelinePitchEstimate != null }
                val melodyTimelinePitchVisual = currentMelodyNote?.let { activeNote ->
                    timelineMelodyVisuals.firstOrNull { visual ->
                        visual.beat == activeNote.beat && visual.duration == activeNote.duration
                    }
                }
                val pitchAwareTimelineContentDescription = sampledMelodyTimelineCents?.let { centsError ->
                    val direction = when {
                        centsError > 0.0 -> "high"
                        centsError < 0.0 -> "low"
                        else -> "on target"
                    }
                    "$timelineContentDescription. Melody pitch error " +
                        "${pitchErrorPercentage(centsError)} percent, $direction"
                } ?: timelineContentDescription
                val melodyPitchLabelPaint = remember {
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        textAlign = Paint.Align.RIGHT
                        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    }
                }
                val melodyScorePaint = remember {
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        textAlign = Paint.Align.CENTER
                        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    }
                }

                // Timeline
                if (!isSimpleMode) {
                    Box(modifier = Modifier.fillMaxWidth().height(chordLaneHeight + melodyLaneHeight)) {
                        Canvas(
                            modifier = Modifier
                                .fillMaxSize()
                                .semantics { contentDescription = pitchAwareTimelineContentDescription }
                                .pointerInput(endBeat) {
                                    detectTapGestures { offset ->
                                        if (inertiaJob?.isActive == true) {
                                            // Timeline is still coasting from a prior swipe; a tap should
                                            // just halt it in place rather than also jump to the tap position.
                                            cancelInertia()
                                            finishScrubbing()
                                        } else {
                                            cancelInertia()
                                            val centerX = size.width / 2f
                                            val deltaX = offset.x - centerX
                                            scrubTo(latestCurrentBeat + deltaX / pixelsPerBeatPx)
                                            finishScrubbing()
                                        }
                                    }
                                }
                                .pointerInput(endBeat) {
                                    var dragBeat = latestCurrentBeat
                                    val velocityTracker = VelocityTracker()
                                    detectDragGestures(
                                        onDragStart = {
                                            velocityTracker.resetTracking()
                                            beginScrubbing()
                                            dragBeat = latestCurrentBeat
                                        },
                                        onDrag = { change, dragAmount ->
                                            velocityTracker.addPointerInputChange(change)
                                            change.consume()
                                            val deltaBeat = dragAmount.x / pixelsPerBeatPx
                                            dragBeat = (dragBeat - deltaBeat).coerceIn(1.0, endBeat)
                                            scrubTo(dragBeat)
                                        },
                                        onDragEnd = {
                                            val velocityPx = velocityTracker.calculateVelocity().x
                                            // Convert px/s to beats/s. 
                                            // Negative because dragging right (positive px) decreases the beat (moves timeline left).
                                            val velocityBeats = -velocityPx / pixelsPerBeatPx
                                            
                                            if (kotlin.math.abs(velocityBeats) > 0.5) {
                                                val inertiaStartBeat = dragBeat
                                                val generation = inertiaGeneration + 1
                                                inertiaGeneration = generation
                                                inertiaJob = scope.launch {
                                                    val animatable = Animatable(inertiaStartBeat.toFloat())
                                                    // Noticeable inertia that settles down reasonably quickly
                                                    val decay = exponentialDecay<Float>(frictionMultiplier = 1.4f)
                                                    var completed = false
                                                    try {
                                                        animatable.animateDecay(velocityBeats, decay) {
                                                            updatePlaybackBeat(value.toDouble().coerceIn(1.0, endBeat))
                                                            // Stop the animation as soon as it reaches either end of
                                                            // the timeline instead of letting it run its full decay
                                                            // curve past the clamped bounds.
                                                            if (value <= 1.0 || value >= endBeat) {
                                                                throw InertiaBoundaryReachedException()
                                                            }
                                                        }
                                                        completed = true
                                                    } catch (_: InertiaBoundaryReachedException) {
                                                        // Reached the start/end of the timeline early; fall through
                                                        // to finishScrubbing() below same as a natural decay finish.
                                                        completed = true
                                                    }
                                                    if (completed && inertiaGeneration == generation) {
                                                        inertiaJob = null
                                                        finishScrubbing()
                                                    }
                                                }
                                            } else {
                                                finishScrubbing()
                                            }
                                        },
                                        onDragCancel = { finishScrubbing() }
                                    )
                                }
                        ) {
                            val totalHeight = size.height; val mLaneHeightPx = melodyLaneHeight.toPx(); val cLaneHeightPx = chordLaneHeight.toPx(); val noteHeight = (mLaneHeightPx / 28f).coerceIn(5f, 10f); val melodyBaseY = mLaneHeightPx / 2; val centerX = size.width / 2f; val translationX = centerX - (currentBeat - 1).toFloat() * pixelsPerBeatPx
                            drawContext.canvas.save(); drawContext.canvas.translate(translationX, 0f)
                            timelineMelodyVisuals.forEach { note ->
                                val x = (note.beat - 1).toFloat() * pixelsPerBeatPx
                                val w = note.duration.toFloat() * pixelsPerBeatPx
                                val screenX = x + translationX
                                if (screenX + w < 0f || screenX > size.width) return@forEach
                                val y = melodyBaseY - (note.staffDegree * noteHeight)
                                val isActive = currentBeat >= note.beat &&
                                    currentBeat < note.beat + note.duration
                                drawRect(
                                    color = if (isActive) primaryColor else secondaryColor.copy(alpha = 0.6f),
                                    topLeft = Offset(x, y),
                                    size = Size(w, noteHeight)
                                )
                            }
                            fixedMelodyPitchScores.forEach { (runId, outcome) ->
                                val run = timelineMelodyPitchRunsById[runId]
                                    ?: return@forEach
                                val scoreCenterX = (run.centerBeat - 1.0).toFloat() * pixelsPerBeatPx
                                val scoreScreenX = scoreCenterX + translationX
                                // A run we listened through but could not score shows a muted
                                // dot, so the timeline separates "no verdict" from "never heard".
                                val scoreLabel = when (outcome) {
                                    is MelodyRunScoreOutcome.Scored ->
                                        formatMelodyTimelinePitchScore(outcome.score)

                                    is MelodyRunScoreOutcome.Unscored -> "·"
                                }
                                val scoreColor = when (outcome) {
                                    is MelodyRunScoreOutcome.Scored ->
                                        pitchFeedbackColor(outcome.score.centsErrorMagnitude)

                                    is MelodyRunScoreOutcome.Unscored ->
                                        Color.White.copy(alpha = 0.45f)
                                }
                                melodyScorePaint.apply {
                                    color = scoreColor.toArgb()
                                    textSize = 11.sp.toPx()
                                }
                                val fontMetrics = melodyScorePaint.fontMetrics
                                val horizontalPadding = 5.dp.toPx()
                                val verticalPadding = 2.dp.toPx()
                                val scoreWidth = melodyScorePaint.measureText(scoreLabel) +
                                    horizontalPadding * 2f
                                if (
                                    scoreScreenX + scoreWidth / 2f < 0f ||
                                    scoreScreenX - scoreWidth / 2f > size.width
                                ) {
                                    return@forEach
                                }

                                val scoreHeight = fontMetrics.descent - fontMetrics.ascent +
                                    verticalPadding * 2f
                                val noteTopY = melodyBaseY - (run.staffDegree * noteHeight)
                                val desiredBaseline = noteTopY - 4.dp.toPx() - fontMetrics.descent
                                val scoreBaseline = desiredBaseline.coerceAtLeast(
                                    -fontMetrics.ascent + verticalPadding
                                )
                                val scoreTop = scoreBaseline + fontMetrics.ascent - verticalPadding

                                drawRoundRect(
                                    color = Color.Black.copy(alpha = 0.76f),
                                    topLeft = Offset(scoreCenterX - scoreWidth / 2f, scoreTop),
                                    size = Size(scoreWidth, scoreHeight),
                                    cornerRadius = CornerRadius(scoreHeight / 2f, scoreHeight / 2f)
                                )
                                drawContext.canvas.nativeCanvas.drawText(
                                    scoreLabel,
                                    scoreCenterX,
                                    scoreBaseline,
                                    melodyScorePaint
                                )
                            }
                            timelineChordVisuals.forEach { chord ->
                                val x = (chord.beat - 1).toFloat() * pixelsPerBeatPx
                                val w = chord.duration.toFloat() * pixelsPerBeatPx
                                val screenX = x + translationX
                                if (screenX + w < 0f || screenX > size.width) return@forEach
                                val isActive = currentBeat >= chord.beat &&
                                    currentBeat < chord.beat + chord.duration
                                drawRect(color = secondaryColor.copy(alpha = 0.2f), topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx))
                                if (isActive) drawRect(color = primaryColor.copy(alpha = 0.4f), topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx))
                                drawRect(color = if (isActive) primaryColor else Color.LightGray, topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                                chord.display?.let { display ->
                                    val innerWidth = w - 14.dp.toPx()
                                    val innerHeight = cLaneHeightPx - 8.dp.toPx()
                                    if (innerWidth > 12.dp.toPx() && innerHeight > 12.dp.toPx()) {
                                        val minFontSize = 8.sp.toPx()
                                        val maxFontSize = kotlin.math.min(innerHeight * 0.9f, innerWidth * 0.58f)
                                        val measured = romanNumeralPainter.fitDisplay(display, minFontSize, maxFontSize, innerWidth, innerHeight, 4.dp.toPx())
                                        if (measured != null) romanNumeralPainter.draw(canvas = drawContext.canvas.nativeCanvas, layout = measured, centerX = x + w / 2f, centerY = mLaneHeightPx + cLaneHeightPx / 2f + measured.baseFontSizePx * 0.035f, color = (if (isActive) primaryColor else Color.White).toArgb())
                                    }
                                }
                            }
                            drawContext.canvas.restore()
                            drawLine(
                                color = Color.White,
                                start = Offset(centerX, 0f),
                                end = Offset(centerX, totalHeight),
                                strokeWidth = 3f
                            )

                            val pitchEstimate = melodyTimelinePitchEstimate
                            val activeMelodyVisual = melodyTimelinePitchVisual
                            if (pitchEstimate != null && activeMelodyVisual != null) {
                                val feedbackColor = pitchFeedbackColor(pitchEstimate.centsError)
                                val haloRadius = 6.dp.toPx()
                                val markerRadius = 2.5f.dp.toPx()
                                val targetMarkerY = melodyBaseY -
                                    (activeMelodyVisual.staffDegree * noteHeight) + noteHeight / 2f
                                val measuredPitchStaffOffset = pitchErrorToTimelineStaffSteps(
                                    animatedMelodyTimelineCents.toDouble()
                                ).toFloat() * noteHeight
                                val rawMarkerY = targetMarkerY - measuredPitchStaffOffset
                                val markerY = rawMarkerY.coerceIn(
                                    haloRadius,
                                    (mLaneHeightPx - haloRadius).coerceAtLeast(haloRadius)
                                )

                                drawCircle(
                                    color = feedbackColor.copy(alpha = 0.28f),
                                    radius = haloRadius,
                                    center = Offset(centerX, markerY)
                                )
                                drawCircle(
                                    color = feedbackColor,
                                    radius = markerRadius,
                                    center = Offset(centerX, markerY)
                                )

                                sampledMelodyTimelineCents
                                    ?.takeIf(::showsLivePitchErrorPercentage)
                                    ?.let { sampledCentsError ->
                                    val percentageLabel = formatPitchErrorPercentage(sampledCentsError)
                                    val percentageColor = pitchFeedbackColor(sampledCentsError)
                                    melodyPitchLabelPaint.apply {
                                        color = percentageColor.toArgb()
                                        textSize = 11.sp.toPx()
                                    }
                                    val fontMetrics = melodyPitchLabelPaint.fontMetrics
                                    val horizontalPadding = 5.dp.toPx()
                                    val verticalPadding = 2.dp.toPx()
                                    val labelWidth = melodyPitchLabelPaint.measureText(percentageLabel) +
                                        horizontalPadding * 2f
                                    val labelHeight = fontMetrics.descent - fontMetrics.ascent +
                                        verticalPadding * 2f
                                    val labelRight = centerX - 8.dp.toPx()
                                    val labelLeft = labelRight - labelWidth
                                    val labelTop = markerY - labelHeight / 2f

                                    drawRoundRect(
                                        color = Color.Black.copy(alpha = 0.76f),
                                        topLeft = Offset(labelLeft, labelTop),
                                        size = Size(labelWidth, labelHeight),
                                        cornerRadius = CornerRadius(labelHeight / 2f, labelHeight / 2f)
                                    )
                                    drawContext.canvas.nativeCanvas.drawText(
                                        percentageLabel,
                                        labelRight - horizontalPadding,
                                        markerY - (fontMetrics.ascent + fontMetrics.descent) / 2f,
                                        melodyPitchLabelPaint
                                    )
                                }
                            }
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(bottom = 96.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentHeight(),
                        contentAlignment = if (isSimpleMode) Alignment.Center else Alignment.TopCenter
                    ) {
                        if (isSimpleMode) {
                            val activeSimpleChord = currentChord?.takeUnless { chord -> (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true }
                            val currentIntervalPitch = chordRootIntervalState?.currentIntervalPitch
                            val previousIntervalPitch = chordRootIntervalState?.previousIntervalPitch
                            val rootAudioNote = currentRootPreviewAudioNote
                            val rootDegreeLabel = currentRootDegreeLabel
                            val rootInterval = chordRootIntervalState?.interval

                            Row(
                                modifier = Modifier.fillMaxWidth().heightIn(max = 250.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                val rootIntervalEnabled = previousIntervalPitch != null && currentIntervalPitch != null && rootInterval != null
                                Surface(
                                    modifier = Modifier.weight(1f).fillMaxHeight()
                                        .semantics {
                                            contentDescription = rootInterval?.let {
                                                "Play root interval ${it.spokenName}. Double tap to sing it back."
                                            } ?: "Root interval unavailable"
                                        }
                                        .combinedClickable(
                                            enabled = rootIntervalEnabled,
                                            onClick = {
                                                if (previousIntervalPitch != null && currentIntervalPitch != null) {
                                                    playIntervalPreview(previousIntervalPitch, currentIntervalPitch)
                                                }
                                            },
                                            onDoubleClick = {
                                                val state = chordRootIntervalState
                                                if (state != null && previousIntervalPitch != null && currentIntervalPitch != null) {
                                                    val previousLabel = if (useRelativeIonianContext) {
                                                        ionianContextDegreeLabel(previousIntervalPitch, ionianContextKey)
                                                    } else {
                                                        state.previousDegreeLabel.orEmpty()
                                                    }
                                                    val currentLabel = if (useRelativeIonianContext) {
                                                        ionianContextDegreeLabel(currentIntervalPitch, ionianContextKey)
                                                    } else {
                                                        state.currentDegreeLabel
                                                    }
                                                    requestSingingTargets(
                                                        SingingTargetRequest(
                                                            first = SingingTargetNote(intervalPreviewNote(previousIntervalPitch), previousLabel),
                                                            second = SingingTargetNote(intervalPreviewNote(currentIntervalPitch), currentLabel),
                                                            requestId = 0
                                                        )
                                                    )
                                                }
                                            }
                                        ),
                                    shape = RoundedCornerShape(32.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Box(modifier = Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.Center) {
                                        Text(
                                            text = rootInterval?.shorthand ?: "—",
                                            textAlign = TextAlign.Center,
                                            fontSize = 54.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1
                                        )
                                        if (rootIntervalEnabled) {
                                            DoubleTapHint(
                                                modifier = Modifier.padding(4.dp),
                                                isTessituraAdjusted = isTessituraAdjusted
                                            )
                                        }
                                    }
                                }
                                Surface(
                                    modifier = Modifier.weight(1f).fillMaxHeight()
                                        .semantics { contentDescription = "Play current root scale degree. Double tap to sing it back. Triple tap to toggle persistent pitch practice." }
                                        .tripleClickable(
                                            enabled = rootAudioNote > 0,
                                            onClick = {
                                                intervalPreviewJob?.cancel()
                                                AudioEngine.stopPreviewPlayback()
                                                intervalPreviewJob = scope.launch {
                                                    AudioEngine.playChord(
                                                        listOf(rootAudioNote),
                                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                                    )
                                                }
                                            },
                                            onDoubleClick = {
                                                if (rootAudioNote > 0) {
                                                    requestSingingTargets(
                                                        SingingTargetRequest(
                                                            first = SingingTargetNote(rootAudioNote, rootDegreeLabel),
                                                            second = null,
                                                            requestId = 0
                                                        )
                                                    )
                                                }
                                            },
                                            onTripleClick = {
                                                togglePersistentPitch(
                                                    selection = PersistentPitchSelection.SimpleRoot,
                                                    isDisplayedTargetActive =
                                                        resolvedPersistentPitchTarget?.position == PersistentPitchCardPosition.SimpleRoot,
                                                    target = simpleRootPitchTarget
                                                )
                                            }
                                        ),
                                    shape = RoundedCornerShape(32.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Box(modifier = Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.Center) {
                                        if (
                                            resolvedPersistentPitchTarget?.position == PersistentPitchCardPosition.SimpleRoot &&
                                            persistentPitchGaugeResult != null
                                        ) {
                                            PitchGauge(
                                                pitchResult = persistentPitchGaugeResult,
                                                targetLabel = resolvedPersistentPitchTarget.label,
                                                modifier = Modifier.matchParentSize()
                                            )
                                        }
                                        // After the gauge, so the moving bar passes behind the degree
                                        // rather than across it.
                                        if (activeSimpleChord != null) {
                                            if (rootDegreeLabel.isNotEmpty()) {
                                                ScaleDegreeText(label = rootDegreeLabel, fontSize = 100.sp, modifier = Modifier.fillMaxWidth(), minFontSize = 36.sp)
                                            } else {
                                                val symbol = if (useRelativeIonianContext) ChordInterpreter.getRelativeIonianRomanSymbol(activeSimpleChord, activeKey, ionianContextKey) else ChordInterpreter.getRomanSymbol(activeSimpleChord, activeKey)
                                                val romanDisplay = RomanNumeralDisplay.fromChord(symbol, activeSimpleChord["borrowed"])
                                                RomanNumeralText(display = romanDisplay, fontSize = 64.sp, modifier = Modifier.fillMaxWidth())
                                            }
                                        }
                                        if (rootAudioNote > 0) {
                                            DoubleTapHint(
                                                modifier = Modifier.padding(4.dp),
                                                isTessituraAdjusted = isTessituraAdjusted
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Top
                            ) {
                                Box(modifier = Modifier.fillMaxWidth().height(64.dp)) {
                                if (melodyCardDisplayMode != MelodyPitchCardDisplayMode.HIDDEN) {
                                    if (singleMelodyPitchCard != null) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth().height(64.dp),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Spacer(modifier = Modifier.weight(0.5f))
                                            Spacer(modifier = Modifier.weight(0.5f))
                                            Surface(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .fillMaxHeight()
                                                    .semantics {
                                                        contentDescription = "Play current melody note ${singleMelodyPitchCard.scaleDegreeLabel}. Double tap to sing it back. Triple tap to toggle persistent pitch practice."
                                                    }
                                                    .tripleClickable(
                                                        onClick = {
                                                            playSingleNotePreview(singleMelodyPitchCard.pitch)
                                                        },
                                                        onDoubleClick = {
                                                            openSingleMelodySingingTarget(
                                                                singleMelodyPitchCard.pitch,
                                                                singleMelodyPitchCard.scaleDegreeLabel
                                                            )
                                                        },
                                                        onTripleClick = {
                                                            togglePersistentPitch(
                                                                selection = PersistentPitchSelection.Melody,
                                                                isDisplayedTargetActive =
                                                                    persistentPitchController.selection == PersistentPitchSelection.Melody,
                                                                target = melodyPersistentPitchTarget
                                                            )
                                                        }
                                                    ),
                                                shape = RoundedCornerShape(16.dp),
                                                color = MaterialTheme.colorScheme.primary,
                                                contentColor = MaterialTheme.colorScheme.onPrimary
                                            ) {
                                                Box(
                                                    modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    if (
                                                        resolvedPersistentPitchTarget?.position == PersistentPitchCardPosition.MelodyCurrent &&
                                                        persistentPitchGaugeResult != null
                                                    ) {
                                                        PitchGauge(
                                                            pitchResult = persistentPitchGaugeResult,
                                                            targetLabel = resolvedPersistentPitchTarget.label,
                                                            modifier = Modifier.matchParentSize()
                                                        )
                                                    }
                                                    // After the gauge, so the moving bar passes behind
                                                    // the degree rather than across it.
                                                    ScaleDegreeText(
                                                        label = singleMelodyPitchCard.scaleDegreeLabel,
                                                        fontSize = 28.sp,
                                                        minFontSize = 12.sp,
                                                        modifier = Modifier.fillMaxSize(),
                                                        color = MaterialTheme.colorScheme.onPrimary
                                                    )
                                                    DoubleTapHint(
                                                        modifier = Modifier.padding(4.dp),
                                                        isTessituraAdjusted = isTessituraAdjusted
                                                    )
                                                }
                                            }
                                        }
                                    } else {
                                Row(
                                    modifier = Modifier.fillMaxWidth().height(64.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    repeat(2) { index ->
                                        val pitchCard = melodyPitchCards.getOrNull(index)
                                        val verticalPosition = pitchCard?.verticalPosition
                                            ?: if (index == 0) {
                                                MelodyPitchCardVerticalPosition.TOP
                                            } else {
                                                MelodyPitchCardVerticalPosition.BOTTOM
                                            }
                                        val contentAlignment = if (verticalPosition == MelodyPitchCardVerticalPosition.TOP) {
                                            Alignment.TopCenter
                                        } else {
                                            Alignment.BottomCenter
                                        }
                                        Box(
                                            modifier = Modifier.weight(0.5f).fillMaxHeight(),
                                            contentAlignment = contentAlignment
                                        ) {
                                            Surface(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .height(30.dp)
                                                    .semantics {
                                                        contentDescription = when (pitchCard?.role) {
                                                            MelodyPitchCardRole.PREVIOUS -> "Play prior melody note ${pitchCard.scaleDegreeLabel}. Double tap to sing it back. Triple tap to toggle persistent pitch practice."
                                                            MelodyPitchCardRole.CURRENT -> "Play current melody note ${pitchCard.scaleDegreeLabel}. Double tap to sing it back. Triple tap to toggle persistent pitch practice."
                                                            null -> "Melody note unavailable"
                                                        }
                                                    }
                                                    .tripleClickable(
                                                        enabled = pitchCard != null,
                                                        onClick = {
                                                            pitchCard?.let { playSingleNotePreview(it.pitch) }
                                                        },
                                                        onDoubleClick = {
                                                            pitchCard?.let {
                                                                openSingleMelodySingingTarget(
                                                                    it.pitch,
                                                                    it.scaleDegreeLabel
                                                                )
                                                            }
                                                        },
                                                        onTripleClick = {
                                                            if (pitchCard != null) {
                                                                togglePersistentPitch(
                                                                    selection = PersistentPitchSelection.Melody,
                                                                    isDisplayedTargetActive =
                                                                        persistentPitchController.selection == PersistentPitchSelection.Melody,
                                                                    target = melodyPersistentPitchTarget
                                                                )
                                                            }
                                                        }
                                                    ),
                                                shape = RoundedCornerShape(16.dp),
                                                color = MaterialTheme.colorScheme.primary,
                                                contentColor = MaterialTheme.colorScheme.onPrimary
                                            ) {
                                                Box(
                                                    modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    if (pitchCard != null) {
                                                        ScaleDegreeText(
                                                            label = pitchCard.scaleDegreeLabel,
                                                            fontSize = 22.sp,
                                                            minFontSize = 10.sp,
                                                            modifier = Modifier.fillMaxSize(),
                                                            color = MaterialTheme.colorScheme.onPrimary
                                                        )
                                                    } else {
                                                        Text("—", fontSize = 18.sp)
                                                    }
                                                    if (pitchCard != null) {
                                                        DoubleTapHint(
                                                            modifier = Modifier.padding(2.dp),
                                                            isTessituraAdjusted = isTessituraAdjusted
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Surface(
                                    modifier = Modifier.weight(1f).fillMaxHeight()
                                        .semantics {
                                            contentDescription = melodyIntervalState?.contentDescription?.let { "$it Double tap to sing it back." }
                                                ?: "Melody interval unavailable"
                                        }
                                        .combinedClickable(
                                            enabled = melodyIntervalState != null,
                                            onClick = {
                                                melodyIntervalState?.let { state ->
                                                    playIntervalPreview(state.previous, state.current)
                                                }
                                            },
                                            onDoubleClick = {
                                                melodyIntervalState?.let { state ->
                                                    requestSingingTargets(
                                                        SingingTargetRequest(
                                                            first = SingingTargetNote(intervalPreviewNote(state.previous), melodyPreviousTargetLabel),
                                                            second = SingingTargetNote(intervalPreviewNote(state.current), melodyCurrentTargetLabel),
                                                            requestId = 0
                                                        )
                                                    )
                                                }
                                            }
                                        ),
                                    shape = RoundedCornerShape(16.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Box(modifier = Modifier.fillMaxSize()) {
                                        // Once there is a prior note this card occupies the slot the
                                        // lone scale-degree card sits in, so hosting the gauge here
                                        // keeps the singer's feedback in one place on screen as the
                                        // melody moves in and out of having a predecessor. What is
                                        // being measured is unchanged: still the current note.
                                        if (
                                            resolvedPersistentPitchTarget?.position == PersistentPitchCardPosition.MelodyCurrent &&
                                            persistentPitchGaugeResult != null
                                        ) {
                                            PitchGauge(
                                                pitchResult = persistentPitchGaugeResult,
                                                targetLabel = resolvedPersistentPitchTarget.label,
                                                modifier = Modifier.matchParentSize()
                                            )
                                        }
                                        // After the gauge, so the moving bar passes behind the
                                        // interval rather than across it.
                                        Text(
                                            text = melodyIntervalState?.interval?.shorthand ?: "—",
                                            modifier = Modifier.align(Alignment.Center),
                                            fontSize = 32.sp,
                                            fontWeight = FontWeight.Bold,
                                            textAlign = TextAlign.Center,
                                            maxLines = 1
                                        )
                                        if (melodyIntervalState != null) {
                                            DoubleTapHint(
                                                modifier = Modifier.padding(4.dp),
                                                isTessituraAdjusted = isTessituraAdjusted
                                            )
                                        }
                                    }
                                }
                                }
                                    }
                                }
                                }
                                Spacer(Modifier.height(8.dp))
                                currentChord?.let { chord ->
                                    val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                                    if (!isRest) {
                                        val symbol = if (useRelativeIonianContext) ChordInterpreter.getRelativeIonianRomanSymbol(chord, activeKey, ionianContextKey) else ChordInterpreter.getRomanSymbol(chord, activeKey)
                                        val romanDisplay = RomanNumeralDisplay.fromChord(symbol, chord["borrowed"])
                                        val notes = ChordInterpreter.getChordNotes(chord, activeKey)
                                        val rootMidi = ChordInterpreter.getRootPositionChordNotes(chord, activeKey).firstOrNull() ?: 0
                                        val spelledRoot = ChordInterpreter.resolveChordRoot(chord, activeKey)?.pitch
                                        val chordDurationBeats = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                                        val chordDurationMs = remainingPlaybackDurationMs(chordDurationBeats, 0.0, bpm)
                                        val previewNotes = notes
                                        val degreeSpacing = when { notes.size >= 7 -> 2.dp; notes.size >= 5 -> 4.dp; else -> 6.dp }
                                        val degreeFontSize = when { notes.size >= 7 -> 24.sp; notes.size >= 5 -> 26.sp; else -> 28.sp }
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Button(onClick = { scope.launch { chordDurationMs?.let { AudioEngine.playChord(previewNotes, durationMs = it, channel = AudioEngine.PlaybackChannel.PREVIEW) } } }, enabled = chordDurationMs != null, modifier = Modifier.weight(1f).height(60.dp), shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) {
                                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { RomanNumeralText(display = romanDisplay, fontSize = 32.sp, modifier = Modifier.fillMaxWidth(), minFontSize = 12.sp) }
                                            }
                                        }
                                        if (rootMidi > 0) { Spacer(Modifier.height(8.dp)); Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(degreeSpacing)) {
                                            notes.forEachIndexed { index, note ->
                                                // Chord-tone cards describe the chord's internal structure, so
                                                // their degrees always stay relative to the effective chord root.
                                                val cardTarget = currentChordToneTargets.getOrNull(index)
                                                val internalLabel = cardTarget?.label
                                                    ?: MusicTheory.getRelativeDegreeLabel(note, rootMidi)
                                                val previewNote = cardTarget?.sourceMidi
                                                    ?: if (useRelativeIonianContext) (spelledRoot?.let { ionianContextPreviewAudioNote(note, it, ionianContextKey) } ?: ionianContextPreviewAudioNote(note, ionianContextKey)) ?: note else note
                                                val activeChordToneIndex =
                                                    (resolvedPersistentPitchTarget?.position as? PersistentPitchCardPosition.ChordTone)
                                                        ?.displayedIndex
                                                Surface(
                                                    modifier = Modifier.weight(1f).height(54.dp)
                                                        .semantics { contentDescription = "Play scale degree $internalLabel. Double tap to sing it back. Triple tap to toggle persistent pitch practice." }
                                                        .tripleClickable(
                                                            onClick = { scope.launch { AudioEngine.playChord(listOf(previewNote), channel = AudioEngine.PlaybackChannel.PREVIEW) } },
                                                            onDoubleClick = {
                                                                requestSingingTargets(
                                                                    SingingTargetRequest(
                                                                        first = SingingTargetNote(previewNote, internalLabel),
                                                                        second = null,
                                                                        requestId = 0
                                                                    )
                                                                )
                                                            },
                                                            onTripleClick = {
                                                                togglePersistentPitch(
                                                                    selection = PersistentPitchSelection.ChordTone(index),
                                                                    isDisplayedTargetActive = activeChordToneIndex == index,
                                                                    target = cardTarget
                                                                )
                                                            }
                                                        ),
                                                    shape = RoundedCornerShape(14.dp),
                                                    color = MaterialTheme.colorScheme.primary,
                                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                                ) {
                                                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                                        if (
                                                            activeChordToneIndex == index &&
                                                            persistentPitchGaugeResult != null
                                                        ) {
                                                            PitchGauge(
                                                                pitchResult = persistentPitchGaugeResult,
                                                                targetLabel = resolvedPersistentPitchTarget?.label.orEmpty(),
                                                                modifier = Modifier.matchParentSize()
                                                            )
                                                        }
                                                        // After the gauge, so the moving bar passes
                                                        // behind the degree rather than across it.
                                                        ScaleDegreeText(label = internalLabel, fontSize = degreeFontSize, modifier = Modifier.fillMaxWidth(), minFontSize = 12.sp)
                                                        DoubleTapHint(
                                                            modifier = Modifier.padding(2.dp),
                                                            isTessituraAdjusted = isTessituraAdjusted
                                                        ) }
                                                } }
                                        } }
                                    }
                                }
                            }
                        }
                    }


                    Spacer(modifier = Modifier.weight(1f))

                    // Unified playback scrub bar
                    Slider(
                        value = currentBeat.toFloat().coerceIn(1f, endBeat.toFloat()),
                        onValueChange = { beat -> scrubTo(beat.toDouble()) },
                        onValueChangeFinished = { finishScrubbing() },
                        valueRange = 1f..endBeat.toFloat(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(32.dp)
                    )

                    Spacer(modifier = Modifier.height(72.dp))
                }
            }

        Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Box(modifier = Modifier.align(Alignment.BottomStart).offset(x = (-8).dp, y = (-88).dp)) { waveformPickerComposable() }
            
            Column(modifier = Modifier.align(Alignment.BottomEnd), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                persistentPitchController.errorMessage?.let { message ->
                    Text(
                        text = message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
                playbackState.error?.let { message ->
                    Text(
                        text = message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = "Root Only", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Switch(
                            checked = isSimpleMode,
                            onCheckedChange = {
                                persistentPitchController.cancel()
                                onSimpleModeChange(it)
                            }
                        )
                    }
                    FilledTonalButton(
                        onClick = {
                            cancelInertia()
                            intervalPreviewJob?.cancel()
                            AudioEngine.stopAllPlayback()
                            isScrubbing = false
                            wasPlayingBeforeScrub = false
                            scrubBeat = 1.0
                            quizPlaybackEngine.reset()
                            // Clearing the accumulator first matters: rewinding to the top
                            // disposes the run that was sounding, and that dispose would
                            // otherwise bank its score right back into the map we just emptied.
                            melodyRunScoreAccumulator.clear()
                            fixedMelodyPitchScores = emptyMap()
                        },
                        modifier = Modifier.size(56.dp),
                        contentPadding = PaddingValues(0.dp),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Reset", modifier = Modifier.size(28.dp))
                    }
                    sectionPicker()
                }
            }

            DraggableQuizPlayPauseButton(
                isPlaying = isPlaying,
                enabled = !isScrubbing && bpm > 0.0,
                xFraction = quizPlayButtonXFraction,
                yFraction = quizPlayButtonYFraction,
                onPositionChange = onQuizPlayButtonPositionChange,
                onClick = {
                    if (!isScrubbing && bpm > 0.0) {
                        intervalPreviewJob?.cancel()
                        AudioEngine.stopPreviewPlayback()
                        if (isPlaying) quizPlaybackEngine.pause() else quizPlaybackEngine.play()
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtistSongsView(
    artistName: String,
    songs: List<SongBrowseRow>,
    onSongClick: (SongBrowseRow) -> Unit,
    onBack: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        ) {
            TextButton(onClick = onBack) { Text("< Back") }
            Text(
                text = "Artist: $artistName",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 8.dp)
            )
        }
        
        LazyColumn(modifier = Modifier.weight(1f)) {
            items(songs) { song ->
                Card(
                    onClick = { onSongClick(song) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                ) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        Text(text = song.title ?: "Unknown Title", style = MaterialTheme.typography.bodyLarge)
                        Text(text = song.artist ?: "Unknown Artist", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

private fun ExtractedSection.metadataObjects(field: String): List<JsonObject> =
    (metadata?.get(field) as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()

private fun JsonObject.num(field: String): Double? = (this[field] as? JsonPrimitive)?.doubleOrNull

private fun prettyScaleName(scale: String): String = scale
    .replace(Regex("([a-z])([A-Z])"), "$1 $2")
    .replaceFirstChar { it.uppercase() }

private fun formatBeat(beat: Double): String =
    if (beat % 1.0 == 0.0) beat.toInt().toString() else "%.2f".format(beat).trimEnd('0').trimEnd('.')

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun InfoTab(
    song: Song,
    section: ExtractedSection,
    sections: Map<String, ExtractedSection>,
    selectedId: String?,
    onSectionChange: (String) -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()

    val keys = remember(section) { section.getKeys() }
    val tempos = remember(section) { section.metadataObjects("tempos") }
    val meters = remember(section) { section.metadataObjects("meters") }
    val orderedSections = remember(sections) { sections.sectionsInSongOrder() }

    val bpm = section.getBpm()
    val beatsPerMeasure = meters.firstOrNull()?.num("numBeats")?.toInt()
    val endBeat = section.metadata?.num("endBeat")
    val totalBeats = endBeat?.let { (it - 1).coerceAtLeast(0.0) }?.takeIf { it > 0.0 }
    val durationLabel = totalBeats?.let {
        val secs = (it / bpm * 60.0).roundToInt()
        "%d:%02d".format(secs / 60, secs % 60)
    }
    val measures = totalBeats?.let { beats ->
        beatsPerMeasure?.takeIf { it > 0 }?.let { kotlin.math.ceil(beats / it).toInt() }
    }

    val melodyNotes = remember(section) {
        val raw = when (val n = section.notes) {
            is JsonArray -> n.toList()
            is JsonObject -> (n["melody1"] as? JsonArray)?.toList() ?: emptyList()
            else -> emptyList()
        }
        raw.mapNotNull { it as? JsonObject }
    }
    val soundedNotes = melodyNotes.count { note ->
        (note["isRest"] as? JsonPrimitive)?.booleanOrNull != true &&
            (note["rest"] as? JsonPrimitive)?.booleanOrNull != true
    }

    val progression = remember(section) {
        section.chords.sortedBy { it.num("beat") ?: 0.0 }
    }
    val uniqueChordCount = remember(section) {
        ChordInterpreter.getUniqueDisplayChords(section.chords, section.getParsedKey()).size
    }

    val youtubeId = (section.metadata?.get("youtube") as? JsonObject)
        ?.let { (it["id"] as? JsonPrimitive)?.contentOrNull }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 96.dp)
    ) {
        item {
            Text(
                text = song.title ?: "Unknown Title",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            song.artist?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            Text(
                text = section.safeSectionName.uppercase(),
                style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 10.dp)
            )
        }

        item { InfoGroup("Overview") }
        item {
            val firstKey = keys.first().key
            InfoRow("Key", "${firstKey.tonic} ${prettyScaleName(firstKey.scale)}")
            InfoRow("Tempo", "${bpm.roundToInt()} BPM")
            beatsPerMeasure?.let { InfoRow("Beats / measure", it.toString()) }
            durationLabel?.let { InfoRow("Length", it) }
            totalBeats?.let { beats ->
                InfoRow("Beats", formatBeat(beats) + (measures?.let { " · $it bars" } ?: ""))
            }
            InfoRow("Chords", "${progression.size} (${uniqueChordCount} unique)")
            if (melodyNotes.isNotEmpty()) {
                InfoRow("Melody notes", "$soundedNotes sounded / ${melodyNotes.size} total")
            } else {
                // State it rather than omitting the row: a silently missing
                // melody reads as a bug in the app instead of what it is —
                // a chord-only TheoryTab. ~1.3k songs in the catalog are
                // chord-only upstream.
                InfoRow("Melody notes", "None — chords only")
            }
        }

        if (progression.isNotEmpty()) {
            item { InfoGroup("Progression") }
            item {
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    progression.forEach { chord ->
                        val beat = chord.num("beat") ?: 1.0
                        val chordKey = section.getKeyAtBeat(beat)
                        val symbol = ChordInterpreter.getRomanSymbol(chord, chordKey)
                        val letterName = ChordInterpreter.getLetterName(chord, chordKey)
                        ChordPill(
                            display = RomanNumeralDisplay.fromChord(symbol, chord["borrowed"]),
                            letterName = letterName,
                            contentDescription = "Play $letterName at beat ${formatBeat(beat)}",
                            onClick = {
                                val notes = ChordInterpreter.getChordNotes(chord, chordKey)
                                if (notes.isNotEmpty()) {
                                    scope.launch { AudioEngine.playChord(notes) }
                                }
                            }
                        )
                    }
                }
            }
        }

        if (keys.size > 1) {
            item { InfoGroup("Key changes") }
            item {
                keys.forEach { k ->
                    InfoRow(
                        "Beat ${formatBeat(k.beat)}",
                        "${k.key.tonic} ${prettyScaleName(k.key.scale)}"
                    )
                }
            }
        }

        if (tempos.size > 1) {
            item { InfoGroup("Tempo changes") }
            item {
                tempos.forEach { t ->
                    InfoRow(
                        "Beat ${formatBeat(t.num("beat") ?: 1.0)}",
                        "${(t.num("bpm") ?: 120.0).roundToInt()} BPM"
                    )
                }
            }
        }

        if (meters.size > 1) {
            item { InfoGroup("Meter changes") }
            item {
                meters.forEach { m ->
                    InfoRow(
                        "Beat ${formatBeat(m.num("beat") ?: 1.0)}",
                        "${(m.num("numBeats") ?: 4.0).toInt()} beats / measure"
                    )
                }
            }
        }

        if (orderedSections.size > 1) {
            item { InfoGroup("Sections") }
            item {
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    orderedSections.forEach { (id, entry) ->
                        FilterChip(
                            selected = id == selectedId,
                            onClick = { onSectionChange(id) },
                            label = { Text(entry.safeSectionName) }
                        )
                    }
                }
            }
        }

        item { InfoGroup("Source") }
        item {
            section.safeNumericId.takeIf { it.isNotBlank() }?.let { InfoRow("Hooktheory ID", it) }
            InfoRow("Slug", song.slug)
            Row(modifier = Modifier.padding(top = 4.dp)) {
                TextButton(
                    onClick = { uriHandler.openUri(song.url) },
                    contentPadding = PaddingValues(horizontal = 4.dp)
                ) { Text("Open on Hooktheory ↗") }
                youtubeId?.let { id ->
                    TextButton(
                        onClick = { uriHandler.openUri("https://www.youtube.com/watch?v=$id") },
                        contentPadding = PaddingValues(horizontal = 4.dp)
                    ) { Text("YouTube ↗") }
                }
            }
        }
    }
}

@Composable
private fun InfoGroup(title: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 22.dp)) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
        Divider(
            modifier = Modifier.padding(top = 6.dp),
            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 7.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(start = 16.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChordPill(
    display: RomanNumeralDisplay,
    letterName: String,
    contentDescription: String,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        modifier = Modifier
            .padding(bottom = 6.dp)
            .semantics { this.contentDescription = contentDescription }
    ) {
        Column(
            modifier = Modifier
                .widthIn(min = 54.dp)
                .padding(horizontal = 10.dp, vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            RomanNumeralText(display = display, fontSize = 16.sp)
            Text(
                text = letterName,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
                maxLines = 1
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChordsTab(
    section: ExtractedSection,
    showLetterNames: Boolean,
    onShowLetterNamesChange: (Boolean) -> Unit,
    isArpeggiated: Boolean,
    onArpeggiatedChange: (Boolean) -> Unit,
    arpeggioStepMs: Float,
    onArpeggioStepMsChange: (Float) -> Unit
) {
    val key = section.getParsedKey()
    val scope = rememberCoroutineScope()
    val displayChords = remember(section, key) {
        ChordInterpreter.getUniqueDisplayChords(section.chords, key)
    }
    val scaleNotes = remember(key) {
        val intervals = MusicTheory.SCALE_INTERVALS[key.scale] ?: MusicTheory.SCALE_INTERVALS["major"]!!
        MusicTheory.generateScaleLabels(key.tonic, intervals)
    }

    Column(modifier = Modifier.padding(16.dp)) {
        // Current Scale Header
        Text(
            text = "Scale: ${scaleNotes.joinToString(", ")}",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Key: ${key.tonic} ${key.scale}", style = MaterialTheme.typography.titleMedium)
            
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Letters", style = MaterialTheme.typography.bodySmall)
                    Switch(
                        checked = showLetterNames,
                        onCheckedChange = onShowLetterNamesChange,
                        modifier = Modifier.scale(0.7f)
                    )
                }

                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text("Arpeggiate", style = MaterialTheme.typography.bodySmall)
                    Switch(
                        checked = isArpeggiated,
                        onCheckedChange = onArpeggiatedChange,
                        modifier = Modifier.scale(0.7f)
                    )
                }
            }
        }
        
        if (isArpeggiated) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Speed: ${arpeggioStepMs.toInt()} ms",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.width(90.dp)
                )
                Slider(
                    value = arpeggioStepMs,
                    onValueChange = onArpeggioStepMsChange,
                    valueRange = 30f..1000f,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        
        LazyVerticalGrid(
            columns = GridCells.Adaptive(100.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(displayChords) { chord ->
                val symbol = ChordInterpreter.getRomanSymbol(chord, key)
                val romanDisplay = RomanNumeralDisplay.fromChord(symbol, chord["borrowed"])
                val letterName = ChordInterpreter.getLetterName(chord, key)

                Card(
                    onClick = {
                        val notes = ChordInterpreter.getChordNotes(chord, key)
                        if (notes.isNotEmpty()) {
                            scope.launch {
                                AudioEngine.playChord(notes, arpeggiate = isArpeggiated, stepMs = arpeggioStepMs.toInt())
                            }
                        }
                    },
                    modifier = Modifier.height(80.dp)
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            RomanNumeralText(
                                display = romanDisplay,
                                fontSize = 20.sp,
                                modifier = Modifier.fillMaxWidth()
                            )
                            if (showLetterNames) {
                                Text(
                                    text = letterName,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.secondary,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
