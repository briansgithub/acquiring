# T10 Library presentation slice

2026-10-15. Intent before edits: implement the local pure-presentational `LibraryContent(props)` view against frozen `view-contract.ts` / `LibraryState` / `SongBrowseRow` APIs. Android-style dark, responsive, accessible search, artist, loading, empty, error, result, and paging states only. `displayTitle` / `displayArtist` provide display text; raw row identity is retained for callbacks. No lifecycle, routing, storage, catalog querying, dependencies, or shared-contract changes. Coordinator owns screen wiring and browser geometry/accessibility proof.

Validation and provenance are appended after implementation. Source authority for this UI slice is the frozen contract and coordinator brief; preceding pure grouping/query/controller ports and their provenance remain documented in `WORKLOG.md`.


Implemented `LibraryContent(props)` as a pure view with the frozen callback API. Search is labeled and capped at512 characters; artist mode uses `displayArtist` with a Back to search action. Result buttons use `displayTitle` / `displayArtist`, while open and artist callbacks receive the original row/raw artist. Loading, missing catalog, retryable error, no-results/download, and paged loading states are represented with polite status/alert semantics. Local CSS supplies a dark presentation, wrapping, flexible small-screen layout, visible focus, and 44px controls.

Final targeted strict type check passed using primary installed dependencies and ignored local config: `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/.artifacts/pwa-port/t10-library-tsconfig.json` (run guard receipt `T10-library-032-final-types`). Coordinator-owned browser geometry, 320px/200% text and interaction checks remain open; no full T10 acceptance is claimed.

2026-11-07T11:15Z Playlists accordion above search (native LibraryView order). Section expanded by default, Favorites collapsed, 280px song list, unstar ★. Hide while search focused / artist view. Result-button mousedown preventDefault preserves clicks when chrome remounts. Play/Shuffle omitted this slice.

2026-11-07T11:23Z Recent Selections below search when focused+empty (native LibrarySearchSuggestions heading). Recents buttons use `data-recent-selections` + `data-song-slug`; tests must scope recents so `rows()` is not inflated. mousedown preventDefault on recents open. Empty recents render null. Artist recents UI not this slice.

2026-11-07T11:29Z All Songs chrome button below paging (native LibraryView). Overlay replaces Library with A–Z/0–9/# headings, one expansion, counts, empty copy. Sort locked to Alphabetical; complexity/mode dropdown, filter, and prefix scrubber omitted. Back control is aria-label Back to Library so exact `Back` song/settings locators stay unique.
