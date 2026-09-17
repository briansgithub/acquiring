package com.acquiring.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.ui.Alignment
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible

/** Rows are pages of globally ranked sequences; children resolve against the same index. */
@Composable
internal fun AuralCatalogScreen(catalog: AuralCatalog, settings: AuralExampleSettings, session: AuralSession,
    onPractice: (AuralPatternTarget) -> Unit, onAdaptive: () -> Unit, onContinue: (() -> Unit)?, modifier: Modifier = Modifier,
    onReview: (List<AuralCatalogRow>) -> Unit = {}) {
    var search by rememberSaveable { mutableStateOf("") }
    var minimum by rememberSaveable { mutableStateOf("") }
    var maximum by rememberSaveable { mutableStateOf("") }
    var expanded by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var pageCount by rememberSaveable { mutableStateOf(1) }
    var loadedFor by rememberSaveable { mutableStateOf("") }
    var rows by remember { mutableStateOf(emptyList<AuralCatalogRow>()) }
    var children by remember { mutableStateOf(emptyMap<String,List<AuralCatalogRow>>()) }
    var ranking by remember { mutableStateOf<AuralCatalog.Ranking?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<AuralCatalogRow?>(null) }
    var evidence by remember { mutableStateOf("") }
    var gaps by remember { mutableStateOf<List<String>?>(null) }
    val scope = rememberCoroutineScope()
    val treeScroll = rememberLazyListState(); val flatScroll = rememberLazyListState()
    val preferences = settings.copy(flatList=false)
    val progress = session.view().progress
    LaunchedEffect(catalog,preferences,search,minimum,maximum) {
        busy=true; error=null
        try {
            val key="${catalog.snapshotId}|$preferences|$search|$minimum|$maximum"
            if(loadedFor!=key) { pageCount=1;expanded=emptyList();loadedFor=key }
            val loaded = runInterruptible(Dispatchers.IO) {
                val min = minimum.toIntOrNull()?.coerceAtLeast(2) ?: 2
                val max = maximum.toIntOrNull()?.coerceAtLeast(min) ?: Int.MAX_VALUE
                val query = catalog.Ranking(preferences,session.recentSongs,session.favorites,min,max,search)
                query to buildList { repeat(pageCount) { addAll(query.page()) } }
            }
            val restoredChildren=withContext(Dispatchers.IO) {
                val result=mutableMapOf<String,List<AuralCatalogRow>>()
                fun restore(row:AuralCatalogRow) {
                    if(row.target.id !in expanded || row.target.id in result) return
                    val children=catalog.children(row.target,preferences,session.recentSongs,session.favorites)
                    result[row.target.id]=children;children.forEach(::restore)
                }
                loaded.second.forEach(::restore);result
            }
            ranking?.close(); ranking=loaded.first; rows=loaded.second; children=restoredChildren
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { error="Could not load the catalog. Try changing the search." }
        finally { busy=false }
    }
    fun toggle(row: AuralCatalogRow) {
        if(row.target.id in expanded) { expanded=expanded-row.target.id; return }
        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { catalog.children(row.target,preferences,session.recentSongs,session.favorites) }
                children=children+(row.target.id to result); expanded=expanded+row.target.id
            } catch (_: Exception) { error="Could not load subsequences." }
        }
    }
    data class Display(val row: AuralCatalogRow,val depth: Int,val key: String,val number: String)
    val displayed = buildList {
        fun append(row: AuralCatalogRow,depth: Int,path: String,number: String) {
            add(Display(row,depth,path,number))
            if(!settings.flatList && row.target.id in expanded) children[row.target.id]?.forEachIndexed { index,child -> append(child,depth+1,"$path/${child.target.id}","$number.${index+1}") }
        }
        rows.forEachIndexed { index,row -> append(row,0,row.target.id,"${index+1}") }
    }
    Column(modifier.fillMaxSize().testTag("AuralCatalog")) {
        Row(Modifier.padding(horizontal=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            TextButton(onClick=onAdaptive) { Text("Guided course") }
            TextButton(onClick={ onReview(rows) },enabled=rows.isNotEmpty() && !busy) { Text("Review") }
            if(onContinue != null) TextButton(onClick=onContinue) { Text("Continue") }
        }
        OutlinedTextField(search,{ search=it },label={ Text("Search progressions") },singleLine=true,modifier=Modifier.fillMaxWidth().padding(horizontal=12.dp).testTag("AuralCatalogSearch"))
        Row(Modifier.padding(12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(minimum,{ minimum=it.filter(Char::isDigit) },label={ Text("Min chords") },singleLine=true,modifier=Modifier.weight(1f))
            OutlinedTextField(maximum,{ maximum=it.filter(Char::isDigit) },label={ Text("Max chords") },singleLine=true,modifier=Modifier.weight(1f))
        }
        Text(if(settings.flatList) "All sequences · highest score first" else "Progressions · tap › for subsequences",Modifier.padding(horizontal=16.dp),style=MaterialTheme.typography.labelSmall)
        TextButton(onClick={ scope.launch { gaps=withContext(Dispatchers.IO) { catalog.analysisGaps() } } }) { Text("Analysis gaps") }
        error?.let { Text(it,Modifier.padding(12.dp),color=MaterialTheme.colorScheme.error) }
        if(busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(state=if(settings.flatList) flatScroll else treeScroll,modifier=Modifier.weight(1f)) {
            items(displayed,key={ it.key }) { entry ->
                val row=entry.row
                Row(Modifier.fillMaxWidth().padding(start=(8+minOf(entry.depth,4)*8).dp,end=8.dp,top=4.dp,bottom=4.dp),verticalAlignment=Alignment.CenterVertically) {
                    Column(Modifier.widthIn(min=48.dp,max=88.dp).padding(end=8.dp),horizontalAlignment=Alignment.CenterHorizontally) {
                        Text(entry.number,style=MaterialTheme.typography.labelLarge,modifier=Modifier.testTag("AuralOutline-${entry.number}"))
                        if(!settings.flatList && row.length>2) FilledTonalIconButton(onClick={ toggle(row) },modifier=Modifier.size(48.dp).testTag("AuralExpand-${entry.number}")) {
                            val open=row.target.id in expanded
                            Icon(if(open) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,
                                contentDescription=if(open) "Collapse ${entry.number}" else "Expand ${entry.number}",modifier=Modifier.size(32.dp))
                        }
                    }
                    Column(Modifier.weight(1f).clickable { onPractice(row.target) }.padding(vertical=12.dp).testTag("AuralPattern-${row.target.id}")) {
                        Text(row.target.labels.joinToString(" → "),style=MaterialTheme.typography.titleMedium,maxLines=3,
                            color=remember(row.target.id) { auralRomanColor(row.target.harmonicMode()) })
                        Text("${row.length} chords · ${row.occurrences} occurrences · ${row.songs} songs",style=MaterialTheme.typography.bodySmall)
                        AuralFamilyProgress(row.target.id, progress)
                    }
                    TextButton(onClick={ info=row; evidence="Loading coverage…"; scope.launch {
                        evidence=try { withContext(Dispatchers.IO) { catalog.evidence(row.target) } } catch (_: Exception) { "Coverage unavailable for this snapshot." }
                    } }) { Text("ⓘ") }
                }
                Divider()
            }
            item {
                if(ranking?.hasMore == true) TextButton(enabled=!busy,onClick={ scope.launch {
                    busy=true
                    try { val page=runInterruptible(Dispatchers.IO) { ranking?.page().orEmpty() }; rows=rows+page;pageCount++ }
                    finally { busy=false }
                } },modifier=Modifier.fillMaxWidth()) { Text("More") }
                else if(!busy && rows.isEmpty()) Text("No matching sequences",Modifier.padding(16.dp))
            }
        }
    }
    info?.let { row -> AlertDialog(onDismissRequest={ info=null },title={ Text("Sequence evidence") },text={ Text(
        "${row.occurrences} occurrences across ${row.songs} songs and ${row.sections} sections.\n${row.effective} effective occurrences for ranking.\nCombined score: ${"%.2f".format(row.score)}\nCounts include overlaps and always describe the full corpus.\nSong popularity is separate from harmonic frequency.\n\n$evidence",Modifier.verticalScroll(rememberScrollState())) },confirmButton={ TextButton(onClick={ info=null }) { Text("Close") } }) }
    gaps?.let { entries -> AlertDialog(onDismissRequest={gaps=null},title={Text("Analysis gaps")},text={
        LazyColumn(Modifier.heightIn(max=420.dp)) {
            item { Text("These passages cannot be graded reliably. Valid passages elsewhere in each section remain available.",Modifier.padding(bottom=12.dp)) }
            items(entries) { Text(it,Modifier.padding(vertical=8.dp),style=MaterialTheme.typography.bodySmall) }
            item { TextButton(onClick={scope.launch { val next=withContext(Dispatchers.IO){catalog.analysisGaps(entries.size)};gaps=entries+next }}) { Text("More") } }
        }
    },confirmButton={TextButton(onClick={gaps=null}){Text("Close")}}) }
}
