// hooks/scripts/lib/flow-context.mjs
// `hook-context`: the synchronous flow hooks. They add the flow rules to the
// agent's context at the right moments and check flow files, so the agent
// mirrors whatever plan its own process produced into `.flow/<slug>.md`
// without the rules shaping the plan itself:
//
//   UserPromptSubmit (1st prompt)  short pointer: when to keep a flow, stay silent
//   SessionStart (compact/resume/clear)  pointer again (+ format if a flow is open)
//   PostToolUse Write/Edit         full format once, right after planning ends
//                                  (plan doc written / first work edit);
//                                  lint of flow files; drift of a mirrored plan
//   PostToolUse ExitPlanMode       "plan approved → create the mirror" + format
//   PreToolUse Write/Edit .flow    deny in plan mode; auto-allow otherwise
//   SubagentStart                  "leave .flow alone" (+ handoff rules)
//   Stop                           block once if an own flow is inconsistent
//
// No network. Prints one JSON line or nothing, never fails the hook.
// Rule texts: lib/flow-rules/*.md (English + Russian, picked by the first prompt).

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listFlows, matchFlowPath, readFrontmatter, resolveFlowDir, samePath } from './flow.mjs'
import { lintFlow } from './flow-lint.mjs'
import { cleanupFlowState, loadFlowState, saveFlowState } from './flow-state.mjs'

const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'flow-rules')
/** Claude Code caps hook additionalContext at 10k chars. */
const MAX_CONTEXT_CHARS = 9000

// -- Rule texts --------------------------------------------------------

export function detectLang(text) {
  const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length
  const lat = (text.match(/[A-Za-z]/g) || []).length
  return cyr > lat * 0.5 ? 'ru' : 'en'
}

function rule(name, lang) {
  const ru = join(RULES_DIR, name.replace(/\.(md|json)$/, '.ru.$1'))
  return readFileSync(lang === 'ru' && existsSync(ru) ? ru : join(RULES_DIR, name), 'utf8')
}

function render(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

const slash = (p) => p.replace(/\\/g, '/')

function ctx(event, text) {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: text.slice(0, MAX_CONTEXT_CHARS),
    },
  }
}

function pointerText(flowDir, lang) {
  const flows = listFlows(flowDir).slice(0, 10)
  const list = flows.length
    ? flows
        .map(
          (f) =>
            `- ${f.name} — ${f.title} · ${f.status} · ${f.done}/${f.total} · source: ${f.source || 'none'}`,
        )
        .join('\n')
    : lang === 'ru'
      ? '(пока нет)'
      : '(none yet)'
  return render(rule('session.md', lang), { FLOW_DIR: slash(flowDir) }).replace(
    '{- name.md — title · status · done/total · source}',
    list,
  )
}

// -- Plan documents ----------------------------------------------------

/** Task-list fingerprint: ticking boxes or adding "(done)" is not a plan change. */
export function planFingerprint(abs) {
  try {
    const text = readFileSync(abs, 'utf8')
      .replace(/\[[ xX~\-!]\]/g, '')
      .replace(/\((done|готово|выполнено|completed)\)/gi, '')
      .replace(/[✅✔☑]/g, '')
      .replace(/~~/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return createHash('sha1').update(text).digest('hex')
  } catch {
    return null
  }
}

/** A markdown file that reads like a work plan: plan-ish path or headings, plus ≥3 list items. */
export function looksLikePlan(abs) {
  const path = slash(abs)
  if (
    !/\.md$/i.test(path) ||
    /(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE|CLAUDE|AGENTS)\.md$/i.test(path)
  )
    return false
  if (/(^|\/)\.claude\/(skills|agents|commands)\//.test(path)) return false
  let text = ''
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    return false
  }
  const items = (text.match(/^\s*(?:[-*]\s|\d+[.)]\s|\d+\.\d+\s)/gm) || []).length
  const planPath = /(^|\/)(plans?|design|specs?|roadmap|todo)(\/|[-_.])|plan[^/]*\.md$/i.test(path)
  const planHeads = /^#{1,4}\s*(phase|task|step|stage|plan|этап|фаза|задач|шаг|план)/im.test(text)
  return items >= 3 && (planPath || planHeads)
}

function sourceAbs(flowDir, source, homeDir) {
  const src = homeDir ? source.replace(/^~(?=[\\/]|$)/, homeDir) : source
  return isAbsolute(src) ? src : join(dirname(flowDir), src)
}

// -- Handlers ----------------------------------------------------------

