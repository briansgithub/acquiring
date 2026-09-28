package com.acquiring.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SongQueueControls(
    queue: SongQueueViewModel,
    playlistDao: PlaylistDao,
    onBack: () -> Unit,
    player: @Composable () -> Unit
) {
    var showQueue by remember { mutableStateOf(false) }
    var showSave by remember { mutableStateOf(false) }
    var name by remember(queue.suggestedName) { mutableStateOf(queue.suggestedName) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().testTag("SongQueueScreen")) {
        Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            TextButton(onClick=onBack) { Text("Back") }
            Text(if(queue.started) "${queue.index+1} of ${queue.entries.size}" else "Song examples",
                Modifier.weight(1f).padding(top=12.dp),style=MaterialTheme.typography.titleMedium)
            if(queue.started) TextButton(onClick={showQueue=true}) { Text("Queue") }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal=8.dp),horizontalArrangement=Arrangement.SpaceEvenly) {
            if(queue.started) {
                TextButton(onClick={ queue.select(queue.index-1,PlaybackController.isPlaybackRequested) },enabled=queue.index>0) { Text("Previous") }
                TextButton(onClick={ queue.select(queue.index+1,PlaybackController.isPlaybackRequested) },enabled=queue.index<queue.entries.lastIndex) { Text("Next") }
            }
            FilterChip(selected=queue.shuffleEnabled,onClick={queue.toggleShuffle()},enabled=queue.entries.size>1,
                label={Text("Shuffle")},modifier=Modifier.heightIn(min=48.dp).testTag("ShuffleQueue"))
            Text(if(queue.shuffleEnabled) "Random order" else if(queue.originQuiz) "Popularity order" else "Saved order",
                Modifier.padding(top=14.dp),style=MaterialTheme.typography.labelMedium)
        }
        queue.notice?.let { Text(it,Modifier.padding(horizontal=16.dp),color=MaterialTheme.colorScheme.onSurfaceVariant) }
        if(queue.loading) { CircularProgressIndicator(Modifier.padding(20.dp)); Text("Finding matching songs…",Modifier.padding(16.dp)) }
        else if(queue.entries.isEmpty()) Text("No matching songs to play or save.",Modifier.padding(16.dp))
        else if(!queue.started) {
            Row(Modifier.fillMaxWidth().padding(horizontal=16.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                Button(onClick=queue::start,modifier=Modifier.heightIn(min=48.dp).testTag("PlaySongQueue")) {
                    Text("Play queue")
                }
                TextButton(onClick={showSave=true}) { Text("Save playlist") }
            }
            LazyColumn(Modifier.fillMaxWidth().weight(1f)) {
                itemsIndexed(queue.entries) { i, song ->
                    TextButton(onClick={queue.select(i,true)},modifier=Modifier.fillMaxWidth()) {
                        Text("${i+1}. ${song.title} — ${song.artist} · ${song.sectionName}",Modifier.fillMaxWidth())
                    }
                }
            }
        } else Box(Modifier.weight(1f)) { player() }
    }
    if(showQueue) ModalBottomSheet(onDismissRequest={showQueue=false}) {
        Text("Song queue",Modifier.padding(16.dp),style=MaterialTheme.typography.titleLarge)
        TextButton(onClick={showQueue=false;showSave=true},modifier=Modifier.testTag("SaveSongQueue")) { Text("Save playlist") }
        LazyColumn(Modifier.fillMaxWidth().heightIn(max=480.dp)) {
            itemsIndexed(queue.entries) { i, song ->
                TextButton(onClick={showQueue=false;queue.select(i,PlaybackController.isPlaybackRequested)},modifier=Modifier.fillMaxWidth()) {
                    Text("${i+1}. ${song.title} — ${song.artist} · ${song.sectionName}",Modifier.fillMaxWidth())
                }
            }
        }
    }
    if(showSave) AlertDialog(onDismissRequest={if(!saving)showSave=false},title={Text("Save playlist")},
        text={OutlinedTextField(value=name,onValueChange={name=it},enabled=!saving,label={Text("Playlist name")},singleLine=true)},
        confirmButton={TextButton(enabled=!saving && name.trim().isNotEmpty(),onClick={
            saving=true
            val snapshot=queue.entries.toList()
            val playlistName=name.trim()
            scope.launch {
                try {
                    val id=UUID.randomUUID().toString()
                    val now=System.currentTimeMillis()
                    withContext(Dispatchers.IO) {
                        playlistDao.saveGeneratedPlaylist(Playlist(id,playlistName,false,now),snapshot.mapIndexed { position,song ->
                            PlaylistEntry(id,song.slug,now,position,song.sectionId,song.sectionName)
                        })
                    }
                    queue.markSaved(id);showSave=false
                } catch (_: Exception) { queue.showNotice("Could not save this playlist. Try again.") }
                finally { saving=false }
            }
        }) {Text(if(saving)"Saving…" else "Save")}},
        dismissButton={TextButton(enabled=!saving,onClick={showSave=false}){Text("Cancel")}})
}
