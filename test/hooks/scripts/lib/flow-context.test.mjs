import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

import {
  handleFlowContext,
  detectLang,
  looksLikePlan,
} from '../../../../hooks/scripts/lib/flow-context.mjs'

const CLI = join(__dirname, '../../../../hooks/scripts/observe_cli.mjs')

const GOOD = `---
title: Tags
status: active
---
## Goal
Tags on add
## Steps
- [x] S1 Parse flags
- [ ] S2 Store tags
## Journal
- plan #plan — 2 steps
- step S1 — parseArgs done
`

let root, repo, config
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flow-ctx-'))
  repo = join(root, 'repo')
  mkdirSync(join(repo, '.git'), { recursive: true })
  mkdirSync(join(repo, 'src'), { recursive: true })
  config = {
    flowEnabled: true,
    localDataRootDir: join(root, 'data'),
    homeDir: join(root, 'home'),
    claudeProjectDir: null,
  }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

let n = 0
const session = () => `s${++n}`
const ev = (sid, hook_event_name, extra = {}) =>
  handleFlowContext(config, { session_id: sid, cwd: repo, hook_event_name, ...extra })
const context = (out) => out?.hookSpecificOutput?.additionalContext ?? ''
const decision = (out) => out?.hookSpecificOutput?.permissionDecision
const writeFlow = (slug, content) => {
  mkdirSync(join(repo, '.flow'), { recursive: true })
  const abs = join(repo, '.flow', `${slug}.md`)
  writeFileSync(abs, content)
  return abs
}
const post = (sid, abs, extra = {}) =>
  ev(sid, 'PostToolUse', { tool_name: 'Edit', tool_input: { file_path: abs }, ...extra })

describe('pointer', () => {
  it('first prompt gets the pointer in its language, once', () => {
    const sid = session()
    expect(ev(sid, 'SessionStart', { source: 'startup' })).toBeNull()
    const first = context(ev(sid, 'UserPromptSubmit', { prompt: 'Добавь теги в todo-cli' }))
    expect(first).toContain('<flow-rules')
    expect(first).toContain('ТИХО')
    expect(first).toContain(`${repo.replace(/\\/g, '/')}/.flow`)
    expect(first).not.toContain('<flow-format') // format comes after planning
    expect(ev(sid, 'UserPromptSubmit', { prompt: 'ещё' })).toBeNull()
  })

  it('slash commands do not count as the first prompt', () => {
    const sid = session()
    expect(ev(sid, 'UserPromptSubmit', { prompt: '/observe status' })).toBeNull()
    expect(context(ev(sid, 'UserPromptSubmit', { prompt: 'Add tags' }))).toContain('SILENT')
  })

  it('lists existing flows', () => {
    writeFlow('legacy', GOOD.replace('title: Tags', 'title: Legacy cleanup'))
    const out = context(ev(session(), 'UserPromptSubmit', { prompt: 'Add tags' }))
    expect(out).toContain('- legacy.md — Legacy cleanup · active · 1/2 · source: none')
  })

  it('compact re-injects the pointer, plus the format when the session owns an open flow', () => {
    const sid = session()
    ev(sid, 'UserPromptSubmit', { prompt: 'Add tags' })
    expect(context(ev(sid, 'SessionStart', { source: 'compact' }))).not.toContain('<flow-format')
    post(sid, writeFlow('tags', GOOD))
    const again = context(ev(sid, 'SessionStart', { source: 'compact' }))
    expect(again).toContain('<flow-rules')
    expect(again).toContain('<flow-format')
  })

  it('no flow dir in the home directory', () => {
    mkdirSync(config.homeDir, { recursive: true })
    const out = handleFlowContext(config, {
      session_id: session(),
      cwd: config.homeDir,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Add tags',
    })
    expect(out).toBeNull()
  })

  it('flowEnabled=false turns everything off', () => {
    config.flowEnabled = false
    expect(ev(session(), 'UserPromptSubmit', { prompt: 'Add tags' })).toBeNull()
  })
})

