package com.acquiring.android

import kotlinx.serialization.json.*
import kotlin.random.Random

/** Include a fixed diatonic vocabulary, so response buttons never enumerate only the answer. */
internal fun auralPatternVocabulary(pattern: AuralPatternTarget): List<String> {
    val minor = Json.parseToJsonElement(pattern.tokens.first()).jsonObject["mode"]?.jsonPrimitive?.content == "minor"
    return ((if (minor) listOf("i", "ii°", "III", "iv", "v", "V", "VI", "VII")
        else listOf("I", "ii", "iii", "IV", "V", "vi", "vii°")) + pattern.labels).distinct().sorted()
}

/** Structured tokens, not a Roman-label whitelist, define the pitches. */
internal fun generatePatternExercise(target: AuralTarget, seed: Long): AuralExercise {
    val pattern = requireNotNull(target.pattern)
    require(pattern.tokens.size >= 2 && pattern.tokens.size == pattern.labels.size && pattern.id == auralPatternId(pattern.tokens,pattern.view))
    require(target.familyId == pattern.id && target.skillId in AuralCurriculum.skills.map { it.id } && target.support in 0..2)
    val rng = Random(seed); val mode = Json.parseToJsonElement(pattern.tokens.first()).jsonObject.getValue("mode").jsonPrimitive.content
    val key = KeyInfo(listOf("C","D","Eb","F","G","A","Bb").random(rng),mode)
    val events = pattern.tokens.mapIndexed { i,token ->
        val chord = Json.parseToJsonElement(token).jsonObject
        require(chord.getValue("mode").jsonPrimitive.content == mode)
        val interpreted = ChordInterpreter.interpret(chord,key)
        val shift = target.octaveShift * 12
        val notes = interpreted.midi.map { it + shift }.sorted(); require(notes.isNotEmpty() && notes.all { it in 1..127 })
        AuralEvent(notes,requireNotNull(interpreted.rootMidi)+shift,notes.first(),pattern.labels[i],"harmony",2.0)
    }
    val tonic = ChordInterpreter.interpret(buildJsonObject { put("root",1); put("type",5) },key)
    val shift = target.octaveShift * 12
    val context = listOf(AuralEvent(tonic.midi.map { it+shift }.sorted(),requireNotNull(tonic.rootMidi)+shift,tonic.midi.min()+shift,"tonic","home",2.0))
    val skill = target.skillId
    val gap = if (skill in listOf("complete","audiate")) if (skill == "audiate") events.lastIndex else rng.nextInt(events.size) else null
    val responseType = when(skill) { "guided" -> "guided"; "identify","compare" -> "choice"; "reproduce" -> "microphone"; else -> "sequence" }
    val vocabulary = auralPatternVocabulary(pattern)
    val alternatives = events.indices.take(8).flatMap { changed ->
        vocabulary.filter { it != pattern.labels[changed] }.take(4).map { replacement ->
            pattern.labels.toMutableList().also { it[changed] = replacement }
        }
    }.distinct()
    val options = if (responseType == "choice") (alternatives.shuffled(rng).take(3) + listOf(pattern.labels)).shuffled(rng).mapIndexed { i,degrees -> AuralOption("option-$i",degrees.joinToString(" → "),degrees) } else emptyList()
    val kind = target.microphoneKind ?: "root"
    require(kind in AuralCurriculum.microphoneKinds)
    val indices = if (kind == "rootSequence") events.indices.toList() else listOf(rng.nextInt(events.size))
    // The tonic is valid in every supported mode. Other scale degrees use source mode intervals when requested later.
    val task = if (responseType == "microphone") AuralMicrophoneTask(kind,
        when(kind) { "rootSequence" -> "Sing the roots in order"; "bass" -> "Sing the bass of chord ${indices.first()+1}"; "scaleDegree" -> "Sing scale degree 1 (tonic)"; else -> "Sing the root of chord ${indices.first()+1}" },
        if(kind == "scaleDegree") emptyList() else indices,
        if(kind == "scaleDegree") listOf(context.first().rootMidi) else indices.map { if(kind == "bass") events[it].bassMidi else events[it].rootMidi }, if(kind == "scaleDegree") 1 else null) else null
    val answer = AuralAnswer(if(gap == null) pattern.labels else listOf(pattern.labels[gap]),options.firstOrNull { it.degrees == pattern.labels }?.id,task?.targetMidis.orEmpty())
    val instrument = target.instrumentOverride ?: "CLARINET"; auralWaveform(instrument)
    val tempo = listOf(66,72,80,88).random(rng)
    val id = "pattern-" + auralDigest("${pattern.id}|$seed|$skill|${target.support}|$kind|$instrument")
    return AuralExercise(id,pattern.id,pattern.id,skill,target.support,target.transfer,seed,AuralCurriculum.GENERATOR_VERSION,key.tonic,tempo,instrument,events,context,pattern.labels,gap,options,answer,responseType,task,
        "pattern-realization-${auralDigest("${pattern.id}|$key|$tempo|$instrument")}",task?.label ?: "Listen, then respond",skill in listOf("complete","audiate"),pattern.labels.joinToString(" → "),
        AuralProvenance(AuralCurriculum.GENERATOR_VERSION,seed,target,pattern.id,key.tonic,tempo,instrument,emptyList(),target.octaveShift,emptyList(),listOf("tonic")))
}

