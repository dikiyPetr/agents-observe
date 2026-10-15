import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useNotificationRulesStore } from '@/stores/notification-rules-store'
import { NOTIFICATION_KINDS, normalizeTag, type SystemThreshold } from '@/lib/notification-rules'
import {
  playNotificationSound,
  requestSystemNotificationPermission,
  showSystemNotification,
  systemNotificationPermission,
  type SystemPermission,
} from '@/lib/system-notify'
import type { NotificationKind } from '@/types/flow'

const THRESHOLDS: { value: SystemThreshold; label: string }[] = [
  { value: 'low', label: 'Always' },
  { value: 'normal', label: 'Normal+' },
  { value: 'high', label: 'High only' },
  { value: 'never', label: 'Never' },
]

function TagListEditor({
  label,
  hint,
  tags,
  onChange,
}: {
  label: string
  hint: string
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const tag = normalizeTag(draft)
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setDraft('')
  }
  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5 mb-2">{hint}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <button
            key={t}
            className="text-xs rounded bg-muted px-1.5 py-0.5 hover:line-through cursor-pointer"
            title="Remove"
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            #{t}
          </button>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          onBlur={add}
          placeholder="#tag + Enter"
          className="h-6 w-28 rounded border border-border bg-transparent px-1.5 text-xs"
        />
      </div>
    </div>
  )
}

export function NotificationSettings() {
  const rules = useNotificationRulesStore((s) => s.rules)
  const updateRules = useNotificationRulesStore((s) => s.updateRules)
  const resetRules = useNotificationRulesStore((s) => s.resetRules)
  const [permission, setPermission] = useState<SystemPermission>(systemNotificationPermission())

  const setThreshold = (kind: NotificationKind, value: SystemThreshold) =>
    updateRules({ thresholds: { ...rules.thresholds, [kind]: value } })
  const toggleHiddenOnly = (kind: NotificationKind, on: boolean) =>
    updateRules({
      hiddenOnlyKinds: on
        ? [...new Set([...rules.hiddenOnlyKinds, kind])]
        : rules.hiddenOnlyKinds.filter((k) => k !== kind),
    })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <BellRing className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
          System notifications
        </h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={rules.systemEnabled}
              onCheckedChange={(v) => updateRules({ systemEnabled: v === true })}
              aria-label="Show system notifications"
              className="mt-0.5 cursor-pointer"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">Show system notifications</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Pops an OS notification for agent events that pass the rules below. Works while a
                dashboard tab is open, also in the background. Everything is always listed in the
                bell menu in the sidebar.
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  Browser permission: <span className="font-mono">{permission}</span>
                </span>
                {permission !== 'granted' && permission !== 'unsupported' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={async () => setPermission(await requestSystemNotificationPermission())}
                  >
                    Allow notifications
                  </Button>
                )}
                {permission === 'granted' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => {
                      if (rules.sound) playNotificationSound('normal')
                      showSystemNotification(
                        {
                          id: Date.now(),
                          ts: Date.now(),
                          kind: 'decision',
                          level: 'normal',
                          title: 'Test notification',
                          body: 'This is how agent notifications will look.',
                          tags: [],
                          step: null,
                          sessionId: null,
                          projectId: null,
                          flowId: null,
                          flowSlug: null,
                          eventId: null,
                        },
                        'Agents Observe',
                        () => {},
                      )
                    }}
                  >
                    Send test
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              checked={rules.sound}
              onCheckedChange={(v) => updateRules({ sound: v === true })}
              aria-label="Play a sound"
              className="mt-0.5 cursor-pointer"
            />
            <div className="text-sm font-medium">Play a sound with system notifications</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">By type</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Minimum level that pops a system notification. Flow journal lines carry a level (
          <span className="font-mono">decision/high</span>); the default is normal, blocked is high.
        </p>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="font-normal pb-1">Type</th>
              <th className="font-normal pb-1">System notification</th>
              <th className="font-normal pb-1 text-center">Only when tab hidden</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_KINDS.map(({ kind, label, hint }) => (
              <tr key={kind} className="border-t border-border/50">
                <td className="py-1.5">
                  <div className="font-medium text-foreground">{label}</div>
                  <div className="text-muted-foreground">{hint}</div>
                </td>
                <td className="py-1.5">
                  <div className="flex gap-1">
                    {THRESHOLDS.map((t) => (
                      <button
                        key={t.value}
                        className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                          rules.thresholds[kind] === t.value
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                        onClick={() => setThreshold(kind, t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="py-1.5 text-center">
                  <Checkbox
                    checked={rules.hiddenOnlyKinds.includes(kind)}
                    onCheckedChange={(v) => toggleHiddenOnly(kind, v === true)}
                    aria-label={`${label}: only when tab hidden`}
                    className="cursor-pointer"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">By tag</h3>
        <TagListEditor
          label="Always notify"
          hint="A system notification is shown for these tags regardless of type and level."
          tags={rules.systemTags}
          onChange={(systemTags) => updateRules({ systemTags })}
        />
        <TagListEditor
          label="Mute"
          hint="Notifications with these tags are hidden everywhere (wins over Always notify)."
          tags={rules.mutedTags}
          onChange={(mutedTags) => updateRules({ mutedTags })}
        />
      </div>

      <Button variant="outline" size="sm" className="text-xs" onClick={resetRules}>
        Reset to defaults
      </Button>
    </div>
  )
}
