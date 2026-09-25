package com.acquiring.android

import java.io.File
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class AuralLoopReductionTest {
    @Test fun commonFixtures() {
        val fixture = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
            .map { File(it, "tooling/aural-corpus/fixtures/loop-reduction.json") }.first { it.exists() }
        Json.parseToJsonElement(fixture.readText()).jsonArray.forEach { value ->
            val row = value.jsonObject
            val tokens = row.getValue("tokens").jsonArray.map { it.jsonPrimitive.content }
            assertEquals(tokens.toString(), AuralLoopReduction(row.getValue("redundant").jsonPrimitive.boolean,
                row.getValue("start").jsonPrimitive.int, row.getValue("length").jsonPrimitive.int), auralReduceLoop(tokens))
        }
    }
    @Test fun hiddenChildrenPromoteBothEndpointBranches() {
        assertEquals(listOf(listOf("X","I","V","I"),listOf("I","V","I"),listOf("V","I","V")),
            auralRetainedChildren(listOf("X","I","V","I","V")))
    }
}