/**
 * Pure-ish handler: payload in, hook output (or null) out. State lives in
 * `<localDataRootDir>/flow-state`. Exported for tests.
 */
export function handleFlowContext(config, p) {
  if (!config.flowEnabled || !p || !p.session_id) return null
  const env = new FlowEnv(config, p)
  switch (p.hook_event_name) {
    case 'SessionStart':
      return env.sessionStart()
    case 'UserPromptSubmit':
      return env.userPromptSubmit()
    case 'SubagentStart':
      return env.subagentStart()
    case 'PreToolUse':
      return env.preToolUse()
    case 'PostToolUse':
      return env.postToolUse()
    case 'Stop':
      return env.stop()
    default:
      return null
  }
}

class FlowEnv {
  constructor(config, p) {
    this.config = config
    this.p = p
    this.flowDir = resolveFlowDir(p.cwd, {
      homeDir: config.homeDir,
      projectDir: config.claudeProjectDir,
    })
    this.state = loadFlowState(config, p.session_id)
  }

  save() {
    saveFlowState(this.config, this.p.session_id, this.state)
  }

  messages() {
    return JSON.parse(rule('messages.json', this.state.lang))
  }

  absToolPath() {
    const fp = this.p.tool_input?.file_path
    if (typeof fp !== 'string' || !fp) return null
    return isAbsolute(fp) ? fp : resolve(this.p.cwd || '.', fp)
  }

  ownedOpen() {
    return Object.values(this.state.owned || {}).filter((abs) => {
      try {
        return (
          (readFrontmatter(readFileSync(abs, 'utf8')).status || 'active').toLowerCase() !== 'done'
        )
      } catch {
        return false
      }
    })
  }

  lint(content, abs, slug) {
    return lintFlow(content, {
      absPath: abs,
      flowDir: this.flowDir || dirname(abs),
      slug,
      homeDir: this.config.homeDir,
    })
  }

  // startup waits for the first prompt (its language picks the rule texts);
  // compact/resume/clear re-inject, plus the format if this session owns an open flow.
  sessionStart() {
    if (this.p.source === 'startup') cleanupFlowState(this.config)
    if (!this.flowDir || this.p.source === 'startup') return null
    const s = this.state
    const lang = s.lang || 'en'
    let text = pointerText(this.flowDir, lang)
    if (this.ownedOpen().length) {
      text += '\n' + rule('format.md', lang)
      s.formatShown = true
    }
    s.pointerShown = true
    this.save()
    return ctx('SessionStart', text)
  }

  userPromptSubmit() {
    const prompt = String(this.p.prompt || '')
    if (prompt.trim().startsWith('/') || !this.flowDir || this.state.pointerShown) return null
    this.state.lang = detectLang(prompt)
    this.state.pointerShown = true
    this.save()
    return ctx('UserPromptSubmit', pointerText(this.flowDir, this.state.lang))
  }

  subagentStart() {
    if (!this.flowDir) return null
    const owned = this.ownedOpen()
    const handoff = owned.length
      ? render(rule('handoff.md', this.state.lang), { FLOW_DIR: slash(dirname(owned[0])) })
      : ''
    return ctx('SubagentStart', rule('subagent.md', this.state.lang).replace('{HANDOFF}', handoff))
  }

