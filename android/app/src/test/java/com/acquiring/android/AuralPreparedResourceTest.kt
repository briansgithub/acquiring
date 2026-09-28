package com.acquiring.android

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class AuralPreparedResourceTest {
    private class Reader : AutoCloseable { var closed = false; override fun close() { closed = true } }

    @Test fun concurrentAndRepeatedAcquisitionsShareOneLoad() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        var loads = 0
        val loaded = CompletableDeferred<Unit>()
        val resource = AuralPreparedResource(scope) { loads++; loaded.await(); Reader() }
        val first = async { resource.acquire() }
        val second = async { resource.acquire() }
        loaded.complete(Unit)
        val a = first.await(); val b = second.await()
        assertSame(a.value, b.value)
        a.release(); b.release()
        val again = resource.acquire()
        assertSame(a.value, again.value); assertEquals(1, loads)
        again.release(); resource.replace {}; assertTrue(a.value.closed)
        scope.cancel()
    }

    @Test fun replacementWaitsForReaderAndFailedReplacementPreservesIt() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val resource = AuralPreparedResource(scope) { Reader() }
        val first = resource.acquire()
        var installed = false
        val replace = async(start=CoroutineStart.UNDISPATCHED) { resource.replace { installed = true } }
        assertFalse(installed); assertFalse(first.value.closed)
        first.release(); replace.await()
        assertTrue(installed); assertTrue(first.value.closed)
        val next = resource.acquire(); assertNotSame(first.value, next.value); next.release()
        try { resource.replace { error("invalid replacement") }; fail() } catch (_: IllegalStateException) { }
        val preserved = resource.acquire(); assertSame(next.value, preserved.value); assertFalse(preserved.value.closed)
        preserved.release(); resource.replace {}; scope.cancel()
    }

    @Test fun cancelledWaiterDoesNotCancelWarmupAndFailureCanRetry() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val started = CompletableDeferred<Unit>(); val finish = CompletableDeferred<Unit>()
        var loads = 0
        val resource = AuralPreparedResource(scope) { loads++; started.complete(Unit); finish.await(); Reader() }
        val waiting = launch { resource.acquire().release() }
        started.await(); waiting.cancelAndJoin(); finish.complete(Unit)
        val next = resource.acquire(); assertEquals(1, loads); next.release(); resource.replace {}
        var attempts = 0
        val retrying = AuralPreparedResource(scope) { if (attempts++ == 0) error("unavailable"); Reader() }
        try { retrying.acquire(); fail() } catch (_: IllegalStateException) { }
        val retried = retrying.acquire(); assertEquals(2, attempts); retried.release()
        retrying.replace {}; scope.cancel()
    }
}
