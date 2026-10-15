// Turns the difference between two flow snapshots into notification drafts.
//
// Every draft carries a `dedupKey` that is unique per flow (enforced by a
// UNIQUE index on the notifications table), so replays and out-of-order
// async hook deliveries can't produce duplicates.

import { createHash } from 'node:crypto'
import type { FlowLevel, ParsedFlow } from './parse'

export type FlowNotificationKind =
  'plan' | 'step' | 'deviation' | 'decision' | 'blocked' | 'info' | 'flow_done' | 'flow_blocked'

export interface NotificationDraft {
  kind: FlowNotificationKind
  level: FlowLevel
  step: string | null
  tags: string[]
  title: string
  body: string
  dedupKey: string
}

const JOURNAL_TITLES: Record<string, string> = {
  plan: 'Plan updated',
  step: 'Step done',
  deviation: 'Deviation from plan',
  decision: 'Autonomous decision',
  blocked: 'Blocked',
  info: 'Note',
}

function hash(text: string): string {
  return createHash('sha1').update(text.trim()).digest('hex').slice(0, 16)
}

function withStep(title: string, step: string | null): string {
  return step ? `${title} · ${step}` : title
}

/**
 * The "plan created" notification, emitted once per flow on first sighting.
 * Carries the `plan` tag plus the tags of the `plan` journal line (if the
 * agent wrote one), so rules can route it.
 */
function planCreated(next: ParsedFlow): NotificationDraft {
  const planEntry = next.journal.find((e) => e.type === 'plan')
  const parts = [`${next.title} · ${next.steps.length} steps`]
  if (next.parent) {
    parts.push(`part of ${next.parent}${next.parentStep ? ` · ${next.parentStep}` : ''}`)
  }
  if (planEntry?.text) parts.push(planEntry.text)
  return {
    kind: 'plan',
    level: planEntry?.level ?? 'normal',
    step: next.parentStep,
    tags: [...new Set(['plan', ...(planEntry?.tags ?? [])])],
    title: next.parent ? 'Sub-plan created' : 'Plan created',
    body: parts.join('\n'),
    dedupKey: 'started',
  }
}

export function diffFlow(prev: ParsedFlow | null, next: ParsedFlow): NotificationDraft[] {
  // First sighting: a single "plan created" notification instead of
  // replaying the whole existing journal.
  if (!prev) return [planCreated(next)]

  const drafts: NotificationDraft[] = []

  const prevJournal = new Set(prev.journal.map((e) => hash(e.raw)))
  const newEntries = next.journal.filter((e) => !prevJournal.has(hash(e.raw)))
  for (const e of newEntries) {
    drafts.push({
      kind: e.type,
      level: e.level,
      step: e.step,
      tags: e.type === 'plan' ? [...new Set(['plan', ...e.tags])] : e.tags,
      title: withStep(JOURNAL_TITLES[e.type], e.step),
      body: e.text,
      dedupKey: `j:${hash(e.raw)}`,
    })
  }

  // Step transitions into done/blocked. Skipped when the agent already
  // logged a matching journal line, so one event = one notification.
  const prevState = new Map(prev.steps.map((s) => [s.id, s.state]))
  for (const s of next.steps) {
    if (s.state !== 'done' && s.state !== 'blocked') continue
    if (prevState.get(s.id) === s.state) continue
    const journalType = s.state === 'done' ? 'step' : 'blocked'
    if (newEntries.some((e) => e.step === s.id && e.type === journalType)) continue
    drafts.push({
      kind: journalType,
      level: s.state === 'blocked' ? 'high' : 'normal',
      step: s.id,
      tags: [],
      title: withStep(s.state === 'done' ? 'Step done' : 'Step blocked', s.id),
      body: s.text,
      dedupKey: `step:${s.id}:${s.state}`,
    })
  }

  if (next.status !== prev.status && next.status !== 'active') {
    drafts.push({
      kind: next.status === 'done' ? 'flow_done' : 'flow_blocked',
      level: next.status === 'done' ? 'normal' : 'high',
      step: null,
      tags: [],
      title: next.status === 'done' ? 'Flow done' : 'Flow blocked',
      body: next.title,
      dedupKey: `status:${next.status}:${next.updated ?? next.journal.length}`,
    })
  }

  return drafts
}
