// Wires derived agent notifications together: initial backlog from
// /api/notifications/feed, live `notification_v2` WS messages, the
// notification rules, browser notifications and click-to-navigate.

import { useEffect } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Project } from '@/types'
import type { AgentNotification } from '@/types/flow'
import { evaluateNotification } from '@/lib/notification-rules'
import { navigateToFlow } from '@/lib/flow-navigation'
import { playNotificationSound, showSystemNotification } from '@/lib/system-notify'
import { useAgentNotificationsStore } from '@/stores/agent-notifications-store'
import { useNotificationRulesStore } from '@/stores/notification-rules-store'
import { useUIStore } from '@/stores/ui-store'

async function getProjects(queryClient: QueryClient): Promise<Project[]> {
  return (
    queryClient.getQueryData<Project[]>(['projects']) ??
    (await queryClient.fetchQuery({ queryKey: ['projects'], queryFn: api.getProjects }))
  )
}

/**
 * Open the plan's session on the Plan tab (if the notification belongs to a
 * flow), otherwise the session itself.
 */
export async function navigateToNotification(
  n: AgentNotification,
  queryClient: QueryClient,
): Promise<void> {
  const projects = await getProjects(queryClient).catch(() => [] as Project[])
  const project = projects.find((p) => p.id === n.projectId) ?? null
  if (n.flowSlug && project && (await navigateToFlow(queryClient, project, n.flowSlug))) return
  const ui = useUIStore.getState()
  if (n.sessionId) {
    ui.openSession(project?.id ?? null, project?.slug ?? null, n.sessionId)
  } else if (project) {
    ui.setSelectedProject(project.id, project.slug)
  }
}

function isMuted(n: AgentNotification): boolean {
  const { rules } = useNotificationRulesStore.getState()
  return !evaluateNotification(n, rules, { tabHidden: document.hidden }).show
}

/** Called from the WebSocket handler for each `notification_v2` message. */
export function handleIncomingAgentNotification(n: AgentNotification, queryClient: QueryClient) {
  const { rules } = useNotificationRulesStore.getState()
  const decision = evaluateNotification(n, rules, { tabHidden: document.hidden })
  if (!decision.show) return
  if (!useAgentNotificationsStore.getState().add(n)) return
  if (!decision.system) return

  if (rules.sound) playNotificationSound(n.level)
  const projectName =
    queryClient.getQueryData<Project[]>(['projects'])?.find((p) => p.id === n.projectId)?.name ??
    null
  const context = [projectName, n.flowSlug].filter(Boolean).join(' · ') || null
  showSystemNotification(n, context, () => void navigateToNotification(n, queryClient))
}

/** Mount once (App.tsx): loads the backlog into the notification center. */
export function useAgentNotificationsController() {
  const { data } = useQuery({
    queryKey: ['agent-notifications-feed'],
    queryFn: () => api.getNotificationFeed(0, 200),
    staleTime: Infinity,
  })
  const mutedTags = useNotificationRulesStore((s) => s.rules.mutedTags)

  useEffect(() => {
    if (data) useAgentNotificationsStore.getState().load(data.filter((n) => !isMuted(n)))
  }, [data])

  // Muting a tag also removes already-listed notifications with it.
  useEffect(() => {
    const store = useAgentNotificationsStore.getState()
    const kept = store.items.filter((n) => !isMuted(n))
    if (kept.length !== store.items.length) useAgentNotificationsStore.setState({ items: kept })
  }, [mutedTags])
}
