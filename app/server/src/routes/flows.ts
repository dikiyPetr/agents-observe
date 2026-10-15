import { Hono } from 'hono'
import type { EventStore, StoredFlow } from '../storage/types'
import { apiError } from '../errors'

type Env = {
  Variables: {
    store: EventStore
  }
}

const router = new Hono<Env>()

function parseProjectId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** List view: everything except the raw markdown, which only the detail view needs. */
function summarize(flow: StoredFlow) {
  const { content: _content, ...rest } = flow
  return rest
}

// GET /projects/:id/flows — flows of a project, most recently updated first
router.get('/projects/:id/flows', async (c) => {
  const projectId = parseProjectId(c.req.param('id'))
  if (!projectId) return apiError(c, 400, 'Invalid project id')
  const flows = await c.get('store').listFlows(projectId)
  return c.json(flows.map(summarize))
})

// GET /projects/:id/flows/:slug — full flow incl. raw content and executing agents
router.get('/projects/:id/flows/:slug', async (c) => {
  const projectId = parseProjectId(c.req.param('id'))
  if (!projectId) return apiError(c, 400, 'Invalid project id')
  const flow = await c.get('store').getFlow(projectId, c.req.param('slug'))
  if (!flow) return apiError(c, 404, 'Flow not found')
  return c.json(flow)
})

export default router
