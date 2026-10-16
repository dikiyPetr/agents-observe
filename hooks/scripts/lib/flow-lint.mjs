// hooks/scripts/lib/flow-lint.mjs
// Flow file lints: the dashboard parser's errors + traps the parser silently
// accepts (sub-headings, numbered steps, dangling arrows, status vs steps…).
// lintFlow(content, { absPath, flowDir, slug, homeDir }) -> [{ line, problem, fix, kind? }]
// kind 'status' marks status/step consistency problems: those are only checked
// at Stop, since parallel Edits pass through mixed states.
// No dependencies - uses only Node.js built-ins.

import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parseFlow } from './flow-parse.gen.mjs'

const STEPS_H = /^(steps|plan|шаги|план)/i
const JOURNAL_H = /^(journal|log|журнал|лог)/i
const GOAL_H = /^(goal|цель)/i
const CANON = /^(goal|цель|steps|шаги|journal|журнал)$/i
const STATUSES = new Set(['review', 'active', 'blocked', 'done'])

export function readFrontmatterLines(content) {
  const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const out = {}
  m[1].split(/\r?\n/).forEach((line, i) => {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (kv) out[kv[1]] = { raw: kv[2], line: i + 2 }
  })
  return out
}

export function fmValue(fm, key) {
  const v = fm?.[key]?.raw
  if (v == null) return null
  return v
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^["']|["']$/g, '')
}

export function lintFlow(content, { absPath, flowDir, slug, homeDir } = {}) {
  const out = []
  const add = (line, problem, fix, kind) =>
    out.push(kind ? { line, problem, fix, kind } : { line, problem, fix })
  const parsed = parseFlow(content, slug || 'flow')
  const lines = content.split(/\r?\n/)

  // L1/L2 frontmatter
  const fm = readFrontmatterLines(content)
  if (!fm) add(1, 'no frontmatter', 'start the file with ---/title/status/--- lines')
  else {
    if (!fm.title) add(1, 'no title in frontmatter', 'add `title: <short title>`')
    if (!fm.status)
      add(1, 'no status in frontmatter', 'add `status: active` (or review/blocked/done)')
    else if (!STATUSES.has(fmValue(fm, 'status').toLowerCase()))
      add(
        fm.status.line,
        `unknown status "${fmValue(fm, 'status')}"`,
        'use review | active | blocked | done',
      )
    for (const k of ['title', 'source', 'parent', 'parent_step']) {
      if (fm[k] && fm[k].raw.includes('#'))
        add(
          fm[k].line,
          `\`#\` in frontmatter value of ${k} (everything after it is cut as a comment)`,
          'remove the # character',
        )
    }
  }

  // Walk sections for structure lints.
  let section = null // 'steps' | 'journal' | 'goal' | 'other'
  let sub = null // heading text when inside a sub-heading under steps
  let stepsSeen = false
  const ids = new Set()
  let firstJournal = null
  lines.forEach((line, i) => {
    const n = i + 1
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (h) {
      const text = h[2]
      if (STEPS_H.test(text) || JOURNAL_H.test(text) || GOAL_H.test(text)) {
        if (!CANON.test(text))
          add(
            n,
            `heading "${text}" is read as a ${STEPS_H.test(text) ? 'Steps' : JOURNAL_H.test(text) ? 'Journal' : 'Goal'} section`,
            'use exactly ## Goal / ## Steps / ## Journal',
          )
        section = STEPS_H.test(text) ? 'steps' : JOURNAL_H.test(text) ? 'journal' : 'goal'
        sub = null
        if (section === 'steps') stepsSeen = true
      } else if (section === 'steps' && h[1].length >= 3) {
        sub = text
      } else {
        section = 'other'
        sub = null
      }
      return
    }
    if (section === 'steps') {
      if (/^\s*([-*+]|\d+[.)])\s+\[/.test(line)) {
        const m = line.match(/^\s*[-*]\s+\[(.)\]\s+(S\d+[\w.-]*)\b/)
        if (sub)
          add(
            n,
            `step under sub-heading "${sub}" is dropped by the parser`,
            'keep one flat list right under ## Steps',
          )
        if (!m)
          add(
            n,
            `step line not in form "- [m] S<n> text": ${line.trim().slice(0, 60)}`,
            'use "- [ ] S1 text"',
          )
        else {
          if (!' ~xX-!'.includes(m[1]))
            add(n, `unknown marker [${m[1]}]`, 'use [ ] [~] [x] [-] [!]')
          if (ids.has(m[2])) add(n, `duplicate step id ${m[2]}`, 'ids must be unique')
          ids.add(m[2])
          // L6 dangling arrow
          const arrow = line.match(/(?:→|->)\s*(?:\.flow\/)?([\w.-]+?)(?:\.md)?\s*$/)
          if (arrow && flowDir && !existsSync(join(flowDir, `${arrow[1]}.md`)))
            add(
              n,
              `step ends with an arrow but .flow/${arrow[1]}.md does not exist (read as delegation)`,
              'only end a step with → <slug> when that child flow exists; reword otherwise',
            )
        }
      } else if (/^\s*[-*]\s+\[\s*\]\s*\S/.test(line) === false && /^\s*[-*]\s+\[\]/.test(line)) {
        add(n, 'empty marker []', 'use "[ ]" with a space')
      }
    }
    if (section === 'journal') {
      const item = line.match(/^\s*[-*]\s+(.*)$/)
      if (item && firstJournal == null) firstJournal = { n, text: item[1].trim() }
    }
  })
  if (!stepsSeen) add(1, 'no ## Steps section', 'add ## Steps with "- [ ] S1 …" lines')
  else if (parsed.steps.length === 0)
    add(1, 'zero steps parsed', 'list steps as "- [ ] S1 text" right under ## Steps')
  if (firstJournal && !/^(\d{1,2}:\d{2}\s+)?plan\b/i.test(firstJournal.text))
    add(
      firstJournal.n,
      'first journal line is not a `plan` line',
      'start the journal with "- plan #plan — <N steps: summary>"',
    )

  // Parser errors (journal etc.), dedup vs our own.
  for (const e of parsed.errors) {
    if (/Unknown status/.test(e)) continue
    if (
      /Unknown step marker|Step without id|Duplicate step id/.test(e) &&
      out.some((o) => /step|marker|id/.test(o.problem))
    )
      continue
    add(
      0,
      e,
      /journal/i.test(e) ? 'journal lines: "- <type>[/high] [S<n>] [#tag] — text"' : 'fix the line',
    )
  }

  // L8 status consistency
  const st = parsed.status
  const states = parsed.steps.map((s) => s.state)
  if (fm?.status) {
    if (st === 'review' && states.some((s) => s === 'doing' || s === 'done'))
      add(
        fm.status.line,
        'status review but steps are in progress/done',
        'set status: active once execution starts',
        'status',
      )
    if (st === 'done' && states.some((s) => s === 'todo' || s === 'doing'))
      add(
        fm.status.line,
        'status done but some steps are still open',
        'mark them [x], [-] (why) or [!], or keep status active',
        'status',
      )
    if (st === 'blocked' && !states.includes('blocked'))
      add(
        fm.status.line,
        'status blocked but no step is [!]',
        'mark the blocked step [!] with the reason',
        'status',
      )
  }

  // L9 source / location / parent
  const source = fm ? fmValue(fm, 'source') : null
  if (source && absPath) {
    const expanded = homeDir ? source.replace(/^~(?=[\\/])/, homeDir) : source
    const base = flowDir ? dirname(flowDir) : dirname(dirname(absPath))
    const p = isAbsolute(expanded) ? expanded : resolve(base, expanded)
    if (!existsSync(p))
      add(
        fm.source.line,
        `source "${source}" not found`,
        'use the plan document path relative to the repo root (or absolute)',
      )
  }
  if (
    absPath &&
    flowDir &&
    resolve(dirname(absPath)).toLowerCase() !== resolve(flowDir).toLowerCase()
  )
    add(0, `flow file is outside ${flowDir}`, `keep flows in ${flowDir}`)
  const parent = fm ? fmValue(fm, 'parent') : null
  if (parent && flowDir && !existsSync(join(flowDir, `${parent}.md`)))
    add(
      fm.parent.line,
      `parent flow .flow/${parent}.md not found`,
      'parent must be the slug of the delegating flow',
    )
  return out
}
