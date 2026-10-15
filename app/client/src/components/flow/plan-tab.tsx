// Session "Plan" tab: the plans (flows) executed by the agents selected in
// the Agents filter — or by every agent of the session when none is
// selected. One plan per agent; a sub-plan delegated to a subagent renders
// nested under the parent step it implements, at any depth.

import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import { FileText, ListChecks, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFlow, useFlows } from '@/hooks/use-flows'
import { useUIStore } from '@/stores/ui-store'
import { formatAgo } from '@/lib/format-ago'
import { notificationIcon } from '@/lib/system-notify'
import {
  buildFlowTree,
  childrenOfStep,
  treeProgress,
  unattachedChildren,
  type FlowNode,
} from '@/lib/flow-tree'
import type { Agent } from '@/types'
import type { FlowJournalEntry, FlowSummary, JournalType } from '@/types/flow'
import { FlowProgress, FlowStatusChip, StepIcon } from './flow-parts'

const JOURNAL_LABELS: Record<JournalType, string> = {
  plan: 'Plan',
  step: 'Step',
  deviation: 'Deviation',
  decision: 'Decision',
  blocked: 'Blocked',
  info: 'Note',
}

const LEVEL_TEXT: Record<FlowJournalEntry['level'], string> = {
  low: 'text-muted-foreground',
  normal: '',
  high: 'text-amber-600 dark:text-amber-400 font-medium',
}

const COLLAPSED_JOURNAL = 4