describe('format after planning', () => {
  it('a written plan document gets the mirror nudge + format, once', () => {
    const sid = session()
    ev(sid, 'UserPromptSubmit', { prompt: 'Add tags' })
    const plan = join(repo, 'docs', 'design', 'tags.md')
    mkdirSync(join(repo, 'docs', 'design'), { recursive: true })
    writeFileSync(plan, '# Tags\n## Phase 1\n- 1.1 a\n- 1.2 b\n- 1.3 c\n')
    const out = context(post(sid, plan, { tool_name: 'Write' }))
    expect(out).toContain('docs/design/tags.md')
    expect(out).toContain('<flow-format')
    expect(post(sid, plan)).toBeNull()
  })

  it('no plan: the first work edit gets the format', () => {
    const sid = session()
    ev(sid, 'UserPromptSubmit', { prompt: 'Add tags' })
    const code = join(repo, 'src', 'a.js')
    writeFileSync(code, 'x')
    expect(context(post(sid, code))).toContain('<flow-format')
    expect(post(sid, code)).toBeNull()
  })

  it('no format in plan mode or from subagents', () => {
    const sid = session()
    ev(sid, 'UserPromptSubmit', { prompt: 'Add tags' })
    const code = join(repo, 'src', 'a.js')
    writeFileSync(code, 'x')
    expect(post(sid, code, { permission_mode: 'plan' })).toBeNull()
    expect(post(sid, code, { agent_id: 'a1' })).toBeNull()
  })

  it('ExitPlanMode asks for the mirror with the plan file as source', () => {
    const sid = session()
    const out = context(
      ev(sid, 'PostToolUse', {
        tool_name: 'ExitPlanMode',
        tool_input: { plan: '…' },
        tool_response: { filePath: 'C:/plans/p.md' },
      }),
    )
    expect(out).toContain('source: C:/plans/p.md')
    expect(out).toContain('<flow-format')
  })
})

describe('PreToolUse on flow files', () => {
  const pre = (sid, extra = {}) =>
    ev(sid, 'PreToolUse', {
      tool_name: 'Write',
      tool_input: { file_path: join(repo, '.flow', 'tags.md') },
      ...extra,
    })

  it('denies in plan mode', () => {
    expect(decision(pre(session(), { permission_mode: 'plan' }))).toBe('deny')
  })

  it('first write before the format was shown: deny once with the format, then allow', () => {
    const sid = session()
    const first = pre(sid)
    expect(decision(first)).toBe('deny')
    expect(first.hookSpecificOutput.permissionDecisionReason).toContain('<flow-format')
    expect(decision(pre(sid))).toBe('allow')
  })

  it('ignores other files and tools', () => {
    const sid = session()
    expect(
      ev(sid, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: join(repo, 'a.md') } }),
    ).toBeNull()
    expect(ev(sid, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } })).toBeNull()
  })
})

describe('flow writes, drift, Stop', () => {
  it('a valid flow is silent; a broken one gets the validator', () => {
    const sid = session()
    expect(post(sid, writeFlow('tags', GOOD))).toBeNull()
    const out = context(post(sid, writeFlow('tags', '- [x] args.js done\n')))
    expect(out).toContain('.flow/tags.md')
    expect(out).toContain('no frontmatter')
  })

  it('status/step mismatch waits for Stop, which blocks once', () => {
    const sid = session()
    const abs = writeFlow('tags', GOOD.replace('status: active', 'status: done'))
    expect(post(sid, abs)).toBeNull()
    const stop = ev(sid, 'Stop')
    expect(stop.decision).toBe('block')
    expect(stop.reason).toContain('status done but some steps are still open')
    expect(ev(sid, 'Stop', { stop_hook_active: true })).toBeNull()
  })

  it('Stop ignores flows the session does not own', () => {
    writeFlow('other', GOOD.replace('status: active', 'status: done'))
    expect(ev(session(), 'Stop')).toBeNull()
  })

  it('editing a mirrored plan nudges only when its task list changed', () => {
    const sid = session()
    const plan = join(repo, 'docs', 'plan.md')
    mkdirSync(join(repo, 'docs'), { recursive: true })
    writeFileSync(plan, '## Tasks\n- [ ] Task 1\n- [ ] Task 2\n')
    post(
      sid,
      writeFlow('tags', GOOD.replace('status: active', 'status: active\nsource: docs/plan.md')),
    )
    writeFileSync(plan, '## Tasks\n- [x] Task 1\n- [ ] Task 2\n')
    expect(post(sid, plan)).toBeNull()
    writeFileSync(plan, '## Tasks\n- [x] Task 1\n- [ ] Task 2\n- [ ] Task 3\n')
    expect(context(post(sid, plan))).toContain('docs/plan.md')
  })
})

