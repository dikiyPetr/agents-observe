// Mirrors app/server/src/flow/parse.ts and storage/types.ts (StoredFlow,
// StoredNotification). Flow format: skills/flow/SKILL.md.

export type FlowStatus = 'active' | 'blocked' | 'done'
export type StepState = 'todo' | 'doing' | 'done' | 'skipped' | 'blocked'
export type JournalType = 'step' | 'deviation' | 'decision' | 'blocked' | 'info'
export type NotificationLevel = 'low' | 'normal' | 'high'

export interface FlowStep {
  id: string
  state: StepState
  text: string
}

export interface FlowJournalEntry {
  time: string | null
  type: JournalType
  level: NotificationLevel
  step: string | null
  tags: string[]
  text: string
  raw: string
}

export interface ParsedFlow {
  title: string
  status: FlowStatus
  updated: string | null
  goal: string
  steps: FlowStep[]
  journal: FlowJournalEntry[]
  progress: { done: number; total: number }
  errors: string[]
}

export interface FlowSummary {
  id: number
  projectId: number
  slug: string
  absPath: string
  parsed: ParsedFlow | null
  title: string
  status: FlowStatus
  updatedTs: number
  lastSessionId: string | null
}

export interface FlowDetail extends FlowSummary {
  content: string
  sessions: { sessionId: string; firstTs: number; lastTs: number }[]
}

/** Kinds produced by the server's notifications service. */
export type NotificationKind =
  JournalType | 'flow_started' | 'flow_done' | 'flow_blocked' | 'needs_input' | 'finished' | 'error'

export interface AgentNotification {
  id: number
  ts: number
  sessionId: string | null
  projectId: number | null
  flowId: number | null
  flowSlug: string | null
  eventId: number | null
  kind: NotificationKind
  level: NotificationLevel
  step: string | null
  tags: string[]
  title: string
  body: string
}
