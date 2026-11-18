"""Native Sonic.java fixture capture (N07). No TS port is imported.

Extracts android/app/src/main/java/sonic/Sonic.java at the pinned authority, compiles it with the
JDK at $JAVA_HOME (Android Studio JBR on the Windows workstation), runs the SpokenPhraseCache-style
transform (speed = natural/target, pitch = 2^(12k/12)) over integer-synthesized signals and one real
bundled clip, and records each output's length and SHA-256 (little-endian int16 bytes).
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess

AUTHORITY = '3c887223b2d06b4c3a1010d0f8a23ceaf8977d08'
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).with_name('native-sonic.json')
WORK = ROOT / 'pwa/.artifacts/pwa-port/n07-sonic-native'
CLIP = 'android/app/src/main/res/raw/root_degree_one.pcm'

DRIVER = r'''
import sonic.Sonic;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
public class Driver {
  static short[] synth(int n, int seed) {
    short[] out = new short[n];
    int lcg = seed;
    for (int i = 0; i < n; i++) {
      lcg = lcg * 1664525 + 1013904223;
      int tri = ((i % 109) * 24000) / 109 - 12000;
      int tri2 = ((i % 55) * 8000) / 55 - 4000;
      int noise = ((lcg >>> 16) % 1001) - 500;
      int env = i < 2400 ? i * 10 / 24 : (i > n - 2400 ? (n - i) * 10 / 24 : 1000);
      out[i] = (short)(((tri + tri2) * env) / 1000 + noise);
    }
    return out;
  }
  static short[] stretch(short[] source, float speed, float pitch, int target) {
    Sonic s = new Sonic(24000, 1);
    s.setSpeed(speed);
    s.setPitch(pitch);
    s.writeShortToStream(source, source.length);
    s.flushStream();
    short[] out = new short[target];
    s.readShortFromStream(out, target);
    return out;
  }
  public static void main(String[] args) throws Exception {
    byte[] raw = Files.readAllBytes(Paths.get(args[0]));
    int clipFrames = raw.length / 2 / 24;
    short[] clip = new short[clipFrames];
    ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(clip);
    int[][] cases = {
      // source(0=synth 7200,1=synth 12000,2=clip), targetMultiplierPercent, pitchExponent
      {0, 100, 1}, {0, 100, -1}, {0, 150, 0}, {0, 200, 0}, {0, 400, 0}, {0, 333, 1}, {0, 250, -1},
      {1, 120, 0}, {1, 300, 1}, {1, 399, -1}, {2, 100, 1}, {2, 175, 0}, {2, 260, -1}, {2, 400, 1}
    };
    StringBuilder json = new StringBuilder("[");
    for (int c = 0; c < cases.length; c++) {
      int[] k = cases[c];
      short[] src = k[0] == 0 ? synth(7200, 12345) : k[0] == 1 ? synth(12000, 777) : clip;
      int natural = src.length;
      int target = natural * k[1] / 100;
      float speed = (float) natural / target;
      float pitch = (float) Math.pow(2.0, k[2] * 12 / 12.0);
      short[] out = stretch(src, speed, pitch, target);
      ByteBuffer bb = ByteBuffer.allocate(out.length * 2).order(ByteOrder.LITTLE_ENDIAN);
      bb.asShortBuffer().put(out);
      java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
      byte[] h = md.digest(bb.array());
      StringBuilder hex = new StringBuilder();
      for (byte b : h) hex.append(String.format("%02x", b));
      if (c > 0) json.append(',');
      json.append(String.format("{\"source\":%d,\"targetPercent\":%d,\"pitchExponent\":%d,\"natural\":%d,\"target\":%d,\"head\":[%d,%d,%d,%d],\"sha256\":\"%s\"}",
        k[0], k[1], k[2], natural, target, out[0], out[1], out[target / 2], out[target - 1], hex));
    }
    json.append(']');
    System.out.print(json);
  }
}
'''


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    src = WORK / 'src'
    (src / 'sonic').mkdir(parents=True, exist_ok=True)
    sonic = subprocess.check_output(['git', 'show', f'{AUTHORITY}:android/app/src/main/java/sonic/Sonic.java'], cwd=ROOT)
    (src / 'sonic/Sonic.java').write_bytes(sonic)
    (src / 'Driver.java').write_text(DRIVER, encoding='utf-8')
    clip = WORK / 'root_degree_one.pcm'
    clip.write_bytes(subprocess.check_output(['git', 'show', f'{AUTHORITY}:{CLIP}'], cwd=ROOT))
    java_home = Path(os.environ['JAVA_HOME'])
    exe = lambda name: str(java_home / 'bin' / (name + ('.exe' if os.name == 'nt' else '')))
    classes = WORK / 'classes'
    subprocess.check_call([exe('javac'), '-encoding', 'UTF-8', '-d', str(classes), str(src / 'sonic/Sonic.java'), str(src / 'Driver.java')])
    output = subprocess.check_output([exe('java'), '-cp', str(classes), 'Driver', str(clip)], text=True)
    cases = json.loads(output)
    OUT.write_text(json.dumps({
        'authority': AUTHORITY,
        'source': 'android/app/src/main/java/sonic/Sonic.java',
        'clip': {'path': CLIP, 'firstClipFrames': len(clip.read_bytes()) // 2 // 24,
                 'sha256': hashlib.sha256(clip.read_bytes()).hexdigest()},
        'cases': cases,
    }, indent=1) + '\n', encoding='utf-8')
    print(f'{len(cases)} native Sonic cases -> {OUT.name}')


if __name__ == '__main__':
    main()
