# Acquiring Android-to-PWA remote continuation

Handoff date: November 7, 2026. Coordinator runtime: unknown. Start from the public continuation branch in `briansgithub/acquiring`. The ported code is the committed October checkpoint `72004432bb261b49057b55907ac7ef1fd28899d6`; this handoff is its successor.

## Clone and set up

```sh
git clone --branch codex/pwa-continuation https://github.com/briansgithub/acquiring.git
cd acquiring
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor 72004432bb261b49057b55907ac7ef1fd28899d6 HEAD
```

Read the owner-supplied repository instructions, the opening checkpoint of [HANDOFF.md](HANDOFF.md), the applicable entry in [tasks.json](tasks.json), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [RUNBOOK.md](RUNBOOK.md). Historical worker names, worktree locations, allowance readings and process IDs belong to the original machine. Use this clone as the coordinator root. Confirm with the owner that the previous session and any scheduled continuation have handed over ownership before editing. Local run-control locks coordinate work only within the same checkout.

Continue the independent React/TypeScript/Vite project under `pwa/`. Use Android shipping commit `801cf7984171d772afc4406ddb5c79c0cb7fd20a` for behavior, with Android tests and shared `contracts/`. Read `android/AGENTS.md` when working with Android reference material. Exclude deprecated `web/` and `ios/` from the port. Maintain foreground audio ownership, deterministic musical behavior, the offline catalog, and separate catalog and user storage.

Use Git, Node 24/npm, Python 3.13 and Chrome for local browser tests. Install from the `pwa/` package lock. Playwright CI uses Chromium. See [pwa/README.md](../../pwa/README.md) and [PWA CI](../../.github/workflows/pwa.yml).

```sh
cd pwa
npm ci
npm run check
```

Use the command wrapper in `pwa/scripts/run-control/run_control.py` for work commands. Its `status` command runs outside the guard. With `run --cwd pwa`, the wrapper keeps its lock at the clone root. For Windows npm, use the installed Node npm CLI path or an explicit command interpreter. Record exact commands and revisions. Build before browser tests and give each Playwright run a unique ignored `--output` path. Use the smallest checks covering the slice, then check the combined revision before claiming integration.

Handoff validation on the code at `72004432`: `npm run check` passed 941 unit tests, one parity input test, strict TypeScript, and the production build. This run covered the package checks and build. Browser and physical device results are tracked separately.

The separate `python docs/pwa-port/validate_audit.py` check still rejects the existing T11/T08 relationship. It requires every dependency of a complete task to be complete, whereas the ledger records T11 completing through T08's accepted static-preview milestone while T08 remains in progress.

## First slice

**2026-11-07 owner priority supersedes the original T15-first agenda.** Playback UI, singing tool, and note/chord cards first. Aural quiz, remaining T15 song-rank, and progression family trees last. Android git lineage is the sequencer/tie-breaker inside that primary band; see [LINEAGE_PRIORITY.md](LINEAGE_PRIORITY.md). Do not repeat the 262-entry history audit. Pinned `801cf798` plus accepted contracts remain authority.

T15 Phase 2 `buildAuralSongRankFragment` is already accepted on this branch at `e5ed284c`. Preserve it; do not expand T15.

**Breadth-first (2026-11-07 4:31AM EST):** sequencing, not acceptance relaxation. Bounded tested vertical slices, then iterate. Do not wait at checkpoints. Direct pushes to `codex/pwa-continuation` authorized. ADB only if a specific test needs it.

T15 Phase 2 `buildAuralSongRankFragment` is already accepted on this branch at `e5ed284c`. Preserve it; do not expand T15. Song-rank is Aural-catalog eligibility only — not Playback/singing/cards.

Landed through this checkpoint: T13 octave kernel `165f3dbf`; T12 timeline `0d77407e`/`430a6430`/`3abadc1c`; route-position `00f26f2a`; Playback Favorites star `b75165b8`; T21 Settings `selectAsDefault` `eb7b0d21`; timeline tap `2d8651ee`; live drag/scrub. Next: T10 Library Favorites accordion (star has no browse UI). Do not polish inertia/Roman. T09 remains required for singing scores/mic. Library Settings Back 64px stays owner-blocked.

## Accepted work and open gates

T00–T04, T06–T07 and T11 are complete. T05 has accepted full song and Aural catalog cold-offline desktop Chrome proofs, with public hosting, real quota, and physical mobile/Safari checks open. `pwa/public/catalog-sources.json` has an empty list. T08–T10 and T12 have remaining audio lifecycle, microphone capture, Library and Playback work. T14 has partial pure learning and session work. The latest T15 statistics checkpoint records 495 tests, strict types, a production build, and four focused Chrome tests at the cited revisions. The Library Settings Back assertion still has the documented 64 px drift and remains pending the owner's decision after two fix cycles. Keep that assertion intact. Consult `tasks.json` for downstream Aural, account, sync, device and release gates.

The clone contains the fixtures required for the first slice. The [song catalog release](https://github.com/briansgithub/acquiring/releases/tag/v1.0.0-data) contains `catalog.db.gz`, asset 550095410, SHA-256 `6cff571af30826cef79c03b0168b5346a62beb4a328560f60c8f69c6dfafe9d4`. The [Aural v3 release](https://github.com/briansgithub/acquiring/releases/tag/aural-catalog-v3-64cfa299cc74) supplies the full Aural catalog, about 1.98 GB raw. Prepared chunks, browser profiles, and raw native captures are ignored artifacts on the original machine. Request specific artifacts only for a slice that requires them. See the October [handoff](HANDOFF.md) for their provenance and paths. Reuse accepted full-catalog and oracle evidence. Cloudflare, Supabase, sign-in configuration and physical devices are later task prerequisites.

## GitHub access and delivery

Cloning uses public read access. Configure a local Git author name and email for attribution. For a hosted agent, install its GitHub App for **only** `briansgithub/acquiring` with **Contents: Read and write**. Add **Pull requests: Read and write** if it will open PRs. A separate agent GitHub account can accept a repository collaborator invitation and use its own Git sign-in. If the platform requires a token, the owner can place a short-lived, repository-scoped fine-grained token in its secret store. **Workflows: Read and write** is needed if the credential will change GitHub workflow files. Keep credentials out of handoff text, command arguments, logs and tracked files. [GitHub App installation](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party) · [Collaborator permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository) · [Fine-grained tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Stage only named paths, review the staged scope, and commit coherent validated checkpoints. With the owner's grant to the receiving agent, push normal updates to `origin/codex/pwa-continuation`. Fetch and inspect divergence before retrying a rejected push. The owner retains approval for integration into `main`, deployment, shared history changes and removal of recovery work. GitHub write access is separate from those approvals.
