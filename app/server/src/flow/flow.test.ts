import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFlow, parseJournalLine } from './parse'
import { diffFlow } from './diff'

// Normalize line endings: git may check the fixture out with CRLF on Windows.
const EXAMPLE = readFileSync(join(__dirname, 'fixtures', 'example.md'), 'utf8').replace(
  /\r\n/g,
  '\n',
)

describe('parseFlow', () => {
  test('parses the example flow', () => {
    const f = parseFlow(EXAMPLE)
    expect(f.title).toBe('Порт инвентаря из Godot')
    expect(f.status).toBe('active')
    expect(f.updated).toBe('2026-10-15T14:25')
    expect(f.goal).toContain('UActorComponent')
    expect(f.steps.map((s) => [s.id, s.state])).toEqual([
      ['S1', 'done'],
      ['S2', 'doing'],
      ['S3', 'todo'],
      ['S4', 'skipped'],
      ['S5', 'blocked'],
    ])
    expect(f.progress).toEqual({ done: 2, total: 5 })
    expect(f.journal).toHaveLength(3)
    expect(f.journal[1]).toMatchObject({
      time: '14:10',
      type: 'deviation',
      level: 'high',
      step: 'S3',
      tags: ['scope'],
      text: 'UI делаю на UMG вместо CommonUI, план изменён',
    })
    expect(f.errors).toEqual([])
  })

  test('works with CRLF line endings and English headings', () => {
    const md =
      '---\r\ntitle: T\r\nstatus: done\r\n---\r\n## Steps\r\n- [x] S1 a\r\n## Journal\r\n- info — finished\r\n'
    const f = parseFlow(md)
    expect(f.status).toBe('done')
    expect(f.steps).toEqual([{ id: 'S1', state: 'done', text: 'a' }])
    expect(f.journal[0]).toMatchObject({ type: 'info', text: 'finished', time: null })
  })

  test('tolerates malformed content and reports errors', () => {
    const md = `---\nstatus: weird\n---\n# Heading title\n## Шаги\n- [ ] no id\n- [?] S2 odd\n## Журнал\n- just some text #risk\n- decision/urgent S1 — bad level\n`
    const f = parseFlow(md)
    expect(f.title).toBe('Heading title')
    expect(f.status).toBe('active')
    expect(f.steps).toEqual([{ id: '#1', state: 'todo', text: 'no id' }])
    expect(f.journal[0]).toMatchObject({
      type: 'info',
      tags: ['risk'],
      text: 'just some text #risk',
    })
    expect(f.journal[1]).toMatchObject({ type: 'decision', level: 'normal', step: 'S1' })
    expect(f.errors).toHaveLength(5)
  })

  test('never throws on garbage', () => {
    expect(() => parseFlow('')).not.toThrow()
    expect(parseFlow('').steps).toEqual([])
  })
})

describe('parseJournalLine', () => {
  test('defaults blocked to high level and collects tags from text', () => {
    const { entry, ok } = parseJournalLine('09:15 blocked S5 — нет SaveGame #risk')
    expect(ok).toBe(true)
    expect(entry).toMatchObject({ type: 'blocked', level: 'high', step: 'S5', tags: ['risk'] })
  })
})

describe('diffFlow', () => {
  const base = parseFlow(EXAMPLE)

  test('first sighting yields a single flow_started', () => {
    const drafts = diffFlow(null, base)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ kind: 'flow_started', dedupKey: 'started' })
  })

  test('identical snapshot yields nothing', () => {
    expect(diffFlow(base, parseFlow(EXAMPLE))).toEqual([])
  })

  test('new journal line + step done with matching journal → one notification each', () => {
    const next = parseFlow(
      EXAMPLE.replace('- [~] S2', '- [x] S2').replace(
        '- 14:25 step S1',
        '- 14:40 decision #perf — Кэширую иконки\n- 14:41 step S2 — Компонент готов\n- 14:25 step S1',
      ),
    )
    const drafts = diffFlow(base, next)
    expect(drafts.map((d) => [d.kind, d.step])).toEqual([
      ['decision', null],
      ['step', 'S2'],
    ])
    expect(drafts[0].tags).toEqual(['perf'])
  })

  test('step done without a journal line still notifies', () => {
    const drafts = diffFlow(base, parseFlow(EXAMPLE.replace('- [ ] S3', '- [x] S3')))
    expect(drafts).toEqual([
      expect.objectContaining({ kind: 'step', step: 'S3', dedupKey: 'step:S3:done' }),
    ])
  })

  test('status change to done / blocked', () => {
    const done = diffFlow(base, parseFlow(EXAMPLE.replace('status: active', 'status: done')))
    expect(done).toEqual([expect.objectContaining({ kind: 'flow_done', level: 'normal' })])
    const blocked = diffFlow(base, parseFlow(EXAMPLE.replace('status: active', 'status: blocked')))
    expect(blocked).toEqual([expect.objectContaining({ kind: 'flow_blocked', level: 'high' })])
  })

  test('dedup keys are stable across snapshots', () => {
    const next = parseFlow(EXAMPLE.replace('## Журнал\n', '## Журнал\n- info — hello\n'))
    const a = diffFlow(base, next)
    const b = diffFlow(
      base,
      parseFlow(EXAMPLE.replace('## Журнал\n', '## Журнал\n- info — hello\n')),
    )
    expect(a[0].dedupKey).toBe(b[0].dedupKey)
  })
})
