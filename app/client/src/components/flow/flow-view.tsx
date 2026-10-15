import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import { ArrowLeft, FileText, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFlow } from '@/hooks/use-flows'
import { useUIStore } from '@/stores/ui-store'
import { formatAgo } from '@/lib/format-ago'
import { notificationIcon } from '@/lib/system-notify'
import { Button } from '@/components/ui/button'
import type { FlowJournalEntry, JournalType, ParsedFlow } from '@/types/flow'
import { FlowProgress, FlowStatusChip, StepIcon } from './flow-parts'

const JOURNAL_LABELS: Record<JournalType, string> = {
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

function Journal({ entries }: { entries: FlowJournalEntry[] }) {
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
  // Newest first: the journal is append-only, so reverse file order.
  const visible = [...entries]
    .reverse()
    .filter((e) => (types.size === 0 || types.has(e.type)) && (!tag || e.tags.includes(tag)))

  const toggleType = (t: JournalType) =>
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  return (
    <section>
      <h2 className="text-xs font-medium text-muted-foreground mb-2">Journal</h2>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No journal entries yet.</p>
      ) : (
        <>
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
          <ol className="space-y-1.5">
            {visible.map((e) => (
              <li key={e.raw} className="flex gap-2 text-xs">
                <span className="w-5 shrink-0 text-center">{notificationIcon(e.type)}</span>
                <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                  {e.time ?? ''}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn(LEVEL_TEXT[e.level])}>
                    {e.step && (
                      <span className="font-mono mr-1.5 text-muted-foreground">{e.step}</span>
                    )}
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
        </>
      )}
    </section>
  )
}

function Steps({ flow }: { flow: ParsedFlow }) {
  return (
    <section>
      <h2 className="text-xs font-medium text-muted-foreground mb-2">Steps</h2>
      <ul className="space-y-1">
        {flow.steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-sm">
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
          </li>
        ))}
      </ul>
    </section>
  )
}

export function FlowView({ projectId, slug }: { projectId: number; slug: string }) {
  const { data: flow, isLoading, error } = useFlow(projectId, slug)
  const openFlow = useUIStore((s) => s.openFlow)
  const openSession = useUIStore((s) => s.openSession)
  const projectSlug = useUIStore((s) => s.selectedProjectSlug)
  const [showSource, setShowSource] = useState(false)
  const parsed = flow?.parsed ?? null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Back to project"
          onClick={() => openFlow(null)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold truncate">{flow?.title ?? slug}</h1>
            {flow && <FlowStatusChip status={flow.status} />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
            {flow?.absPath || `.flow/${slug}.md`}
            {flow && <span className="font-sans"> · updated {formatAgo(flow.updatedTs)}</span>}
          </p>
        </div>
        <Button
          variant={showSource ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setShowSource((v) => !v)}
        >
          <FileText className="h-3.5 w-3.5" /> Source
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {error && <p className="text-xs text-red-500">Flow not found.</p>}
        {flow && showSource && (
          <pre className="text-xs whitespace-pre-wrap font-mono rounded-md border border-border bg-muted/30 p-3">
            {flow.content}
          </pre>
        )}
        {flow && !showSource && parsed && (
          <div className="max-w-4xl space-y-6">
            <FlowProgress done={parsed.progress.done} total={parsed.progress.total} />
            {parsed.goal && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground mb-1">Goal</h2>
                <div className="text-sm leading-relaxed [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:font-mono [&_code]:text-xs">
                  <Markdown>{parsed.goal}</Markdown>
                </div>
              </section>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Steps flow={parsed} />
              <Journal entries={parsed.journal} />
            </div>
            {flow.sessions.length > 0 && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground mb-2">Sessions</h2>
                <div className="flex flex-wrap gap-1.5">
                  {flow.sessions.map((s) => (
                    <button
                      key={s.sessionId}
                      className="text-xs rounded border border-border px-2 py-1 hover:border-primary/50 cursor-pointer"
                      onClick={() => openSession(projectId, projectSlug, s.sessionId)}
                    >
                      <span className="font-mono">{s.sessionId.slice(0, 8)}</span>
                      <span className="text-muted-foreground ml-1.5">{formatAgo(s.lastTs)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {parsed.errors.length > 0 && (
              <section className="text-xs text-amber-700 dark:text-amber-400">
                <h2 className="font-medium mb-1 flex items-center gap-1">
                  <TriangleAlert className="h-3.5 w-3.5" /> Format warnings
                </h2>
                <ul className="list-disc pl-5 space-y-0.5">
                  {parsed.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
