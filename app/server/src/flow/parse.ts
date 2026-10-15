// Flow file parser. Format is documented in skills/flow/SKILL.md.
//
// parseFlow never throws: anything it cannot understand is kept (journal
// lines become `info` entries) and reported in `errors`, so a slightly
// malformed file still renders in the dashboard.

export type FlowStatus = 'active' | 'blocked' | 'done'
export type StepState = 'todo' | 'doing' | 'done' | 'skipped' | 'blocked'
export type JournalType = 'step' | 'deviation' | 'decision' | 'blocked' | 'info'
export type FlowLevel = 'low' | 'normal' | 'high'

export interface FlowStep {
  id: string
  state: StepState
  text: string
}

export interface FlowJournalEntry {
  time: string | null
  type: JournalType
  level: FlowLevel
  step: string | null
  tags: string[]
  text: string
  /** The original line (without the list marker), used as a stable identity. */
  raw: string
}

export interface ParsedFlow {
  title: string
  status: FlowStatus
  updated: string | null
  goal: string
  steps: FlowStep[]
  journal: FlowJournalEntry[]
  progress: { done: number; total: number }
  errors: string[]
}

const STEP_MARKERS: Record<string, StepState> = {
  ' ': 'todo',
  '~': 'doing',
  x: 'done',
  X: 'done',
  '-': 'skipped',
  '!': 'blocked',
}

const JOURNAL_TYPES = new Set<JournalType>(['step', 'deviation', 'decision', 'blocked', 'info'])
const LEVELS = new Set<FlowLevel>(['low', 'normal', 'high'])
const STATUSES = new Set<FlowStatus>(['active', 'blocked', 'done'])

const GOAL_HEADING = /^(goal|цель)/i
const STEPS_HEADING = /^(steps|plan|шаги|план)/i
const JOURNAL_HEADING = /^(journal|log|журнал|лог)/i

const STEP_RE = /^\s*[-*]\s+\[(.)\]\s+(?:(S\d+[\w.-]*)\b\s*)?(.*)$/
const ITEM_RE = /^\s*[-*]\s+(.*)$/
// HH:MM type[/level] [S<n>] [#tags…] — text   (separator: — – - or :)
const JOURNAL_RE =
  /^(?:(\d{1,2}:\d{2})\s+)?([a-z]+)(?:\/([a-z]+))?\s+(?:(S\d+[\w.-]*)\s+)?((?:#[\p{L}\p{N}_-]+\s+)*)(?:[—–:-]\s*)?(.*)$/iu
const TAG_RE = /#([\p{L}\p{N}_-]+)/gu

function parseFrontmatter(md: string): { data: Record<string, string>; body: string } {
  const m = md.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[^\n]*(?:\r?\n|$)/)
  if (!m) return { data: {}, body: md }
  const data: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*(?:#.*)?$/)
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { data, body: md.slice(m[0].length) }
}

function splitSections(body: string): { heading: string; lines: string[] }[] {
  const sections: { heading: string; lines: string[] }[] = [{ heading: '', lines: [] }]
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)
    if (h) sections.push({ heading: h[1], lines: [] })
    else sections[sections.length - 1].lines.push(line)
  }
  return sections
}

function uniq(items: string[]): string[] {
  return [...new Set(items)]
}

export function parseJournalLine(raw: string): { entry: FlowJournalEntry; ok: boolean } {
  const m = raw.match(JOURNAL_RE)
  const type = m?.[2]?.toLowerCase() as JournalType | undefined
  if (!m || !type || !JOURNAL_TYPES.has(type)) {
    const tags = uniq([...raw.matchAll(TAG_RE)].map((t) => t[1].toLowerCase()))
    return {
      entry: { time: null, type: 'info', level: 'normal', step: null, tags, text: raw, raw },
      ok: false,
    }
  }
  const levelRaw = m[3]?.toLowerCase() as FlowLevel | undefined
  const level: FlowLevel =
    levelRaw && LEVELS.has(levelRaw) ? levelRaw : type === 'blocked' ? 'high' : 'normal'
  const text = (m[6] ?? '').trim()
  const tags = uniq(
    [...(m[5] ?? '').matchAll(TAG_RE), ...text.matchAll(TAG_RE)].map((t) => t[1].toLowerCase()),
  )
  return {
    entry: { time: m[1] ?? null, type, level, step: m[4] ?? null, tags, text, raw },
    ok: !m[3] || LEVELS.has(levelRaw as FlowLevel),
  }
}

export function parseFlow(md: string, fallbackTitle = 'Untitled flow'): ParsedFlow {
  const errors: string[] = []
  const { data, body } = parseFrontmatter(md ?? '')

  const statusRaw = (data.status || 'active').toLowerCase() as FlowStatus
  const status: FlowStatus = STATUSES.has(statusRaw) ? statusRaw : 'active'
  if (!STATUSES.has(statusRaw)) errors.push(`Unknown status "${data.status}"`)

  const sections = splitSections(body)
  let title = data.title || ''
  if (!title) {
    const h1 = body.match(/^#\s+(.+)$/m)
    title = h1 ? h1[1].trim() : fallbackTitle
  }

  const goal = sections
    .filter((s) => GOAL_HEADING.test(s.heading))
    .map((s) => s.lines.join('\n').trim())
    .join('\n\n')

  // Steps: checkbox items in the steps section, or anywhere if there is none.
  const stepSections = sections.filter((s) => STEPS_HEADING.test(s.heading))
  const stepLines = (stepSections.length ? stepSections : sections).flatMap((s) => s.lines)
  const steps: FlowStep[] = []
  const seenIds = new Set<string>()
  for (const line of stepLines) {
    const m = line.match(STEP_RE)
    if (!m) continue
    const state = STEP_MARKERS[m[1]]
    if (!state) {
      errors.push(`Unknown step marker "[${m[1]}]": ${line.trim()}`)
      continue
    }
    let id = m[2] ?? `#${steps.length + 1}`
    if (!m[2]) errors.push(`Step without id (S<n>): ${line.trim()}`)
    if (seenIds.has(id)) {
      errors.push(`Duplicate step id ${id}`)
      id = `${id}#${steps.length + 1}`
    }
    seenIds.add(id)
    steps.push({ id, state, text: m[3].trim() })
  }

  const journal: FlowJournalEntry[] = []
  for (const section of sections.filter((s) => JOURNAL_HEADING.test(s.heading))) {
    for (const line of section.lines) {
      const item = line.match(ITEM_RE)
      if (!item) continue
      const { entry, ok } = parseJournalLine(item[1].trim())
      if (!ok) errors.push(`Unrecognized journal line: ${item[1].trim()}`)
      journal.push(entry)
    }
  }

  const done = steps.filter((s) => s.state === 'done' || s.state === 'skipped').length
  return {
    title,
    status,
    updated: data.updated || null,
    goal,
    steps,
    journal,
    progress: { done, total: steps.length },
    errors,
  }
}
