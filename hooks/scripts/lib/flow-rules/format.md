<flow-format source="agents-observe">
Flow file format (strict parser). Write the flow silently; nothing about your plan or work changes.

WHAT:
- A written work plan exists (plan document, plan-mode plan, numbered plan in chat): mirror whatever structure it has — one step per task or section it tracks, same order, short wording copied from it in the plan's own language (shorten, never translate), its own number/id first if it has one ("S4 2.1 Add migration"); more than ~6 items → mirror only its top-level tasks/phases ("S2 Phase 2: CLI"). `source:` = plan document path (omit for chat-only plans). Never edit the plan document for the flow; keep updating it as your process requires.
- No written plan: the flow is a log of finished work, not a plan. Never list future steps. Create it with the step you just finished as `[x] S1`; after that, each time you finish a meaningful step, append it as `[x] S<n>` together with its `step` line in one Edit. Work in whatever order you would anyway.
- Plan awaiting the user's approval: `status: review` before you stop. Approved → `active`. Changes requested → rewrite the steps to match and add a `plan` line.

---
title: <short title, no #>
status: review | active | blocked | done
source: <plan document path; mirrors only>
---
## Goal
<one line>
## Steps
- [ ] S1 <text>
## Journal
- plan #plan — <N steps: summary | "log of finished work">

Steps: one flat list right under `## Steps` — no sub-headings, nesting or numbered items. Markers [ ] todo, [x] done, [-] skipped (why), [!] blocked (why); no in-progress marker. Ids S1, S2…; never renumber or reuse. Trailing `→ <slug>` = delegated; don't end other steps with an arrow.
Journal: append-only, newest last: `- <type>[/high] [S<n>] [#tag] — <text>`; types plan, step, deviation, decision, blocked, info; optional tags #scope #api #perf #test #refactor #risk #assumption #asset.

UPDATE only when something completes or changes, in ONE message per event (never mark a step as started). Never spend a turn on the flow alone: send its Edit(s) in parallel with your next work tool call, and the closing update together with your final check (e.g. the last test run); if that check fails, set the status back.
- a step finished: [x] + its `step` line together
- work differs from a mirrored plan (step added/dropped/changed, other approach) → fix steps + `deviation` line (`/high` if the outcome changes)
- `decision` only for real alternatives you picked yourself during execution and not already in the plan; the user's answers and choices are `info`
- you cannot finish a step because you need something from the user (access, token, decision) → [!] with the reason + `blocked` line + `status: blocked` together, then ask in chat as you normally would; never mark such a step [-]. [-] only for steps dropped by plan change or by the user.
- all resolved → last step [x] + its `step` line + `info` summary + `status: done` together
Edit flow files only with Write/Edit/MultiEdit, never via Bash. Text in the user's language except copied step text.

SLUG: short kebab-case from the task; add -2 if a listed flow of another task has it. One flow per task: follow-ups to the same task stay in its flow.
SUBAGENTS: track delegated steps in your own flow. Only when handing a subagent a multi-step chunk, end its prompt with `[flow-handoff] slug=<child> parent=<your-slug> step=S<n>` and end your step with `→ <child>`.
</flow-format>
