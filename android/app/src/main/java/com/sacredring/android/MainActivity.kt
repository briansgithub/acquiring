package com.sacredring.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.room.Room
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
    val scope = rememberCoroutineScope()
    val harvestService = remember(activeDb) { HarvestService(activeDb) }

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
        
        // ... (Download Full Catalog and Harvest sections remain same)
        Card(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Download Catalog (39k Songs)", style = MaterialTheme.typography.titleMedium)
                val context = androidx.compose.ui.platform.LocalContext.current
                var downloadStatus by remember { mutableStateOf("") }
                Button(
                    onClick = {
                        scope.launch {
                            downloadStatus = "Connecting..."
                            val result = DatabaseDownloader.downloadAndInstallCatalog(context, activeDb) { downloadStatus = it }
                            result.onSuccess {
                                // Re-open fresh Room database connection
                                val newDb = Room.databaseBuilder(
                                    context.applicationContext,
                                    AppDatabase::class.java, "sacred-ring-db"
                                ).build()
                                activeDb = newDb
                                val songCount = newDb.songDao().getSongCount()
                                downloadStatus = "Catalog installed & connected! ($songCount songs ready)"
                            }
                            result.onFailure { downloadStatus = "Error: ${it.message}" }
                        }
                    },
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Text("Download Catalog (2.4 MB)")
                }
                if (downloadStatus.isNotEmpty()) {
                    Text(text = downloadStatus, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }

        // Harvest Section

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Harvest New Song", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = urlToHarvest,
                    onValueChange = { urlToHarvest = it },
                    label = { Text("Hooktheory URL") },
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = {
                        scope.launch {
                            harvestStatus = "Starting..."
                            val result = harvestService.harvest(urlToHarvest) { harvestStatus = it }
                            result.onFailure { harvestStatus = "Error: ${it.message}" }
                        }
                    },
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Text("Harvest & Save")
                }
                if (harvestStatus.isNotEmpty()) {
                    Text(text = harvestStatus, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Search Section
        Text(text = "Database Search", style = MaterialTheme.typography.titleMedium)
        
        ExposedDropdownMenuBox(
            expanded = isExpanded,
            onExpandedChange = { isExpanded = it },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("Search by Title or Slug") },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isExpanded) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )

            if (suggestions.isNotEmpty()) {
                ExposedDropdownMenu(
                    expanded = isExpanded,
                    onDismissRequest = { isExpanded = false }
                ) {
                    suggestions.forEach { song ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(text = song.title ?: "Unknown Title", style = MaterialTheme.typography.bodyLarge)
                                    Text(text = song.artist ?: "Unknown Artist", style = MaterialTheme.typography.bodySmall)
                                }
                            },
                            onClick = {
                                searchQuery = song.title ?: song.slug
                                allSongs = listOf(song)
                                isExpanded = false
                                searchResult = "Selected from suggestions: ${song.slug}"
                            }
                        )
                    }
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = {
                    scope.launch {
                        val results = activeDb.songDao().searchSongsByTitle(searchQuery)
                        allSongs = results
                        searchResult = if (results.isNotEmpty()) {
                            "Found ${results.size} matches"
                        } else {
                            "No titles matching '$searchQuery'"
                        }
                        isExpanded = false
                    }
                },
                modifier = Modifier.weight(1f)
            ) {
                Text("Search Title")
            }

            Button(
                onClick = {
                    scope.launch {
                        val targetSlug = searchQuery.trim().trimEnd('/')
                            .substringAfter("theorytab/view/")
                            .replace("/", "__")
                        val song = activeDb.songDao().getSongBySlug(targetSlug)
                        if (song != null) {
                            allSongs = listOf(song)
                            searchResult = "✅ Found by Slug: $targetSlug"
                        } else {
                            searchResult = "❌ Not found by Slug: $targetSlug"
                        }
                    }
                },
                modifier = Modifier.weight(1f)
            ) {
                Text("Find Slug")
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = {
                    scope.launch {
                        val count = activeDb.songDao().getSongCount()
                        val loadedList = activeDb.songDao().getSongs(limit = 100, offset = 0)
                        allSongs = loadedList
                        searchResult = "Database contains $count songs (Showing first ${loadedList.size})"
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("List All Library")
            }
        }


        searchResult?.let {
            Text(
                text = it,
                modifier = Modifier.padding(top = 8.dp),
                color = if (it.startsWith("✅")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
        }

        Divider(modifier = Modifier.padding(vertical = 16.dp))

        Text(
            text = "Library:",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        LazyColumn {
            items(allSongs) { song ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                ) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        Text(text = song.title ?: "Unknown Title", style = MaterialTheme.typography.bodyLarge)
                        Text(text = song.artist ?: "Unknown Artist", style = MaterialTheme.typography.bodyMedium)
                        Text(text = song.slug, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
