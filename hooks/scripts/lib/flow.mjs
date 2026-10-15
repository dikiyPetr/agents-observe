// hooks/scripts/lib/flow.mjs
// Helpers for flow files (`<repo>/.flow/<slug>.md`) — see skills/flow/SKILL.md.
// No dependencies - uses only Node.js built-ins.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Flow files bigger than this are not attached to events. */
export const MAX_FLOW_FILE_BYTES = 256 * 1024

const FLOW_PATH_RE = /(?:^|\/)\.flow\/([^/]+)\.md$/i

/**
 * Returns `{ slug }` when `filePath` points at a flow file, else null.
 * Accepts both Windows and POSIX separators.
 */
export function matchFlowPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null
  const m = filePath.replace(/\\/g, '/').match(FLOW_PATH_RE)
  return m ? { slug: m[1] } : null
}

/**
 * Read a flow file for attaching to an event. Returns the content, or
 * null when the file is missing, unreadable or too large.
 */
export function readFlowFile(absPath, log) {
  try {
    const { size } = statSync(absPath)
    if (size > MAX_FLOW_FILE_BYTES) {
      log?.warn?.(`Flow file too large to attach (${size} bytes): ${absPath}`)
      return null
    }
    return readFileSync(absPath, 'utf8')
  } catch (err) {
    log?.warn?.(`Failed to read flow file ${absPath}: ${err.message}`)
    return null
  }
}

/** Minimal frontmatter reader — only `key: value` scalar lines are needed here. */
export function readFrontmatter(content) {
  const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*(?:#.*)?$/)
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * List flows under `<cwd>/.flow` whose status is not `done`.
 * Returns [{ relPath, title, status }]. Never throws.
 */
export function listActiveFlows(cwd) {
  if (!cwd) return []
  const dir = join(cwd, '.flow')
  let names
  try {
    names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md'))
  } catch {
    return []
  }
  const active = []
  for (const name of names) {
    const content = readFlowFile(join(dir, name))
    if (content == null) continue
    const fm = readFrontmatter(content)
    const status = (fm.status || 'active').toLowerCase()
    if (status === 'done') continue
    active.push({ relPath: `.flow/${name}`, title: fm.title || name.slice(0, -3), status })
  }
  return active
}

/** Context text injected on SessionStart so the agent keeps following the flow protocol. */
export function buildFlowReminder(flows) {
  if (!flows.length) return null
  const list = flows.map((f) => `- ${f.relPath} — ${f.title} (status: ${f.status})`).join('\n')
  return (
    `Active flow files in this project:\n${list}\n` +
    'Keep them updated following the /flow skill protocol: mark steps [~]/[x]/[-]/[!], ' +
    'append journal lines for step / deviation / decision / blocked, and edit flow files only with Edit/Write.'
  )
}
