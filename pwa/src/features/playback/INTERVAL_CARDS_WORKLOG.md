# Interval playback cards worklog
Date: 2026-10-17
Branch: codex/pwa-interval-cards
Base: 79a96b47c7896ec07a2165c95182e472b3562ee6
Owner: song_ui_review
Task: T12 interval-card UI

## Intent
Use the existing single PreviewOwner with renderCardPreview injection for interval requests. Keep static card taps unchanged. Root interval appears only when the accepted root interval helper allows it; melody interval appears only in INTERVAL mode with state. Build the request synchronously from raw source pitches plus the current manual transpose and waveform. Use accepted spoken interval names for accessible labels and visible shorthand/caption. Preserve prior/current cards and existing owner, StrictMode, section, and layout behavior. Do not edit beyond PlaybackCards.tsx, playback.css, and this worklog; no singing or sequence control.

## Progress
- Verified clean starting branch at the exact frozen base; run-control recovery list is empty.
- Reviewed final interval binding comments, the card-preview renderer/request helper, current card implementation, and event-state helpers.
- Next: implement root/melody interval actions, strict scoped typecheck, diff-check, and commit the three assigned paths.

- Implemented interval actions using cardIntervalPreviewRequest and the shared injected PreviewOwner renderer. Root visibility follows showsRootOnlyInterval; melody visibility follows the existing INTERVAL state. Static taps and existing controls remain unchanged. Added visible shorthand/Interval labels and exact spoken accessible names.
- Scoped strict TypeScript check passed for PlaybackCards.tsx and its import graph using the existing ignored config and root dependencies.
- `git diff --check` passed. Browser acceptance remains root-owned and pending.

- Added refusal handling for unsupported/unrepresentable interval requests: stop the shared preview owner and surface a clear existing alert state without allowing a click exception to escape.
