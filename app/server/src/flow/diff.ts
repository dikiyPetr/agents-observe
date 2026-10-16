// Turns the difference between two flow snapshots into notification drafts.
//
// Every draft carries a `dedupKey` that is unique per flow (enforced by a
// UNIQUE index on the notifications table), so replays and out-of-order
// async hook deliveries can't produce duplicates.

import { createHash } from 'node:crypto'
import type { FlowJournalEntry, FlowLevel, FlowStatus, ParsedFlow } from './parse'

export type FlowNotificationKind =
  | 'plan'
  | 'step'
  | 'deviation'
  | 'decision'
  | 'blocked'
  | 'info'
  | 'flow_review'
  | 'flow_done'
  | 'flow_blocked'

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

/** Status changes that notify; moving to `active` (approval, unblock) is silent. */
const STATUS_NOTIFICATIONS: Partial<
  Record<FlowStatus, Pick<NotificationDraft, 'kind' | 'level' | 'title'>>
> = {
  review: { kind: 'flow_review', level: 'high', title: 'Plan awaiting approval' },
  blocked: { kind: 'flow_blocked', level: 'high', title: 'Flow blocked' },
  done: { kind: 'flow_done', level: 'normal', title: 'Flow done' },
}

function hash(text: string): string {
  return createHash('sha1').update(text.trim()).digest('hex').slice(0, 16)
}

/**
 * A `step`/`blocked` journal line about a step shares its key with that step's
 * marker transition: agents often send `[x]` and the journal line as two
 * parallel Edits (two snapshots), and the user should get one notification.
 */
function stepKey(e: FlowJournalEntry): string | null {
  if (!e.step || (e.type !== 'step' && e.type !== 'blocked')) return null
  return `step:${e.step}:${e.type === 'step' ? 'done' : 'blocked'}`
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
  // A plan that first appears awaiting approval needs the user, not just a heads-up.
  const review = next.status === 'review'
  return {
    kind: review ? 'flow_review' : 'plan',
    level: review ? 'high' : (planEntry?.level ?? 'normal'),
    step: next.parentStep,
    tags: [...new Set(['plan', ...(planEntry?.tags ?? [])])],
    title: review ? 'Plan awaiting approval' : next.parent ? 'Sub-plan created' : 'Plan created',
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
      dedupKey: stepKey(e) ?? `j:${hash(e.raw)}`,
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

  const status = STATUS_NOTIFICATIONS[next.status]
  if (next.status !== prev.status && status) {
    drafts.push({
      ...status,
      step: null,
      tags: [],
      body: next.title,
      dedupKey: `status:${next.status}:${next.updated ?? next.journal.length}`,
    })
  }

  return drafts
}
