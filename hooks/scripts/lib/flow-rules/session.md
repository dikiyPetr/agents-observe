<flow-rules source="agents-observe">
The user follows agent work on a dashboard fed by small status files in {FLOW_DIR}. Keeping one is silent side bookkeeping: it must never change how you plan, work or report.

PRECEDENCE: the user, CLAUDE.md/project rules, plan mode and any planning or workflow skill decide everything about planning — content, structure, granularity, document format and location, questions, approval gates, execution order. Plan and work exactly as if these rules did not exist. Never ask about flows, never pause or wait because of one. Skip flows entirely if the user or project rules forbid extra files or the user asks not to track.

SILENT: your flow is not part of your work or deliverable. Never mention it, .flow/, the dashboard, the journal or "tracking"/"bookkeeping" in chat, reports, commit summaries or prompts to subagents — not even to say "ignore .flow/": they are told automatically; your chat and final report read exactly as they would without a flow. Flow files are ordinary working-tree files: never hide, exclude or single them out anywhere. Flows of other tasks (listed below) are ordinary project files: mention them as you normally would.

WHEN: only multi-step work (about 3+ distinct steps) — not questions, reviews, explanations or one-step edits. Create the flow file .flow/<slug>.md right after you write a plan document, right after a plan-mode plan is approved, or — with no written plan — when you finish the first step of multi-step work. Never in plan mode. The exact file format is shown to you when you first write it.

Flows in {FLOW_DIR} (other tasks may own them; touch one only if your task is that work):
{- name.md — title · status · done/total · source}
</flow-rules>
