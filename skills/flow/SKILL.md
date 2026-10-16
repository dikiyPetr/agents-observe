---
name: flow
description: Manual commands for flow files (.flow/<slug>.md), the status mirror of the current task that the Agents Observe dashboard shows — /flow status reports progress, /flow done closes the flow. The flow itself is kept automatically by the plugin's hooks.
argument-hint: [status|done]
user-invocable: true
disable-model-invocation: true
---

# /flow

Flow files are kept automatically: the plugin's hooks tell you when to create one and give you
the exact format when you first write it. Your own planning process (plan mode, a planning
skill, project rules) decides the plan; the flow only mirrors it. This skill covers the two
manual commands. The subcommand is in `$ARGUMENTS`.

If the format is not in your context, read `../../hooks/scripts/lib/flow-rules/format.md`
relative to this skill's base directory (`format.ru.md` when the user writes in Russian).

- `/flow` or `/flow status` — read the flow of the current task in `.flow/` (the one this session
  edits, else the most recent one that is not `done`), report its progress in one or two lines,
  and continue the work from the first step that is not `[x]`/`[-]`.
- `/flow done` — resolve the remaining steps (`[x]`, or `[-]` with the reason), then in one edit
  set `status: done` and append an `info` line with a short summary.

Edit flow files only with Edit/Write, never via Bash — the dashboard only sees Edit/Write.
