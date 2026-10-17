"""Native-only Kotlin2.2.10 RNG/identity oracle. Run from repo root under run-control.
No TS imports, generator extraction, installed dependencies or network access.
Compiler/runtime/stdlib are explicitly version-pinned; cached support jars are hashed.
Intentional portable JSON is tracked; driver/classes/compiler output stay ignored.
"""
from pathlib import Path
import hashlib, json, os, shutil, subprocess

VERSION = '2.2.10'
AUTHORITY = '801cf7984171d772afc4406ddb5c79c0cb7fd20a'
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
WORK = ROOT / '.artifacts/pwa-port/t14-random-native'
CACHE = Path(os.environ.get('GRADLE_USER_HOME', str(Path.home() / '.gradle'))) / 'caches/modules-2/files-2.1'
UPSTREAM = {
    'https://raw.githubusercontent.com/JetBrains/kotlin/v2.2.10/libraries/stdlib/src/kotlin/random/Random.kt':
        '08908a882def6a47385909121ece437f9c90de405e67ea94232da2e8d80c8756',
    'https://raw.githubusercontent.com/JetBrains/kotlin/v2.2.10/libraries/stdlib/src/kotlin/random/XorWowRandom.kt':
        '74980524237cf7300b570abe5775eaffc7e86dd1b5032794a6249d7c7d8ff6ad',
}
DRIVER = r"""import kotlin.random.Random
class CountedRandom(seed:Long):Random() {
    private val native = Random(seed)
    var draws = 0
    override fun nextBits(bitCount:Int):Int { draws++; return native.nextBits(bitCount) }
}
fun quote(text:String):String = text.map { c -> when(c) {
    '"' -> "\\\""; '\\' -> "\\\\"; else -> if(c.code < 32 || c.code >= 127) "\\u%04x".format(c.code) else c.toString()
} }.joinToString("", "\"", "\"")
fun json(value:Any?):String = when(value) {
    null -> "null"
    is String -> quote(value)
    is Number, is Boolean -> value.toString()
    is Map<*,*> -> value.entries.joinToString(",", "{", "}") { quote(it.key.toString())+":"+json(it.value) }
    is Iterable<*> -> value.joinToString(",", "[", "]") { json(it) }
    else -> error("Fixture adapter cannot encode $value")
}
fun main() {
    check(KotlinVersion.CURRENT.toString() == "2.2.10")
    val seeds = listOf("0", "-1", "-9223372036854775808", "9223372036854775807",
        "9007199254740992", "9007199254740993", "1", "4294967297")
    val rows = seeds.map { seed ->
        val rng = CountedRandom(seed.toLong())
        val raw = List(8) { rng.nextInt() }
        val bitCounts = listOf(0, 1, 26, 27, 31, 32)
        val bits = bitCounts.map { rng.nextBits(it) }
        val bounds = listOf(1, 2, 3, 4, 6, 12, 1073741825, Int.MAX_VALUE)
        val bounded = bounds.map { rng.nextInt(it) }
        val before = rng.draws
        val rejection = List(64) { rng.nextInt(1073741825) }
        val rejectionDraws = rng.draws - before
        check(rejectionDraws > rejection.size)
        val ranges = listOf(rng.nextInt(-10, 10), rng.nextInt(Int.MIN_VALUE, 0),
            rng.nextInt(Int.MIN_VALUE, Int.MAX_VALUE), rng.nextInt(-2000000000, 2000000000))
        val doubles = List(4) { rng.nextDouble() }
        val values = listOf("I", "ii", "IV", "V", "vi", "V/V", "vii\u00b0")
        val shuffle = values.shuffled(rng)
        val secondShuffle = values.shuffled(rng)
        val empty = emptyList<String>().shuffled(rng)
        val singleton = listOf("only").shuffled(rng)
        val chosen = values.random(rng)
        val singleChoice = listOf("only").random(rng)
        val tail = List(3) { rng.nextInt() }
        linkedMapOf("seed" to seed, "raw" to raw, "bitCounts" to bitCounts, "bits" to bits,
            "bounds" to bounds, "bounded" to bounded, "rejection" to rejection, "rejectionDraws" to rejectionDraws,
            "ranges" to ranges, "doubles" to doubles, "values" to values, "shuffle" to shuffle,
            "secondShuffle" to secondShuffle, "empty" to empty, "singleton" to singleton,
            "chosen" to chosen, "singleChoice" to singleChoice, "tail" to tail)
    }
    val strings = listOf("", "aural-android-aural-1", "I \u2192 V/V", "Aa", "BB", "\uD834\uDD1E", "\uD800", "e\u0301", "\u00e9")
    val hashes = strings.map { linkedMapOf("utf16" to it.map { c -> c.code }, "hash" to it.hashCode(), "hex" to it.hashCode().toUInt().toString(16)) }
    val lists = listOf<List<Any?>>(listOf("dominant-return", "direct", "C", 72, "sine", listOf(listOf(48, 52, 55), listOf(55, 59, 62)), listOf(listOf(48, 52, 55))),
        listOf(true, false, null, Int.MIN_VALUE, Int.MAX_VALUE, emptyList<Int>(), listOf("a,b", "[x]")))
    val listRows = lists.map { linkedMapOf("value" to it, "text" to it.toString(), "joined" to it.joinToString("|"),
        "hash" to it.joinToString("|").hashCode(), "hex" to it.joinToString("|").hashCode().toUInt().toString(16)) }
    val wrapInputs = listOf(2147483648L, -2147483649L, 4294967295L, 4294967296L, 9007199254740991L)
    println(json(linkedMapOf("runtimeVersion" to KotlinVersion.CURRENT.toString(), "cases" to rows,
        "hashes" to hashes, "lists" to listRows, "wrap" to wrapInputs.map { listOf(it, it.toInt()) })))
}
"""

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def cached(group, artifact, version=None):
    directory = CACHE / group / artifact
    if version is not None:
        directory /= version
    paths = sorted(p for p in directory.glob('**/*.jar') if not p.name.endswith(('-sources.jar', '-javadoc.jar')))
    if not paths:
        raise RuntimeError(f'Missing cached {group}:{artifact}:{version}; install tooling separately')
    return paths[-1]

