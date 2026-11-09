"""Generate the bundled degree cues with Kokoro v1.0 and Praat.

Install kokoro-onnx==0.6.1 and praat-parselmouth==0.4.7.
Get kokoro-v1.0.int8.onnx and voices-v1.0.bin from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
The Kokoro-82M model is Apache-2.0: https://huggingface.co/hexgrad/Kokoro-82M.
"""

import argparse
from pathlib import Path

from kokoro_onnx import Kokoro
import numpy as np
import parselmouth
from parselmouth.praat import call

RATE = 24_000
DEGREES = ("one", "two", "three", "four", "five", "six", "seven")
ROOT_PITCHES = range(48, 72)
SUFFIXES = {
    "min": "mɪn",
    "seven": "sˈɛvən",
    "sev_maj": "sˈɛv mˈædʒ",
    "sev_min": "sˈɛv mˈɪn",
    "dim": "dɪm",
    "dim_sev": "dˈɪm sˈɛv",
    "half_dim": "hˈæf dˈɪm",
    "aug": "ɔɡ",
    "sus": "sʌs",
}


def synthesize(model, text, *, phonemes=False):
    samples, rate = model.create(
        text, voice="af_heart", speed=1.65 if phonemes else 1.35, is_phonemes=phonemes
    )
    if rate != RATE:
        raise ValueError(f"Expected {RATE} Hz, got {rate}")
    voiced = np.flatnonzero(np.abs(samples) > np.max(np.abs(samples)) * 0.004)
    return samples[max(0, voiced[0] - 120):voiced[-1] + 120]


def time_limited_manipulation(samples, limit):
    sound = parselmouth.Sound(samples, RATE)
    manipulation = call(sound, "To Manipulation", 0.01, 75, 600)
    duration = min(sound.duration, limit)
    if duration < sound.duration:
        duration_tier = call(manipulation, "Extract duration tier")
        call(duration_tier, "Add point", sound.duration / 2, duration / sound.duration)
        call([manipulation, duration_tier], "Replace duration tier")
    return sound, manipulation, round(duration * RATE)


def pitched_variants(samples):
    sound, manipulation, frames = time_limited_manipulation(samples, 0.235)
    for midi in ROOT_PITCHES:
        target_hz = 440 * 2 ** ((midi - 69) / 12)
        tier = call(manipulation, "Extract pitch tier")
        call(tier, "Remove points between", 0, sound.duration)
        call(tier, "Add point", sound.duration / 2, target_hz)
        call([manipulation, tier], "Replace pitch tier")
        tuned = call(manipulation, "Get resynthesis (overlap-add)").values[0]
        yield np.pad(tuned[:frames], (0, max(0, frames - len(tuned))))


def pcm(samples):
    samples = samples.copy()
    fade = min(120, len(samples) // 2)
    samples[:fade] *= np.linspace(0, 1, fade)
    samples[-fade:] *= np.linspace(1, 0, fade)
    samples *= 0.75 / np.max(np.abs(samples))
    return (samples * 32_767).astype("<i2").tobytes()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("voices", type=Path)
    args = parser.parse_args()
    model = Kokoro(str(args.model), str(args.voices))
    output = Path(__file__).resolve().parents[1] / "app/src/main/res/raw"
    for word in DEGREES:
        variants = pitched_variants(synthesize(model, word))
        (output / f"root_degree_{word}.pcm").write_bytes(b"".join(map(pcm, variants)))
    for key, phonemes in SUFFIXES.items():
        samples = synthesize(model, phonemes, phonemes=True)
        limit = 0.255 if " " in phonemes or key == "seven" else 0.205
        _, manipulation, frames = time_limited_manipulation(samples, limit)
        concise = call(manipulation, "Get resynthesis (overlap-add)").values[0][:frames]
        (output / f"root_suffix_{key}.pcm").write_bytes(pcm(concise))


if __name__ == "__main__":
    main()