  preToolUse() {
    if (!['Write', 'Edit', 'MultiEdit'].includes(this.p.tool_name)) return null
    const abs = this.absToolPath()
    if (!matchFlowPath(abs)) return null
    const decide = (permissionDecision, permissionDecisionReason) => ({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason,
      },
    })
    if (this.p.permission_mode === 'plan') return decide('deny', this.messages().planModeDeny)
    // Fallback: the format is normally shown after planning (PostToolUse); if the
    // agent writes a flow before that, deny once and hand it the format.
    if (!this.state.formatShown && !this.p.agent_id) {
      this.state.formatShown = true
      this.save()
      return decide('deny', this.messages().jitDeny + rule('format.md', this.state.lang))
    }
    return decide('allow', 'flow status file')
  }

  postToolUse() {
    const s = this.state
    const msgs = this.messages()
    if (this.p.tool_name === 'ExitPlanMode') {
      if (!this.flowDir) return null
      const ti = this.p.tool_input || {}
      const tr =
        typeof this.p.tool_response === 'object' && this.p.tool_response ? this.p.tool_response : {}
      const planFile = ti.planFilePath || tr.planFilePath || tr.filePath || ti.filePath || null
      s.formatShown = true
      this.save()
      return ctx(
        'PostToolUse',
        render(msgs.exitPlan, {
          flowDir: slash(this.flowDir),
          planFile: planFile || '<the plan file>',
        }) +
          '\n' +
          rule('format.md', s.lang),
      )
    }
    if (!['Write', 'Edit', 'MultiEdit'].includes(this.p.tool_name)) return null
    const abs = this.absToolPath()
    if (!abs) return null

    const flow = matchFlowPath(abs)
    if (flow) return this.flowWritten(abs, flow.slug, msgs)
    if (!this.flowDir) return null

    const planning = !s.formatShown && !this.p.agent_id && this.p.permission_mode !== 'plan'
    // A work plan document was just written → the format, once, after planning.
    if (planning && looksLikePlan(abs)) {
      s.formatShown = true
      this.save()
      return ctx(
        'PostToolUse',
        render(msgs.planWritten, { file: slash(abs) }) + '\n' + rule('format.md', s.lang),
      )
    }
    // No written plan: the first work edit means planning is over.
    if (planning && s.pointerShown) {
      s.formatShown = true
      this.save()
      return ctx('PostToolUse', msgs.formatOnEdit + rule('format.md', s.lang))
    }
    return this.drift(abs, msgs)
  }

  flowWritten(abs, slug, msgs) {
    let content
    try {
      content = readFileSync(abs, 'utf8')
    } catch {
      return null
    }
    const s = this.state
    s.owned = { ...s.owned, [slug]: abs }
    const src = readFrontmatter(content).source
    if (src) {
      s.srcPrint = {
        ...s.srcPrint,
        [`${slug}.md`]: planFingerprint(
          sourceAbs(this.flowDir || dirname(abs), src, this.config.homeDir),
        ),
      }
    }
    this.save()
    // Status consistency waits for Stop: parallel Edits pass through mixed states.
    const problems = this.lint(content, abs, slug).filter((x) => x.kind !== 'status')
    if (!problems.length) return null
    const shown = problems
      .slice(0, 6)
      .map((x) => `- ${x.line ? `L${x.line}: ` : ''}${x.problem} → ${x.fix}`)
    if (problems.length > 6) shown.push(`(+${problems.length - 6} more)`)
    return ctx(
      'PostToolUse',
      render(msgs.validator, {
        rel: `.flow/${slug}.md`,
        n: problems.length,
        items: shown.join('\n'),
      }),
    )
  }

  // The edited file is the source of an open mirror and its task list changed.
  drift(abs, msgs) {
    const s = this.state
    for (const f of listFlows(this.flowDir)) {
      if (!f.source || f.status === 'done') continue
      if (!samePath(sourceAbs(this.flowDir, f.source, this.config.homeDir), abs)) continue
      const print = planFingerprint(abs)
      if (s.srcPrint?.[f.name] === print) continue
      s.srcPrint = { ...s.srcPrint, [f.name]: print }
      this.save()
      return ctx('PostToolUse', render(msgs.drift, { source: f.source, rel: `.flow/${f.name}` }))
    }
    return null
  }

  // End of the turn: the session's own flows must be consistent. Blocks at most once.
  stop() {
    if (this.p.stop_hook_active) return null
    for (const [slug, abs] of Object.entries(this.state.owned || {})) {
      let content
      try {
        content = readFileSync(abs, 'utf8')
      } catch {
        continue
      }
      const problems = this.lint(content, abs, slug)
      if (!problems.length) continue
      const items = problems
        .slice(0, 6)
        .map((x) => `\n- ${x.line ? `L${x.line}: ` : ''}${x.problem} → ${x.fix}`)
        .join('')
      return {
        decision: 'block',
        reason: render(this.messages().stopFix, { rel: `.flow/${slug}.md`, items }),
      }
    }
    return null
  }
}

// -- Command -----------------------------------------------------------

function readStdin() {
  return new Promise((done) => {
    let input = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (input += chunk))
    process.stdin.on('end', () => done(input))
  })
}

/** hook-context: read the hook payload, print the flow context JSON (or nothing). */
export async function hookContextCommand(config, log) {
  const t0 = Date.now()
  let out = null
  let event = '?'
  try {
    const raw = await readStdin()
    const payload = raw.trim() ? JSON.parse(raw) : null
    event = payload?.hook_event_name || '?'
    out = handleFlowContext(config, payload)
  } catch (err) {
    log.warn(`hook-context failed: ${err.message}`)
    out = null
  }
  if (out) process.stdout.write(JSON.stringify(out) + '\n')
  log.debug(`hook-context ${event}: ${out ? 'context' : 'none'} in ${Date.now() - t0}ms`)
}
