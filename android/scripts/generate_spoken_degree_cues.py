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
SEVEN = "sˈɛvən"
SUFFIXES = {
    "min": "mˈɪn",
    "seven": SEVEN,
    "sev_maj": "sˈɛv mˈædʒ",
    "sev_min": "sˈɛv mˈɪn",
    "min_sev_maj": "mˈɪn sˈɛv mˈædʒ",
    "dim": "dˈɪm",
    "dim_sev": "dˈɪm sˈɛv",
    "half_dim": "hˈæf dˈɪm",
    "aug": "ˈɔɡ",
    "sus": "sˈʌs",
}
ACCIDENTALS = {"flat": "flˈæt", "sharp": "ʃˈɑɹp"}


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


def synthesize(model, word):
    # Run a single inference with context on both sides of the cue, then
    # use the model's token boundaries rather than gating quiet consonants.
    lead = "hˈiɹ ɪz ðə kjˈu. "
    samples, rate, timings = model.create_timed(
        lead + word + ". nˈaʊ lˈɪsən əɡˈɛn.",
        voice="am_michael", is_phonemes=True, trim=False,
        sentence_pause=0, clause_pause=0,
    )
    start = len(model.tokenizer.known(lead))
    stop = start + len(model.tokenizer.known(word))
    if rate != RATE or "".join(t.phoneme for t in timings[start:stop]) != model.tokenizer.known(word):
        raise ValueError(f"Unexpected synthesis timing for {word!r}")
    first = max(0, round(timings[start].start * RATE) - 240)
    last = round(timings[stop - 1].end * RATE)
    cue = samples[first:last + 480]
    return clarify_seven(cue, timings[start:stop], first) if word == SEVEN else cue


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
    }
    parser.add_argument("--only", nargs="+", choices=cues, help="Regenerate only the named PCM resources.")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        model = load_model(args.model, args.voices, Path(temp) / "timed.onnx")
        for name in args.only or cues:
            word = cues[name]
            phonemes = model.tokenizer.phonemize(word, "en-us") if name.startswith("root_degree_") else word
            samples = synthesize(model, phonemes)
            (output / f"{name}.pcm").write_bytes(b"".join(map(pcm, pitched_variants(samples))))


if __name__ == "__main__":
    main()
