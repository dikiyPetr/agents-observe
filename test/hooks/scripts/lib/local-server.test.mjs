import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { localServerProblem } from '../../../../hooks/scripts/lib/local-server.mjs'

describe('localServerProblem', () => {
  let dir
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'local-server-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('needs start.mjs and installed server dependencies', () => {
    expect(localServerProblem({ serverDir: dir })).toMatch(/no start\.mjs/)
    writeFileSync(join(dir, 'start.mjs'), '')
    expect(localServerProblem({ serverDir: dir })).toMatch(/dependencies are not installed/)
    mkdirSync(join(dir, 'app', 'server', 'node_modules'), { recursive: true })
    expect(localServerProblem({ serverDir: dir })).toBeNull()
  })
})
