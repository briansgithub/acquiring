package com.acquiring.android

import android.content.Context
import android.util.Log
import java.io.File
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*

/** Keeps one prepared reader alive across navigation; replacement waits for its consumers. */
internal class AuralPreparedResource<T : AutoCloseable>(
    private val scope: CoroutineScope,
    private val load: suspend () -> T,
) {
    private val acquisitions = Mutex()
    private val state = Mutex()
    private val users = MutableStateFlow(0)
    private var prepared: Deferred<T>? = null

    inner class Lease internal constructor(val value: T) {
        private var released = false
        suspend fun release() = withContext(NonCancellable) {
            state.withLock { if (!released) { released = true; users.value-- } }
        }
    }

    suspend fun acquire(): Lease = acquisitions.withLock {
        state.withLock {
            val pending = prepared ?: scope.async { load() }.also { prepared = it }
            val value = try { pending.await() } catch (error: Throwable) {
                if (pending.isCancelled) prepared = null
                throw error
            }
            users.value++
            Lease(value)
        }
    }

    /** Staging and validation happen first. Failed replacement leaves the prepared reader intact. */
    suspend fun replace(install: () -> Unit) = acquisitions.withLock {
        users.first { it == 0 }
        state.withLock {
            val old = prepared?.let { runCatching { it.await() }.getOrNull() }
            currentCoroutineContext().ensureActive()
            install()
            prepared = null
            old?.close()
        }
    }
}

internal class AuralCatalogStore private constructor(private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val resource = AuralPreparedResource(scope) {
        check(AuralCatalogDownloader.hasInstalledBundleFiles(context)) { "Progression bundle is incomplete" }
        val started = System.nanoTime()
        AuralCatalog(File(context.filesDir, "aural-catalog.db")).also {
            if (BuildConfig.DEBUG) Log.d("AuralCatalogLoad", "Prepared ${it.snapshotId.take(12)} in ${(System.nanoTime()-started)/1_000_000} ms")
        }
    }

    suspend fun acquire() = resource.acquire()

    fun warm() {
        scope.launch {
            try {
                val lease = acquire()
                try {
                    val json = Json { ignoreUnknownKeys = true }
                    val storage = context.getSharedPreferences("aural_catalog_browse", Context.MODE_PRIVATE)
                    val settings = runCatching {
                        val envelope = json.parseToJsonElement(AuralPreferences(context).read() ?: "{}").jsonObject
                        envelope["exampleSettings"]?.let { json.decodeFromJsonElement<AuralExampleSettings>(it) }
                    }.getOrNull() ?: AuralExampleSettings()
                    val query = runCatching { json.decodeFromString<AuralProgressionQuery>(storage.getString("progressionQuery", "").orEmpty()) }
                        .getOrDefault(AuralProgressionQuery())
                    lease.value.matchingBuckets(settings, query, storage.getInt("minimumPopularityPercent",80).coerceIn(0,100))
                } finally { lease.release() }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { /* The Quiz screen offers the existing download/retry flow when needed. */ }
        }
    }

    suspend fun replaceInstalled(install: () -> Unit) { resource.replace(install); warm() }

    companion object {
        @Volatile private var instance: AuralCatalogStore? = null
        fun get(context: Context): AuralCatalogStore = instance ?: synchronized(this) {
            instance ?: AuralCatalogStore(context.applicationContext).also { instance = it }
        }
    }
}
