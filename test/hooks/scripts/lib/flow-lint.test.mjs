import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { lintFlow } from '../../../../hooks/scripts/lib/flow-lint.mjs'
import { parseFlow as parseGen } from '../../../../hooks/scripts/lib/flow-parse.gen.mjs'
import { parseFlow as parseTs } from '../../../../app/server/src/flow/parse.ts'
import { canGenerate, generate } from '../../../../scripts/gen-flow-parser.mjs'

const ROOT = join(__dirname, '../../../..')

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

const problems = (md, opts) => lintFlow(md, opts).map((p) => p.problem)

describe('lintFlow', () => {
  it('a well-formed flow has no problems', () => {
    expect(lintFlow(GOOD)).toEqual([])
  })

  it('missing frontmatter / steps', () => {
    expect(problems('just text')).toEqual(
      expect.arrayContaining(['no frontmatter', 'no ## Steps section']),
    )
  })

  it('traps the parser accepts silently', () => {
    const md = GOOD.replace('- [ ] S2 Store tags', '### Phase 2\n- [ ] S2 Store tags\n1. [ ] S3 x')
    const p = problems(md)
    expect(p.some((x) => x.includes('sub-heading'))).toBe(true)
    expect(p.some((x) => x.includes('step line not in form'))).toBe(true)
  })

  it('unknown status and # in a value', () => {
    const p = problems(
      GOOD.replace('status: active', 'status: wip').replace('title: Tags', 'title: Tags #1'),
    )
    expect(p).toEqual(
      expect.arrayContaining([
        'unknown status "wip"',
        '`#` in frontmatter value of title (everything after it is cut as a comment)',
      ]),
    )
  })

  it('status problems are tagged kind=status', () => {
    const out = lintFlow(GOOD.replace('status: active', 'status: review'))
    expect(out).toEqual([expect.objectContaining({ kind: 'status' })])
  })

  describe('paths', () => {
    let dir
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'flow-lint-'))
      mkdirSync(join(dir, '.flow'))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('source, dangling arrow and parent are checked against the repo', () => {
      const flowDir = join(dir, '.flow')
      const md = GOOD.replace(
        'status: active',
        'status: active\nsource: docs/plan.md\nparent: big',
      ).replace('S2 Store tags', 'S2 Store tags → child')
      const opts = { absPath: join(flowDir, 'tags.md'), flowDir }
      expect(problems(md, opts)).toEqual([
        expect.stringContaining('.flow/child.md does not exist'),
        'source "docs/plan.md" not found',
        'parent flow .flow/big.md not found',
      ])
      mkdirSync(join(dir, 'docs'))
      writeFileSync(join(dir, 'docs', 'plan.md'), '')
      writeFileSync(join(flowDir, 'child.md'), '')
      writeFileSync(join(flowDir, 'big.md'), '')
      expect(problems(md, opts)).toEqual([])
    })
  })
})

describe('generated hook parser', () => {
  it.skipIf(!canGenerate)('is up to date with app/server/src/flow/parse.ts', () => {
    const current = readFileSync(join(ROOT, 'hooks/scripts/lib/flow-parse.gen.mjs'), 'utf8')
    expect(current.replace(/\r\n/g, '\n')).toBe(generate())
  })

  it('parses like the server parser', () => {
    const fixtures = join(ROOT, 'app/server/src/flow/fixtures')
    const samples = [
      GOOD,
      GOOD.replace('status: active', 'status: review\nsource: docs/x.md'),
      '- [~] loose step\n## Journal\n- 10:00 weird line',
      ...readdirSync(fixtures).map((f) => readFileSync(join(fixtures, f), 'utf8')),
    ]
    for (const md of samples) expect(parseGen(md, 'f')).toEqual(parseTs(md, 'f'))
  })
})
