package com.acquiring.android

import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.ActivityNotFoundException
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
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
import androidx.compose.ui.platform.LocalUriHandler
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


private enum class SongParentPage {
    LIBRARY,
    ARTIST,
    ALL_SONGS
}

private const val ALL_SONGS_STATE_KEY = "all-songs"

@OptIn(ExperimentalMaterial3Api::class)
class MainActivity : ComponentActivity() {
    private lateinit var db: AppDatabase
    private lateinit var userDb: UserDataDatabase
    private val songOctaveOffsetViewModel by viewModels<SongOctaveOffsetViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (resources.getBoolean(R.bool.lock_phone_portrait)) {
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        enableEdgeToEdge()

        AppAudioOutput.initialize(this)
        QuizPlaybackController.initialize(this)
        AppInstrumentSession.initialize(this)
        TimelineFrameRateStore.initialize(this)
        AudioDiagnostics.record("app.audioInitialized")

        db = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java, AppDatabase.DB_NAME
        ).addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3).build()

        // A separate file from the catalog, and deliberately not rebuilt when a
        // downloaded catalog replaces AppDatabase. See UserDataDatabase.
        userDb = Room.databaseBuilder(
            applicationContext,
            UserDataDatabase::class.java, UserDataDatabase.DB_NAME
        ).addMigrations(UserDataDatabase.MIGRATION_1_2, UserDataDatabase.MIGRATION_2_3).build()
        songOctaveOffsetViewModel.attachDao(userDb.songOctaveOffsetDao())

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
            var showIntroduction by remember {
                mutableStateOf(!IntroductionPrefs.hasCompleted(this@MainActivity))
            }
            MaterialTheme(colorScheme = darkColorScheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    if (showIntroduction) {
                        IntroductionView(
                            onContinue = {
                                IntroductionPrefs.markCompleted(this@MainActivity)
                                showIntroduction = false
                            }
                        )
                    } else {
                        MainScreen(db, userDb, songOctaveOffsetViewModel)
                    }
                }
            }
        }
    }

    override fun onPause() {
        QuizPlaybackController.pauseForAppInactive()
        AudioEngine.stopAllPlayback()
        super.onPause()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MainScreen(
    db: AppDatabase,
    userDb: UserDataDatabase,
    songOctaveOffsetViewModel: SongOctaveOffsetViewModel
) {
    var activeDb by remember { mutableStateOf(db) }
    val searchFocusManager = LocalFocusManager.current
    // Not swapped when the catalog is: playlists outlive a catalog download.
    val playlistDao = remember(userDb) { userDb.playlistDao() }
    var urlToHarvest by remember { mutableStateOf("") }
    var harvestStatus by remember { mutableStateOf("") }
    var searchQuery by remember { mutableStateOf("") }
    var searchArtistQuery by remember { mutableStateOf("") }
    var searchResult by remember { mutableStateOf<String?>(null) }
    var catalogStatus by remember { mutableStateOf("") }
    var updateStatus by remember { mutableStateOf("") }
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
    var selectedSongComplexityRating by remember { mutableStateOf<Double?>(null) }
    var selectedSectionId by remember { mutableStateOf<String?>(null) }
    var isShowingAllSongs by rememberSaveable { mutableStateOf(false) }
    var isShowingSettings by rememberSaveable { mutableStateOf(false) }
    var timelineFrameRate by remember {
        mutableStateOf(TimelineFrameRateStore.preference)
    }
    var isShowingQuiz by remember { mutableStateOf(false) }
    var songParentPage by remember { mutableStateOf(SongParentPage.LIBRARY) }
    var showLetterNames by remember { mutableStateOf(false) }
    var quizTempoPercent by remember(selectedSong?.slug) { mutableStateOf(100f) }
    var quizArpeggioOptionIndex by remember(selectedSong?.slug) {
        mutableStateOf(DEFAULT_QUIZ_ARPEGGIO_OPTION_INDEX)
    }
    var isShowingRecent by remember { mutableStateOf(false) }
    var isShowingRecentArtists by remember { mutableStateOf(false) }
    val currentWaveform by AppInstrumentSession.sessionInstrument.collectAsState()
    val defaultInstrument by AppInstrumentSession.defaultInstrument.collectAsState()
    var globalTranspose by remember { mutableStateOf(AudioEngine.globalTranspose) }
    var singingTargetRequest by remember { mutableStateOf<SingingTargetRequest?>(null) }
    var singingTargetRequestId by remember { mutableStateOf(0) }
    var singingDockExpanded by remember { mutableStateOf(false) }
    var singingDepartureTick by remember { mutableStateOf(0) }
    var singingCollapseTick by remember { mutableStateOf(0) }
    var stopPersistentTick by remember { mutableStateOf(0) }
    var isPersistentMonitoring by remember { mutableStateOf(false) }
    var quizWasShown by remember { mutableStateOf(false) }
    val octaveOffset = songOctaveOffsetViewModel.octaveOffset
    
    var titleOffset by remember { mutableStateOf(0) }
    var artistOffset by remember { mutableStateOf(0) }
    var isTitlePaging by remember { mutableStateOf(false) }
    var isArtistPaging by remember { mutableStateOf(false) }
    var browseOpenJob by remember { mutableStateOf<Job?>(null) }
    var catalogAutoInstallStarted by remember { mutableStateOf(false) }
    var playUpdateStatus by remember { mutableStateOf(PlayUpdateStatus.UNAVAILABLE) }
    
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val downloadCatalog: () -> Unit = {
        scope.launch {
            catalogStatus = "Starting download..."
            val result = DatabaseDownloader.downloadAndInstallCatalog(
                context = context,
                currentDb = activeDb,
                userDb = userDb
            ) { catalogStatus = it }

            if (result.isSuccess) {
                CatalogAutoInstall.markRefreshed(context)
                // Re-open the replacement catalog after its atomic install.
                activeDb = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java, AppDatabase.DB_NAME
                ).addMigrations(
                    AppDatabase.MIGRATION_1_2,
                    AppDatabase.MIGRATION_2_3
                ).build()
                // Rebuild manual harvests the new catalog does not carry.
                // Skipping this is survivable: the launch-time replay below
                // picks them up, so a failure delays restoration, never loses it.
                val restored = runCatching { HarvestLedger.replay(activeDb, userDb) }.getOrDefault(0)
                catalogStatus = if (restored > 0) {
                    "Database Refreshed! ($restored harvested song${if (restored == 1) "" else "s"} kept)"
                } else {
                    "Database Refreshed!"
                }
            } else {
                // A validated install closes Room only immediately before the
                // atomic swap. Reopen the preserved catalog if needed.
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
    LaunchedEffect(activeDb) {
        val songCount = runCatching { activeDb.songDao().getSongCount() }.getOrDefault(0)
        if (CatalogAutoInstall.shouldStart(songCount, catalogAutoInstallStarted)) {
            catalogAutoInstallStarted = true
            downloadCatalog()
        }
    }
    LaunchedEffect(Unit) {
        playUpdateStatus = checkPlayUpdateStatus(context)
    }
    val microphonePitchCoordinator = remember(context.applicationContext) {
        MicrophonePitchCoordinator(MicrophonePitchTracker(context.applicationContext))
    }
    val persistentQuizPitchSource = remember(microphonePitchCoordinator) {
        microphonePitchCoordinator.sourceFor(MicrophonePitchOwner.QUIZ_PERSISTENT)
    }
    val singingToolPitchSource = remember(microphonePitchCoordinator) {
        microphonePitchCoordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL)
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

    val harvestService = remember(activeDb, userDb) { HarvestService(activeDb, userDb) }
    val catalogSearchIndex = remember { CatalogSearchIndex() }
    var searchIndexEpoch by remember { mutableStateOf(0) }
    fun rememberIndexedSong(song: Song) {
        catalogSearchIndex.upsert(SongBrowseRow(song.slug, song.artist, song.title))
        searchIndexEpoch++
    }
    // Repairs an install that died between the swap and its own replay. Replay
    // is insert-if-absent, so the usual case is one query and no writes.
    LaunchedEffect(activeDb, userDb) {
        runCatching { HarvestLedger.replay(activeDb, userDb) }
        val rows = runCatching { activeDb.songDao().getSearchIndexRows() }.getOrDefault(emptyList())
        catalogSearchIndex.replaceAll(rows)
        searchIndexEpoch++
    }
    val json = remember { Json { ignoreUnknownKeys = true } }
    val singingSessionKey = selectedSong?.slug?.let { slug -> "$slug:${selectedSectionId.orEmpty()}" }
    LaunchedEffect(isShowingQuiz) {
        if (isShowingQuiz) {
            quizWasShown = true
        } else if (quizWasShown) {
            singingDepartureTick++
            stopPersistentTick++
        }
    }
    LaunchedEffect(singingSessionKey, selectedSong?.slug) {
        val slug = selectedSong?.slug
        val key = singingSessionKey
        if (slug != null && key != null) {
            songOctaveOffsetViewModel.enterSession(slug, key)
        }
        singingTargetRequest = null
    }
    LaunchedEffect(selectedSong?.slug) {
        if (selectedSong != null) {
            globalTranspose = 0
            AudioEngine.globalTranspose = 0
        }
    }
    LaunchedEffect(activeDb, selectedSong?.slug) {
        selectedSongComplexityRating = selectedSong?.slug?.let { slug ->
            try {
                activeDb.songDao().getComplexityRating(slug)
            } catch (_: Exception) {
                null
            }
        }
    }

    // Whether the open song sits in Favorites, read once per song. The star
    // flips this optimistically and writes through, the way every other control
    // on this screen behaves.
    var isSelectedSongFavorite by remember { mutableStateOf(false) }
    var showFavoritedConfirmation by remember { mutableStateOf(false) }
    LaunchedEffect(playlistDao, selectedSong?.slug) {
        val slug = selectedSong?.slug
        isSelectedSongFavorite = if (slug == null) {
            false
        } else {
            try {
                playlistDao.isInPlaylist(PlaylistIds.FAVORITES, slug)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                false
            }
        }
    }
    val toggleSelectedSongFavorite = {
        val slug = selectedSong?.slug
        if (slug != null) {
            val shouldAdd = !isSelectedSongFavorite
            isSelectedSongFavorite = shouldAdd
            scope.launch {
                try {
                    playlistDao.ensureBuiltInPlaylist(
                        id = PlaylistIds.FAVORITES,
                        name = PlaylistIds.FAVORITES_NAME,
                        createdAt = System.currentTimeMillis()
                    )
                    if (shouldAdd) {
                        playlistDao.addEntry(
                            PlaylistEntry(
                                playlistId = PlaylistIds.FAVORITES,
                                slug = slug,
                                addedAt = System.currentTimeMillis()
                            )
                        )
                    } else {
                        playlistDao.removeEntry(PlaylistIds.FAVORITES, slug)
                    }
                    if (shouldShowFavoritedConfirmation(shouldAdd, writeSucceeded = true)) {
                        showFavoritedConfirmation = true
                        delay(FAVORITED_CONFIRMATION_MS)
                        showFavoritedConfirmation = false
                    }
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (_: Exception) {
                    // Put the star back rather than claiming a write that failed.
                    isSelectedSongFavorite = !shouldAdd
                    showFavoritedConfirmation = false
                }
            }
        }
    }

    val returnToParent = {
        browseOpenJob?.cancel()
        browseOpenJob = null
        if (isShowingSettings) {
            isShowingSettings = false
        } else if (selectedArtistSongs != null && selectedSongSections == null) {
            selectedArtistName = null
            selectedArtistSongs = null
        } else if (selectedSongSections != null && !isShowingQuiz) {
            isShowingQuiz = true
        } else if (selectedSongSections != null) {
            songOctaveOffsetViewModel.clearSession()
            selectedSongSections = null
            selectedSong = null
            isShowingQuiz = false
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
        enabled = isShowingSettings || selectedSongSections != null || selectedArtistSongs != null || isShowingAllSongs
    ) {
        returnToParent()
    }

    LaunchedEffect(activeDb, searchQuery, selectedSong, selectedArtistSongs, hasSearchTitleFocus, searchIndexEpoch) {
        if (searchQuery.isNotEmpty() && hasSearchTitleFocus) {
            if (!catalogSearchIndex.isLoaded) delay(300)
            titleOffset = 0
            suggestions = if (catalogSearchIndex.isLoaded) {
                catalogSearchIndex.songSuggestions(searchQuery, limit = 20, offset = 0)
            } else {
                activeDb.songDao().getSearchSuggestions(searchQuery, limit = 20, offset = 0)
            }
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

    LaunchedEffect(activeDb, searchArtistQuery, selectedSong, selectedArtistSongs, hasSearchArtistFocus, searchIndexEpoch) {
        if (searchArtistQuery.isNotEmpty() && hasSearchArtistFocus) {
            isShowingRecentArtists = false
            if (!catalogSearchIndex.isLoaded) delay(300)
            artistOffset = 0
            artistSuggestions = if (catalogSearchIndex.isLoaded) {
                catalogSearchIndex.artistSuggestions(searchArtistQuery, limit = 20, offset = 0)
            } else {
                activeDb.songDao().getArtistSuggestions(searchArtistQuery, limit = 20, offset = 0)
            }
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
        songOctaveOffsetViewModel.clearSession()
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
                    isShowingQuiz = true
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
                    rememberIndexedSong(harvestedSong)
                    val blob = harvestedSong.dataBlob
                    if (blob != null) {
                        try {
                            val sections = decodeSongSections(blob)
                            if (selectedSong?.slug != song.slug) return@launch
                            HistoryManager.addArtist(context, harvestedSong.artist)
                            selectedSong = harvestedSong
                            selectedSongSections = sections
                            selectedSectionId = sections.sectionsInSongOrder().firstOrNull()?.key ?: sections.keys.firstOrNull()
                            isShowingQuiz = true
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

    Box(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
        // Invisible target that owns the default initial focus on launch, so the
        // search field starts genuinely unselected instead of grabbing focus itself.
        Box(
            modifier = Modifier
                .size(1.dp)
                .focusRequester(initialFocusRequester)
                .focusTarget()
        )
        Column(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .weight(1f)
                .then(
                    if (isShowingQuiz) Modifier else Modifier.padding(16.dp)
                )
        ) {
            if (isShowingSettings) {
                AppSettingsScreen(
                    defaultInstrument = defaultInstrument,
                    onDefaultInstrumentChange = AppInstrumentSession::selectAsDefault,
                    catalogStatus = catalogStatus,
                    catalogFreshness = CatalogAutoInstall.lastRefreshLabel(context),
                    onUpdateCatalog = downloadCatalog,
                    playUpdateStatus = playUpdateStatus,
                    onOpenPlayUpdate = {
                        openUpdateDistribution(context)
                    },
                    timelineFrameRate = timelineFrameRate,
                    onTimelineFrameRateChange = {
                        TimelineFrameRateStore.select(context, it)
                        timelineFrameRate = it
                    },
                    onShareAudioDiagnostics = { AudioDiagnostics.share(context) },
                    onResetAudioEngine = { AudioDiagnostics.resetEngine() },
                    onBack = { isShowingSettings = false }
                )
            } else if (selectedSongSections == null) {
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
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(
                            onClick = { isShowingSettings = true },
                            modifier = Modifier.semantics { contentDescription = "Open settings" }
                        ) {
                            Text(
                                if (playUpdateStatus == PlayUpdateStatus.UPDATE_AVAILABLE) {
                                    "Settings •"
                                } else {
                                    "Settings"
                                }
                            )
                        }
                    }
                    LibraryView(
                    activeDb = activeDb,
                    playlistDao = playlistDao,
                    urlToHarvest = urlToHarvest,
                    onUrlChange = { urlToHarvest = it },
                    harvestStatus = harvestStatus,
                    onHarvest = {
                        scope.launch {
                            harvestStatus = "Starting..."
                            val result = harvestService.harvest(urlToHarvest) { harvestStatus = it }
                            result.onSuccess(::rememberIndexedSong)
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
                        val query = searchQuery.trim()
                        searchFocusManager.clearFocus(force = true)
                        isExpanded = false
                        isArtistExpanded = false
                        if (query.isBlank()) {
                            allSongs = emptyList()
                            searchResult = "Enter a title to search"
                            isExpanded = false
                        } else {
                            scope.launch {
                                val results = if (catalogSearchIndex.isLoaded) {
                                    catalogSearchIndex.songsByTitle(query)
                                } else {
                                    activeDb.songDao().searchBrowseSongsByTitle(query)
                                }
                                allSongs = results
                                searchResult = if (results.isNotEmpty()) "Found ${results.size} matches" else "No titles matching '$query'"
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
                                    val nextSuggestions = if (catalogSearchIndex.isLoaded) {
                                        catalogSearchIndex.songSuggestions(
                                            requestedQuery,
                                            limit = 20,
                                            offset = nextOffset
                                        )
                                    } else {
                                        activeDb.songDao().getSearchSuggestions(
                                            requestedQuery,
                                            limit = 20,
                                            offset = nextOffset
                                        )
                                    }
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
                                    val nextSuggestions = if (catalogSearchIndex.isLoaded) {
                                        catalogSearchIndex.artistSuggestions(
                                            requestedQuery,
                                            limit = 20,
                                            offset = nextOffset
                                        )
                                    } else {
                                        activeDb.songDao().getArtistSuggestions(
                                            requestedQuery,
                                            limit = 20,
                                            offset = nextOffset
                                        )
                                    }
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
                        songOctaveOffsetViewModel.clearSession()
                        HistoryManager.addArtist(context, artistName)
                        songParentPage = SongParentPage.ARTIST
                        scope.launch {
                            val results = activeDb.songDao().getBrowseSongsByArtist(artistName)
                            selectedArtistName = canonicalArtistName(artistName)
                            selectedArtistSongs = results
                            isArtistExpanded = false
                        }
                    },
                    onSearchArtist = {
                        val query = searchArtistQuery.trim()
                        searchFocusManager.clearFocus(force = true)
                        isExpanded = false
                        isArtistExpanded = false
                        if (query.isBlank()) {
                            allSongs = emptyList()
                            searchResult = "Enter an artist to search"
                        } else {
                            scope.launch {
                                val results = if (catalogSearchIndex.isLoaded) {
                                    catalogSearchIndex.songsByArtist(query)
                                } else {
                                    activeDb.songDao().searchBrowseSongsByArtist(query)
                                }
                                allSongs = results
                                searchResult = if (results.isNotEmpty()) "Found ${results.size} matches" else "No artists matching '$query'"
                            }
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
                    onSongClick = openBrowseSong
                )
                }
            } else if (isShowingQuiz) {
                QuizDestination(
                    song = selectedSong!!,
                    sections = selectedSongSections!!,
                    selectedSectionId = selectedSectionId,
                    onSectionChange = { selectedSectionId = it },
                    currentWaveform = currentWaveform,
                    onWaveformChange = {
                        AppInstrumentSession.selectForSession(it)
                    },
                    globalTranspose = globalTranspose,
                    quizTempoPercent = quizTempoPercent,
                    onQuizTempoPercentChange = { quizTempoPercent = it },
                    quizArpeggioOptionIndex = quizArpeggioOptionIndex,
                    onQuizArpeggioOptionIndexChange = { quizArpeggioOptionIndex = it },
                    onTransposeChange = {
                        globalTranspose = it
                        AudioEngine.globalTranspose = it
                    },
                    onArtistClick = { artistName ->
                        songOctaveOffsetViewModel.clearSession()
                        HistoryManager.addArtist(context, artistName)
                        songParentPage = SongParentPage.ARTIST
                        scope.launch {
                            val results = activeDb.songDao().getBrowseSongsByArtist(artistName)
                            selectedArtistName = canonicalArtistName(artistName)
                            selectedArtistSongs = results
                            selectedSongSections = null
                            selectedSong = null
                            isShowingQuiz = false
                        }
                    },
                    onShowSongInfo = { isShowingQuiz = false },
                    onSingingTargetsRequested = { request ->
                        singingTargetRequestId++
                        singingTargetRequest = request.copy(requestId = singingTargetRequestId)
                    },
                    octaveOffset = octaveOffset,
                    persistentPitchSource = persistentQuizPitchSource,
                    isFavorite = isSelectedSongFavorite,
                    onToggleFavorite = toggleSelectedSongFavorite,
                    singingDockExpanded = singingDockExpanded,
                    onBack = returnToParent,
                    stopPersistentSignal = stopPersistentTick,
                    onPersistentMonitoringChange = { active ->
                        isPersistentMonitoring = active
                    },
                    onRequestCollapseDock = { singingCollapseTick++ }
                )
            } else {
                SongDetailView(
                    song = selectedSong!!,
                    complexityRating = selectedSongComplexityRating,
                    sections = selectedSongSections!!,
                    selectedSectionId = selectedSectionId,
                    onSectionChange = { selectedSectionId = it },
                    showLetterNames = showLetterNames,
                    onShowLetterNamesChange = { showLetterNames = it },
                    onBack = returnToParent
                )
            }

        }

        HummingIntervalPopup(
            sectionSessionKey = singingSessionKey,
            targetRequest = singingTargetRequest,
            globalTranspose = globalTranspose,
            octaveOffset = octaveOffset,
            onOctaveOffsetChange = songOctaveOffsetViewModel::updateOctaveOffset,
            pitchSource = singingToolPitchSource,
            onExpandedChange = { expanded ->
                if (expanded) stopPersistentTick++
                singingDockExpanded = expanded
            },
            isPersistentMonitoring = isPersistentMonitoring,
            onStopPersistent = { stopPersistentTick++ },
            departureTick = singingDepartureTick,
            collapseTick = singingCollapseTick
        )
        }

        if (showFavoritedConfirmation) {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .align(Alignment.Center)
                    .testTag(FAVORITED_CONFIRMATION_TEST_TAG)
            ) {
                Text(
                    text = "Favorited",
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
    }
}
