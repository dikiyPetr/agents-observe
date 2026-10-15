// Pure decision logic for derived agent notifications: does a notification
// show up in the notification center, and does it also pop a system
// (browser) notification? Settings live in stores/notification-rules-store.

import type { AgentNotification, NotificationKind, NotificationLevel } from '@/types/flow'

/** Minimum level that triggers a system notification, or 'never'. */
export type SystemThreshold = NotificationLevel | 'never'

export interface NotificationRules {
  /** Browser (OS) notifications on/off. The in-app center always records. */
  systemEnabled: boolean
  sound: boolean
  thresholds: Record<NotificationKind, SystemThreshold>
  /** Kinds that only pop a system notification while the dashboard tab is hidden. */
  hiddenOnlyKinds: NotificationKind[]
  /** Notifications carrying any of these tags are dropped entirely. */
  mutedTags: string[]
  /** Notifications carrying any of these tags always pop (unless muted). */
  systemTags: string[]
}

export const NOTIFICATION_KINDS: { kind: NotificationKind; label: string; hint: string }[] = [
  { kind: 'needs_input', label: 'Needs input', hint: 'Permission prompt or question' },
  { kind: 'blocked', label: 'Blocked', hint: 'Agent cannot continue' },
  { kind: 'deviation', label: 'Deviation', hint: 'Plan changed' },
  { kind: 'decision', label: 'Decision', hint: 'Autonomous decision' },
  { kind: 'step', label: 'Step done', hint: 'Plan step finished' },
  { kind: 'flow_done', label: 'Flow done', hint: 'All steps resolved' },
  { kind: 'flow_blocked', label: 'Flow blocked', hint: 'Flow status set to blocked' },
  { kind: 'flow_started', label: 'Flow started', hint: 'New flow file seen' },
  { kind: 'finished', label: 'Agent finished', hint: 'End of an agent turn' },
  { kind: 'error', label: 'Error', hint: 'Turn ended with an API error' },
  { kind: 'info', label: 'Note', hint: 'Info line in the journal' },
]

export const DEFAULT_NOTIFICATION_RULES: NotificationRules = {
  systemEnabled: true,
  sound: false,
  thresholds: {
    needs_input: 'low',
    blocked: 'low',
    flow_blocked: 'low',
    error: 'low',
    deviation: 'normal',
    decision: 'normal',
    step: 'normal',
    flow_done: 'low',
    flow_started: 'normal',
    finished: 'normal',
    info: 'high',
  },
  hiddenOnlyKinds: ['finished'],
  mutedTags: [],
  systemTags: [],
}

const LEVEL_RANK: Record<NotificationLevel, number> = { low: 0, normal: 1, high: 2 }

export interface NotificationDecision {
  /** Listed in the notification center. */
  show: boolean
  /** Also pop a browser/OS notification. */
  system: boolean
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase()
}

export function evaluateNotification(
  n: Pick<AgentNotification, 'kind' | 'level' | 'tags'>,
  rules: NotificationRules,
  ctx: { tabHidden: boolean },
): NotificationDecision {
  const tags = n.tags.map(normalizeTag)
  const muted = new Set(rules.mutedTags.map(normalizeTag))
  if (tags.some((t) => muted.has(t))) return { show: false, system: false }
  if (!rules.systemEnabled) return { show: true, system: false }

  const forced = new Set(rules.systemTags.map(normalizeTag))
  if (tags.some((t) => forced.has(t))) return { show: true, system: true }

  const threshold = rules.thresholds[n.kind] ?? 'normal'
  if (threshold === 'never') return { show: true, system: false }
  if (LEVEL_RANK[n.level] < LEVEL_RANK[threshold]) return { show: true, system: false }
  if (rules.hiddenOnlyKinds.includes(n.kind) && !ctx.tabHidden) return { show: true, system: false }
  return { show: true, system: true }
}

/** Merge persisted (possibly older/partial) rules over the defaults. */
export function mergeRules(
  saved: Partial<NotificationRules> | null | undefined,
): NotificationRules {
  if (!saved || typeof saved !== 'object') return DEFAULT_NOTIFICATION_RULES
  return {
    ...DEFAULT_NOTIFICATION_RULES,
    ...saved,
    thresholds: { ...DEFAULT_NOTIFICATION_RULES.thresholds, ...(saved.thresholds ?? {}) },
  }
}
