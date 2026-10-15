// Plan hierarchy: one flow per agent; a delegated sub-plan points at its
// parent flow (`parentSlug`) and the parent step it implements. Any depth.

import type { FlowSummary } from '@/types/flow'

export interface FlowNode {
  flow: FlowSummary
  children: FlowNode[]
}

/**
 * Build the forest of flows. A flow whose parent is unknown (not in the
 * list) — or that would close a cycle — becomes a root.
 */
export function buildFlowTree(flows: FlowSummary[]): FlowNode[] {
  const nodes = new Map<string, FlowNode>()
  for (const flow of flows) nodes.set(flow.slug, { flow, children: [] })

  const roots: FlowNode[] = []
  for (const node of nodes.values()) {
    const parent = node.flow.parentSlug ? nodes.get(node.flow.parentSlug) : undefined
    if (parent && !isAncestor(node, parent, nodes)) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** True when `candidate` is `node` itself or one of its descendants (would form a cycle). */
function isAncestor(node: FlowNode, candidate: FlowNode, nodes: Map<string, FlowNode>): boolean {
  let cur: FlowNode | undefined = candidate
  const seen = new Set<string>()
  while (cur && !seen.has(cur.flow.slug)) {
    if (cur === node) return true
    seen.add(cur.flow.slug)
    cur = cur.flow.parentSlug ? nodes.get(cur.flow.parentSlug) : undefined
  }
  return false
}

export function findNode(roots: FlowNode[], slug: string): FlowNode | null {
  for (const r of roots) {
    if (r.flow.slug === slug) return r
    const hit = findNode(r.children, slug)
    if (hit) return hit
  }
  return null
}

/** The node and all its descendants, depth-first. */
export function subtree(node: FlowNode): FlowNode[] {
  return [node, ...node.children.flatMap(subtree)]
}

/** Children delegated from a given step of `node` (by `parentStep` or the step's `→ slug`). */
export function childrenOfStep(node: FlowNode, stepId: string): FlowNode[] {
  const stepChild = node.flow.parsed?.steps.find((s) => s.id === stepId)?.child ?? null
  return node.children.filter((c) => c.flow.parentStep === stepId || c.flow.slug === stepChild)
}

/** Children not attached to any existing step of `node`. */
export function unattachedChildren(node: FlowNode): FlowNode[] {
  const steps = node.flow.parsed?.steps ?? []
  return node.children.filter(
    (c) => !steps.some((s) => c.flow.parentStep === s.id || s.child === c.flow.slug),
  )
}

/**
 * Where clicking a plan should take the user: the most recent session in
 * which this plan's own agent worked (falling back to any agent of the
 * subtree), filtered to every agent of the plan and its sub-plans in that
 * session.
 */
export function navigationTarget(node: FlowNode): { sessionId: string; agentIds: string[] } | null {
  const links = subtree(node).flatMap((n) => n.flow.agents)
  const own = node.flow.agents
  const pool = own.length ? own : links
  if (!pool.length) return null
  const latest = pool.reduce((a, b) => (b.lastTs > a.lastTs ? b : a))
  const agentIds = [
    ...new Set(links.filter((l) => l.sessionId === latest.sessionId).map((l) => l.agentId)),
  ]
  return { sessionId: latest.sessionId, agentIds }
}

/**
 * Progress of a plan including its sub-plans: a delegated step counts as the
 * steps of the sub-plan(s) that implement it, recursively.
 */
export function treeProgress(node: FlowNode): { done: number; total: number } {
  let done = 0
  let total = 0
  const add = (p: { done: number; total: number }) => {
    done += p.done
    total += p.total
  }
  for (const step of node.flow.parsed?.steps ?? []) {
    const kids = childrenOfStep(node, step.id)
    if (kids.length) kids.forEach((k) => add(treeProgress(k)))
    else add({ done: step.state === 'done' || step.state === 'skipped' ? 1 : 0, total: 1 })
  }
  unattachedChildren(node).forEach((k) => add(treeProgress(k)))
  return { done, total }
}
