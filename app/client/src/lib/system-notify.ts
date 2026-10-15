// Browser (OS) notifications + a short beep. Works only while a dashboard
// tab is open (it may be in the background). 127.0.0.1 / localhost count
// as secure contexts, so no https is needed.

import type { AgentNotification } from '@/types/flow'

export type SystemPermission = NotificationPermission | 'unsupported'

export function systemNotificationPermission(): SystemPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Must be called from a user gesture (click) — browsers ignore it otherwise. */
export async function requestSystemNotificationPermission(): Promise<SystemPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

const ICONS: Partial<Record<AgentNotification['kind'], string>> = {
  needs_input: '✋',
  blocked: '⛔',
  flow_blocked: '⛔',
  error: '❌',
  deviation: '↪️',
  decision: '🧭',
  step: '✅',
  flow_done: '🏁',
  plan: '📋',
  flow_started: '📋',
  finished: '💤',
  info: 'ℹ️',
}

export function notificationIcon(kind: AgentNotification['kind']): string {
  return ICONS[kind] ?? '🔔'
}

export function showSystemNotification(
  n: AgentNotification,
  context: string | null,
  onClick: () => void,
): void {
  if (systemNotificationPermission() !== 'granted') return
  try {
    const notification = new Notification(`${notificationIcon(n.kind)} ${n.title}`, {
      body: [context, n.body].filter(Boolean).join('\n'),
      tag: `agents-observe-${n.id}`,
      requireInteraction: n.level === 'high',
    })
    notification.onclick = () => {
      window.focus()
      onClick()
      notification.close()
    }
  } catch (err) {
    console.warn('[notifications] system notification failed:', err)
  }
}

let audioCtx: AudioContext | null = null

export function playNotificationSound(level: AgentNotification['level']): void {
  try {
    audioCtx ??= new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = level === 'high' ? 880 : 660
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.25)
  } catch {
    // audio unavailable (autoplay policy before first interaction) — ignore
  }
}
