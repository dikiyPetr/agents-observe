import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ListChecks, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFlows } from '@/hooks/use-flows'
import { useProjects } from '@/hooks/use-projects'
import { formatAgo } from '@/lib/format-ago'
import { buildFlowTree, navigationTarget, treeProgress, type FlowNode } from '@/lib/flow-tree'
import { navigateToFlow } from '@/lib/flow-navigation'
import { FlowProgress, FlowStatusChip } from './flow-parts'

function FlowCard({ node, onOpen }: { node: FlowNode; onOpen: (slug: string) => void }) {
  const { flow } = node
  const progress = treeProgress(node)
  const agentCount = new Set(flow.agents.map((a) => `${a.sessionId}/${a.agentId}`)).size
  const canOpen = navigationTarget(node) !== null
  return (
    <div>
      <button
        className={cn(
          'w-full text-left rounded-md border border-border p-2.5 transition-colors',
          canOpen
            ? 'hover:border-primary/50 hover:bg-accent/40 cursor-pointer'
            : 'opacity-70 cursor-default',
        )}
        title={canOpen ? 'Open the session with this plan’s agents' : 'No agent recorded yet'}
        onClick={() => canOpen && onOpen(flow.slug)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate flex-1">{flow.title}</span>
          {flow.parentStep && (
            <span className="text-[10px] font-mono text-muted-foreground">{flow.parentStep}</span>
          )}
          <FlowStatusChip status={flow.status} />
        </div>
        <FlowProgress className="mt-2" done={progress.done} total={progress.total} />
        <div className="mt-1.5 text-[10px] text-muted-foreground flex items-center gap-2">
          <span className="font-mono truncate flex-1">.flow/{flow.slug}.md</span>
          {agentCount > 0 && (
            <span className="flex items-center gap-0.5 shrink-0">
              <Users className="h-3 w-3" /> {agentCount}
            </span>
          )}
          <span className="shrink-0">{formatAgo(flow.updatedTs)}</span>
        </div>
      </button>
      {node.children.length > 0 && (
        <div className="ml-4 mt-1.5 space-y-1.5 border-l border-border pl-3">
          {node.children.map((c) => (
            <FlowCard key={c.flow.slug} node={c} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

/** "Flows" block on the project page: plan trees. Renders nothing when the project has none. */
export function FlowsSection({ projectId }: { projectId: number }) {
  const { data: flows } = useFlows(projectId)
  const { data: projects } = useProjects()
  const queryClient = useQueryClient()
  const roots = useMemo(() => (flows ? buildFlowTree(flows) : []), [flows])
  const project = projects?.find((p) => p.id === projectId)
  if (!roots.length || !project) return null

  return (
    <div className="border-b border-border px-4 py-3">
      <h2 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" /> Flows
      </h2>
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start">
        {roots.map((r) => (
          <FlowCard
            key={r.flow.slug}
            node={r}
            onOpen={(slug) => void navigateToFlow(queryClient, project, slug)}
          />
        ))}
      </div>
    </div>
  )
}
