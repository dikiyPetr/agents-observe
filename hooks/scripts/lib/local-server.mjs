// hooks/scripts/lib/local-server.mjs
// Auto-start for the local/dev runtimes: launches start.mjs from a clone that
// has its dependencies installed, detached, so the server outlives the hook.
// The server stops by itself after AGENTS_OBSERVE_SHUTDOWN_DELAY_MS with no
// connected sessions or dashboard tabs.
// No dependencies - uses only Node.js built-ins.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where start.mjs can run from: `config.serverDir` must contain start.mjs and
 * the installed server dependencies. The plugin cache copy has none, so
 * plugin installs point AGENTS_OBSERVE_SERVER_DIR at a clone.
 */
export function localServerProblem(config) {
  const script = join(config.serverDir, 'start.mjs')
  if (!existsSync(script)) return `no start.mjs in ${config.serverDir}`
  if (!existsSync(join(config.serverDir, 'app', 'server', 'node_modules')))
    return `dependencies are not installed in ${config.serverDir} (run: node start.mjs once there)`
  return null
}

/** Spawn start.mjs detached; output goes to <logsDir>/server.log. Returns an error string or null. */
export function startLocalServer(config, log, env) {
  const problem = localServerProblem(config)
  if (problem) return problem
  mkdirSync(config.logsDir, { recursive: true })
  const out = openSync(join(config.logsDir, 'server.log'), 'a')
  const child = spawn(
    process.execPath,
    [join(config.serverDir, 'start.mjs'), '--skip-install', '--build-if-stale'],
    {
      cwd: config.serverDir,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, out],
      // Same data root as this hook, so the server's DB and port file are the ones the hooks use.
      env: { ...env, AGENTS_OBSERVE_LOCAL_DATA_ROOT: config.localDataRootDir },
    },
  )
  child.on('error', (err) => log.error(`Failed to start local server: ${err.message}`))
  child.unref()
  log.info(
    `Started local server (runtime=${config.runtime}) from ${config.serverDir}, pid ${child.pid}`,
  )
  return null
}
