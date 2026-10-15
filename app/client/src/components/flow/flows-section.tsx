import { ListChecks } from 'lucide-react'
import { useFlows } from '@/hooks/use-flows'
import { useUIStore } from '@/stores/ui-store'
import { formatAgo } from '@/lib/format-ago'
import { FlowProgress, FlowStatusChip } from './flow-parts'

/** "Flows" block on the project page. Renders nothing when the project has none. */
export function FlowsSection({ projectId }: { projectId: number }) {
  const { data: flows } = useFlows(projectId)
  const openFlow = useUIStore((s) => s.openFlow)
  if (!flows?.length) return null

  return (
    <div className="border-b border-border px-4 py-3">
      <h2 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" /> Flows
      </h2>
      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {flows.map((f) => (
          <button
            key={f.id}
            className="text-left rounded-md border border-border p-2.5 hover:border-primary/50 hover:bg-accent/40 cursor-pointer transition-colors"
            onClick={() => openFlow(f.slug)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate flex-1">{f.title}</span>
              <FlowStatusChip status={f.status} />
            </div>
            <FlowProgress
              className="mt-2"
              done={f.parsed?.progress.done ?? 0}
              total={f.parsed?.progress.total ?? 0}
            />
            <div className="mt-1.5 text-[10px] text-muted-foreground flex justify-between gap-2">
              <span className="font-mono truncate">.flow/{f.slug}.md</span>
              <span className="shrink-0">{formatAgo(f.updatedTs)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
