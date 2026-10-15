import { describe, test, expect } from 'vitest'
import {
  DEFAULT_NOTIFICATION_RULES as D,
  evaluateNotification,
  mergeRules,
  type NotificationRules,
} from './notification-rules'

const visible = { tabHidden: false }
const hidden = { tabHidden: true }
const n = (kind: any, level: any = 'normal', tags: string[] = []) => ({ kind, level, tags })

describe('evaluateNotification', () => {
  test('defaults: decisions pop, notes only when high', () => {
    expect(evaluateNotification(n('decision'), D, visible)).toEqual({ show: true, system: true })
    expect(evaluateNotification(n('info'), D, visible)).toEqual({ show: true, system: false })
    expect(evaluateNotification(n('info', 'high'), D, visible).system).toBe(true)
  })

  test('finished pops only while the tab is hidden', () => {
    expect(evaluateNotification(n('finished'), D, visible).system).toBe(false)
    expect(evaluateNotification(n('finished'), D, hidden).system).toBe(true)
  })

  test('muted tags hide entirely and win over forced tags', () => {
    const rules: NotificationRules = { ...D, mutedTags: ['#Refactor'], systemTags: ['refactor'] }
    expect(evaluateNotification(n('decision', 'high', ['refactor']), rules, hidden)).toEqual({
      show: false,
      system: false,
    })
  })

  test('forced tags pop regardless of threshold', () => {
    const rules: NotificationRules = { ...D, systemTags: ['risk'] }
    expect(evaluateNotification(n('info', 'low', ['risk']), rules, visible).system).toBe(true)
  })

  test('never threshold and disabled system notifications', () => {
    const rules: NotificationRules = { ...D, thresholds: { ...D.thresholds, step: 'never' } }
    expect(evaluateNotification(n('step', 'high'), rules, hidden).system).toBe(false)
    expect(
      evaluateNotification(n('needs_input', 'high'), { ...D, systemEnabled: false }, hidden),
    ).toEqual({ show: true, system: false })
  })
})

describe('mergeRules', () => {
  test('fills missing keys from defaults', () => {
    const merged = mergeRules({ sound: true, thresholds: { step: 'high' } as any })
    expect(merged.sound).toBe(true)
    expect(merged.thresholds.step).toBe('high')
    expect(merged.thresholds.decision).toBe(D.thresholds.decision)
    expect(mergeRules(null)).toBe(D)
  })
})
