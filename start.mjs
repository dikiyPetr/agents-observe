#!/usr/bin/env node

/**
 * Starts the API server & dashboard UI locally instead of in docker
 *
 * Set AGENTS_OBSERVE_RUNTIME=local|dev in env or claude settings.json to enable auto start to use this script
 * Reads all config from hooks/scripts/lib/config.mjs (central source of truth).
 *
 * Modes:
 *   local — install deps, build client, start server (production-like)
 *   dev   — install deps, start server + client with hot reload
 */

import { execFileSync, spawn } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getConfig,
  getServerEnv,
  getClientEnv,
  initLocalDataDirs,
} from './hooks/scripts/lib/config.mjs'
import { saveServerPortFile, removeServerPortFile } from './hooks/scripts/lib/fs.mjs'

const config = getConfig()
const serverDir = resolve(config.installDir, 'app/server')
const clientDir = resolve(config.installDir, 'app/client')
const isDev = config.isDevRuntime
const skipInstall = process.argv.includes('--skip-install')
// npm/npx are .cmd shims on Windows and can't be spawned without a shell
const shell = process.platform === 'win32'

function run(cmd, args, cwd, env = {}) {
  const rel = cwd.replace(config.installDir + '/', '') || '.'
  console.log(`\n> ${cmd} ${args.join(' ')}  (in ${rel})`)
  execFileSync(cmd, args, { cwd, shell, stdio: 'inherit', env: { ...process.env, ...env } })
}

// 1. Install dependencies
if (skipInstall) {
  console.log('\nSkipping npm install (--skip-install)')
} else {
  run('npm', ['install'], serverDir)
  run('npm', ['install'], clientDir)
}

// 2. Build client (skip in dev — vite serves it directly). With
// --build-if-stale (used by hook auto-start) an up-to-date dist is reused.
if (!isDev) {
  if (process.argv.includes('--build-if-stale') && !clientBuildStale()) {
    console.log('\nClient build is up to date (--build-if-stale)')
  } else {
    run('npm', ['run', 'build'], clientDir, getClientEnv(config))
  }
}

/** True when app/client/dist is missing or older than any client source file. */
function clientBuildStale() {
  let built
  try {
    built = statSync(resolve(clientDir, 'dist/index.html')).mtimeMs
  } catch {
    return true
  }
  const newer = (p) => {
    let st
    try {
      st = statSync(p)
    } catch {
      return false
    }
    if (!st.isDirectory()) return st.mtimeMs > built
    return readdirSync(p).some((name) => newer(resolve(p, name)))
  }
  return ['src', 'public', 'index.html', 'package.json', 'vite.config.ts'].some((p) =>
    newer(resolve(clientDir, p)),
  )
}

// 3. Initialize the local data dirs before starting the server
initLocalDataDirs(config)

// 4. Start server
const serverEnv = getServerEnv(config)

saveServerPortFile(config, config.serverPort)

if (isDev) {
  console.log(`\nStarting dev server on http://localhost:${config.serverPort} (API)\n`)
  console.log(`Starting dev client on http://localhost:${config.clientPort} (UI + proxy)\n`)

  const server = spawn('npm', ['run', 'dev'], {
    cwd: serverDir,
    shell,
    stdio: 'inherit',
    env: { ...process.env, ...serverEnv },
  })

  const client = spawn('npm', ['run', 'dev'], {
    cwd: clientDir,
    shell,
    stdio: 'inherit',
    env: { ...process.env, ...getClientEnv(config) },
  })

  function cleanup() {
    removeServerPortFile(config)
    server.kill('SIGINT')
    client.kill('SIGINT')
  }

  server.on('close', (code) => {
    removeServerPortFile(config)
    client.kill()
    process.exit(code ?? 0)
  })
  client.on('close', () => {
    server.kill()
  })
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
} else {
  console.log(`\nStarting server on http://localhost:${config.serverPort} (API + UI)\n`)

  const server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: serverDir,
    shell,
    stdio: 'inherit',
    env: { ...process.env, ...serverEnv },
  })

  server.on('close', (code) => {
    removeServerPortFile(config)
    process.exit(code ?? 0)
  })
  process.on('SIGINT', () => {
    removeServerPortFile(config)
    server.kill('SIGINT')
  })
  process.on('SIGTERM', () => {
    removeServerPortFile(config)
    server.kill('SIGTERM')
  })
}
