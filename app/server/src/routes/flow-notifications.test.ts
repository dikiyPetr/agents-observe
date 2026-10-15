import { describe, test, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { SqliteAdapter } from '../storage/sqlite-adapter'
import type { EventStore } from '../storage/types'

type Env = {
  Variables: {
    store: EventStore
    broadcastToSession: (sessionId: string, msg: object) => void
    broadcastToAll: (msg: object) => void
    broadcastActivity: (sessionId: string, eventId: number) => void
  }
}

const EXAMPLE = readFileSync(join(__dirname, '..', 'flow', 'fixtures', 'example.md'), 'utf8').replace(
  /\r\n/g,
  '\n',
)

let store: SqliteAdapter
let app: Hono<Env>
let allBroadcasts: any[]

beforeEach(async () => {
  store = new SqliteAdapter(':memory:')
  allBroadcasts = []
  const { default: eventsRouter } = await import('./events')
  const { default: notificationsRouter } = await import('./notifications')
  const { default: flowsRouter } = await import('./flows')
  app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('store', store as unknown as EventStore)
    c.set('broadcastToSession', () => {})
    c.set('broadcastToAll', (msg) => allBroadcasts.push(msg))
    c.set('broadcastActivity', () => {})
    await next()
  })
  app.route('/api', eventsRouter)
  app.route('/api', notificationsRouter)
  app.route('/api', flowsRouter)
})

let seq = 0
function flowEdit(content: string, timestamp: number, sessionId = 'sess-1') {
  return {
    agentClass: 'claude-code',
    sessionId,
    agentId: sessionId,
    hookName: 'PostToolUse',
    timestamp,
    cwd: '/game',
    payload: {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/game/.flow/inventory.md' },
      seq: seq++, // keep signatures distinct between otherwise identical posts
    },
    _meta: {
      project: { slug: 'game' },
      flowFile: { slug: 'inventory', absPath: '/game/.flow/inventory.md', content },
    },
  }
}

async function post(body: unknown) {
  const res = await app.request('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(201)
  return res
}

async function feed(): Promise<any[]> {
  const res = await app.request('/api/notifications/feed')
  return (await res.json()) as any[]
}

const kinds = (msgs: any[]) =>
  msgs.filter((m) => m.type === 'notification_v2').map((m) => m.data.kind)

describe('flow edits → notifications', () => {
  test('first sighting stores the flow and emits flow_started only', async () => {
    await post(flowEdit(EXAMPLE, 1000))
    expect(kinds(allBroadcasts)).toEqual(['flow_started'])
    expect(allBroadcasts.find((m) => m.type === 'flow_update')?.data).toMatchObject({
      slug: 'inventory',
      status: 'active',
    })

    const projects = await store.getProjects()
    const res = await app.request(`/api/projects/${projects[0].id}/flows/inventory`)
    const flow = (await res.json()) as any
    expect(flow.title).toBe('Порт инвентаря из Godot')
    expect(flow.parsed.progress).toEqual({ done: 2, total: 5 })
    expect(flow.sessions.map((s: any) => s.sessionId)).toEqual(['sess-1'])
  })

  test('journal line + step done produce exactly the new notifications; replay produces none', async () => {
    await post(flowEdit(EXAMPLE, 1000))
    const next = EXAMPLE.replace('- [ ] S3', '- [x] S3').replace(
      '- 14:25 step S1',
      '- 14:40 decision #perf — Кэширую иконки\n- 14:25 step S1',
    )
    allBroadcasts = []
    await post(flowEdit(next, 2000))
    expect(kinds(allBroadcasts)).toEqual(['decision', 'step'])

    // Same content again (e.g. a second Edit that didn't change the file)
    allBroadcasts = []
    await post(flowEdit(next, 3000))
    expect(kinds(allBroadcasts)).toEqual([])

    const rows = await feed()
    // Feed is newest first; rows with the same ts come by id desc.
    expect(rows.map((r) => r.kind)).toEqual(['step', 'decision', 'flow_started'])
    expect(rows[0].flowSlug).toBe('inventory')
  })

  test('an older snapshot arriving late is ignored', async () => {
    await post(flowEdit(EXAMPLE, 1000))
    const newer = EXAMPLE.replace('status: active', 'status: done')
    await post(flowEdit(newer, 3000))
    allBroadcasts = []
    await post(flowEdit(EXAMPLE.replace('## Журнал\n', '## Журнал\n- info — stale\n'), 2000))
    expect(kinds(allBroadcasts)).toEqual([])
    const projects = await store.getProjects()
    const flow = await store.getFlow(projects[0].id, 'inventory')
    expect(flow?.status).toBe('done')
  })
})

describe('native events → notifications', () => {
  const native = (hookName: string, payload: Record<string, unknown>) => ({
    agentClass: 'claude-code',
    sessionId: 'sess-2',
    agentId: 'sess-2',
    hookName,
    timestamp: 5000 + seq++,
    payload: { hook_event_name: hookName, ...payload },
    _meta: { project: { slug: 'game' } },
  })

  test('Notification and Stop become needs_input / finished rows', async () => {
    await post(native('Notification', { notification_type: 'permission_prompt', message: 'Allow Bash?' }))
    await post(native('Stop', { last_assistant_message: 'Done with S2' }))
    await post(native('PreToolUse', { tool_name: 'Read' }))
    const rows = await feed()
    expect(rows.map((r) => [r.kind, r.level, r.title])).toEqual([
      ['finished', 'normal', 'Agent finished'],
      ['needs_input', 'high', 'Permission needed'],
    ])
    expect(rows[0].body).toBe('Done with S2')
  })
})