describe('SubagentStart', () => {
  it('leave-alone rules; handoff rules only while the parent owns an open flow', () => {
    const sid = session()
    expect(context(ev(sid, 'SubagentStart'))).not.toContain('[flow-handoff]')
    post(sid, writeFlow('tags', GOOD))
    expect(context(ev(sid, 'SubagentStart'))).toContain('[flow-handoff]')
  })
})

describe('helpers', () => {
  it('detectLang', () => {
    expect(detectLang('Добавь теги в todo-cli')).toBe('ru')
    expect(detectLang('Add tags to the CLI')).toBe('en')
  })

  it('looksLikePlan', () => {
    const f = (rel, text) => {
      const abs = join(repo, rel)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, text)
      return looksLikePlan(abs)
    }
    expect(f('docs/plans/2026-tags.md', '- a\n- b\n- c\n')).toBe(true)
    expect(f('notes.md', '## Phase 1\n1. a\n2. b\n3. c\n')).toBe(true)
    expect(f('README.md', '## Plan\n- a\n- b\n- c\n')).toBe(false)
    expect(f('docs/plans/x.md', '- a\n')).toBe(false)
  })
})

describe('hook-context CLI', () => {
  it('prints one JSON line on stdout and nothing else', () => {
    const r = spawnSync(process.execPath, [CLI, 'hook-context'], {
      input: JSON.stringify({
        session_id: session(),
        cwd: repo,
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Add tags',
      }),
      env: { ...process.env, AGENTS_OBSERVE_LOCAL_DATA_ROOT: config.localDataRootDir },
      encoding: 'utf8',
    })
    expect(r.status).toBe(0)
    const lines = r.stdout.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
  })

  it('garbage stdin → no output, exit 0', () => {
    const r = spawnSync(process.execPath, [CLI, 'hook-context'], {
      input: 'not json',
      env: { ...process.env, AGENTS_OBSERVE_LOCAL_DATA_ROOT: config.localDataRootDir },
      encoding: 'utf8',
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('AGENTS_OBSERVE_FLOW=off → no output', () => {
    const r = spawnSync(process.execPath, [CLI, 'hook-context'], {
      input: JSON.stringify({
        session_id: session(),
        cwd: repo,
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Add tags',
      }),
      env: {
        ...process.env,
        AGENTS_OBSERVE_LOCAL_DATA_ROOT: config.localDataRootDir,
        AGENTS_OBSERVE_FLOW: 'off',
      },
      encoding: 'utf8',
    })
    expect(r.stdout).toBe('')
  })
})

describe('state', () => {
  it('is kept per session under localDataRootDir/flow-state', () => {
    const sid = session()
    ev(sid, 'UserPromptSubmit', { prompt: 'Добавь теги' })
    const state = JSON.parse(
      readFileSync(join(config.localDataRootDir, 'flow-state', `${sid}.json`), 'utf8'),
    )
    expect(state).toMatchObject({ lang: 'ru', pointerShown: true })
  })
})
