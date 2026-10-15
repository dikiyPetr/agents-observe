import { create } from 'zustand'
import { mergeRules, type NotificationRules } from '@/lib/notification-rules'

const STORAGE_KEY = 'agents-observe-notification-rules'

function load(): NotificationRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return mergeRules(raw ? JSON.parse(raw) : null)
  } catch {
    return mergeRules(null)
  }
}

interface NotificationRulesState {
  rules: NotificationRules
  updateRules: (patch: Partial<NotificationRules>) => void
  resetRules: () => void
}

export const useNotificationRulesStore = create<NotificationRulesState>((set, get) => ({
  rules: load(),
  updateRules: (patch) => {
    const rules = { ...get().rules, ...patch }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
    } catch {
      // storage unavailable — keep the in-memory value
    }
    set({ rules })
  },
  resetRules: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    set({ rules: mergeRules(null) })
  },
}))
