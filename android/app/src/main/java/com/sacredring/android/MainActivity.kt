package com.sacredring.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.scale
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

import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.room.Room
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.*
import kotlin.math.min
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
class MainActivity : ComponentActivity() {
    private lateinit var db: AppDatabase

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        db = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java, "sacred-ring-db"
        ).build()

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
                    MainScreen(db)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(db: AppDatabase) {
    var activeDb by remember { mutableStateOf(db) }
    var urlToHarvest by remember { mutableStateOf("") }
    var harvestStatus by remember { mutableStateOf("") }
    var searchQuery by remember { mutableStateOf("") }
    var searchArtistQuery by remember { mutableStateOf("") }
    var searchResult by remember { mutableStateOf<String?>(null) }
    var catalogStatus by remember { mutableStateOf("") }
    var allSongs by remember { mutableStateOf(listOf<Song>()) }
    var suggestions by remember { mutableStateOf(listOf<Song>()) }
    var artistSuggestions by remember { mutableStateOf(listOf<Song>()) }
    var isExpanded by remember { mutableStateOf(false) }
    var isArtistExpanded by remember { mutableStateOf(false) }
    var selectedSong by remember { mutableStateOf<Song?>(null) }
    var selectedSongSections by remember { mutableStateOf<Map<String, ExtractedSection>?>(null) }
    var selectedSectionId by remember { mutableStateOf<String?>(null) }
    var currentTab by remember { mutableStateOf(2) }
    var showLetterNames by remember { mutableStateOf(false) }
    var isArpeggiated by remember { mutableStateOf(false) }
    var arpeggioStepMs by remember { mutableStateOf(80f) }
    var isShowingRecent by remember { mutableStateOf(false) }
    var currentWaveform by remember { mutableStateOf(AudioEngine.Waveform.SAWTOOTH) }
    var globalTranspose by remember { mutableStateOf(AudioEngine.globalTranspose) }
    
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current

    val harvestService = remember(activeDb) { HarvestService(activeDb) }
    val json = remember { Json { ignoreUnknownKeys = true } }
    val returnToParent = {
        if (currentTab == 2) {
            // Quiz is a child of the selected song's Chords page.
            currentTab = 1
        } else {
            // The selected song's Info and Chords pages are children of search.
            selectedSongSections = null
            selectedSong = null
        }
    }

    // Match the visible Back control while a selected song is open.
    BackHandler(enabled = selectedSongSections != null) {
        returnToParent()
    }

    LaunchedEffect(searchQuery) {
        if (searchQuery.isNotEmpty()) {
            delay(300) // Debounce
            suggestions = activeDb.songDao().getSearchSuggestions(searchQuery)
            isExpanded = true // Always expand when typing to show suggestions or "No results"
            isShowingRecent = false
        } else {
            // Show recent songs when empty from SharedPreferences
            val slugs = HistoryManager.getRecentSlugs(context)
            if (slugs.isNotEmpty()) {
                val recentSongs = activeDb.songDao().getSongsBySlugs(slugs)
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

    LaunchedEffect(searchArtistQuery) {
        if (searchArtistQuery.isNotEmpty()) {
            delay(300) // Debounce
            artistSuggestions = activeDb.songDao().getSongSuggestionsByArtist(searchArtistQuery)
            isArtistExpanded = true
        } else {
            artistSuggestions = emptyList()
            isArtistExpanded = false
        }
    }

    val openSong: (Song) -> Unit = { song ->
        HistoryManager.addSong(context, song.slug)
        isExpanded = false
        selectedSong = song

        if (song.dataBlob != null) {
            try {
                val dataStr = DataUtils.decompress(song.dataBlob)
                val sections = HooktheoryDataCompat.migrateSections(
                    json.decodeFromString<Map<String, ExtractedSection>>(dataStr)
                )
                selectedSongSections = sections
                selectedSectionId = sections.sectionsInSongOrder().firstOrNull()?.key ?: sections.keys.firstOrNull()
                currentTab = 2 // Open Quiz; SongDetailView starts in Simple mode
            } catch (e: Exception) {
                searchResult = "❌ Error loading song: ${e.message}"
            }
        } else {
            // Auto-harvest on demand if dataBlob is missing
            scope.launch {
                harvestStatus = "Fetching chords for ${song.title ?: song.slug}..."
                val result = harvestService.harvest(song.url) { harvestStatus = it }
                result.onSuccess { harvestedSong ->
                    harvestedSong.dataBlob?.let { blob ->
                        try {
                            val dataStr = DataUtils.decompress(blob)
                            val sections = HooktheoryDataCompat.migrateSections(
                                json.decodeFromString<Map<String, ExtractedSection>>(dataStr)
                            )
                            selectedSong = harvestedSong
                            selectedSongSections = sections
                            selectedSectionId = sections.sectionsInSongOrder().firstOrNull()?.key ?: sections.keys.firstOrNull()
                            currentTab = 2 // Open Quiz; SongDetailView starts in Simple mode
                            harvestStatus = "Loaded chords for ${song.title ?: song.slug}!"
                        } catch (e: Exception) {
                            harvestStatus = "❌ Error loading harvested song: ${e.message}"
                        }
                    }
                }
                result.onFailure { error ->
                    harvestStatus = "❌ Error fetching song: ${error.message}"
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        if (selectedSongSections == null) {
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
                isExpanded = isExpanded,
                onExpandedChange = { isExpanded = it },
                suggestions = suggestions,
                isShowingRecent = isShowingRecent,
                onSearchTitle = {
                    scope.launch {
                        val results = activeDb.songDao().searchSongsByTitle(searchQuery)
                        allSongs = results
                        searchResult = if (results.isNotEmpty()) "Found ${results.size} matches" else "No titles matching '$searchQuery'"
                        isExpanded = false
                    }
                },
                searchArtistQuery = searchArtistQuery,
                onSearchArtistQueryChange = { 
                    searchArtistQuery = it
                    if (it.isNotEmpty()) isExpanded = false
                },
                isArtistExpanded = isArtistExpanded,
                onArtistExpandedChange = { isArtistExpanded = it },
                artistSuggestions = artistSuggestions,
                onSearchArtist = {
                    scope.launch {
                        val results = activeDb.songDao().searchSongsByArtist(searchArtistQuery)
                        allSongs = results
                        searchResult = if (results.isNotEmpty()) "Found ${results.size} songs by artist matching '$searchArtistQuery'" else "No artists matching '$searchArtistQuery'"
                        isArtistExpanded = false
                    }
                },
                onSuggestionClick = openSong,
                onListAll = {
                    scope.launch {
                        val count = activeDb.songDao().getSongCount()
                        allSongs = activeDb.songDao().getSongs(limit = 100, offset = 0)
                        searchResult = "Database contains $count songs"
                    }
                },
                searchResult = searchResult,
                allSongs = allSongs,
                onSongClick = openSong,

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
                                AppDatabase::class.java, "sacred-ring-db"
                            ).build()
                            catalogStatus = "Database Refreshed!"
                        } else {
                            catalogStatus = "Error: ${result.exceptionOrNull()?.message}"
                        }
                    }
                }
            )
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
                onBack = returnToParent
            )
        }

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
    isExpanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    suggestions: List<Song>,
    isShowingRecent: Boolean,
    searchArtistQuery: String,
    onSearchArtistQueryChange: (String) -> Unit,
    isArtistExpanded: Boolean,
    onArtistExpandedChange: (Boolean) -> Unit,
    artistSuggestions: List<Song>,
    onSearchArtist: () -> Unit,
    onSuggestionClick: (Song) -> Unit,
    onSearchTitle: () -> Unit,
    onListAll: () -> Unit,
    searchResult: String?,
    allSongs: List<Song>,
    onSongClick: (Song) -> Unit,
    catalogStatus: String,
    onDownloadCatalog: () -> Unit
) {
    var isHarvestExpanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        // Search Section
        Text(text = "Database Search", style = MaterialTheme.typography.titleMedium)
        
        // Search by Title/Slug
        ExposedDropdownMenuBox(
            expanded = isExpanded,
            onExpandedChange = onExpandedChange,
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                label = { Text("Search by Title or Slug") },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isExpanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )

            if (isExpanded) {
                ExposedDropdownMenu(
                    expanded = isExpanded,
                    onDismissRequest = { onExpandedChange(false) },
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

        Spacer(modifier = Modifier.height(16.dp))

        // Search by Artist Section
        ExposedDropdownMenuBox(
            expanded = isArtistExpanded,
            onExpandedChange = onArtistExpandedChange,
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = searchArtistQuery,
                onValueChange = onSearchArtistQueryChange,
                label = { Text("Search by Artist") },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isArtistExpanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )

            if (isArtistExpanded) {
                ExposedDropdownMenu(
                    expanded = isArtistExpanded,
                    onDismissRequest = { onArtistExpandedChange(false) },
                    modifier = Modifier.heightIn(max = 400.dp)
                ) {
                    if (artistSuggestions.isEmpty() && searchArtistQuery.isNotEmpty()) {
                        DropdownMenuItem(
                            text = { Text("No artists matching '$searchArtistQuery'", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary) },
                            onClick = {},
                            enabled = false
                        )
                    }

                    artistSuggestions.forEach { song ->
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

        Button(
            onClick = onSearchArtist,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
        ) {
            Text("Search Artist")
        }

        Button(onClick = onListAll, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text("List All Library")
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
        Button(
            onClick = onDownloadCatalog,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 16.dp)
        ) {
            Text("Download Full Library")
        }
        
        if (catalogStatus.isNotEmpty()) {
            Text(
                text = catalogStatus,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 16.dp),
                color = MaterialTheme.colorScheme.primary
            )
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
    var playChords by remember { mutableStateOf(true) }
    var playOnlyRoot by remember { mutableStateOf(false) }
    var isSimpleMode by remember { mutableStateOf(true) }
    val uriHandler = LocalUriHandler.current

    val transposePickerComposable: @Composable () -> Unit = {
        ExposedDropdownMenuBox(
            expanded = isTransposeExpanded,
            onExpandedChange = { isTransposeExpanded = it },
            modifier = Modifier.width(100.dp)
        ) {
            OutlinedTextField(
                value = if (globalTranspose == 0) "0" else "+$globalTranspose",
                onValueChange = {},
                readOnly = true,
                label = { Text("Transpose") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isTransposeExpanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                textStyle = MaterialTheme.typography.bodyMedium
            )

            ExposedDropdownMenu(
                expanded = isTransposeExpanded,
                onDismissRequest = { isTransposeExpanded = false }
            ) {
                (0..12).forEach { transpose ->
                    DropdownMenuItem(
                        text = { Text(if (transpose == 0) "0" else "+$transpose") },
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
                    modifier = Modifier.fillMaxWidth().menuAnchor()
                )

                ExposedDropdownMenu(
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
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            TextButton(onClick = onBack) { Text("< Back") }
            if (currentTab != 2) {
                Text(
                    text = selectedSection.safeSongInfo,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).padding(start = 8.dp)
                )

                Box(modifier = Modifier.padding(end = 8.dp)) {
                    transposePickerComposable()
                }
            } else {
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = { uriHandler.openUri(song.url) }) { Text("URL") }
                TextButton(onClick = { onTabChange(0) }) { Text("Info") }
                TextButton(onClick = { onTabChange(1) }) { Text("Chords") }
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
            0 -> InfoTab(selectedSection, sections, selectedSectionKey, onSectionChange)
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
                playChords = playChords,
                onPlayChordsChange = { playChords = it },
                playOnlyRoot = playOnlyRoot,
                onPlayOnlyRootChange = { playOnlyRoot = it },
                isSimpleMode = isSimpleMode,
                onSimpleModeChange = { isSimpleMode = it },
                currentWaveform = currentWaveform,
                onWaveformChange = onWaveformChange,
                sectionPicker = sectionPickerComposable,
                transposePicker = transposePickerComposable,
                globalTranspose = globalTranspose
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


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuizTab(
    section: ExtractedSection,
    playChords: Boolean,
    onPlayChordsChange: (Boolean) -> Unit,
    playOnlyRoot: Boolean,
    onPlayOnlyRootChange: (Boolean) -> Unit,
    isSimpleMode: Boolean,
    onSimpleModeChange: (Boolean) -> Unit,
    currentWaveform: AudioEngine.Waveform,
    onWaveformChange: (AudioEngine.Waveform) -> Unit,
    sectionPicker: @Composable () -> Unit,
    transposePicker: @Composable () -> Unit,
    globalTranspose: Int
) {
    val baseBpm = section.getBpm().toFloat().coerceIn(40f, 240f)
    var tempoPercent by remember(section) { mutableStateOf(100f) }
    val bpm = (baseBpm * tempoPercent / 100f).toDouble()

    val notesJson = (section.notes as? JsonArray) ?: emptyList()
    
    val melody = remember(notesJson) {
        notesJson.mapNotNull { el ->
            try {
                val obj = el as? JsonObject ?: return@mapNotNull null
                val rawBeat = (obj["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                MelodyNote(
                    sd = (obj["sd"] as? JsonPrimitive)?.contentOrNull ?: "1",
                    beat = if (rawBeat == 0.0) 1.0 else rawBeat,
                    duration = (obj["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0,
                    octave = (obj["octave"] as? JsonPrimitive)?.intOrNull ?: 0,
                    isRest = (obj["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                        (obj["rest"] as? JsonPrimitive)?.booleanOrNull == true
                )
            } catch (_: Exception) { null }
        }
    }

    var isPlaying by remember { mutableStateOf(false) }
    var currentBeat by remember { mutableStateOf(1.0) }
    var playbackTrigger by remember { mutableStateOf(0) }
    var melodyChordBalance by remember { mutableStateOf(0.55f) }
    val melodyVolume = melodyChordBalance
    val chordVolume = 1f - melodyChordBalance
    var isScrubbing by remember { mutableStateOf(false) }
    var wasPlayingBeforeScrub by remember { mutableStateOf(false) }
    var activeNoteReplayJob by remember { mutableStateOf<Job?>(null) }
    var isWaveformExpanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    
    val endBeat = remember(section, melody) {
        val metadataEndBeat = (section.metadata?.get("endBeat") as? JsonPrimitive)?.doubleOrNull ?: 0.0
        
        // Calculate content end beat by looking at the last non-rest note/chord
        val lastNoteEnd = melody.filter { !it.isRest }.maxOfOrNull { it.beat + it.duration } ?: 0.0
        val lastChordEnd = section.chords.filter { 
            val isRest = (it["isRest"] as? JsonPrimitive)?.booleanOrNull == true || 
                         (it["rest"] as? JsonPrimitive)?.booleanOrNull == true
            !isRest
        }.maxOfOrNull { 
            val b = (it["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            val d = (it["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            b + d
        } ?: 0.0
        
        val contentEnd = maxOf(lastNoteEnd, lastChordEnd)
        
        when {
            // If we have metadata and it's reasonably close to content (or content is empty), trust it.
            metadataEndBeat > 0 && (contentEnd == 0.0 || metadataEndBeat <= contentEnd + 8.0) -> metadataEndBeat
            // If metadata is much larger than content, it might be a default or full-song marker.
            // Snap to the next 4-beat measure boundary.
            metadataEndBeat > contentEnd + 8.0 && contentEnd > 0 -> {
                val nextMeasure = (kotlin.math.ceil((contentEnd - 1.0) / 4.0) * 4.0) + 1.0
                nextMeasure.coerceAtLeast(4.0)
            }
            contentEnd > 0 -> kotlin.math.ceil(contentEnd)
            else -> 32.0
        }
    }
    val pixelsPerBeat = 60f
    val chordLaneHeight = 40.dp
    val melodyLaneHeight = 88.dp

    fun beginScrubbing() {
        if (isScrubbing) return
        wasPlayingBeforeScrub = isPlaying
        isScrubbing = true
        isPlaying = false
        activeNoteReplayJob?.cancel()
        AudioEngine.stopAllPlayback()
    }

    fun scrubTo(beat: Double) {
        beginScrubbing()
        currentBeat = beat.coerceIn(1.0, endBeat)
    }

    fun finishScrubbing() {
        if (!isScrubbing) return
        val shouldResume = wasPlayingBeforeScrub
        isScrubbing = false
        activeNoteReplayJob?.cancel()
        isPlaying = shouldResume
        if (shouldResume) playbackTrigger++
    }

    fun skipBack(seconds: Double) {
        if (isScrubbing) return
        val shouldResume = isPlaying
        isPlaying = false
        activeNoteReplayJob?.cancel()
        AudioEngine.stopAllPlayback()
        val beatsToSkip = seconds * (bpm / 60.0)
        currentBeat = (currentBeat - beatsToSkip).coerceAtLeast(1.0)
        if (shouldResume) {
            playbackTrigger++
            isPlaying = true
        }
    }

    fun replayActiveNotesWithRemainingDuration() {
        if (bpm <= 0.0) return
        val beat = currentBeat.coerceIn(1.0, endBeat)
        val secondsPerBeat = 60.0 / bpm
        activeNoteReplayJob?.cancel()
        activeNoteReplayJob = scope.launch {
            melody.forEach { note ->
                val noteEnd = note.beat + note.duration
                if (!note.isRest && beat >= note.beat && beat < noteEnd) {
                    val remainingMs = ((noteEnd - beat) * secondsPerBeat * 1000.0).toInt().coerceAtLeast(40)
                    val activeKey = section.getKeyAtBeat(note.beat)
                    val midi = MusicTheory.getMidiNote(note.sd, note.octave, activeKey)
                    launch { AudioEngine.playChord(listOf(midi), durationMs = remainingMs, channel = AudioEngine.PlaybackChannel.MELODY) }
                }
            }

            if (isSimpleMode || playChords) {
                section.chords.forEach { chord ->
                    val chordBeat = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                    val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                    val chordEnd = chordBeat + duration
                    val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                    if (!isRest && beat >= chordBeat && beat < chordEnd) {
                        val activeKey = section.getKeyAtBeat(chordBeat)
                        val notes = if (isSimpleMode || playOnlyRoot) ChordInterpreter.getRootPositionChordNotes(chord, activeKey) else ChordInterpreter.getChordNotes(chord, activeKey)
                        if (notes.isNotEmpty()) {
                            val remainingMs = ((chordEnd - beat) * secondsPerBeat * 1000.0).toInt().coerceAtLeast(40)
                            launch { AudioEngine.playChord(notes, durationMs = remainingMs, channel = AudioEngine.PlaybackChannel.CHORD) }
                        }
                    }
                }
            }
        }
    }

    LaunchedEffect(section) {
        activeNoteReplayJob?.cancel(); AudioEngine.stopAllPlayback(); AudioEngine.setLayerVolumes(melodyVolume, chordVolume)
        isPlaying = false; currentBeat = 1.0
    }

    LaunchedEffect(melodyChordBalance) { AudioEngine.setLayerVolumes(melodyVolume, chordVolume) }

    LaunchedEffect(playChords, playOnlyRoot, isSimpleMode, globalTranspose, tempoPercent, melodyChordBalance) {
        activeNoteReplayJob?.cancel(); AudioEngine.stopAllPlayback(); AudioEngine.setLayerVolumes(melodyVolume, chordVolume)
        if (isPlaying && bpm <= 0.0) isPlaying = false else if (isPlaying && !isScrubbing) { replayActiveNotesWithRemainingDuration(); playbackTrigger++ }
    }

    DisposableEffect(Unit) { onDispose { AudioEngine.stopAllPlayback(); AudioEngine.setLayerVolumes(1f, 1f) } }

    LaunchedEffect(isPlaying, isScrubbing, section, playbackTrigger) {
        if (isPlaying && !isScrubbing && bpm > 0.0) {
            var startTime = System.currentTimeMillis()
            var startBeat = currentBeat
            var scheduledThroughBeat = startBeat
            var lastUiUpdateMs = 0L
            withContext(Dispatchers.Default) {
                while (isPlaying && !isScrubbing) {
                    val elapsedMs = System.currentTimeMillis() - startTime
                    val elapsedBeats = (elapsedMs / 1000.0) * (bpm / 60.0)
                    val tickEndBeat = startBeat + elapsedBeats
                    val previousBeat = scheduledThroughBeat

                    var looped = false
                    var effectiveTickEnd = tickEndBeat
                    if (effectiveTickEnd > endBeat) {
                        effectiveTickEnd = endBeat
                        looped = true
                    }
                
                    melody.forEach { note -> 
                        if (!note.isRest && note.beat >= previousBeat && note.beat < effectiveTickEnd) {
                            launch { 
                                val activeKey = section.getKeyAtBeat(note.beat)
                                val midi = MusicTheory.getMidiNote(note.sd, note.octave, activeKey)
                                AudioEngine.playChord(listOf(midi), durationMs = (note.duration * 60000.0 / bpm).toInt(), channel = AudioEngine.PlaybackChannel.MELODY) 
                            }
                        } 
                    }
                    if (isSimpleMode || playChords) {
                        section.chords.forEach { chord ->
                            val beat = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                            val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                            val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                            if (!isRest && beat >= previousBeat && beat < effectiveTickEnd) {
                                launch { 
                                    val activeKey = section.getKeyAtBeat(beat)
                                    val notes = ChordInterpreter.getChordNotes(chord, activeKey)
                                    if (notes.isNotEmpty()) { 
                                        val notesToPlay = if (isSimpleMode || playOnlyRoot) { 
                                            val rootNote = ChordInterpreter.getRootPositionChordNotes(chord, activeKey).firstOrNull()
                                            if (rootNote != null) listOf(rootNote) else emptyList() 
                                        } else notes
                                        AudioEngine.playChord(notesToPlay, durationMs = (duration * 60000.0 / bpm).toInt(), channel = AudioEngine.PlaybackChannel.CHORD) 
                                    } 
                                }
                            }
                        }
                    }

                    if (looped) {
                        AudioEngine.stopAllPlayback()
                        startTime = System.currentTimeMillis()
                        startBeat = 1.0
                        scheduledThroughBeat = 1.0
                        lastUiUpdateMs = 0L
                        withContext(Dispatchers.Main.immediate) {
                            currentBeat = 1.0
                        }
                        delay(10)
                        continue
                    }

                    scheduledThroughBeat = effectiveTickEnd
                    if (System.currentTimeMillis() - lastUiUpdateMs >= 33L) { 
                        withContext(Dispatchers.Main.immediate) { currentBeat = effectiveTickEnd }
                        lastUiUpdateMs = System.currentTimeMillis() 
                    }
                    delay(10)
                }
            }
        }
    }

    val waveformPickerComposable: @Composable () -> Unit = {
        val waveformLabel = currentWaveform.name.lowercase().split("_").joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
        ExposedDropdownMenuBox(expanded = isWaveformExpanded, onExpandedChange = { isWaveformExpanded = !isWaveformExpanded }, modifier = Modifier.width(128.dp)) {
            Box(modifier = Modifier.fillMaxWidth().height(48.dp).border(width = 1.dp, color = MaterialTheme.colorScheme.outline, shape = RoundedCornerShape(4.dp)).menuAnchor().semantics { contentDescription = "Sound: $waveformLabel" }, contentAlignment = Alignment.Center) {
                Text(text = waveformLabel, maxLines = 1, textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall.copy(lineHeight = 12.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)), modifier = Modifier.fillMaxWidth())
                Box(modifier = Modifier.align(Alignment.CenterEnd)) { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isWaveformExpanded) }
            }
            ExposedDropdownMenu(expanded = isWaveformExpanded, onDismissRequest = { isWaveformExpanded = false }) {
                AudioEngine.Waveform.entries.forEach { waveform -> DropdownMenuItem(text = { Text(waveform.name.lowercase().split("_").joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }, style = MaterialTheme.typography.bodySmall, maxLines = 1) }, onClick = { onWaveformChange(waveform); isWaveformExpanded = false }) }
            }
        }
    }

    val activeKey = section.getKeyAtBeat(currentBeat)
    val currentChord = remember(section, currentBeat) { section.chords.find { chord ->
        val beat = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0; val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
        currentBeat >= beat && currentBeat < (beat + duration)
    } }

    val audiationTargets = remember(currentChord, activeKey, globalTranspose, isSimpleMode) {
        if (isSimpleMode) { currentChord?.let { chord ->
            val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
            if (!isRest) { val rootMidi = ChordInterpreter.getRootPositionChordNotes(chord, activeKey).firstOrNull() ?: 0
                if (rootMidi > 0) listOf(AudiationTarget(id = 100, label = MusicTheory.getDegreeLabelFromMidi(rootMidi, activeKey), untransposedMidi = rootMidi, transposedMidi = rootMidi + globalTranspose)) else emptyList()
            } else emptyList() } ?: emptyList()
        } else { currentChord?.let { chord -> val notes = ChordInterpreter.getChordNotes(chord, activeKey); val rootMidi = ChordInterpreter.getRootPositionChordNotes(chord, activeKey).firstOrNull() ?: 0
            val list = notes.mapIndexed { index, note -> AudiationTarget(id = index, label = MusicTheory.getRelativeDegreeLabel(note, rootMidi), untransposedMidi = note, transposedMidi = note + globalTranspose) }.toMutableList()
            list.add(AudiationTarget(100, ChordInterpreter.getRomanSymbol(chord, activeKey), rootMidi, rootMidi + globalTranspose))
            list } ?: emptyList()
        }
    }

    val density = androidx.compose.ui.platform.LocalDensity.current
    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    var audiationPuckOffset by remember {
        mutableStateOf(with(density) { 
            Offset((configuration.screenWidthDp / 2f - 24f).dp.toPx(), (configuration.screenHeightDp * 0.60f).dp.toPx())
        })
    }
    var audiationOctaveShift by remember { mutableStateOf(0) }

    val targetsWithShift = remember(audiationTargets, audiationOctaveShift) {
        audiationTargets.map { it.copy(transposedMidi = it.transposedMidi + audiationOctaveShift * 12) }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AudiationPitchPracticeContainer(
            targets = targetsWithShift,
            initialOffset = audiationPuckOffset,
            onTargetSelected = { isPlaying = false; activeNoteReplayJob?.cancel(); AudioEngine.stopAllPlayback() },
            onSessionCanceled = {},
            onCalibrated = { hummedMidi ->
                val songRoots = section.chords.mapNotNull { chord ->
                    val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                    if (!isRest) { val chordKey = section.getKeyAtBeat((chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0)
                        ChordInterpreter.getRootPositionChordNotes(chord, chordKey).firstOrNull() } else null
                }
                if (songRoots.isNotEmpty()) {
                    val avgRoot = songRoots.average(); val currentBaseAvg = avgRoot + AudioEngine.globalTranspose
                    audiationOctaveShift = kotlin.math.round((hummedMidi - currentBaseAvg) / 12.0).toInt()
                }
            }
        ) { audiationState, onTargetPositioned ->
            if (audiationState is AudiationState.Dragging) { audiationPuckOffset = audiationState.offset }

            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                val displayScale = activeKey.scale.replace(Regex("([a-z])([A-Z])"), "$1 $2").replaceFirstChar { it.titlecase() }
                Column(modifier = Modifier.fillMaxWidth().height(152.dp)) {
                    Box(modifier = Modifier.fillMaxWidth().height(56.dp)) {
                        Text(text = displayScale, textAlign = TextAlign.Center, fontSize = 32.sp, fontWeight = FontWeight.Bold, color = ringModeColor(activeKey.scale), modifier = Modifier.fillMaxWidth().align(Alignment.Center))
                        if (!isSimpleMode) { Box(modifier = Modifier.align(Alignment.CenterEnd)) { transposePicker() } }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Chord / Melody\nVol.", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(96.dp))
                        Slider(value = melodyChordBalance, onValueChange = { melodyChordBalance = it }, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Tempo", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(48.dp))
                        Slider(value = tempoPercent, onValueChange = { tempoPercent = it }, valueRange = 0f..200f, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
                        Text(text = "${tempoPercent.roundToInt()}%", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(38.dp))
                        IconButton(onClick = { tempoPercent = 100f }, modifier = Modifier.size(32.dp)) { Icon(imageVector = Icons.Filled.Refresh, contentDescription = "Reset tempo to 100%") }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                val primaryColor = MaterialTheme.colorScheme.primary; val secondaryColor = MaterialTheme.colorScheme.secondary
                val romanNumeralPainter = remember { RomanNumeralPainter() }; val pixelsPerBeatPx = with(density) { pixelsPerBeat.dp.toPx() }
                val timelineContentDescription = remember(section, currentBeat) {
                    val activeChord_t = section.chords.find { chord ->
                        val beat_t = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0; val duration_t = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                        currentBeat >= beat_t && currentBeat < beat_t + duration_t
                    }
                    if (activeChord_t == null) "Chord timeline" else {
                        val beat_t = (activeChord_t["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0; val isRest_t = (activeChord_t["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (activeChord_t["rest"] as? JsonPrimitive)?.booleanOrNull == true
                        val label_t = if (isRest_t) "rest" else ChordInterpreter.getRomanSymbol(activeChord_t, section.getKeyAtBeat(beat_t))
                        "Chord timeline, current chord $label_t"
                    }
                }

                if (!isSimpleMode) {
                    Box(modifier = Modifier.fillMaxWidth().height(chordLaneHeight + melodyLaneHeight)) {
                        Canvas(modifier = Modifier.fillMaxSize().semantics { contentDescription = timelineContentDescription }.pointerInput(endBeat) { detectTapGestures { offset -> val centerX = size.width / 2f; val deltaX = offset.x - centerX; scrubTo(currentBeat + deltaX / pixelsPerBeatPx); finishScrubbing() } }.pointerInput(endBeat) { var dragBeat = currentBeat; detectDragGestures(onDragStart = { beginScrubbing(); dragBeat = currentBeat }, onDrag = { change, dragAmount -> change.consume(); val deltaBeat = dragAmount.x / pixelsPerBeatPx; dragBeat = (dragBeat - deltaBeat).coerceIn(1.0, endBeat); scrubTo(dragBeat) }, onDragEnd = { finishScrubbing() }, onDragCancel = { finishScrubbing() }) }
                        ) {
                            val totalHeight = size.height; val mLaneHeightPx = melodyLaneHeight.toPx(); val cLaneHeightPx = chordLaneHeight.toPx(); val noteHeight = (mLaneHeightPx / 28f).coerceIn(5f, 10f); val melodyBaseY = mLaneHeightPx / 2; val centerX = size.width / 2f; val translationX = centerX - (currentBeat - 1).toFloat() * pixelsPerBeatPx
                            drawContext.canvas.save(); drawContext.canvas.translate(translationX, 0f)
                            melody.forEach { note -> val x = (note.beat - 1).toFloat() * pixelsPerBeatPx; val w = note.duration.toFloat() * pixelsPerBeatPx; val degree = MusicTheory.getRawDegree(note.sd); val y = melodyBaseY - (degree * noteHeight) - (note.octave * noteHeight * 7); val isActive = currentBeat >= note.beat && currentBeat < (note.beat + note.duration)
                                drawRect(color = if (isActive) primaryColor else secondaryColor.copy(alpha = 0.6f), topLeft = Offset(x, y), size = Size(w, noteHeight)) }
                            section.chords.forEach { chord -> val beat_c = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0; val duration_c = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0; val isRest_c = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                                val x = (beat_c - 1).toFloat() * pixelsPerBeatPx; val w = duration_c.toFloat() * pixelsPerBeatPx; val isActive = currentBeat >= beat_c && currentBeat < (beat_c + duration_c)
                                drawRect(color = secondaryColor.copy(alpha = 0.2f), topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx))
                                if (isActive) drawRect(color = primaryColor.copy(alpha = 0.4f), topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx))
                                drawRect(color = if (isActive) primaryColor else Color.LightGray, topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                                if (!isRest_c) { val screenX = x + translationX; val isVisible = screenX + w >= 0f && screenX <= size.width; val innerWidth = w - 14.dp.toPx(); val innerHeight = cLaneHeightPx - 8.dp.toPx()
                                    if (isVisible && innerWidth > 12.dp.toPx() && innerHeight > 12.dp.toPx()) { val chordKey = section.getKeyAtBeat(beat_c); val symbol = ChordInterpreter.getRomanSymbol(chord, chordKey); val display = RomanNumeralDisplay.fromChord(symbol, chord["borrowed"]); val minFontSize = 8.sp.toPx(); val maxFontSize = kotlin.math.min(innerHeight * 0.9f, innerWidth * 0.58f)
                                        val measured = romanNumeralPainter.fitDisplay(display, minFontSize, maxFontSize, innerWidth, innerHeight, 4.dp.toPx())
                                        if (measured != null) romanNumeralPainter.draw(canvas = drawContext.canvas.nativeCanvas, layout = measured, centerX = x + w / 2f, centerY = mLaneHeightPx + cLaneHeightPx / 2f + measured.baseFontSizePx * 0.035f, color = (if (isActive) primaryColor else Color.White).toArgb()) } }
                            }
                            drawContext.canvas.restore(); drawLine(color = Color.Red, start = Offset(centerX, 0f), end = Offset(centerX, totalHeight), strokeWidth = 3f)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(if (isSimpleMode) 0.dp else 8.dp))

                if (isSimpleMode) {
                    val activeSimpleChord = currentChord?.takeUnless { chord -> (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true }
                    val rootMidi = activeSimpleChord?.let { chord -> ChordInterpreter.getRootPositionChordNotes(chord, activeKey).firstOrNull() } ?: 0
                    val rootDegreeLabel = if (rootMidi > 0) MusicTheory.getDegreeLabelFromMidi(rootMidi, activeKey) else ""
                    Column(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.7f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Button(onClick = { if (rootMidi > 0) scope.launch { AudioEngine.playChord(listOf(rootMidi), channel = AudioEngine.PlaybackChannel.CHORD) } }, enabled = rootMidi > 0, colors = ButtonDefaults.buttonColors(disabledContainerColor = MaterialTheme.colorScheme.primary, disabledContentColor = MaterialTheme.colorScheme.onPrimary), modifier = Modifier.fillMaxWidth().height(250.dp).onGloballyPositioned { onTargetPositioned(100, it) }, shape = RoundedCornerShape(32.dp)) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                if (activeSimpleChord != null) { if (rootDegreeLabel.isNotEmpty()) ScaleDegreeText(label = rootDegreeLabel, fontSize = 120.sp, modifier = Modifier.fillMaxWidth(), minFontSize = 48.sp) else { val symbol = ChordInterpreter.getRomanSymbol(activeSimpleChord, activeKey); val romanDisplay = RomanNumeralDisplay.fromChord(symbol, activeSimpleChord["borrowed"]); RomanNumeralText(display = romanDisplay, fontSize = 80.sp, modifier = Modifier.fillMaxWidth()) } }
                                if (audiationState is AudiationState.Listening && audiationState.target.id == 100) PitchGauge(pitchResult = audiationState.pitch, targetLabel = audiationState.target.label, modifier = Modifier.matchParentSize())
                            }
                        }
                        Slider(value = currentBeat.toFloat().coerceIn(1f, endBeat.toFloat()), onValueChange = { beat -> scrubTo(beat.toDouble()) }, onValueChangeFinished = { finishScrubbing() }, valueRange = 1f..endBeat.toFloat(), modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp))
                        Spacer(modifier = Modifier.height(24.dp))
                        OutlinedButton(onClick = { skipBack(3.0) }, enabled = !isScrubbing, modifier = Modifier.align(Alignment.End).padding(end = 12.dp).width(132.dp).height(64.dp), shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(0.dp)) {
                            Row(modifier = Modifier.fillMaxSize(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(24.dp).scale(-1f, 1f)); Spacer(Modifier.width(8.dp)); Text(text = "3 sec.", textAlign = TextAlign.Center, maxLines = 1, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 18.sp, lineHeight = 18.sp, platformStyle = PlatformTextStyle(includeFontPadding = false))) }
                        }
                    }
                } else {
                    currentChord?.let { chord -> val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                        if (!isRest) {
                            val symbol = ChordInterpreter.getRomanSymbol(chord, activeKey); val romanDisplay = RomanNumeralDisplay.fromChord(symbol, chord["borrowed"]); val notes = ChordInterpreter.getChordNotes(chord, activeKey); val rootMidi = ChordInterpreter.getRootPositionChordNotes(chord, activeKey).firstOrNull() ?: 0
                            val chordDurationMs = ((chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0 * 60000.0 / bpm).toInt(); val degreeSpacing = when { notes.size >= 7 -> 2.dp; notes.size >= 5 -> 4.dp; else -> 6.dp }; val degreeFontSize = when { notes.size >= 7 -> 24.sp; notes.size >= 5 -> 26.sp; else -> 28.sp }
                            Column(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.7f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Button(onClick = { scope.launch { AudioEngine.playChord(if (playOnlyRoot) listOf(rootMidi) else notes, durationMs = chordDurationMs, channel = AudioEngine.PlaybackChannel.CHORD) } }, modifier = Modifier.weight(1f).height(60.dp).onGloballyPositioned { onTargetPositioned(100, it) }, shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) {
                                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { RomanNumeralText(display = romanDisplay, fontSize = 32.sp, modifier = Modifier.fillMaxWidth(), minFontSize = 12.sp)
                                            if (audiationState is AudiationState.Listening && audiationState.target.id == 100) PitchGauge(pitchResult = audiationState.pitch, targetLabel = audiationState.target.label, modifier = Modifier.matchParentSize()) }
                                    }
                                }
                                if (rootMidi > 0) { Spacer(Modifier.height(8.dp)); Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(degreeSpacing)) {
                                    notes.forEachIndexed { index, note -> val internalLabel = MusicTheory.getRelativeDegreeLabel(note, rootMidi); val isHovered = audiationState is AudiationState.Dragging && audiationState.hoveredId == index
                                        OutlinedButton(onClick = { scope.launch { AudioEngine.playChord(listOf(note), channel = AudioEngine.PlaybackChannel.CHORD) } }, modifier = Modifier.weight(1f).height(50.dp).onGloballyPositioned { onTargetPositioned(index, it) }, shape = RoundedCornerShape(14.dp), contentPadding = PaddingValues(0.dp), colors = if (isHovered) ButtonDefaults.outlinedButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer) else ButtonDefaults.outlinedButtonColors()) {
                                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { ScaleDegreeText(label = internalLabel, fontSize = degreeFontSize, modifier = Modifier.fillMaxWidth(), minFontSize = 12.sp)
                                                if (audiationState is AudiationState.Listening && audiationState.target.id == index) PitchGauge(pitchResult = audiationState.pitch, targetLabel = audiationState.target.label, modifier = Modifier.matchParentSize()) }
                                        } }
                                } }
                            }
                        }
                    }
                }
            }
        }

        Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Box(modifier = Modifier.align(Alignment.BottomStart).offset(x = (-8).dp, y = (-88).dp)) { waveformPickerComposable() }
            Row(modifier = Modifier.align(Alignment.BottomStart).offset(x = (-8).dp, y = 8.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (!isSimpleMode) {
                    Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) { Text("Chords", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(44.dp))
                            Switch(checked = playChords, onCheckedChange = onPlayChordsChange) }
                        Row(verticalAlignment = Alignment.CenterVertically) { Text("Root", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(44.dp))
                            Switch(checked = playOnlyRoot, onCheckedChange = onPlayOnlyRootChange) }
                    }
                } else { Spacer(modifier = Modifier.width(96.dp)) }
                Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(text = "Simple", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Switch(checked = isSimpleMode, onCheckedChange = onSimpleModeChange) }
            }
            Column(modifier = Modifier.align(Alignment.BottomEnd), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(onClick = { activeNoteReplayJob?.cancel(); AudioEngine.stopAllPlayback(); isPlaying = false; isScrubbing = false; wasPlayingBeforeScrub = false; currentBeat = 1.0 }, modifier = Modifier.size(64.dp), contentPadding = PaddingValues(0.dp), shape = RoundedCornerShape(18.dp)) { Icon(Icons.Default.Refresh, contentDescription = "Reset", modifier = Modifier.size(32.dp)) }
                    Button(onClick = { if (!isScrubbing) { if (isPlaying) { activeNoteReplayJob?.cancel(); AudioEngine.pauseAllPlayback(); isPlaying = false } else { AudioEngine.resumeAllPlayback(); isPlaying = true } } }, enabled = !isScrubbing, modifier = Modifier.width(132.dp).height(64.dp)) {
                        if (isPlaying) Text("Ⅱ", fontSize = 28.sp) else Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(8.dp)); Text(if (isPlaying) "Pause" else "Play")
                    }
                }
                sectionPicker()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InfoTab(
    section: ExtractedSection,
    sections: Map<String, ExtractedSection>,
    selectedId: String?,
    onSectionChange: (String) -> Unit
) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Section: ${section.safeSectionName}", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Text("Metadata:", style = MaterialTheme.typography.titleSmall)
        Text(section.metadata.toString(), style = MaterialTheme.typography.bodySmall)
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
