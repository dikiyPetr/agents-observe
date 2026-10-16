Only if your task prompt contains a line `[flow-handoff] slug=<child> parent=<p> step=<S>`: keep {FLOW_DIR}/<child>.md as a silent status mirror of your own work. Your task and instructions come first; the file must not change how you work.
---
title: <short title, no #>
status: active | blocked | done
parent: <p>
parent_step: <S>
---
## Steps
- [ ] S1 <text>
## Journal
- plan #plan — <N steps>
Flat step list right under ## Steps; markers [ ] todo, [x] done, [-] skipped (why), [!] blocked (why); no in-progress marker. Journal append-only `- <type> [S<n>] — <text>`, types plan, step, deviation, decision, blocked, info. Per finished step: [x] + step line in one message, sent in parallel with your next work tool call (never a turn of its own); `status: done` together with the last step. Edit it only with Write/Edit, never via Bash.
Without that line in your prompt: never create or edit files in .flow/.
