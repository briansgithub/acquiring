"""Generate the bundled degree cues with Kokoro v1.0 and Praat.

Install kokoro-onnx==0.6.1, praat-parselmouth==0.4.7, and onnx==1.23.2.
Get the full-precision kokoro-v1.0.onnx and voices-v1.0.bin from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
The Kokoro-82M model is Apache-2.0: https://huggingface.co/hexgrad/Kokoro-82M.
"""

import argparse
from pathlib import Path
import tempfile

from kokoro_onnx import Kokoro
import numpy as np
import onnx
import onnxruntime
import parselmouth
from parselmouth.praat import call

RATE = 24_000
DEGREES = ("one", "two", "three", "four", "five", "six", "seven")
ROOT_PITCHES = range(36, 60)
VOICE = "af_heart"
SUFFIXES = {
    "min": "mˈaɪnɚ",
    "seven": "dˈɑmɪnənt sˈɛvənθ",
    "sev_maj": "mˈeɪdʒɚ sˈɛvənθ",
    "sev_min": "mˈaɪnɚ sˈɛvənθ",
    "min_sev_maj": "mˈaɪnɚ mˈeɪdʒɚ sˈɛvənθ",
    "dim": "dɪmˈɪnɪʃt",
    "dim_sev": "dɪmˈɪnɪʃt sˈɛvənθ",
    "half_dim": "hˈæf dɪmˈɪnɪʃt sˈɛvənθ",
    "aug": "ˈɔɡmɛntɪd",
    "sus_two": "səsˈpɛndɪd sˈɛkənd",
    "sus_four": "səsˈpɛndɪd fˈɔɹθ",
    "sus_two_four": "səsˈpɛndɪd sˈɛkənd ænd fˈɔɹθ",
    "seventh_sus_two": "dˈɑmɪnənt sˈɛvənθ səsˈpɛndɪd sˈɛkənd",
    "seventh_sus_four": "dˈɑmɪnənt sˈɛvənθ səsˈpɛndɪd fˈɔɹθ",
    "seventh_sus_two_four": "dˈɑmɪnənt sˈɛvənθ səsˈpɛndɪd sˈɛkənd ænd fˈɔɹθ",
}
ACCIDENTALS = {"flat": "flˈæt", "sharp": "ʃˈɑɹp"}
MELODY_FUNCTIONS = {
    "root": "root",
    "second": "second",
    "third": "third",
    "fourth": "fourth",
    "fifth": "fifth",
    "sixth": "sixth",
    "seventh": "seventh",
    "ninth": "ninth",
    "eleventh": "eleventh",
    "thirteenth": "thirteenth",
    "passing": "passing",
    "chromatic_passing": "chromatic passing",
    "upper_neighbor": "upper neighbor",
    "lower_neighbor": "lower neighbor",
    "anticipation": "anticipation",
    "suspension": "suspension",
    "retardation": "retardation",
    "held_over": "held over",
    "appoggiatura": "appoggiatura",
    "escape": "escape",
    "leading": "leading",
    "pedal": "pedal",
    "color": "color",
    "chromatic_color": "chromatic color",
    "one": "one",
    "two": "two",
    "three": "three",
    "four": "four",
    "five": "five",
    "six": "six",
    "seven": "seven",
}
MODES = (
    "major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian",
    "ionian", "aeolian", "harmonic minor", "phrygian dominant",
)


