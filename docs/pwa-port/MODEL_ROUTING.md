# Model routing for the PWA port

Updated2026-10-14. Coordinator runtime model identifier unknown. The owner explicitly authorized assigning sub-agent models and thinking levels.

| Work | Available model ID | Thinking | Reason |
| --- | --- | --- | --- |
| Recovery controller, data persistence, theory/audio DSP, learning evidence, sync/integration | gpt-6.1-sol | high | Complex state/ordering and correctness requirements |
| Bounded UI components, straightforward adapters/fixtures and documentation | gpt-6-luna | medium | Clear local brief and limited surface; review and tests remain required |
| Ordinary repeatable edits after a validated pattern | gpt-6-luna | low | Small mechanical changes only |

Default at most one worker alongside coordinator. Use fork_turns=none for model overrides; provide only task-specific inputs, owned paths and resumption requirements. Start at the lightest setting meeting the task's quality bar; upgrade on a demonstrated issue rather than speculative complexity. Do not use max/ultra effort for routine work. All models/workers share the live account usage windows; no price or quota multiplier is assumed.

Actual first assignment: T00 run-control, gpt-6.1-sol/high, isolated sibling branch codex/pwa-run-control from the implementation authorization checkpoint. Save small local progress receipts and validated commits. T01 contracts/lockfile/CI/root routing remain coordinator-owned; subsequent routine UI slices may be delegated to Luna/medium after contracts stabilize.

Source: official OpenAI model selection guidance https://developers.openai.com/api/docs/guides/model-selection, fetched2026-10-14; availability and supported thinking values also verified from the session's collaboration tool catalog. No automatic coordinator model switch or credit/reset purchase is authorized.
