# Possible testing resources (not completed proof)

Updated 2026-11-07. None of this is T27/device acceptance, physical-hearing proof, or authorization to touch a phone.

## Pixel 9 Pro (owner offer, unverified)

Brian offered a Pixel 9 Pro for relevant Android/PWA testing, shared with Music Finder wireless ADB work. Shared-memory Tailscale IP `100.95.230.49`.

**Coordinator shared-box FYI 2026-11-07:** Music Finder host paired/connected `100.95.230.49:38131` using `/workspace/music/android-sdk/platform-tools/adb`, `get-state=device`, live model Pixel 9 Pro, Android 17 SDK 37. That does **not** prove this cloud coding VM can reach the device. Do not ADB-explore from here unless a specific test needs it; coordinator can run device tests when asked.

Do not assume access. Do not probe, pair, install, reset, clear data, push APKs, or change networking/auth/security. Do not disrupt Music Finder tests. No extra coding agent.

When a slice actually needs physical Chrome/PWA evidence, report exact **non-invasive** access/test needs to the coordinator so they can arrange with Music Finder. Until then desktop Playwright remains the browser gate.

This offer is a possible later resource only. Recorded here so T27 does not treat it as a completed device row.

## 2026-11-07T09:25Z coding-VM smoke (read-only, no connect)

Environment: **Cursor cloud coding VM**, not Brian's shared box / Music Finder host. `hostname=cursor`, `user=ubuntu`, Ubuntu 24.04.5, kernel 6.12.113+.

| Check | Result |
| --- | --- |
| `adb` on PATH / common SDK paths | missing (`adb_not_on_PATH`; no `/usr/bin/adb`, no Android SDK dirs) |
| already-connected devices | not queried (no adb); no default transport |
| `adb get-state` / `ro.product.model` / `ro.build.version.release` / sdk | **not run on this VM** (no authorized endpoint here; coordinator box later reported Pixel 9 Pro / Android 17 SDK 37) |
| `tailscale` | not installed |
| CGNAT `100.x` routes | none in `/proc/net/route`; default iface `enp0s3` |
| ping `100.95.230.49` (host only, 4 packets, no port scan) | 100% loss |
| ping `1.1.1.1` control | ok (VM has general egress) |
| `~/.android/adbkey` | absent (existence only; file never read/copied) |

No `adb connect`/`pair`, no port guessing, no installs, no key material, no Music Finder disruption. Physical properties remain unknown until coordinator relays an already-authorized endpoint that this environment can actually reach.