def clarify_seven(samples, timings, first_frame):
    # This take has a prominent /s/ and a much quieter second syllable.
    # Lift the /ən/ without boosting the sibilant or adding a syllable break.
    token_frames = {
        t.phoneme: round(t.start * RATE) - first_frame for t in timings
    }
    gain = np.interp(
        np.arange(len(samples)),
        [0, token_frames["ɛ"], token_frames["v"], token_frames["ə"]],
        [0.6, 0.6, 1.0, 3.2],
    )
    samples = samples * gain
    # Keep low-energy consonants and a short release. Discard the near-silent
    # remainder so time compression can spend its budget on the word.
    window = RATE // 100
    levels = np.sqrt(np.mean(samples[:len(samples) // window * window].reshape(-1, window) ** 2, axis=1))
    last = np.flatnonzero(levels > levels.max() * 0.007)[-1]
    return samples[:(last + 3) * window]


def synthesize(model, word, clarify=False):
    # Run a single inference with context on both sides of the cue, then
    # use the model's token boundaries rather than gating quiet consonants.
    lead = "hˈiɹ ɪz ðə kjˈu. "
    samples, rate, timings = model.create_timed(
        lead + word + ". nˈaʊ lˈɪsən əɡˈɛn.",
        voice=VOICE, is_phonemes=True, trim=False,
        sentence_pause=0, clause_pause=0,
    )
    start = len(model.tokenizer.known(lead))
    stop = start + len(model.tokenizer.known(word))
    if rate != RATE or "".join(t.phoneme for t in timings[start:stop]) != model.tokenizer.known(word):
        raise ValueError(f"Unexpected synthesis timing for {word!r}")
    first = max(0, round(timings[start].start * RATE) - 240)
    last = round(timings[stop - 1].end * RATE)
    cue = samples[first:last + 480]
    return clarify_seven(cue, timings[start:stop], first) if clarify else cue


def pitched_variants(samples):
    sound = parselmouth.Sound(samples, RATE)
    manipulation = call(sound, "To Manipulation", 0.01, 70, 400)
    for midi in ROOT_PITCHES:
        target_hz = 440 * 2 ** ((midi - 69) / 12)
        tier = call(manipulation, "Extract pitch tier")
        call(tier, "Remove points between", 0, sound.duration)
        call(tier, "Add point", sound.duration / 2, target_hz)
        call([manipulation, tier], "Replace pitch tier")
        tuned = call(manipulation, "Get resynthesis (overlap-add)").values[0]
        yield tuned


def pcm(samples):
    samples = samples.copy()
    fade = min(120, len(samples) // 2)
    samples[:fade] *= np.linspace(0, 1, fade)
    samples[-fade:] *= np.linspace(1, 0, fade)
    samples *= 0.75 / np.max(np.abs(samples))
    return (samples * 32_767).astype("<i2").tobytes()


def load_model(model_path, voices_path, timed_path):
    # The full-precision release exposes audio only. Make its existing
    # duration predictor available as a second output for offline extraction.
    graph = onnx.load(model_path)
    duration = next(node.output[0] for node in graph.graph.node if node.name == "/encoder/Cast")
    graph.graph.node.append(onnx.helper.make_node("Identity", [duration], ["duration"]))
    graph.graph.output.append(onnx.helper.make_tensor_value_info("duration", onnx.TensorProto.INT64, [None, None]))
    onnx.save(graph, timed_path)
    session = onnxruntime.InferenceSession(str(timed_path), providers=["CPUExecutionProvider"])
    return Kokoro.from_session(session, str(voices_path))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("voices", type=Path)
    output = Path(__file__).resolve().parents[1] / "app/src/main/res/raw"
    cues = {
        **{f"root_degree_{word}": word for word in DEGREES},
        **{f"root_suffix_{key}": phonemes for key, phonemes in SUFFIXES.items()},
        **{f"root_accidental_{key}": phonemes for key, phonemes in ACCIDENTALS.items()},
        **{f"melody_fn_{key}": word for key, word in MELODY_FUNCTIONS.items()},
        **{f"mode_{name.replace(' ', '_')}": name for name in MODES},
    }
    parser.add_argument("--only", nargs="+", choices=sorted(cues), help="Regenerate only the named PCM resources.")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        model = load_model(args.model, args.voices, Path(temp) / "timed.onnx")
        for name in args.only or cues:
            word = cues[name]
            phonemes = word if name.startswith("root_suffix_") or name.startswith("root_accidental_") else model.tokenizer.phonemize(word, "en-us")
            samples = synthesize(model, phonemes, clarify=name == "root_degree_seven")
            rendered = pcm(samples) if name.startswith("mode_") else b"".join(map(pcm, pitched_variants(samples)))
            (output / f"{name}.pcm").write_bytes(rendered)


if __name__ == "__main__":
    main()
