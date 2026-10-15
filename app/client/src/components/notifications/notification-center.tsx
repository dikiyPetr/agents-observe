import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BellRing, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  useAgentNotificationsStore,
  useUnreadAgentNotificationCount,
} from '@/stores/agent-notifications-store'
import { useUIStore } from '@/stores/ui-store'
import { navigateToNotification } from '@/hooks/use-agent-notifications'
import { notificationIcon } from '@/lib/system-notify'
import { formatAgo } from '@/lib/format-ago'
import type { AgentNotification } from '@/types/flow'

const LEVEL_DOT: Record<AgentNotification['level'], string> = {
  low: 'bg-muted-foreground/40',
  normal: 'bg-sky-500',
  high: 'bg-amber-500',
}

export function NotificationCenter({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const items = useAgentNotificationsStore((s) => s.items)
  const lastReadId = useAgentNotificationsStore((s) => s.lastReadId)
  const unread = useUnreadAgentNotificationCount()
  const queryClient = useQueryClient()

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Mark read on close so the unread highlight is visible while open.
        if (!next) useAgentNotificationsStore.getState().markAllRead()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative h-7 w-7 shrink-0', collapsed && 'order-first')}
          title="Agent notifications"
        >
          <BellRing className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[10px] leading-4 font-semibold text-white text-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
          <div className="flex-1" />
          <button
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => useAgentNotificationsStore.getState().clear()}
          >
            Clear
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Notification settings"
            onClick={() => {
              setOpen(false)
              useUIStore.getState().openSettings('notifications')
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No notifications yet. Agents following the /flow protocol report steps, deviations and
              decisions here.
            </p>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              className={cn(
                'w-full text-left px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-accent cursor-pointer flex gap-2',
                n.id > lastReadId && 'bg-accent/40',
              )}
              onClick={() => {
                setOpen(false)
                useAgentNotificationsStore.getState().markAllRead()
                void navigateToNotification(n, queryClient)
              }}
            >
              <span className="text-base leading-5 shrink-0">{notificationIcon(n.kind)}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', LEVEL_DOT[n.level])} />
                  <span className="text-xs font-medium truncate">{n.title}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                    {formatAgo(n.ts)}
                  </span>
                </span>
                {n.body && (
                  <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {n.body}
                  </span>
                )}
                {(n.flowSlug || n.tags.length > 0) && (
                  <span className="flex flex-wrap gap-1 mt-1">
                    {n.flowSlug && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {n.flowSlug}
                      </span>
                    )}
                    {n.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] rounded bg-muted px-1 text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