internal fun auralWithPatternCorpus(base: AuralExercise, source: AuralCorpusProvenance): AuralExercise {
    val target = requireNotNull(base.provenance.target.pattern); val p = source.passage
    require(source.seed == (base.seed and 0xffffffffL) && p.patternId == target.id && p.view == target.view && p.events.size == target.tokens.size && p.degreeLabels == target.labels)
    require(source.semitoneShift == base.provenance.target.octaveShift * 12)
    val tonic = requireNotNull(MusicTheory.NOTE_TO_PC[p.keyTonic]); val shift = source.semitoneShift
    fun shifted(e: AuralEvent): AuralEvent {
        require(e.notes.isNotEmpty() && e.notes.size <= 16 && e.bassMidi == e.notes.min() && e.beats.isFinite() && e.beats > 0)
        require((e.notes + e.rootMidi).all { it+shift in 1..127 })
        return e.copy(notes=e.notes.map { it+shift }.sorted(),rootMidi=e.rootMidi+shift,bassMidi=e.bassMidi+shift)
    }
    val events = p.events.mapIndexed { i,e ->
        val token = Json.parseToJsonElement(target.tokens[i]).jsonObject
        require(token.getValue("mode").jsonPrimitive.content == p.keyScale)
        require(e.rootMidi%12 == (tonic+token.getValue("rootPc").jsonPrimitive.int)%12)
        val pcs = token.getValue("intervals").jsonArray.map { (e.rootMidi+it.jsonPrimitive.int)%12 }.toSet()
        require(e.notes.map { it%12 }.toSet() == pcs && e.degree == target.labels[i])
        if(target.view == "harmony_bass") require((e.bassMidi-e.rootMidi+120)%12 == token.getValue("bassInterval").jsonPrimitive.int)
        shifted(e)
    }
    require(p.context.size == 1)
    val tonicChord = ChordInterpreter.interpret(buildJsonObject { put("root",1); put("type",5) },KeyInfo(p.keyTonic,p.keyScale))
    require(p.context.single().notes.map { it%12 }.toSet() == tonicChord.midi.map { it%12 }.toSet())
    val context = p.context.map(::shifted)
    val task = base.microphoneTask?.let { t -> t.copy(targetMidis=if(t.kind == "scaleDegree") listOf(context.first().rootMidi) else t.eventIndices.map { if(t.kind == "bass") events[it].bassMidi else events[it].rootMidi }) }
    val key = listOf("C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B")[tonic]
    return base.copy(id=base.id+"-"+auralDigest(p.occurrenceId).take(16),keyTonic=key,events=events,context=context,microphoneTask=task,answer=base.answer.copy(targetMidis=task?.targetMidis.orEmpty()),
        fingerprint="source-${auralDigest(p.sourceId)}",previouslyExposed=source.familiar || !source.sourceHistoryReliable,exposureRegistered=true,
        provenance=base.provenance.copy(keyTonic=key,corpus=source))
}
