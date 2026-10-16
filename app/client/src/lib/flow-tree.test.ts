import { describe, test, expect } from 'vitest'
import type { FlowSummary, StepState } from '@/types/flow'
import {
  buildFlowTree,
  childrenOfStep,
  findNode,
  navigationTarget,
  treeProgress,
  unattachedChildren,
} from './flow-tree'

function flow(
  slug: string,
  opts: {
    parent?: string
    parentStep?: string
    steps?: [string, StepState, string?][]
    agents?: [string, string, number][]
  } = {},
): FlowSummary {
  const steps = (opts.steps ?? []).map(([id, state, child]) => ({
    id,
    state,
    text: id,
    child: child ?? null,
  }))
  return {
    id: Math.random(),
    projectId: 1,
    slug,
    absPath: '',
    title: slug,
    status: 'active',
    updatedTs: 0,
    lastSessionId: null,
    parentSlug: opts.parent ?? null,
    parentStep: opts.parentStep ?? null,
    agents: (opts.agents ?? []).map(([sessionId, agentId, lastTs]) => ({
      sessionId,
      agentId,
      firstTs: 0,
      lastTs,
    })),
    parsed: {
      title: slug,
      status: 'active',
      updated: null,
      source: null,
      parent: opts.parent ?? null,
      parentStep: opts.parentStep ?? null,
      goal: '',
      steps,
      journal: [],
      progress: {
        done: steps.filter((s) => s.state === 'done' || s.state === 'skipped').length,
        total: steps.length,
      },
      errors: [],
    },
  }
}

// main → ui (S2) → ui-bindings (S1); main → orphan child without step link
const FLOWS = [
  flow('main', {
    steps: [
      ['S1', 'done'],
      ['S2', 'doing', 'ui'],
      ['S3', 'todo'],
    ],
    agents: [['sess-1', 'sess-1', 10]],
  }),
  flow('ui', {
    parent: 'main',
    parentStep: 'S2',
    steps: [
      ['S1', 'doing'],
      ['S2', 'done'],
    ],
    agents: [['sess-1', 'agent-ui', 20]],
  }),
  flow('ui-bindings', {
    parent: 'ui',
    parentStep: 'S1',
    steps: [
      ['S1', 'done'],
      ['S2', 'todo'],
    ],
    agents: [
      ['sess-1', 'agent-bind', 30],
      ['sess-0', 'agent-old', 5],
    ],
  }),
  flow('notes', { parent: 'main', steps: [['S1', 'todo']], agents: [] }),
  flow('lost-child', { parent: 'missing', agents: [['sess-2', 'x', 1]] }),
]

describe('buildFlowTree', () => {
  test('nests sub-plans at any depth and keeps orphans as roots', () => {
    const roots = buildFlowTree(FLOWS)
    expect(roots.map((r) => r.flow.slug)).toEqual(['main', 'lost-child'])
    const main = roots[0]
    expect(main.children.map((c) => c.flow.slug)).toEqual(['ui', 'notes'])
    expect(findNode(roots, 'ui')!.children.map((c) => c.flow.slug)).toEqual(['ui-bindings'])
  })

  test('breaks parent cycles instead of looping', () => {
    const roots = buildFlowTree([flow('a', { parent: 'b' }), flow('b', { parent: 'a' })])
    expect(roots.length).toBeGreaterThan(0)
  })

  test('step attachment', () => {
    const main = findNode(buildFlowTree(FLOWS), 'main')!
    expect(childrenOfStep(main, 'S2').map((c) => c.flow.slug)).toEqual(['ui'])
    expect(unattachedChildren(main).map((c) => c.flow.slug)).toEqual(['notes'])
  })
})

describe('treeProgress', () => {
  test('replaces delegated steps by their sub-plans, recursively', () => {
    const main = findNode(buildFlowTree(FLOWS), 'main')!
    // main: S1 done, S3 todo; S2 → ui: (S1 → ui-bindings: 1/2) + S2 done; notes: 0/1
    expect(treeProgress(main)).toEqual({ done: 3, total: 6 })
  })
})

describe('navigationTarget', () => {
  test("opens the plan owner's latest session filtered to the whole subtree there", () => {
    const roots = buildFlowTree(FLOWS)
    expect(navigationTarget(findNode(roots, 'main')!)).toEqual({
      sessionId: 'sess-1',
      agentIds: ['sess-1', 'agent-ui', 'agent-bind'],
    })
    expect(navigationTarget(findNode(roots, 'ui')!)).toEqual({
      sessionId: 'sess-1',
      agentIds: ['agent-ui', 'agent-bind'],
    })
  })

  test('falls back to sub-plan agents, or null without any', () => {
    const roots = buildFlowTree(FLOWS)
    expect(navigationTarget(findNode(roots, 'notes')!)).toBeNull()
  })
})
