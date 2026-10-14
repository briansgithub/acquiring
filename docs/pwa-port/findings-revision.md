# Revision audit findings

Completed 2026-10-14.103 entries classified against 801cf798. Runtime model unknown.

The revision pass separates true new behavior from subtree imports, native release/configuration, same-behavior reapplications and integration ancestry. Merge first-parent paths and combined resolution paths were inspected; critical instrument/session/navigation resolutions received bounded patch review. Whole historical patches were not exhaustively read.

- f89a775c and the foreground playback plan explicitly retire background notifications/media controls. Preserve current owner/focus/route-loss handling and explicit resume, using browser lifecycle equivalents.
- Default Instrument persists independently from one per-run session instrument. Changing the default deliberately updates the current session; changing a song or session selection must not overwrite the saved default. Final fallback is Synth Clarinet.
- The two pitch-hint repairs and artist-query repair pairs overlap in behavior; their whole patch IDs differ because release/test contexts differ. They are not four independent features.
- Structured theory separates resolved root, bass, tone labels, letter format and voicing. Source-evidence and historical fixtures supersede permissive parity budgets; renderer/UI integration follows these contracts.
- A separate harvest ledger preserves manually added songs across catalog replacement. Catalog installation must not erase favorites, recents, queue snapshots, settings or learning progress.
- Current routes are Library -> Playback with origin-preserving Back and Info as a detour. Dedicated Settings, normalized displayed names, focused inline Library suggestions and independent Hooktheory accordion are final targets.
- September11/12 replaces calibration with persistent per-song octave -2..+3, replaces draggable transport with a fixed row, and replaces old Chords arpeggiation controls with block previews/tone cards/transitions.
- Introduction, offline Help, policy access,60 fps/max visual preference and allow-listed diagnostics/engine reset are shipping capabilities. Native orientation/Play-signing mechanics require browser equivalents or explicit platform adaptation.

No Android/browser/device tests were run for the audit. Old release/handoff pass claims remain scoped to their own revisions. Current implementation plan and capability table define the PWA targets; unmerged recovery snapshots are preserved and never replayed wholesale.
