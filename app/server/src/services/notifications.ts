// app/server/src/services/notifications.ts
//
// Derives user-facing notifications from incoming hook events:
//   - native Claude Code events (Notification → needs input, Stop → finished)
//   - flow file edits (`_meta.flowFile`, attached by the CLI on PostToolUse
//     Write/Edit of `.flow/<slug>.md`), diffed against the stored snapshot.
//
// Runs alongside the legacy per-session pending-notification flag, which
// is left untouched.

import type { EventStore, StoredFlow, StoredNotification } from '../storage/types'
import type { EventEnvelope } from '../types'
import { parseFlow, type ParsedFlow } from '../flow/parse'
import { diffFlow } from '../flow/diff'

export interface DerivedNotifications {
  notifications: StoredNotification[]
  /** Set when a flow snapshot was stored, so clients can refetch it. */
  flow: StoredFlow | null
}

interface DeriveInput {
  envelope: EventEnvelope
  eventId: number
  projectId: number | null
  timestamp: number
}

interface FlowFileMeta {
  slug: string
  absPath: string
  content: string
}

const MAX_BODY_CHARS = 400

function truncate(text: unknown, max = MAX_BODY_CHARS): string {
  if (typeof text !== 'string') return ''
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const NEEDS_INPUT_TITLES: Record<string, string> = {
  permission_prompt: 'Permission needed',
  idle_prompt: 'Waiting for your input',
  elicitation_dialog: 'Question for you',
}

function readFlowFileMeta(envelope: EventEnvelope): FlowFileMeta | null {
  const f = (envelope._meta as Record<string, unknown> | undefined)?.flowFile as
    | Partial<FlowFileMeta>
    | undefined
  if (!f || typeof f.slug !== 'string' || typeof f.content !== 'string') return null
  return { slug: f.slug, absPath: typeof f.absPath === 'string' ? f.absPath : '', content: f.content }
}

async function deriveNative(
  store: EventStore,
  { envelope, eventId, projectId, timestamp }: DeriveInput,
): Promise<StoredNotification[]> {
  const p = (envelope.payload ?? {}) as Record<string, unknown>
  const base = {
    ts: timestamp,
    sessionId: envelope.sessionId,
    projectId,
    flowId: null,
    eventId,
    step: null,
    tags: [] as string[],
    dedupKey: null,
  }

  let row: StoredNotification | null = null
  if (envelope.hookName === 'Notification') {
    const type = typeof p.notification_type === 'string' ? p.notification_type : ''
    row = await store.insertNotificationIgnore({
      ...base,
      kind: 'needs_input',
      level: 'high',
      title: NEEDS_INPUT_TITLES[type] ?? 'Agent needs attention',
      body: truncate(p.message),
    })
  } else if (envelope.hookName === 'Stop') {
    row = await store.insertNotificationIgnore({
      ...base,
      kind: 'finished',
      level: 'normal',
      title: 'Agent finished',
      body: truncate(p.last_assistant_message),
    })
  } else if (envelope.hookName === 'StopFailure') {
    row = await store.insertNotificationIgnore({
      ...base,
      kind: 'error',
      level: 'high',
      title: 'Agent stopped with an error',
      body: truncate(p.error ?? p.message),
    })
  }
  return row ? [row] : []
}

async function deriveFlow(
  store: EventStore,
  input: DeriveInput,
  file: FlowFileMeta,
): Promise<DerivedNotifications> {
  const { envelope, eventId, projectId, timestamp } = input
  if (projectId === null) {
    console.warn(`[flow] ${file.slug}: session ${envelope.sessionId} has no project yet — skipped`)
    return { notifications: [], flow: null }
  }

  const prev = await store.getFlow(projectId, file.slug)
  const next = parseFlow(file.content, file.slug)
  const { flow, applied } = await store.upsertFlowSnapshot({
    projectId,
    slug: file.slug,
    absPath: file.absPath,
    content: file.content,
    parsedJson: JSON.stringify(next),
    title: next.title,
    status: next.status,
    updatedTs: timestamp,
    sessionId: envelope.sessionId,
  })
  await store.linkFlowSession(flow.id, envelope.sessionId, timestamp)
  // An older snapshot arriving late must not produce notifications or
  // roll the stored flow back.
  if (!applied) return { notifications: [], flow: null }

  const drafts = diffFlow((prev?.parsed as ParsedFlow | null) ?? null, next)
  const notifications: StoredNotification[] = []
  for (const d of drafts) {
    const row = await store.insertNotificationIgnore({
      ts: timestamp,
      sessionId: envelope.sessionId,
      projectId,
      flowId: flow.id,
      eventId,
      kind: d.kind,
      level: d.level,
      step: d.step,
      tags: d.tags,
      title: d.title,
      body: truncate(d.body),
      dedupKey: d.dedupKey,
    })
    if (row) notifications.push(row)
  }
  return { notifications, flow }
}

export async function deriveNotifications(
  store: EventStore,
  input: DeriveInput,
): Promise<DerivedNotifications> {
  const flowFile = readFlowFileMeta(input.envelope)
  if (flowFile) return deriveFlow(store, input, flowFile)
  return { notifications: await deriveNative(store, input), flow: null }
}
