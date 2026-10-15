import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  matchFlowPath,
  readFrontmatter,
  listActiveFlows,
  buildFlowReminder,
  MAX_FLOW_FILE_BYTES,
} from '../../../../hooks/scripts/lib/flow.mjs'
import { buildHookEvent } from '../../../../hooks/scripts/lib/agents/claude-code.mjs'

function makeLog() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn() }
}

const FLOW = `---
title: Port inventory
status: active   # active | blocked | done
---
## Steps
- [ ] S1 First
`

describe('matchFlowPath', () => {
  it('matches POSIX and Windows flow paths', () => {
    expect(matchFlowPath('/repo/.flow/port-inventory.md')).toEqual({ slug: 'port-inventory' })
    expect(matchFlowPath('D:\\game\\.flow\\ui.md')).toEqual({ slug: 'ui' })
    expect(matchFlowPath('.flow/rel.md')).toEqual({ slug: 'rel' })
  })

  it('rejects non-flow paths', () => {
    expect(matchFlowPath('/repo/docs/plan.md')).toBeNull()
    expect(matchFlowPath('/repo/.flow/nested/x.md')).toBeNull()
    expect(matchFlowPath('/repo/.flow/x.txt')).toBeNull()
    expect(matchFlowPath(undefined)).toBeNull()
  })
})

describe('readFrontmatter', () => {
  it('reads scalars and strips trailing comments', () => {
    expect(readFrontmatter(FLOW)).toEqual({ title: 'Port inventory', status: 'active' })
  })

  it('returns {} without frontmatter', () => {
    expect(readFrontmatter('# no frontmatter')).toEqual({})
  })
})

describe('listActiveFlows / buildFlowReminder', () => {
  let dir
  beforeEach(() => {
    dir = join(tmpdir(), `flow-${Date.now()}-${Math.random()}`)
    mkdirSync(join(dir, '.flow'), { recursive: true })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists non-done flows only', () => {
    writeFileSync(join(dir, '.flow', 'a.md'), FLOW)
    writeFileSync(join(dir, '.flow', 'b.md'), FLOW.replace('status: active', 'status: done'))
    writeFileSync(join(dir, '.flow', 'notes.txt'), 'ignored')
    const flows = listActiveFlows(dir)
    expect(flows).toEqual([{ relPath: '.flow/a.md', title: 'Port inventory', status: 'active' }])
    expect(buildFlowReminder(flows)).toContain('.flow/a.md — Port inventory (status: active)')
  })

  it('returns [] / null when there is no .flow dir', () => {
    expect(listActiveFlows(join(dir, 'missing'))).toEqual([])
    expect(buildFlowReminder([])).toBeNull()
  })
})

describe('claude-code.buildHookEvent flow attachment', () => {
  const config = { agentClass: 'claude-code', projectSlug: 'p' }
  let dir
  beforeEach(() => {
    dir = join(tmpdir(), `flow-attach-${Date.now()}-${Math.random()}`)
    mkdirSync(join(dir, '.flow'), { recursive: true })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const post = (tool, filePath, extra = {}) => ({
    hook_event_name: 'PostToolUse',
    session_id: 's1',
    cwd: dir,
    tool_name: tool,
    tool_input: { file_path: filePath },
    ...extra,
  })

  it('attaches the full flow file on PostToolUse Edit', () => {
    const abs = join(dir, '.flow', 'inv.md')
    writeFileSync(abs, FLOW)
    const { envelope } = buildHookEvent(config, makeLog(), post('Edit', abs))
    expect(envelope._meta.flowFile).toEqual({ slug: 'inv', absPath: abs, content: FLOW })
  })

  it('resolves relative paths against cwd', () => {
    writeFileSync(join(dir, '.flow', 'rel.md'), FLOW)
    const { envelope } = buildHookEvent(config, makeLog(), post('Write', '.flow/rel.md'))
    expect(envelope._meta.flowFile.slug).toBe('rel')
  })

  it('ignores other tools, other hooks, other files and oversized files', () => {
    const abs = join(dir, '.flow', 'inv.md')
    writeFileSync(abs, FLOW)
    const log = makeLog()
    expect(buildHookEvent(config, log, post('Read', abs)).envelope._meta?.flowFile).toBeUndefined()
    expect(
      buildHookEvent(config, log, post('Edit', abs, { hook_event_name: 'PreToolUse' })).envelope
        ._meta?.flowFile,
    ).toBeUndefined()
    expect(
      buildHookEvent(config, log, post('Edit', join(dir, 'README.md'))).envelope._meta?.flowFile,
    ).toBeUndefined()

    writeFileSync(abs, 'x'.repeat(MAX_FLOW_FILE_BYTES + 1))
    expect(buildHookEvent(config, log, post('Edit', abs)).envelope._meta?.flowFile).toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('too large'))
  })
})
