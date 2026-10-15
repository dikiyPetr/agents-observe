import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/** Flows of a project. Kept fresh by `flow_update` WS invalidation. */
export function useFlows(projectId: number | null) {
  return useQuery({
    queryKey: ['flows', projectId],
    queryFn: () => api.getFlows(projectId!),
    enabled: projectId != null,
  })
}

export function useFlow(projectId: number | null, slug: string | null) {
  return useQuery({
    queryKey: ['flow', projectId, slug],
    queryFn: () => api.getFlow(projectId!, slug!),
    enabled: projectId != null && !!slug,
  })
}
