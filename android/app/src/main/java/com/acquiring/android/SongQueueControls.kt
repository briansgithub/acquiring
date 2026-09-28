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
            Text("${if(queue.entries.isEmpty()) 0 else queue.index+1} of ${queue.entries.size}",Modifier.weight(1f).padding(top=12.dp))
            TextButton(onClick={showQueue=true},enabled=queue.entries.isNotEmpty()) { Text("Queue") }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal=8.dp),horizontalArrangement=Arrangement.SpaceEvenly) {
            TextButton(onClick={ queue.select(queue.index-1,PlaybackController.isPlaybackRequested) },enabled=queue.index>0) { Text("Previous") }
            TextButton(onClick={ queue.select(queue.index+1,PlaybackController.isPlaybackRequested) },enabled=queue.index<queue.entries.lastIndex) { Text("Next") }
            TextButton(onClick={queue.shuffleRemaining()},enabled=queue.entries.size-queue.index>2,
                modifier=Modifier.testTag("ShuffleQueue")) { Text("Shuffle") }
        }
        queue.notice?.let { Text(it,Modifier.padding(horizontal=16.dp),color=MaterialTheme.colorScheme.onSurfaceVariant) }
        if(queue.loading) { CircularProgressIndicator(Modifier.padding(20.dp)); Text("Finding matching songs…",Modifier.padding(16.dp)) }
        else if(queue.entries.isEmpty()) Text("No matching songs to play or save.",Modifier.padding(16.dp))
        else Box(Modifier.weight(1f)) { player() }
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
