package com.acquiring.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlin.math.roundToInt

private data class AuralLeaf(val length: Int, val start: AuralStartGroup) { val id = "$length|${start.id}" }
private data class AuralLeafPage(val rows: List<AuralCatalogRow> = emptyList(), val ranking: AuralCatalog.Ranking? = null,
    val busy: Boolean = false, val error: String? = null, val hasMore: Boolean = false)
private data class AuralPrimaryGroup(val id: String, val label: String, val leaves: List<AuralLeaf>)
private data class AuralDisplay(val row: AuralCatalogRow, val depth: Int, val key: String, val number: String)

@Composable
private fun AuralCatalogChoice(label: String, value: String, options: List<Pair<String,String>>,
    onSelect: (String) -> Unit, modifier: Modifier = Modifier, tag: String) {
    var open by remember { mutableStateOf(false) }
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth().testTag(tag)) {
                Text(value, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Icon(Icons.Default.KeyboardArrowDown, contentDescription = null)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (id, name) -> DropdownMenuItem(text = { Text(name) },
                    onClick = { open = false; onSelect(id) }, modifier = Modifier.testTag("$tag-$id")) }
            }
        }
    }
}

/** Two-dimensional catalog: either chord count or starting numeral may be the primary grouping. */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
internal fun AuralCatalogScreen(catalog: AuralCatalog, settings: AuralExampleSettings, session: AuralSession,
    onPractice: (AuralPatternTarget) -> Unit, onAdaptive: () -> Unit, onContinue: (() -> Unit)?, modifier: Modifier = Modifier,
    onReview: (List<AuralCatalogRow>) -> Unit = {}, onSettingsChange: (AuralExampleSettings) -> Unit = {},
    onPlayMatchingSongs: (AuralPatternTarget) -> Unit = {},
    minimumPopularityPercent: Int? = null, onMinimumPopularityChange: (Int) -> Unit = {},
    minimumCoreLength: Int = 2, onMinimumCoreLengthChange: (Int) -> Unit = {},
    browseStorageName: String = "aural_catalog_browse") {
    val storage = LocalContext.current.applicationContext.getSharedPreferences(browseStorageName, android.content.Context.MODE_PRIVATE)
    var query by remember { mutableStateOf(runCatching {
        Json.decodeFromString<AuralProgressionQuery>(storage.getString("progressionQuery", "").orEmpty())
    }.getOrDefault(AuralProgressionQuery())) }
    var appliedQuery by remember { mutableStateOf(query) }
    var activeLeaf by rememberSaveable { mutableStateOf(storage.getString("leaf", "").orEmpty()) }
    var lastGroupedLeaf by rememberSaveable { mutableStateOf(storage.getString("groupedLeaf", "").orEmpty()) }
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
    var moreOptions by rememberSaveable { mutableStateOf(false) }
    var generation by remember { mutableStateOf(0) }
    var loadedKey by remember { mutableStateOf("") }
    var pendingRestorePages by remember { mutableStateOf(storage.getInt("pages",1).coerceAtLeast(1)) }
    var disposed by remember { mutableStateOf(false) }
    val mutex = remember { Mutex() }
    val liveRankings = remember { mutableSetOf<AuralCatalog.Ranking>() }
    val scope = rememberCoroutineScope()
    var migrateLengthOrder by remember { mutableStateOf(storage.getInt("lengthOrderVersion",0) < 1) }
    val savedIndex = storage.getInt("scrollIndex",0)
    val migratedIndex = if(storage.getInt("browseLayoutVersion",0) == 0 && storage.contains("scrollIndex")) savedIndex + 1 else savedIndex
    val scroll = rememberLazyListState(if(migrateLengthOrder) 0 else migratedIndex,
        if(migrateLengthOrder) 0 else storage.getInt("scrollOffset",0))
    val effective = if (catalog.supportsModeAnalysis) settings else settings.copy(analysis="allModes")
    val rankingPreferences = effective.copy(flatList=false,groupingPriority="length")
    val ungrouped = settings.groupingPriority == "none"
    val globalLeaf = remember { AuralLeaf(0,AuralStartGroup("","All starting chords",0,"",true,false)) }
    val priorQueryKey = "${catalog.snapshotId}|${catalog.popularityVersion}|$rankingPreferences|$appliedQuery|$minimumPopularityPercent"
    val queryKey = "$priorQueryKey|$minimumCoreLength"
    var draftPopularity by rememberSaveable(minimumPopularityPercent) { mutableStateOf((minimumPopularityPercent ?: 80).toFloat()) }
    var coreLengthDraft by rememberSaveable(minimumCoreLength) { mutableStateOf(minimumCoreLength.toString()) }
    LaunchedEffect(coreLengthDraft) {
        delay(350)
        coreLengthDraft.toIntOrNull()?.takeIf { it in 2..9999 && it!=minimumCoreLength }?.let(onMinimumCoreLengthChange)
    }
    val frozenRecent = remember(queryKey) { session.recentSongs.toList() }
    val frozenFavorites = remember(queryKey) { session.favorites.toSet() }
    val progress = session.view().progress

    DisposableEffect(catalog) { onDispose {
        disposed=true; generation++
        scope.launch(NonCancellable + Dispatchers.IO) { mutex.withLock { liveRankings.forEach { it.close() };liveRankings.clear() } }
    } }
    LaunchedEffect(settings.distinguishInversions) {
        if (!settings.distinguishInversions && query.chords.any { it.inversion != null }) {
            query = query.copy(chords = query.chords.map { it.copy(inversion = null) })
            storage.edit().putString("progressionQuery", Json.encodeToString(query)).apply()
        }
    }
    LaunchedEffect(query) { delay(250);appliedQuery=query }
    LaunchedEffect(catalog, rankingPreferences, appliedQuery, minimumPopularityPercent, minimumCoreLength) {
        generation++; val expected=generation
        val storedContext=storage.getString("context","")
        val restore=loadedKey.isEmpty() && (storedContext==queryKey || minimumCoreLength==2 && storedContext==priorQueryKey)
        pendingRestorePages=if(restore) storage.getInt("pages",1).coerceAtLeast(1) else 1
        loadedKey=""; buckets=emptyMap(); pages=emptyMap(); children=emptyMap(); expandedRows=emptyList()
        if(!restore) { expandedPrimary=emptyList();expandedSecondary=emptyList();activeLeaf="";activePrimary="";scroll.scrollToItem(0) }
        loadingGroups=true; catalogError=null
        try {
            val result=withContext(Dispatchers.IO) { mutex.withLock {
                liveRankings.forEach { it.close() };liveRankings.clear()
                runInterruptible { catalog.matchingBuckets(rankingPreferences,appliedQuery,minimumPopularityPercent).filterKeys { it >= minimumCoreLength } }
            } }
            if(expected!=generation) return@LaunchedEffect
            buckets=result
            val validLeaf=(ungrouped && activeLeaf==globalLeaf.id && result.isNotEmpty()) ||
                result.any { (length,starts) -> starts.any { "$length|${it.id}"==activeLeaf } }
            if(restore && validLeaf) {
                expandedSecondary=listOf(activeLeaf)
                activePrimary=if(ungrouped) "global" else if(settings.groupingPriority=="start") "start:${activeLeaf.substringAfter('|')}" else "length:${activeLeaf.substringBefore('|')}"
                expandedPrimary=listOf(activePrimary)
            } else if(restore) { activeLeaf="";activePrimary="";expandedPrimary=emptyList();expandedSecondary=emptyList() }
            loadedKey=queryKey
        } catch (cancelled:CancellationException) { throw cancelled }
        catch (_: Exception) { if(expected==generation) {catalogError="Could not load progression groups.";buckets=emptyMap()} }
        finally { if(expected==generation) loadingGroups=false }
    }

    val allStarts = buckets.values.flatten().associateBy { it.id }.values.sortedWith(auralStartGroupOrder)
    val startFirst = settings.groupingPriority == "start" && catalog.supportsStartGrouping
    val primaryGroups = if (ungrouped) {
        if(buckets.isEmpty()) emptyList() else listOf(AuralPrimaryGroup("global","All progressions",listOf(globalLeaf)))
    } else if (startFirst) allStarts.map { start ->
        AuralPrimaryGroup("start:${start.id}", "Starts with ${start.label}", buckets.filterValues { groups -> groups.any { it.id==start.id } }.keys.sortedDescending().map { AuralLeaf(it,start) })
    } else buckets.keys.sortedDescending().map { length ->
        AuralPrimaryGroup("length:$length", "$length chords", buckets.getValue(length).map { AuralLeaf(length,it) })
    }
    LaunchedEffect(loadedKey, primaryGroups, migrateLengthOrder) {
        if(migrateLengthOrder && loadedKey==queryKey && !loadingGroups) {
            scroll.scrollToItem(if(activePrimary.isNotEmpty()) primaryGroups.indexOfFirst { it.id==activePrimary }.coerceAtLeast(0) + 1 else 0)
            storage.edit().putInt("lengthOrderVersion",1).apply()
            migrateLengthOrder=false
        }
    }
    LaunchedEffect(loadedKey,loadingGroups) {
        if(loadedKey==queryKey && !loadingGroups) storage.edit().putInt("browseLayoutVersion",1).apply()
    }

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
                        if(leaf.length==0) minimumCoreLength else leaf.length,if(leaf.length==0) Int.MAX_VALUE else leaf.length,
                        appliedQuery,leaf.start.id.takeIf(String::isNotEmpty),minimumPopularityPercent).also { liveRankings.add(it) }
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
                val result=withContext(Dispatchers.IO) { mutex.withLock { catalog.children(row.target,rankingPreferences,frozenRecent,frozenFavorites,minimumPopularityPercent) } }
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
    // Read expansion state in the composable scope so LazyColumn rebuilds its item set on collapse.
    val visibleRows=primaryGroups.flatMap { it.leaves }.filter { pages[it.id]!=null }
        .associate { it.id to displays(it) }
    LaunchedEffect(loadedKey,expandedSecondary,settings.groupingPriority) {
        if(loadedKey==queryKey) primaryGroups.flatMap { it.leaves }.filter { (ungrouped || it.id in expandedSecondary) && pages[it.id]==null }.forEach { load(it) }
    }
    LaunchedEffect(settings.groupingPriority) {
        if(ungrouped) {
            if(activeLeaf.isNotEmpty() && activeLeaf!=globalLeaf.id) lastGroupedLeaf=activeLeaf
            activeLeaf=globalLeaf.id;activePrimary="global"
        } else {
            if(activeLeaf==globalLeaf.id) activeLeaf=lastGroupedLeaf
            if(activeLeaf.isNotEmpty()) {
            activePrimary=if(startFirst) "start:${activeLeaf.substringAfter('|')}" else "length:${activeLeaf.substringBefore('|')}"
            expandedPrimary=listOf(activePrimary)
            expandedSecondary=(expandedSecondary+activeLeaf).distinct()
            }
        }
    }
    LaunchedEffect(loadedKey,activeLeaf,activePrimary,pages,query) {
        if(loadedKey==queryKey) {
            val editor=storage.edit().putString("context",queryKey).putString("leaf",activeLeaf)
            .putString("primary",activePrimary).putString("groupedLeaf",lastGroupedLeaf).putString("progressionQuery",Json.encodeToString(query))
            val loaded=pages[activeLeaf]
            if(loaded!=null && !loaded.busy) editor.putInt("pages",((loaded.rows.size+29)/30).coerceAtLeast(1))
            else if(activeLeaf.isEmpty()) editor.putInt("pages",1)
            editor.apply()
        }
    }
    LaunchedEffect(scroll) { snapshotFlow { scroll.firstVisibleItemIndex to scroll.firstVisibleItemScrollOffset }.collect { (index,offset) ->
        if(!loadingGroups && loadedKey==queryKey) storage.edit().putInt("scrollIndex",index).putInt("scrollOffset",offset).apply()
    } }

    LazyColumn(state=scroll, modifier=modifier.fillMaxSize().testTag("AuralCatalog")) {
        item(key="browse-controls") {
            Column(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(horizontal=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick=onAdaptive) { Text("Guided course") }
                    if(onContinue!=null) TextButton(onClick=onContinue) { Text("Continue practice") }
                }
                AuralProgressionSearch(query,{ query=it;storage.edit().putString("progressionQuery",Json.encodeToString(it)).apply() },catalog,effective)
                Row(Modifier.fillMaxWidth().padding(horizontal=12.dp,vertical=6.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    val analysisOptions = if(catalog.supportsModeAnalysis)
                        listOf("relativeMajor" to "Relative major","allModes" to "Mixed Modes","filterMode" to "Filter by mode")
                    else listOf("allModes" to "Mixed Modes")
                    AuralCatalogChoice("Analysis",analysisOptions.firstOrNull { it.first==effective.analysis }?.second ?: "Mixed Modes",
                        analysisOptions,{onSettingsChange(settings.copy(analysis=it))},Modifier.weight(1f),"AuralAnalysis")
                    val sortOptions=listOf("mostSongs" to "Most songs","recommended" to "Recommended","longest" to "Longest first","shortest" to "Shortest first")
                    AuralCatalogChoice("Sort by",sortOptions.firstOrNull { it.first==settings.sortOrder }?.second ?: "Most songs",
                        sortOptions,{onSettingsChange(settings.copy(sortOrder=it))},Modifier.weight(1f),"AuralSort")
                }
                if(effective.analysis=="filterMode") AuralCatalogChoice("Mode",auralModeLabel(effective.modeFilter),
                    AURAL_MODES.map { it to auralModeLabel(it) },{onSettingsChange(settings.copy(modeFilter=it))},
                    Modifier.fillMaxWidth().padding(horizontal=12.dp),"AuralModeFilter")
                if(settings.sortOrder=="mostSongs") Text("Ordered by use across the full song database.",
                    Modifier.padding(horizontal=16.dp),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick={moreOptions=!moreOptions},modifier=Modifier.padding(horizontal=12.dp).testTag("AuralMoreBrowsingOptions")) {
                    Icon(if(moreOptions) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,null)
                    Text("More browsing options")
                }
                Text(buildList {
                    if(minimumPopularityPercent!=null) add("Song popularity ≥${minimumPopularityPercent}%")
                    add("Core ≥$minimumCoreLength chords")
                    add(when(settings.groupingPriority) { "length" -> "Length first"; "start" -> "Starting chord first"; else -> "No grouping" })
                    if(settings.distinguishInversions) add("Inversions distinguished")
                }.joinToString(" · "),Modifier.padding(start=16.dp,end=16.dp,bottom=8.dp),
                    style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines=2,overflow=TextOverflow.Ellipsis)
                if(moreOptions) Column(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=4.dp)) {
                    Text("Minimum core progression length",style=MaterialTheme.typography.titleSmall)
                    Row(verticalAlignment=Alignment.CenterVertically) {
                        OutlinedButton(onClick={onMinimumCoreLengthChange((minimumCoreLength-1).coerceAtLeast(2))},
                            enabled=minimumCoreLength>2,modifier=Modifier.testTag("AuralCoreLengthDecrease")) { Text("−") }
                        OutlinedTextField(value=coreLengthDraft,onValueChange={ value ->
                            if(value.length<=4 && value.all(Char::isDigit)) coreLengthDraft=value
                        },singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number,imeAction=ImeAction.Done),
                            keyboardActions=KeyboardActions(onDone={
                                coreLengthDraft.toIntOrNull()?.takeIf { it in 2..9999 }?.let(onMinimumCoreLengthChange)
                                    ?: run { coreLengthDraft=minimumCoreLength.toString() }
                            }),
                            isError=coreLengthDraft.toIntOrNull()?.let { it !in 2..9999 } ?: true,
                            modifier=Modifier.width(96.dp).testTag("AuralMinimumCoreLength"),label={Text("Chords")})
                        OutlinedButton(onClick={onMinimumCoreLengthChange((minimumCoreLength+1).coerceAtMost(9999))},
                            enabled=minimumCoreLength<9999,modifier=Modifier.testTag("AuralCoreLengthIncrease")) { Text("+") }
                    }
                    Text("A 4-chord core contains 3 transitions. Shorter subsequences can still appear beneath it.",
                        style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    if(coreLengthDraft.toIntOrNull()?.let { it !in 2..9999 } ?: true)
                        Text("Enter 2–9999 chords.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.error)
                    Divider(Modifier.padding(vertical=8.dp))
                    Text("Song popularity",style=MaterialTheme.typography.titleSmall)
                    if(minimumPopularityPercent!=null) {
                        Text("Show songs scored ${draftPopularity.roundToInt()}% or higher",style=MaterialTheme.typography.bodySmall)
                        Slider(value=draftPopularity,onValueChange={draftPopularity=it},valueRange=0f..100f,
                            onValueChangeFinished={onMinimumPopularityChange(draftPopularity.roundToInt())},
                            modifier=Modifier.testTag("AuralMinimumPopularity").semantics { contentDescription="Minimum song popularity" })
                        Text(if(catalog.popularity.isEmpty()) "No popularity scores are installed; this filter has no matches."
                            else "Songs without a measured score are excluded. This does not change the song counts used for Most songs.",
                            style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Divider(Modifier.padding(vertical=8.dp))
                    Text("Grouping",style=MaterialTheme.typography.titleSmall)
                    Column {
                        listOf("none" to "No grouping","length" to "Length → Starting chord","start" to "Starting chord → Length").forEach { (id,label) ->
                            RadioButtonRow(label,settings.groupingPriority==id,catalog.supportsStartGrouping || id!="start",
                                {onSettingsChange(settings.copy(groupingPriority=id))},"AuralGroup-$id")
                        }
                    }
                    if(!catalog.supportsStartGrouping) Text("Update the progression catalog to group by starting chord.",
                        style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    AuralExampleSwitch("Show subsequences","AuralFlatList",!settings.flatList,
                        description="Expand shorter sequences under a progression") { onSettingsChange(settings.copy(flatList=!it)) }
                    Divider(Modifier.padding(vertical=8.dp))
                    Text("Chord matching",style=MaterialTheme.typography.titleSmall)
                    AuralExampleSwitch("Distinguish inversions","AuralInversions",settings.distinguishInversions,
                        description="Include the bass note when matching a chord") { onSettingsChange(settings.copy(distinguishInversions=it)) }
                }
                catalogError?.let {Text(it,Modifier.padding(12.dp),color=MaterialTheme.colorScheme.error)}
                if(loadingGroups) LinearProgressIndicator(Modifier.fillMaxWidth().testTag("AuralCatalogLoading"))
            }
        }
            if (!loadingGroups && catalogError == null && primaryGroups.isEmpty()) item(key="no-matches") {
                Text("No progressions with at least $minimumCoreLength chords match your filters.",Modifier.padding(16.dp).testTag("AuralNoMatchingGroups"))
            }
            primaryGroups.forEach { primary ->
                if(!ungrouped) item(key=primary.id) {
                    val open=primary.id in expandedPrimary
                    ListItem(headlineContent={Text(primary.label,style=MaterialTheme.typography.titleMedium)},
                        supportingContent={Text(if(startFirst) "${primary.leaves.size} sequence lengths" else "${primary.leaves.size} starting-chord groups")},
                        leadingContent={Icon(if(open) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,null)},
                        modifier=Modifier.clickable { activePrimary=if(open) "" else primary.id;expandedPrimary=if(open) expandedPrimary-primary.id else expandedPrimary+primary.id }.testTag("AuralPrimary-${primary.id}"))
                    Divider()
                }
                if(ungrouped || primary.id in expandedPrimary) primary.leaves.forEach { leaf ->
                    if(!ungrouped) item(key="sub:${primary.id}:${leaf.id}") {
                        val open=leaf.id in expandedSecondary
                        val label=if(startFirst) "${leaf.length} chords" else "Starts with ${leaf.start.label}"
                        val page=pages[leaf.id]
                        ListItem(headlineContent={Text(label)},
                            supportingContent={if(open) Text(when {
                                page==null || page.busy -> "Loading progressions…"
                                page.error!=null -> page.error
                                page.rows.isEmpty() -> "No matching progressions"
                                else -> "${page.rows.size} progressions loaded"
                            },modifier=Modifier.testTag(if(page!=null && !page.busy && page.rows.isNotEmpty()) "AuralSubgroupReady-${leaf.id}" else "AuralSubgroupStatus-${leaf.id}"))},
                            leadingContent={Icon(if(open) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,null)},
                            modifier=Modifier.padding(start=16.dp).clickable{toggleLeaf(leaf)}.testTag("AuralSubgroup-${leaf.id}"))
                    }
                    if(ungrouped || leaf.id in expandedSecondary) {
                        if(!ungrouped) item(key="review:${leaf.id}") { TextButton(onClick={ onReview(pages[leaf.id]?.rows.orEmpty().take(30).toList()) },
                            enabled=pages[leaf.id]?.rows?.isNotEmpty()==true && !loadingGroups && query==appliedQuery) {Text("Review this subgroup")} }
                        items(visibleRows[leaf.id].orEmpty(),key={it.key}) { entry ->
                            val row=entry.row
                            Row(Modifier.fillMaxWidth().padding(start=(24+minOf(entry.depth,4)*8).dp,end=8.dp,top=4.dp,bottom=4.dp),verticalAlignment=Alignment.CenterVertically) {
                                Column(Modifier.widthIn(min=48.dp,max=88.dp).padding(end=8.dp),horizontalAlignment=Alignment.CenterHorizontally) {
                                    Text(entry.number,style=MaterialTheme.typography.labelLarge,modifier=Modifier.testTag("AuralOutline-${leaf.id}-${entry.number}"))
                                    if(!settings.flatList && row.length>2) FilledTonalIconButton(onClick={toggleRow(entry)},modifier=Modifier.size(48.dp).testTag("AuralExpand-${leaf.id}-${entry.number}")) {
                                        val open=entry.key in expandedRows
                                        Icon(if(open) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,if(open) "Collapse ${entry.number}" else "Expand ${entry.number}")
                                    }
                                }
                                Column(Modifier.weight(1f)) {
                                    Column(Modifier.fillMaxWidth().clickable(enabled=loadedKey==queryKey && !loadingGroups){onPractice(row.target)}.padding(vertical=12.dp).testTag("AuralPattern-${row.target.id}")) {
                                        Text(auralRomanSequence(row.target.labels),style=MaterialTheme.typography.titleMedium,maxLines=3)
                                        Text(if(row.target.view.startsWith("relative_")) "Relative major" else row.target.sourceMode()?.let(::auralModeLabel) ?: "Mode unavailable",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("${row.length} chords · ${row.globalSongs} songs overall" +
                                            if(minimumPopularityPercent!=null) " · ${row.songs} matching" else " · ${row.globalOccurrences} uses",
                                            style=MaterialTheme.typography.bodySmall)
                                        AuralFamilyProgress(row.target.id,progress)
                                    }
                                    Row(verticalAlignment=Alignment.CenterVertically) {
                                        Button(onClick={onPlayMatchingSongs(row.target)},
                                            enabled=loadedKey==queryKey && !loadingGroups && row.songs>0,
                                            modifier=Modifier.heightIn(min=48.dp).testTag("AuralPlaySongs-${row.target.id}")) {
                                            Icon(Icons.Default.PlayArrow,contentDescription=null)
                                            Spacer(Modifier.width(4.dp))
                                            Text("Examples")
                                        }
                                        TextButton(onClick={info=row;evidence="Loading coverage…";scope.launch{evidence=try{withContext(Dispatchers.IO){catalog.evidence(row.target)}}catch(_:Exception){"Coverage unavailable for this snapshot."}}}){Text("ⓘ")}
                                    }
                                }
                            }
                            Divider()
                        }
                        item(key="page:${leaf.id}") {
                            val page=pages[leaf.id]
                            if(page?.busy==true) LinearProgressIndicator(Modifier.fillMaxWidth())
                            page?.error?.let{Text(it,Modifier.padding(16.dp),color=MaterialTheme.colorScheme.error)}
                            if(page?.error!=null) TextButton(onClick={load(leaf,page.rows.isNotEmpty())}) {Text("Retry")}
                            if(page?.hasMore==true) TextButton(onClick={load(leaf,true)},enabled=page.busy!=true && query==appliedQuery,modifier=Modifier.fillMaxWidth()){Text("More")}
                            else if(page?.busy==false && page.rows.isEmpty()) Text(
                                minimumPopularityPercent?.let { "No matching sequences with songs at ${it}% popularity or higher" } ?: "No matching sequences",
                                Modifier.padding(16.dp))
                        }
                    }
                }
            }
    }
    info?.let { row -> AlertDialog(onDismissRequest={info=null},title={Text("Sequence evidence")},text={Text("${row.globalOccurrences} uses across ${row.globalSongs} songs overall.\n${row.occurrences} uses across ${row.songs} matching songs and ${row.sections} sections.\nRecommended score: ${"%.2f".format(row.score)}\n\n$evidence",Modifier.verticalScroll(rememberScrollState()))},confirmButton={TextButton(onClick={info=null}){Text("Close")}}) }
}

@Composable
private fun RadioButtonRow(label:String,selected:Boolean,enabled:Boolean,onClick:()->Unit,tag:String) {
    Row(Modifier.fillMaxWidth().clickable(enabled=enabled,onClick=onClick).testTag(tag),verticalAlignment=Alignment.CenterVertically) {
        RadioButton(selected=selected,onClick=onClick,enabled=enabled)
        Text(label,modifier=Modifier.padding(start=8.dp))
    }
}
