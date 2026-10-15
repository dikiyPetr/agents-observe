// Notification center state: derived agent notifications (flow steps,
// deviations, decisions, needs-input, finished). Separate from the legacy
// per-session pending flag in components/sidebar/notification-indicator.tsx.

import { create } from 'zustand'
import type { AgentNotification } from '@/types/flow'

const LAST_READ_KEY = 'agents-observe-agent-notifications-last-read-id'
const MAX_ITEMS = 300

function loadLastReadId(): number {
  try {
    return Number(localStorage.getItem(LAST_READ_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

interface AgentNotificationsState {
  /** Newest first. Already filtered by the notification rules (muted tags dropped). */
  items: AgentNotification[]
  lastReadId: number
  /** Replace the list with the server backlog (initial load / reconnect). */
  load: (items: AgentNotification[]) => void
  /** Add one live notification. Returns false when it was already known. */
  add: (item: AgentNotification) => boolean
  markAllRead: () => void
  clear: () => void
}

export const useAgentNotificationsStore = create<AgentNotificationsState>((set, get) => ({
  items: [],
  lastReadId: loadLastReadId(),
  load: (items) => {
    const byId = new Map(get().items.map((i) => [i.id, i]))
    for (const i of items) byId.set(i.id, i)
    set({ items: [...byId.values()].sort((a, b) => b.id - a.id).slice(0, MAX_ITEMS) })
  },
  add: (item) => {
    if (get().items.some((i) => i.id === item.id)) return false
    set({ items: [item, ...get().items].slice(0, MAX_ITEMS) })
    return true
  },
  markAllRead: () => {
    const top = get().items[0]?.id ?? get().lastReadId
    try {
      localStorage.setItem(LAST_READ_KEY, String(top))
    } catch {
      // ignore
    }
    set({ lastReadId: top })
  },
  clear: () => {
    get().markAllRead()
    set({ items: [] })
  },
}))

export function useUnreadAgentNotificationCount(): number {
  return useAgentNotificationsStore((s) => s.items.filter((i) => i.id > s.lastReadId).length)
}
