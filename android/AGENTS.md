# Agent Defaults

Follow the least-context, risk-proportional procedure below.

- Start with relevant Android files and `git status --short --branch`; preserve unrelated changes.
- Do not formally plan routine Android Studio work. Plan only when requested or when work is ambiguous, high-risk, multi-phase, dependency-ordered, or multi-session.
- Probe unknown or large files with `python scripts/context_probe.py scan <paths>`; search/chunk medium files and ask before extreme full reads unless explicitly required.
- Use symbols/search/line ranges for source and configuration. For logs/reports, use `context_probe.py tail` then page backward with `chunk`.
- Run the smallest relevant Gradle/device check. Use `python scripts/compact_check.py --name <label> -- <command>` for noisy output, and allow at most two fix/retest cycles before asking to expand.
- Ask before optional repository-wide analysis, exhaustive logs, or full validation that materially expands scope.

Concurrent agents require separate Git worktrees. Never overwrite unrelated user work.