function Journal({ entries }: { entries: FlowJournalEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const [types, setTypes] = useState<Set<JournalType>>(new Set())
  const [tag, setTag] = useState<string | null>(null)
  const allTags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries])
  const presentTypes = useMemo(
    () =>
      (Object.keys(JOURNAL_LABELS) as JournalType[]).filter((t) =>
        entries.some((e) => e.type === t),
      ),
    [entries],
  )
  if (entries.length === 0) return null

  // Newest first: the journal is append-only, so reverse file order.
  const filtered = [...entries]
    .reverse()
    .filter((e) => (types.size === 0 || types.has(e.type)) && (!tag || e.tags.includes(tag)))
  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED_JOURNAL)

  const toggleType = (t: JournalType) =>
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  return (
    <div className="mt-3">
      {expanded && (
        <div className="flex flex-wrap gap-1 mb-2">
          {presentTypes.map((t) => (
            <button
              key={t}
              className={cn(
                'text-[11px] rounded border px-1.5 py-0.5 cursor-pointer',
                types.has(t)
                  ? 'border-primary bg-primary/10'
                  : 'border-border text-muted-foreground',
              )}
              onClick={() => toggleType(t)}
            >
              {notificationIcon(t)} {JOURNAL_LABELS[t]}
            </button>
          ))}
          {allTags.map((t) => (
            <button
              key={t}
              className={cn(
                'text-[11px] rounded px-1.5 py-0.5 cursor-pointer',
                tag === t ? 'bg-primary/15 text-foreground' : 'bg-muted text-muted-foreground',
              )}
              onClick={() => setTag(tag === t ? null : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
      <ol className="space-y-1">
        {visible.map((e) => (
          <li key={e.raw} className="flex gap-2 text-xs">
            <span className="w-5 shrink-0 text-center">{notificationIcon(e.type)}</span>
            <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{e.time ?? ''}</span>
            <span className="flex-1 min-w-0">
              <span className={cn(LEVEL_TEXT[e.level])}>
                {e.step && <span className="font-mono mr-1.5 text-muted-foreground">{e.step}</span>}
                {e.text}
              </span>
              {e.tags.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  {e.tags.map((t) => `#${t}`).join(' ')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {(filtered.length > COLLAPSED_JOURNAL || expanded) && (
        <button
          className="mt-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Collapse journal' : `Show full journal (${entries.length})`}
        </button>
      )}
    </div>
  )
}

function SourceView({ projectId, slug }: { projectId: number; slug: string }) {
  const { data, isLoading } = useFlow(projectId, slug)
  if (isLoading) return <p className="text-xs text-muted-foreground mt-2">Loading…</p>
  return (
    <pre className="mt-2 text-xs whitespace-pre-wrap font-mono rounded-md border border-border bg-muted/30 p-3">
      {data?.content}
    </pre>
  )
}

function agentLabel(agentId: string, sessionId: string, agents: Map<string, Agent>): string {
  if (agentId === sessionId) return 'Main'
  const a = agents.get(agentId)
  return a?.name || a?.agentType || agentId.slice(0, 8)
}

function AgentChips({
  flow,
  sessionId,
  agents,
}: {
  flow: FlowSummary
  sessionId: string
  agents: Map<string, Agent>
}) {
  const here = flow.agents.filter((a) => a.sessionId === sessionId)
  const elsewhere = new Set(
    flow.agents.filter((a) => a.sessionId !== sessionId).map((a) => a.sessionId),
  ).size
  return (
    <span className="flex flex-wrap items-center gap-1">
      {here.map((l) => {
        const status = agents.get(l.agentId)?.status
        return (
          <span
            key={l.agentId}
            className="inline-flex items-center gap-1 text-[11px] rounded bg-muted px-1.5 py-0.5"
            title={l.agentId}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                status === 'active' ? 'bg-green-500' : 'bg-muted-foreground/50',
              )}
            />
            {agentLabel(l.agentId, sessionId, agents)}
          </span>
        )
      })}
      {elsewhere > 0 && (
        <span className="text-[11px] text-muted-foreground">
          +{elsewhere} other session{elsewhere > 1 ? 's' : ''}
        </span>
      )}
    </span>
  )
}

function PlanNode({
  node,
  projectId,
  sessionId,
  agents,
  depth,
}: {
  node: FlowNode
  projectId: number
  sessionId: string
  agents: Map<string, Agent>
  depth: number
}) {
  const { flow } = node
  const parsed = flow.parsed
  const focus = useUIStore((s) => s.planFocusSlug === flow.slug)
  const [showSource, setShowSource] = useState(false)
  const progress = treeProgress(node)
  const loose = unattachedChildren(node)

  const nested = (kids: FlowNode[]) =>
    kids.length > 0 && (
      <div className="ml-6 mt-1.5 space-y-2 border-l border-border pl-3">
        {kids.map((k) => (
          <PlanNode
            key={k.flow.slug}
            node={k}
            projectId={projectId}
            sessionId={sessionId}
            agents={agents}
            depth={depth + 1}
          />
        ))}
      </div>
    )

  return (
    <div
      id={`plan-${flow.slug}`}
      className={cn(
        'rounded-md border border-border p-3 transition-shadow',
        depth > 0 && 'bg-muted/10',
        focus && 'ring-2 ring-primary/60',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{flow.title}</span>
            <FlowStatusChip status={flow.status} />
            <AgentChips flow={flow} sessionId={sessionId} agents={agents} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
            .flow/{flow.slug}.md
            <span className="font-sans"> · updated {formatAgo(flow.updatedTs)}</span>
          </div>
        </div>
        <button
          className={cn(
            'flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 cursor-pointer shrink-0',
            showSource ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setShowSource((v) => !v)}
        >
          <FileText className="h-3 w-3" /> Source
        </button>
      </div>

      <FlowProgress className="mt-2" done={progress.done} total={progress.total} />

      {showSource && <SourceView projectId={projectId} slug={flow.slug} />}

      {!showSource && parsed && (
        <>
          {parsed.goal && (
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5">
              <Markdown>{parsed.goal}</Markdown>
            </div>
          )}
          <ul className="mt-2 space-y-1">
            {parsed.steps.map((s) => (
              <li key={s.id}>
                <div className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0">
                    <StepIcon state={s.state} />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground mt-0.5 w-8 shrink-0">
                    {s.id}
                  </span>
                  <span
                    className={cn(
                      s.state === 'skipped' && 'line-through text-muted-foreground',
                      s.state === 'blocked' && 'text-red-600 dark:text-red-400',
                      s.state === 'doing' && 'font-medium',
                    )}
                  >
                    {s.text}
                  </span>
                  {s.child && (
                    <span className="text-[11px] text-muted-foreground font-mono">→ {s.child}</span>
                  )}
                </div>
                {nested(childrenOfStep(node, s.id))}
              </li>
            ))}
          </ul>
          {nested(loose)}
          <Journal entries={parsed.journal} />
          {parsed.errors.length > 0 && (
            <details className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
              <summary className="cursor-pointer flex items-center gap-1">
                <TriangleAlert className="h-3 w-3" /> {parsed.errors.length} format warning
                {parsed.errors.length > 1 ? 's' : ''}
              </summary>
              <ul className="list-disc pl-5 mt-1">
                {parsed.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Roots to render: in-scope plans with no in-scope ancestor. Each is shown
 * with its full sub-plan tree.
 */
function scopedRoots(forest: FlowNode[], inScope: (f: FlowSummary) => boolean): FlowNode[] {
  const out: FlowNode[] = []
  const walk = (node: FlowNode) => {
    if (inScope(node.flow)) out.push(node)
    else node.children.forEach(walk)
  }
  forest.forEach(walk)
  return out
}

export function PlanTab({
  projectId,
  sessionId,
  agents,
}: {
  projectId: number | null
  sessionId: string
  agents: Agent[]
}) {
  const { data: flows, isLoading } = useFlows(projectId)
  const selectedAgentIds = useUIStore((s) => s.selectedAgentIds)
  const planFocusSlug = useUIStore((s) => s.planFocusSlug)
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  const roots = useMemo(() => {
    if (!flows) return []
    const selected = new Set(selectedAgentIds)
    const inScope = (f: FlowSummary) =>
      f.agents.some(
        (a) => a.sessionId === sessionId && (selected.size === 0 || selected.has(a.agentId)),
      )
    return scopedRoots(buildFlowTree(flows), inScope)
  }, [flows, selectedAgentIds, sessionId])

  useEffect(() => {
    if (!planFocusSlug) return
    // Wait a frame so freshly fetched plans are in the DOM.
    const id = requestAnimationFrame(() =>
      document
        .getElementById(`plan-${planFocusSlug}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    )
    return () => cancelAnimationFrame(id)
  }, [planFocusSlug, roots])

  if (projectId == null) {
    return (
      <p className="p-6 text-xs text-muted-foreground">
        Plans are tracked per project — this session has no project.
      </p>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!isLoading && roots.length === 0 && (
        <div className="max-w-xl text-xs text-muted-foreground space-y-1">
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <ListChecks className="h-4 w-4" />
            No plans for {selectedAgentIds.length ? 'the selected agents' : 'this session'}
          </p>
          <p>
            An agent creates its plan in <span className="font-mono">.flow/&lt;slug&gt;.md</span>{' '}
            with the <span className="font-mono">/flow</span> skill; sub-plans of delegated
            subagents appear nested under the step they implement.
          </p>
        </div>
      )}
      <div className="max-w-5xl space-y-3">
        {roots.map((r) => (
          <PlanNode
            key={r.flow.slug}
            node={r}
            projectId={projectId}
            sessionId={sessionId}
            agents={agentMap}
            depth={0}
          />
        ))}
      </div>
    </div>
  )
}
