# Agent Defaults

Follow the least-context, risk-proportional procedure below.

- Start with relevant Android files and `git status --short --branch`; preserve unrelated changes.
- Do not formally plan routine Android Studio work. Plan only when requested or when work is ambiguous, high-risk, multi-phase, dependency-ordered, or multi-session.
- Probe unknown or large files with `python scripts/context_probe.py scan <paths>`; search/chunk medium files and ask before extreme full reads unless explicitly required.
- Use symbols/search/line ranges for source and configuration. For logs/reports, use `context_probe.py tail` then page backward with `chunk`.
- Run the smallest relevant Gradle/device check. Use `python scripts/compact_check.py --name <label> -- <command>` for noisy output, and allow at most two fix/retest cycles before asking to expand.
- Ask before optional repository-wide analysis, exhaustive logs, or full validation that materially expands scope.

Concurrent agents require separate Git worktrees. Use sibling folders beside the primary checkout, one normal branch per worktree; pushes publish that branch, while an authorized merge/PR from the primary checkout lands it in the default branch. Never overwrite unrelated user work.
- After an authorized merge, verify the feature tip is reachable from the default branch, then remove the sibling worktree and delete its local branch with `git branch -d`; delete remote branches only after authorization. Preserve dirty or unmerged work and never force-delete another agent's checkout.

## Android beta release commands

When the owner explicitly says "release Android beta", follow `fastlane/RELEASING.md`.
That command authorizes one main-only testing release and automatically generated
release notes, without a second routine approval. First verify one-time setup and
the validation-only trial are complete. Never infer release approval from a request
to implement features, test, commit, or push. Do not merge or push unfinished work
as part of the release command. Security-sensitive access changes still require
owner confirmation. Report internal and closed outcomes separately; API acceptance
is not Google review approval. Never upload signed bundles to public artifacts.
