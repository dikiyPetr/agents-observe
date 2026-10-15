// Clicking a plan (flows list, notification) opens the session where its
// agent works, filtered to that agent and the agents of all its sub-plans,
// on the Plan tab.

import type { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { buildFlowTree, findNode, navigationTarget } from '@/lib/flow-tree'
import { useUIStore } from '@/stores/ui-store'
import type { FlowSummary } from '@/types/flow'

export async function navigateToFlow(
  queryClient: QueryClient,
  project: { id: number; slug: string },
  flowSlug: string,
): Promise<boolean> {
  const flows = await queryClient.fetchQuery({
    queryKey: ['flows', project.id],
    queryFn: () => api.getFlows(project.id),
    staleTime: 2000,
  })
  const node = findNode(buildFlowTree(flows as FlowSummary[]), flowSlug)
  const target = node && navigationTarget(node)
  if (!target) return false

  const ui = useUIStore.getState()
  ui.openSession(project.id, project.slug, target.sessionId)
  // openSession resets the agent filter, so apply ours afterwards.
  useUIStore.setState({
    selectedAgentIds: target.agentIds,
    sessionTab: 'plan',
    planFocusSlug: flowSlug,
  })
  return true
}
