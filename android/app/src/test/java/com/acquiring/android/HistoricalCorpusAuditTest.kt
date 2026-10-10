package com.acquiring.android
import kotlinx.serialization.json.*
import org.junit.Test
import org.junit.Assert.assertEquals
class HistoricalCorpusAuditTest {
 @Test fun auditOriginal45() {
  val cases=Json.parseToJsonElement(javaClass.classLoader!!.getResourceAsStream("historic_corpus45.json")!!.bufferedReader().readText()).jsonArray
  assertEquals(45,cases.size)
  var roman=0;var letter=0;var pcs=0;var changes=0
  for(raw in cases){val c=raw.jsonObject;val chord=Json.parseToJsonElement(c.getValue("json").jsonPrimitive.content).jsonObject;val keyJson=c.getValue("key").jsonObject;val key=KeyInfo(keyJson.getValue("tonic").jsonPrimitive.content,keyJson.getValue("scale").jsonPrimitive.content)
   val id=c.getValue("id").jsonPrimitive.content;val r=ChordInterpreter.getRomanSymbol(chord,key);val l=ChordInterpreter.getLetterName(chord,key);val p=ChordInterpreter.getChordNotes(chord,key).map{((it%12)+12)%12}.toSet().sorted();val dr=r!=c.getValue("expectedRoman").jsonPrimitive.content;val dl=l!=c.getValue("expectedLetter").jsonPrimitive.content;val dp=p!=c.getValue("expectedPcs").jsonArray.map{it.jsonPrimitive.int}.sorted()
   if(dr)roman++;if(dl)letter++;if(dp)pcs++;if(dr||dl||dp){changes++;println("HISTORICAL_DIFF "+id+" | "+r+" | "+l+" | "+p+" | roman="+dr+" letter="+dl+" pcs="+dp)}
  }
  println("HISTORICAL_SUMMARY cases="+cases.size+" changedCases="+changes+" roman="+roman+" letter="+letter+" pcs="+pcs)
 }
}
