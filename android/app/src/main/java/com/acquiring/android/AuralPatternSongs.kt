package com.acquiring.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException

@Composable
internal fun AuralPatternSongs(catalog:AuralCatalog?,target:AuralPatternTarget,busy:Boolean,onSong:(AuralPatternSong)->Unit,modifier:Modifier=Modifier) {
    var songs by remember(target.id) { mutableStateOf<List<AuralPatternSong>?>(null) }
    var error by remember(target.id) { mutableStateOf(false) }
    var retry by remember { mutableStateOf(0) }
    val scroll=rememberLazyListState()
    LaunchedEffect(catalog,target.id,retry) {
        if(catalog==null) return@LaunchedEffect
        error=false
        try { songs=withContext(Dispatchers.IO) { catalog.songs(target) } }
        catch(cancelled:CancellationException) { throw cancelled }
        catch(_:Exception) { error=true }
    }
    Column(modifier.fillMaxSize().testTag("AuralSongs")) {
        Text(songs?.let { "${it.size} songs · A–Z" } ?: "Songs · A–Z",Modifier.padding(16.dp),style=MaterialTheme.typography.labelLarge)
        if(busy || songs==null && !error) LinearProgressIndicator(Modifier.fillMaxWidth())
        if(error) TextButton(onClick={ retry++ }) { Text("Could not load songs · Retry") }
        if(songs!=null) LazyColumn(state=scroll,modifier=Modifier.weight(1f).testTag("AuralSongsList")) {
            itemsIndexed(songs.orEmpty(),key={_,song->song.id}) { index,song ->
                ListItem(headlineContent={Text(song.title)},supportingContent={Text(song.artist)},
                    leadingContent={Text("${index+1}")},trailingContent={Text("›")},
                    modifier=Modifier.fillMaxWidth().clickable(enabled=!busy) { onSong(song) }.testTag("AuralSong-${song.id}"))
                Divider()
            }
        }
    }
}
