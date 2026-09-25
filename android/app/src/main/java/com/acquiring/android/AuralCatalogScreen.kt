package com.acquiring.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private data class AuralLeaf(val length: Int, val start: AuralStartGroup) { val id = "$length|${start.id}" }
private data class AuralLeafPage(val rows: List<AuralCatalogRow> = emptyList(), val ranking: AuralCatalog.Ranking? = null,
    val busy: Boolean = false, val error: String? = null, val hasMore: Boolean = false)
private data class AuralPrimaryGroup(val id: String, val label: String, val leaves: List<AuralLeaf>)
private data class AuralDisplay(val row: AuralCatalogRow, val depth: Int, val key: String, val number: String)

/** Two-dimensional catalog: either chord count or starting numeral may be the primary grouping. */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
internal fun AuralCatalogScreen(catalog: AuralCatalog, settings: AuralExampleSettings, session: AuralSession,
    onPractice: (AuralPatternTarget) -> Unit, onAdaptive: () -> Unit, onContinue: (() -> Unit)?, modifier: Modifier = Modifier,
    onReview: (List<AuralCatalogRow>) -> Unit = {}, onSettingsChange: (AuralExampleSettings) -> Unit = {}) {
    val storage = LocalContext.current.applicationContext.getSharedPreferences("aural_catalog_browse", android.content.Context.MODE_PRIVATE)
    var search by rememberSaveable { mutableStateOf(storage.getString("search", "").orEmpty()) }
    var appliedSearch by remember { mutableStateOf(search) }
    var activeLeaf by rememberSaveable { mutableStateOf(storage.getString("leaf", "").orEmpty()) }
    var activePrimary by rememberSaveable { mutableStateOf(storage.getString("primary", "").orEmpty()) }
    var expandedPrimary by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var expandedSecondary by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var expandedRows by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var buckets by remember { mutableStateOf<Map<Int,List<AuralStartGroup>>>(emptyMap()) }
    var pages by remember { mutableStateOf(emptyMap<String,AuralLeafPage>()) }
    var children by remember { mutableStateOf(emptyMap<String,List<AuralCatalogRow>>()) }
    var loadingGroups by remember { mutableStateOf(true) }
    var catalogError by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<AuralCatalogRow?>(null) }
    var evidence by remember { mutableStateOf("") }
    var gaps by remember { mutableStateOf<List<String>?>(null) }
    var modeMenu by remember { mutableStateOf(false) }
    var generation by remember { mutableStateOf(0) }
    var loadedKey by remember { mutableStateOf("") }
    var pendingRestorePages by remember { mutableStateOf(storage.getInt("pages",1).coerceAtLeast(1)) }
    var disposed by remember { mutableStateOf(false) }
    val mutex = remember { Mutex() }
    val liveRankings = remember { mutableSetOf<AuralCatalog.Ranking>() }
    val scope = rememberCoroutineScope()
    val scroll = rememberLazyListState(storage.getInt("scrollIndex",0),storage.getInt("scrollOffset",0))
    val effective = if (catalog.supportsModeAnalysis) settings else settings.copy(analysis="allModes")
    val rankingPreferences = effective.copy(flatList=false,groupingPriority="length")
    val queryKey = "${catalog.snapshotId}|$rankingPreferences|$appliedSearch"
    val frozenRecent = remember(queryKey) { session.recentSongs.toList() }
    val frozenFavorites = remember(queryKey) { session.favorites.toSet() }
    val progress = session.view().progress

    DisposableEffect(catalog) { onDispose {
        disposed=true; generation++
        scope.launch(NonCancellable + Dispatchers.IO) { mutex.withLock { liveRankings.forEach { it.close() };liveRankings.clear() } }
    } }
    LaunchedEffect(search) { delay(250);appliedSearch=search }
    LaunchedEffect(catalog, rankingPreferences, appliedSearch) {
        generation++; val expected=generation
        val restore=loadedKey.isEmpty() && storage.getString("context","")==queryKey
        pendingRestorePages=if(restore) storage.getInt("pages",1).coerceAtLeast(1) else 1
        loadedKey=""; buckets=emptyMap(); pages=emptyMap(); children=emptyMap(); expandedRows=emptyList()
        if(!restore) { expandedPrimary=emptyList();expandedSecondary=emptyList();activeLeaf="";activePrimary="";scroll.scrollToItem(0) }
        loadingGroups=true; catalogError=null
        try {
            val result=withContext(Dispatchers.IO) { mutex.withLock {
                liveRankings.forEach { it.close() };liveRankings.clear()
                catalog.groupedBuckets(rankingPreferences)
            } }
            if(expected!=generation) return@LaunchedEffect
            buckets=result
            val validLeaf=result.any { (length,starts) -> starts.any { "$length|${it.id}"==activeLeaf } }
            if(restore && validLeaf) {
                expandedSecondary=listOf(activeLeaf)
                activePrimary=if(settings.groupingPriority=="start") "start:${activeLeaf.substringAfter('|')}" else "length:${activeLeaf.substringBefore('|')}"
                expandedPrimary=listOf(activePrimary)
            } else if(restore) { activeLeaf="";activePrimary="";expandedPrimary=emptyList();expandedSecondary=emptyList() }
            loadedKey=queryKey
        } catch (cancelled:CancellationException) { throw cancelled }
        catch (_: Exception) { if(expected==generation) {catalogError="Could not load progression groups.";buckets=emptyMap()} }
        finally { if(expected==generation) loadingGroups=false }
    }

    val allStarts = buckets.values.flatten().associateBy { it.id }.values.sortedWith(auralStartGroupOrder)
    val startFirst = settings.groupingPriority == "start" && catalog.supportsStartGrouping
    val primaryGroups = if (startFirst) allStarts.map { start ->
        AuralPrimaryGroup("start:${start.id}", "Starts with ${start.label}", buckets.filterValues { groups -> groups.any { it.id==start.id } }.keys.map { AuralLeaf(it,start) })
    } else buckets.map { (length,starts) -> AuralPrimaryGroup("length:$length", "$length chords", starts.map { AuralLeaf(length,it) }) }

    fun load(leaf: AuralLeaf, more: Boolean = false) {
        if (pages[leaf.id]?.busy == true || loadedKey!=queryKey || disposed) return
        val expected=generation
        val prior=pages[leaf.id]
        val requestedPages=if(prior==null && leaf.id==activeLeaf) pendingRestorePages else 1
        pages=pages+(leaf.id to (prior ?: AuralLeafPage()).copy(busy=true,error=null))
        scope.launch {
            try {
                val loaded=withContext(Dispatchers.IO) { mutex.withLock {
                    if(disposed || expected!=generation) return@withLock null
                    val ranking = prior?.ranking ?: catalog.Ranking(rankingPreferences,frozenRecent,frozenFavorites,
                        leaf.length,leaf.length,appliedSearch,leaf.start.id.takeIf(String::isNotEmpty)).also { liveRankings.add(it) }
                    val rows=buildList { repeat(requestedPages) { if(ranking.hasMore) addAll(ranking.page()) } }
                    AuralLeafPage((if(more) prior?.rows.orEmpty() else emptyList())+rows,ranking,false,hasMore=ranking.hasMore)
                } }
                if(expected==generation && !disposed && loaded!=null) pages=pages+(leaf.id to loaded)
            } catch (cancelled:CancellationException) { throw cancelled }
            catch (_: Exception) { if(expected==generation && !disposed) pages=pages+(leaf.id to (prior ?: AuralLeafPage()).copy(busy=false,error="Could not load this group.")) }
        }
    }
    fun toggleLeaf(leaf:AuralLeaf) {
        if(leaf.id in expandedSecondary) expandedSecondary=expandedSecondary-leaf.id
        else { activeLeaf=leaf.id;expandedSecondary=expandedSecondary+leaf.id }
    }
    fun toggleRow(entry:AuralDisplay) {
        val row=entry.row
        if(entry.key in expandedRows) { expandedRows=expandedRows-entry.key; return }
        val expected=generation
        scope.launch {
            try {
                val result=withContext(Dispatchers.IO) { mutex.withLock { catalog.children(row.target,rankingPreferences,frozenRecent,frozenFavorites) } }
                if(expected==generation && !disposed) { children=children+(entry.key to result);expandedRows=expandedRows+entry.key }
            } catch (cancelled:CancellationException) { throw cancelled }
            catch (_:Exception) { if(expected==generation) catalogError="Could not load subsequences." }
        }
    }
    fun displays(leaf:AuralLeaf):List<AuralDisplay> = buildList {
        fun append(row:AuralCatalogRow,depth:Int,path:String,number:String) {
            add(AuralDisplay(row,depth,"${leaf.id}|$path",number))
            if(!settings.flatList && "${leaf.id}|$path" in expandedRows) children["${leaf.id}|$path"]?.forEachIndexed { index, child ->
                append(child,depth+1,"$path/${child.target.id}","$number.${index+1}")
            }
        }
        pages[leaf.id]?.rows.orEmpty().forEachIndexed { index,row -> append(row,0,row.target.id,"${index+1}") }
    }
    LaunchedEffect(loadedKey,expandedSecondary) {
        if(loadedKey==queryKey) primaryGroups.flatMap { it.leaves }.filter { it.id in expandedSecondary && pages[it.id]==null }.forEach { load(it) }
    }
    LaunchedEffect(startFirst) {
        if(activeLeaf.isNotEmpty()) {
            activePrimary=if(startFirst) "start:${activeLeaf.substringAfter('|')}" else "length:${activeLeaf.substringBefore('|')}"
            expandedPrimary=listOf(activePrimary)
            expandedSecondary=(expandedSecondary+activeLeaf).distinct()
        }
    }
    LaunchedEffect(loadedKey,activeLeaf,activePrimary,pages,search) {
        if(loadedKey==queryKey) {
            val editor=storage.edit().putString("context",queryKey).putString("leaf",activeLeaf)
            .putString("primary",activePrimary).putString("search",search)
            val loaded=pages[activeLeaf]
            if(loaded!=null && !loaded.busy) editor.putInt("pages",((loaded.rows.size+29)/30).coerceAtLeast(1))
            else if(activeLeaf.isEmpty()) editor.putInt("pages",1)
            editor.apply()
        }
    }
    LaunchedEffect(scroll) { snapshotFlow { scroll.firstVisibleItemIndex to scroll.firstVisibleItemScrollOffset }.collect { (index,offset) ->
        if(!loadingGroups && loadedKey==queryKey) storage.edit().putInt("scrollIndex",index).putInt("scrollOffset",offset).apply()
    } }

    Column(modifier.fillMaxSize().testTag("AuralCatalog")) {
        Row(Modifier.padding(horizontal=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            TextButton(onClick=onAdaptive) { Text("Guided course") }
            if(onContinue!=null) TextButton(onClick=onContinue) { Text("Continue") }
        }
        OutlinedTextField(search,{search=it},label={Text("Search progressions")},singleLine=true,modifier=Modifier.fillMaxWidth().padding(horizontal=12.dp).testTag("AuralCatalogSearch"))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal=12.dp,vertical=6.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            listOf("relativeMajor" to "Relative major","allModes" to "Mixed Modes","filterMode" to "Filter by mode").forEach { (id,label) ->
                FilterChip(selected=effective.analysis==id,onClick={if(catalog.supportsModeAnalysis || id=="allModes") onSettingsChange(settings.copy(analysis=id))},
                    enabled=catalog.supportsModeAnalysis || id=="allModes",label={Text(label)},modifier=Modifier.testTag("AuralAnalysis-$id"))
            }
        }
        if(effective.analysis=="filterMode") Box(Modifier.fillMaxWidth().padding(horizontal=12.dp)) {
            OutlinedButton(onClick={modeMenu=true},modifier=Modifier.fillMaxWidth().testTag("AuralModeFilter")) { Text(auralModeLabel(effective.modeFilter)) }
            DropdownMenu(expanded=modeMenu,onDismissRequest={modeMenu=false}) { AURAL_MODES.forEach { mode ->
                DropdownMenuItem(text={Text(auralModeLabel(mode))},onClick={modeMenu=false;onSettingsChange(settings.copy(modeFilter=mode))})
            } }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal=12.dp,vertical=4.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Text("Group first:",style=MaterialTheme.typography.labelLarge,modifier=Modifier.align(Alignment.CenterVertically))
            FilterChip(selected=settings.groupingPriority!="start",onClick={onSettingsChange(settings.copy(groupingPriority="length"))},label={Text("Length")})
            FilterChip(selected=settings.groupingPriority=="start",onClick={onSettingsChange(settings.copy(groupingPriority="start"))},
                enabled=catalog.supportsStartGrouping,label={Text("Starting chord")})
        }
        if(!catalog.supportsStartGrouping) Text("Update the progression catalog to group by starting chord.",Modifier.padding(horizontal=16.dp),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick={scope.launch {gaps=withContext(Dispatchers.IO){catalog.analysisGaps()}}}) {Text("Analysis gaps")}
        catalogError?.let {Text(it,Modifier.padding(12.dp),color=MaterialTheme.colorScheme.error)}
        if(loadingGroups) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(state=scroll,modifier=Modifier.weight(1f)) {
            primaryGroups.forEach { primary ->
                item(key=primary.id) {
                    val open=primary.id in expandedPrimary
                    ListItem(headlineContent={Text(primary.label,style=MaterialTheme.typography.titleMedium)},
                        supportingContent={Text(if(startFirst) "${primary.leaves.size} sequence lengths" else "${primary.leaves.size} starting-chord groups")},
                        leadingContent={Icon(if(open) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,null)},
                        modifier=Modifier.clickable { activePrimary=if(open) "" else primary.id;expandedPrimary=if(open) expandedPrimary-primary.id else expandedPrimary+primary.id }.testTag("AuralPrimary-${primary.id}"))
                    Divider()
                }
                if(primary.id in expandedPrimary) primary.leaves.forEach { leaf ->
                    item(key="sub:${primary.id}:${leaf.id}") {
                        val open=leaf.id in expandedSecondary
                        val label=if(startFirst) "${leaf.length} chords" else "Starts with ${leaf.start.label}"
                        ListItem(headlineContent={Text(label)},leadingContent={Icon(if(open) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,null)},
                            modifier=Modifier.padding(start=16.dp).clickable{toggleLeaf(leaf)}.testTag("AuralSubgroup-${leaf.id}"))
                    }
                    if(leaf.id in expandedSecondary) {
                        item(key="review:${leaf.id}") { TextButton(onClick={ onReview(pages[leaf.id]?.rows.orEmpty().take(30).toList()) },
                            enabled=pages[leaf.id]?.rows?.isNotEmpty()==true && !loadingGroups && search==appliedSearch) {Text("Review this subgroup")} }
                        items(displays(leaf),key={it.key}) { entry ->
                            val row=entry.row
                            Row(Modifier.fillMaxWidth().padding(start=(24+minOf(entry.depth,4)*8).dp,end=8.dp,top=4.dp,bottom=4.dp),verticalAlignment=Alignment.CenterVertically) {
                                Column(Modifier.widthIn(min=48.dp,max=88.dp).padding(end=8.dp),horizontalAlignment=Alignment.CenterHorizontally) {
                                    Text(entry.number,style=MaterialTheme.typography.labelLarge,modifier=Modifier.testTag("AuralOutline-${leaf.id}-${entry.number}"))
                                    if(!settings.flatList && row.length>2) FilledTonalIconButton(onClick={toggleRow(entry)},modifier=Modifier.size(48.dp).testTag("AuralExpand-${leaf.id}-${entry.number}")) {
                                        val open=entry.key in expandedRows
                                        Icon(if(open) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,if(open) "Collapse ${entry.number}" else "Expand ${entry.number}")
                                    }
                                }
                                Column(Modifier.weight(1f).clickable{onPractice(row.target)}.padding(vertical=12.dp).testTag("AuralPattern-${row.target.id}")) {
                                    Text(auralRomanSequence(row.target.labels),style=MaterialTheme.typography.titleMedium,maxLines=3)
                                    Text(if(row.target.view.startsWith("relative_")) "Relative major" else row.target.sourceMode()?.let(::auralModeLabel) ?: "Mode unavailable",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("${row.length} chords · ${row.occurrences} occurrences · ${row.songs} songs",style=MaterialTheme.typography.bodySmall)
                                    AuralFamilyProgress(row.target.id,progress)
                                }
                                TextButton(onClick={info=row;evidence="Loading coverage…";scope.launch{evidence=try{withContext(Dispatchers.IO){catalog.evidence(row.target)}}catch(_:Exception){"Coverage unavailable for this snapshot."}}}){Text("ⓘ")}
                            }
                            Divider()
                        }
                        item(key="page:${leaf.id}") {
                            val page=pages[leaf.id]
                            if(page?.busy==true) LinearProgressIndicator(Modifier.fillMaxWidth())
                            page?.error?.let{Text(it,Modifier.padding(16.dp),color=MaterialTheme.colorScheme.error)}
                            if(page?.error!=null) TextButton(onClick={load(leaf,page.rows.isNotEmpty())}) {Text("Retry")}
                            if(page?.hasMore==true) TextButton(onClick={load(leaf,true)},enabled=page.busy!=true && search==appliedSearch,modifier=Modifier.fillMaxWidth()){Text("More")}
                            else if(page?.busy==false && page.rows.isEmpty()) Text("No matching sequences",Modifier.padding(16.dp))
                        }
                    }
                }
            }
        }
    }
    info?.let { row -> AlertDialog(onDismissRequest={info=null},title={Text("Sequence evidence")},text={Text("${row.occurrences} occurrences across ${row.songs} songs and ${row.sections} sections.\n${row.effective} effective occurrences for ranking.\nCombined score: ${"%.2f".format(row.score)}\nCounts include overlaps and always describe the full corpus.\nSong popularity is separate from harmonic frequency.\n\n$evidence",Modifier.verticalScroll(rememberScrollState()))},confirmButton={TextButton(onClick={info=null}){Text("Close")}}) }
    gaps?.let { entries -> AlertDialog(onDismissRequest={gaps=null},title={Text("Analysis gaps")},text={LazyColumn(Modifier.heightIn(max=420.dp)){item{Text("These passages cannot be graded reliably. Valid passages elsewhere in each section remain available.",Modifier.padding(bottom=12.dp))};items(entries){Text(it,Modifier.padding(vertical=8.dp),style=MaterialTheme.typography.bodySmall)};item{TextButton(onClick={scope.launch{val next=withContext(Dispatchers.IO){catalog.analysisGaps(entries.size)};gaps=entries+next}}){Text("More")}}}},confirmButton={TextButton(onClick={gaps=null}){Text("Close")}}) }
}
