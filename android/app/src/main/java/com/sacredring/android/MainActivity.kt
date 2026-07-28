package com.sacredring.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.room.Room
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

@OptIn(ExperimentalMaterial3Api::class)
class MainActivity : ComponentActivity() {
    private lateinit var db: AppDatabase

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        db = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java, "sacred-ring-db"
        ).build()

        setContent {
            MaterialTheme {
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
    var searchResult by remember { mutableStateOf<String?>(null) }
    var allSongs by remember { mutableStateOf(listOf<Song>()) }
    var suggestions by remember { mutableStateOf(listOf<Song>()) }
    var isExpanded by remember { mutableStateOf(false) }
    var selectedSongSections by remember { mutableStateOf<Map<String, ExtractedSection>?>(null) }
    var selectedSectionId by remember { mutableStateOf<String?>(null) }
    var currentTab by remember { mutableStateOf(0) }
    var showLetterNames by remember { mutableStateOf(false) }
    
    val scope = rememberCoroutineScope()

    val harvestService = remember(activeDb) { HarvestService(activeDb) }
    val json = remember { Json { ignoreUnknownKeys = true } }

    LaunchedEffect(searchQuery) {
        if (searchQuery.length >= 2) {
            delay(300) // Debounce
            suggestions = activeDb.songDao().getSearchSuggestions(searchQuery)
            isExpanded = suggestions.isNotEmpty()
        } else {
            suggestions = emptyList()
            isExpanded = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "Sacred Ring Port",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(bottom = 16.dp)
        )

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
                onSearchQueryChange = { searchQuery = it },
                isExpanded = isExpanded,
                onExpandedChange = { isExpanded = it },
                suggestions = suggestions,
                onSuggestionClick = { song ->
                    searchQuery = song.title ?: song.slug
                    allSongs = listOf(song)
                    isExpanded = false
                    searchResult = "Selected from suggestions: ${song.slug}"
                },
                onSearchTitle = {
                    scope.launch {
                        val results = activeDb.songDao().searchSongsByTitle(searchQuery)
                        allSongs = results
                        searchResult = if (results.isNotEmpty()) "Found ${results.size} matches" else "No titles matching '$searchQuery'"
                        isExpanded = false
                    }
                },
                onFindSlug = {
                    scope.launch {
                        val targetSlug = searchQuery.trim().trimEnd('/').substringAfter("theorytab/view/").replace("/", "__")
                        val song = activeDb.songDao().getSongBySlug(targetSlug)
                        if (song != null) {
                            allSongs = listOf(song)
                            searchResult = "✅ Found by Slug: $targetSlug"
                        } else {
                            searchResult = "❌ Not found by Slug: $targetSlug"
                        }
                    }
                },
                onListAll = {
                    scope.launch {
                        val count = activeDb.songDao().getSongCount()
                        allSongs = activeDb.songDao().getSongs(limit = 100, offset = 0)
                        searchResult = "Database contains $count songs"
                    }
                },
                searchResult = searchResult,
                allSongs = allSongs,
                onSongClick = { song ->
                    song.dataBlob?.let { blob ->
                        val dataStr = blob.decodeToString()
                        val sections = json.decodeFromString<Map<String, ExtractedSection>>(dataStr)
                        selectedSongSections = sections
                        selectedSectionId = sections.keys.firstOrNull()
                        currentTab = 1 // Switch to Chords tab
                    }
                }
            )
        } else {
            // Song Detail View with Tabs
            SongDetailView(
                sections = selectedSongSections!!,
                selectedSectionId = selectedSectionId,
                onSectionChange = { selectedSectionId = it },
                currentTab = currentTab,
                onTabChange = { currentTab = it },
                showLetterNames = showLetterNames,
                onShowLetterNamesChange = { showLetterNames = it },
                onBack = { selectedSongSections = null }
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
    onSuggestionClick: (Song) -> Unit,
    onSearchTitle: () -> Unit,
    onFindSlug: () -> Unit,
    onListAll: () -> Unit,
    searchResult: String?,
    allSongs: List<Song>,
    onSongClick: (Song) -> Unit
) {
    Column {
        // Harvest Section
        Card(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Harvest New Song", style = MaterialTheme.typography.titleMedium)
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

        // Search Section
        Text(text = "Database Search", style = MaterialTheme.typography.titleMedium)
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

            if (suggestions.isNotEmpty()) {
                ExposedDropdownMenu(
                    expanded = isExpanded,
                    onDismissRequest = { onExpandedChange(false) }
                ) {
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

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(onClick = onSearchTitle, modifier = Modifier.weight(1f)) { Text("Search Title") }
            Button(onClick = onFindSlug, modifier = Modifier.weight(1f)) { Text("Find Slug") }
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

        Divider(modifier = Modifier.padding(vertical = 16.dp))

        LazyColumn {
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
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongDetailView(
    sections: Map<String, ExtractedSection>,
    selectedSectionId: String?,
    onSectionChange: (String) -> Unit,
    currentTab: Int,
    onTabChange: (Int) -> Unit,
    showLetterNames: Boolean,
    onShowLetterNamesChange: (Boolean) -> Unit,
    onBack: () -> Unit
) {
    val selectedSection = sections[selectedSectionId] ?: sections.values.first()
    
    Column {
        Row(
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            TextButton(onClick = onBack) { Text("< Back") }
            Text(
                text = selectedSection.songInfo,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f).padding(start = 8.dp)
            )
        }

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
        }

        when (currentTab) {
            0 -> InfoTab(selectedSection, sections.keys.toList(), selectedSectionId, onSectionChange)
            1 -> ChordsTab(selectedSection, showLetterNames, onShowLetterNamesChange)
        }
    }
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InfoTab(
    section: ExtractedSection,
    sectionIds: List<String>,
    selectedId: String?,
    onSectionChange: (String) -> Unit
) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Section: ${section.sectionName}", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(8.dp))
        Text("Switch Section:", style = MaterialTheme.typography.bodyMedium)
        Row(modifier = Modifier.padding(top = 8.dp)) {
            sectionIds.forEach { id ->
                FilterChip(
                    selected = id == selectedId,
                    onClick = { onSectionChange(id) },
                    label = { Text(id) },
                    modifier = Modifier.padding(end = 4.dp)
                )
            }
        }
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
    onShowLetterNamesChange: (Boolean) -> Unit
) {
    val key = section.getParsedKey()
    val scope = rememberCoroutineScope()

    Column(modifier = Modifier.padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
        ) {
            Text("Key: ${key.tonic} ${key.scale}", style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("Letter Names", style = MaterialTheme.typography.bodySmall)
                Switch(
                    checked = showLetterNames,
                    onCheckedChange = onShowLetterNamesChange,
                    modifier = Modifier.scale(0.7f)
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        LazyVerticalGrid(
            columns = GridCells.Adaptive(100.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(section.chords) { chord ->
                val symbol = ChordInterpreter.getRomanSymbol(chord, key)
                val letterName = ChordInterpreter.getLetterName(chord, key)
                Card(
                    onClick = {
                        val notes = ChordInterpreter.getChordNotes(chord, key)
                        scope.launch {
                            AudioEngine.playChord(notes)
                        }
                    },
                    modifier = Modifier.height(80.dp)
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                        Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                            Text(
                                text = symbol,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center
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

