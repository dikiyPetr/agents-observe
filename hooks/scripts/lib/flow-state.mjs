// hooks/scripts/lib/flow-state.mjs
// Per-session state of the flow context hooks (which flows the session owns,
// whether the rules/format were shown, plan fingerprints for drift checks).
// Stored as <localDataRootDir>/flow-state/<session_id>.json.
// No dependencies - uses only Node.js built-ins.

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

/** State files untouched for this long are deleted on SessionStart. */
export const FLOW_STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const empty = () => ({ owned: {} })

export function flowStateDir(config) {
  return join(config.localDataRootDir, 'flow-state')
}

function stateFile(config, sessionId) {
  if (!sessionId || !/^[\w.-]+$/.test(sessionId)) return null
  return join(flowStateDir(config), `${sessionId}.json`)
}

/** Never throws: a missing or broken file is an empty state. */
export function loadFlowState(config, sessionId) {
  const file = stateFile(config, sessionId)
  if (!file) return empty()
  try {
    return { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    return empty()
  }
}

/** Atomic write (tmp + rename), so a concurrent hook never reads half a file. */
export function saveFlowState(config, sessionId, state) {
  const file = stateFile(config, sessionId)
  if (!file) return
  mkdirSync(flowStateDir(config), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state))
  renameSync(tmp, file)
}

export function cleanupFlowState(config, now = Date.now()) {
  const dir = flowStateDir(config)
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    const file = join(dir, name)
    try {
      if (now - statSync(file).mtimeMs > FLOW_STATE_TTL_MS) unlinkSync(file)
    } catch {}
  }
}
