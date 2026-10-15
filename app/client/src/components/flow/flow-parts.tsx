// Small presentational pieces shared by the flows list and the flow view.

import { Ban, CheckCircle2, Circle, CircleDot, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlowStatus, StepState } from '@/types/flow'

const STATUS_STYLES: Record<FlowStatus, string> = {
  active: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  blocked: 'bg-red-500/15 text-red-700 dark:text-red-300',
  done: 'bg-green-500/15 text-green-700 dark:text-green-300',
}

export function FlowStatusChip({ status }: { status: FlowStatus }) {
  return (
    <span
      className={cn(
        'text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5',
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  )
}

export function FlowProgress({
  done,
  total,
  className,
}: {
  done: number
  total: number
  className?: string
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
        {done}/{total}
      </span>
    </div>
  )
}

export function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'doing':
      return <CircleDot className="h-4 w-4 text-sky-500 animate-pulse" />
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-muted-foreground" />
    case 'blocked':
      return <Ban className="h-4 w-4 text-red-500" />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/60" />
  }
}
