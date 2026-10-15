---
name: flow
description: Plan a multi-step task as a live flow file (.flow/<slug>.md) — one plan per agent, nested through delegated subagents — that the Agents Observe dashboard renders and turns into notifications (plan created, step done, deviation, autonomous decision, blocked). Use when the user invokes /flow or asks to "work by flow" / "веди flow", before starting any multi-step task in a project that already has .flow/*.md files, and before delegating part of a flow to a subagent.
argument-hint: [new <title>|status|done]
user_invocable: true
---

# /flow

A **flow** is the plan of **one agent** for one task, stored at `<repo root>/.flow/<slug>.md`.
It is the plan and the status board at once: the user watches it live in the Agents Observe
dashboard, and every change you make to it (plan created, step finished, deviation, decision,
blocker) becomes a notification for them.

Plans nest through agents: when an agent hands a step to a subagent, that subagent gets its own
flow file pointing back to the parent step, and may delegate further the same way — any depth.
The agent is the smallest unit of nesting: no sub-steps inside one file.

## Usage

- `/flow new <title>` — make a plan for the current task and start executing it
- `/flow` or `/flow status` — re-read the active flow(s) and continue following the protocol
- `/flow done` — finish the active flow

The subcommand is in `$ARGUMENTS`. Write flow content in the language the user talks to you in.

## File format

```md
---
title: Порт инвентаря из Godot
status: active            # active | blocked | done
updated: 2026-10-15T14:25
---
## Цель
Перенести систему инвентаря на UActorComponent с сохранением поведения прототипа.

## Шаги
- [x] S1 Разобрать Inventory.gd и сигналы
- [~] S2 UInventoryComponent + сериализация
- [~] S3 UI-виджет WBP_Inventory → inventory-ui
- [-] S4 Drag&drop (пропущен: не нужен в прототипе)
- [!] S5 Сохранения (блокер: нет SaveGame-системы)

## Журнал
- 14:00 plan #plan — 5 шагов: компонент, UI отдаю субагенту, сохранения позже
- 14:02 decision S2 #api — Используем TArray<FItemStack> вместо TMap: нужен порядок слотов
- 14:10 deviation/high S3 #scope — UI делаю на UMG вместо CommonUI, план изменён
- 14:25 step S1 — Готово, сигналы → делегаты
```

A delegated sub-plan (`.flow/inventory-ui.md`, owned by the subagent doing step S3):

```md
---
title: UI-виджет инвентаря
status: active
parent: port-inventory     # slug of the parent flow
parent_step: S3            # the parent step this plan implements
updated: 2026-10-15T14:12
---
## Шаги
- [ ] S1 Разметка WBP_Inventory
- [ ] S2 Биндинги к UInventoryComponent

## Журнал
- 14:12 plan #plan — 2 шага
```

Rules the dashboard parser relies on:

- **Frontmatter** — `title`, `status` (`active` | `blocked` | `done`), `updated` (local ISO time
  of the last edit); `parent` + `parent_step` only in delegated sub-plans.
- **Sections** — headings `Цель`/`Goal`, `Шаги`/`Steps`, `Журнал`/`Journal`. Extra sections (notes, risks, links) are fine.
- **Steps** — flat list `- [<marker>] S<n> <text>` with a unique, never-reused id. Markers:
  `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped (say why) · `[!]` blocked (say why).
  A step handed to a subagent ends with `→ <child-slug>`.
- **Journal** — append-only, one line per event, newest at the bottom:
  `- HH:MM <type>[/<level>] [S<n>] [#tag …] — <text>`
  - `type`: `plan` (plan created / re-planned) · `step` (step finished) · `deviation` (plan
    changed) · `decision` (you chose something yourself) · `blocked` (you cannot continue) ·
    `info` (anything else worth knowing)
  - `level` (optional): `low` · `normal` (default) · `high` (default for `blocked`)
  - never edit or delete old journal lines — each new line is one notification

## Tags

Use the most specific tag that applies; free-form tags are allowed when none fits (lowercase,
no spaces). The user filters and mutes notifications by tag. `#plan` is reserved for `plan` lines.

| Tag | Meaning |
|-----|---------|
| `#plan` | a plan was created or rebuilt (always on `plan` lines) |
| `#scope` | what is in/out of the task changed |
| `#api` | interface, data structure or module boundary choice |
| `#perf` | performance trade-off |
| `#test` | testing approach, test added/skipped |
| `#refactor` | restructuring not asked for explicitly |
| `#risk` | something may break or needs the user's attention later |
| `#assumption` | you assumed something the user did not state |
| `#asset` | content/asset pipeline (models, textures, scenes, data files) |

## Protocol

1. **Create** (`/flow new <title>`, or right after the skill is invoked for a new task): work out
   the plan yourself (no separate approval step), write `.flow/<slug>.md` (kebab-case slug from the
   title) with `status: active`, the goal and every step as `[ ]` with ids S1…Sn, and a first
   journal line `- HH:MM plan #plan — <N steps, one-line summary>`. Writing the file is what
   notifies the user that the plan exists. Then start executing.
2. **Before a step**: mark it `[~]`.
3. **After a step**: mark it `[x]` and append a `step` line with the step id and a one-line result.
4. **Plan changed** (step added, removed, merged, reordered or done differently than planned):
   update the steps (new ids for new steps, `[-]` with a reason for dropped ones) and append a
   `deviation` line explaining what changed and why. Use `/high` if it changes the outcome.
   A full re-plan also gets a new `plan #plan` line.
5. **Autonomous decision** — you picked between real alternatives without asking (library,
   data layout, naming convention, workaround): append a `decision` line with the choice and the
   reason. Not needed for trivial choices.
6. **Blocked**: mark the step `[!]` with the reason, append a `blocked` line, set `status: blocked`
   and tell the user in chat what you need. Set `status: active` again when unblocked.
7. **Finish** (`/flow done` or all steps resolved): set `status: done` and append an `info`
   line with a short summary.
8. Update `updated` in the frontmatter on every edit.

## Delegating a step to a subagent

Subagents do not load this skill, so the delegating agent passes the protocol along:

1. Pick a child slug (e.g. `<parent-slug>-<topic>`), mark the parent step `[~]` and append
   `→ <child-slug>` to it.
2. In the subagent's prompt include, verbatim, the block below with the placeholders filled in.
3. When the subagent returns, check its flow file, then mark the parent step `[x]` (or `[!]`) and
   log a `step` / `blocked` line in your own flow.

```text
You own the plan file .flow/<child-slug>.md (create it first). Format:
frontmatter: title, status (active|blocked|done), updated, parent: <parent-slug>, parent_step: <S-id>
## Steps — flat list "- [ ] S1 text"; markers [ ] [~] [x] [-] [!]
## Journal — append-only lines "- HH:MM <type>[/<level>] [S<n>] [#tags] — text",
types: plan, step, deviation, decision, blocked, info.
First journal line: "- HH:MM plan #plan — <N steps, summary>". Mark steps [~] before and [x]
after, logging a step line; log deviation / decision / blocked lines as they happen; set
status: done at the end. Edit this file only with the Edit/Write tools, never via Bash.
If you delegate further, give your subagent its own .flow file with parent: <child-slug> and
these same instructions.
```

## Important

- **Edit flow files only with the Edit / Write tools** — never via Bash (`echo >>`, `sed`):
  the dashboard only sees edits made with Edit/Write, and the agent making the edit is recorded
  as the one executing that plan.
- One flow file per agent per task; never edit another agent's flow except to mark your own
  delegated step in your file.
- Keep the file small: one line per step and per journal entry; details belong in chat or code.
- `/flow` or `/flow status` with an existing flow: read it, report progress in one or two lines,
  and continue from the first step that is not `[x]`/`[-]`.
