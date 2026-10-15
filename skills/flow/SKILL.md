---
name: flow
description: Track a multi-step task as a live flow file (.flow/<slug>.md) — plan steps, progress, deviations and autonomous decisions — that the Agents Observe dashboard renders and turns into notifications. Use after a plan is approved (plan mode or chat), when the user says "work by flow" / "веди flow", or whenever the project has an active .flow/*.md file.
argument-hint: [new <title>|status|done]
user_invocable: true
---

# /flow

A **flow** is one markdown file per task at `<repo root>/.flow/<slug>.md`. It is the plan and the
status board at once: the user watches it live in the Agents Observe dashboard, and every change
you make to it (step finished, deviation, decision, blocker) becomes a notification for them.

## Usage

- `/flow new <title>` — create a flow from the plan that was just approved
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
- [ ] S3 UI-виджет WBP_Inventory
- [-] S4 Drag&drop (пропущен: не нужен в прототипе)
- [!] S5 Сохранения (блокер: нет SaveGame-системы)

## Журнал
- 14:02 decision S2 #api — Используем TArray<FItemStack> вместо TMap: нужен порядок слотов
- 14:10 deviation/high S3 #scope — UI делаю на UMG вместо CommonUI, план изменён
- 14:25 step S1 — Готово, сигналы → делегаты
```

Rules the dashboard parser relies on:

- **Frontmatter** — `title`, `status` (`active` | `blocked` | `done`), `updated` (local ISO time of the last edit).
- **Sections** — headings `Цель`/`Goal`, `Шаги`/`Steps`, `Журнал`/`Journal`. Extra sections (notes, risks, links) are fine.
- **Steps** — `- [<marker>] S<n> <text>` with a unique, never-reused id. Markers:
  `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped (say why) · `[!]` blocked (say why).
- **Journal** — append-only, one line per event, newest at the bottom:
  `- HH:MM <type>[/<level>] [S<n>] [#tag …] — <text>`
  - `type`: `step` (step finished) · `deviation` (plan changed) · `decision` (you chose something
    yourself) · `blocked` (you cannot continue) · `info` (anything else worth knowing)
  - `level` (optional): `low` · `normal` (default) · `high` (default for `blocked`)
  - never edit or delete old journal lines — each new line is one notification

## Tags

Use the most specific tag that applies; free-form tags are allowed when none fits (lowercase,
no spaces). The user filters and mutes notifications by tag.

| Tag | Meaning |
|-----|---------|
| `#scope` | what is in/out of the task changed |
| `#api` | interface, data structure or module boundary choice |
| `#perf` | performance trade-off |
| `#test` | testing approach, test added/skipped |
| `#refactor` | restructuring not asked for explicitly |
| `#risk` | something may break or needs the user's attention later |
| `#assumption` | you assumed something the user did not state |
| `#asset` | content/asset pipeline (models, textures, scenes, data files) |

## Protocol

1. **Create** (`/flow new <title>`): after a plan is approved, write `.flow/<slug>.md`
   (kebab-case slug from the title) with `status: active`, the goal and every plan step as
   `[ ]` with ids S1…Sn. Do not wait for another approval — planning already happened.
2. **Before a step**: mark it `[~]`.
3. **After a step**: mark it `[x]` and append a `step` line with the step id and a one-line result.
4. **Plan changed** (step added, removed, merged, reordered or done differently than planned):
   update the steps (new ids for new steps, `[-]` with a reason for dropped ones) and append a
   `deviation` line explaining what changed and why. Use `/high` if it changes the outcome.
5. **Autonomous decision** — you picked between real alternatives without asking (library,
   data layout, naming convention, workaround): append a `decision` line with the choice and the
   reason. Not needed for trivial choices.
6. **Blocked**: mark the step `[!]` with the reason, append a `blocked` line, set `status: blocked`
   and tell the user in chat what you need. Set `status: active` again when unblocked.
7. **Finish** (`/flow done` or all steps resolved): set `status: done` and append an `info`
   line with a short summary.
8. Update `updated` in the frontmatter on every edit.

## Important

- **Edit flow files only with the Edit / Write tools** — never via Bash (`echo >>`, `sed`):
  the dashboard only sees edits made with Edit/Write.
- Keep the file small: one line per step and per journal entry; details belong in chat or code.
- One flow per task. Several flows may exist; only the ones with `status: active|blocked` are current.
- `/flow` or `/flow status` with an existing flow: read it, report progress in one or two lines,
  and continue from the first step that is not `[x]`/`[-]`.