def main():
    build = subprocess.check_output(['git','show',f'{AUTHORITY}:android/build.gradle'],cwd=ROOT)
    assert b'kotlin-gradle-plugin:2.2.10' in build
    stdlib = cached('org.jetbrains.kotlin','kotlin-stdlib',VERSION)
    kotlin = [cached('org.jetbrains.kotlin', name, VERSION) for name in
        ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-daemon-embeddable']]
    support = [cached('org.jetbrains','annotations'), cached('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm')]
    trove = list((CACHE/'org.jetbrains.intellij.deps/trove4j').glob('**/*.jar'))
    jars = kotlin + support + trove
    java = shutil.which('java')
    if not java:
        raise RuntimeError('Existing Java required')
    prefix = [java,'-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8']
    compiler = prefix + ['-cp',os.pathsep.join(map(str,jars)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler']
    version = subprocess.run(compiler+['-version'],check=True,capture_output=True,cwd=ROOT).stderr.decode('utf-8')
    assert 'kotlinc-jvm 2.2.10 ' in version, version
    WORK.mkdir(parents=True,exist_ok=True)
    driver = WORK/'Driver.kt'
    driver.write_text(DRIVER,encoding='utf-8',newline='\n')
    classes = WORK/'classes'
    command = compiler+['-no-stdlib','-no-reflect','-classpath',os.pathsep.join(map(str,[stdlib,support[0]])),
        '-d',str(classes),str(driver)]
    subprocess.run(command,check=True,cwd=ROOT)
    runtime = prefix+['-cp',os.pathsep.join(map(str,[classes,stdlib])),'DriverKt']
    output = subprocess.check_output(runtime,cwd=ROOT)
    (WORK/'stdout.json').write_bytes(output)
    fixture = json.loads(output.decode('utf-8'))
    assert fixture['runtimeVersion'] == VERSION and len(fixture['cases']) == 8
    fixture['provenance'] = dict(authority=AUTHORITY,kotlinVersion=VERSION,
        buildSha256=hashlib.sha256(build).hexdigest(),driverSha256=digest(driver),producerSha256=digest(Path(__file__)),
        officialSources=UPSTREAM,jars=[dict(file=p.name,sha256=digest(p)) for p in jars],
        compilerVersion=version.strip().splitlines()[0],
        capture='native kotlin.random.Random(Long), JVM String.hashCode/List.toString; no TS expected generation',
        command='python pwa/src/domain/learning/fixtures/generate-random-native.py',
        encoding='UTF-8 JVM file.encoding/stdout.encoding/stderr.encoding')
    target = OUT/'native-random.json'
    target.write_text(json.dumps(fixture,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
    print(f'Captured8 seeds; compiler/runtime {VERSION}; fixtureSHA256={digest(target)}')

if __name__ == '__main__':
    main()
