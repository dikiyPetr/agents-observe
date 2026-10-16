// hooks/scripts/lib/flow.mjs
// Helpers for flow files (`<repo>/.flow/<slug>.md`). Format: lib/flow-rules/format.md.
// No dependencies - uses only Node.js built-ins.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, parse as parsePath, resolve } from 'node:path'

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
 * The `.flow` directory for a session's cwd: the nearest ancestor that already
 * has `.flow/`, else the git root (`.git` dir or file, so worktrees work), else
 * `projectDir`, else cwd. Returns null when that would land in the home dir or
 * a filesystem root. Never throws.
 */
export function resolveFlowDir(cwd, { homeDir, projectDir } = {}) {
  if (!cwd) return null
  try {
    let dir = resolve(cwd)
    let gitRoot = null
    for (;;) {
      const flowDir = join(dir, '.flow')
      if (existsSync(flowDir) && statSync(flowDir).isDirectory())
        return guardFlowDir(flowDir, homeDir)
      if (!gitRoot && existsSync(join(dir, '.git'))) gitRoot = dir
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
    return guardFlowDir(join(gitRoot || projectDir || cwd, '.flow'), homeDir)
  } catch {
    return null
  }
}

function guardFlowDir(flowDir, homeDir) {
  const root = resolve(dirname(flowDir))
  if (homeDir && samePath(root, homeDir)) return null
  if (root === parsePath(root).root) return null
  return flowDir
}

/** Path equality that ignores separators and (Windows) case. */
export function samePath(a, b) {
  const n = (p) => resolve(p).replace(/\\/g, '/').toLowerCase()
  return n(a) === n(b)
}

/**
 * All flows in `flowDir` (any status, so slug collisions can be avoided),
 * newest first: [{ name, abs, title, status, source, done, total, mtime }].
 * Never throws.
 */
export function listFlows(flowDir) {
  let names
  try {
    names = readdirSync(flowDir).filter((n) => n.toLowerCase().endsWith('.md'))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const abs = join(flowDir, name)
    const content = readFlowFile(abs)
    if (content == null) continue
    const fm = readFrontmatter(content)
    // Not a flow: other markdown that happens to live in .flow/.
    if (!fm.status && !/^#{1,6}\s+(steps|шаги)/im.test(content)) continue
    const steps = content.match(/^\s*[-*]\s+\[(.)\]\s+S\d+/gm) || []
    let mtime = 0
    try {
      mtime = statSync(abs).mtimeMs
    } catch {}
    out.push({
      name,
      abs,
      title: fm.title || name.slice(0, -3),
      status: (fm.status || 'active').toLowerCase(),
      source: fm.source || null,
      done: steps.filter((st) => /\[(x|X|-)\]/.test(st)).length,
      total: steps.length,
      mtime,
    })
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}
