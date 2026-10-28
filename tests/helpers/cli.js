// Each test file that uses these helpers calls useTempHome() once, at the top.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach } from 'vitest'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const CLI = path.join(ROOT, 'bin/cli.js')
export const MODS = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8')).plugins.map(
  (/** @type {{ name: string }} */ plugin) => plugin.name,
)
/** A mod without special handling, for tests about any mod (datalogix ships the old skills). */
export const PLAIN_MOD = 'steps'

/** Reply to "plugin marketplace list --json": claude-config already added from GitHub. */
export const ADDED_MARKETPLACE = `echo '[{"name":"claude-config","repo":"datalogix/claude-config"}]'`

// Set by useTempHome() before each test: read them inside a test, never when
// the file loads (live bindings, new for each test).
/** @type {string} */
export let tmpDir
/** @type {string} */
export let home
/** @type {string} */
export let binDir

export function useTempHome() {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-config-'))
    home = path.join(tmpDir, 'home')
    binDir = path.join(tmpDir, 'bin')
    fs.mkdirSync(home)
    fs.mkdirSync(binDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
}

/**
 * Writes a fake claude that logs each call's arguments (`claudeCalls`) and
 * what `--values-stdin` reads (`claudeStdin`), then replies by the whole
 * argument list. By default it is installed, with no mods and no
 * marketplaces; any other call prints nothing and succeeds.
 *
 * @param {Record<string, string>} [replies] sh commands by argument list, as
 *   in `'plugin list --json': "echo '[]'"`, over the defaults
 */
export function fakeClaude(replies = {}) {
  const allReplies = {
    '--version': 'echo 2.0.0',
    'plugin list --json': "echo '[]'",
    'plugin marketplace list --json': "echo '[]'",
    ...replies,
  }
  const cases = Object.entries(allReplies)
    .map(([args, body]) => `  "${args}") ${body} ;;`)
    .join('\n')
  // Shell builtins only: PATH holds just the fake claude.
  const logStdinScript = `case "$*" in *--values-stdin) while IFS= read -r line || [ -n "$line" ]; do printf '%s\\n' "$line"; done >> "${path.join(tmpDir, 'stdin')}" ;; esac`
  const file = path.join(binDir, 'claude')
  fs.writeFileSync(
    file,
    `#!/bin/sh\necho "$*" >> "${path.join(tmpDir, 'calls')}"\n${logStdinScript}\ncase "$*" in\n${cases}\nesac\n`,
  )
  fs.chmodSync(file, 0o755)
}

export function claudeCalls() {
  const file = path.join(tmpDir, 'calls')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : []
}

/** What each --values-stdin call read, one line per call. */
export function claudeStdin() {
  const file = path.join(tmpDir, 'stdin')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : []
}

/**
 * @param {string} first
 * @param {string} second
 */
export function assertCalledBefore(first, second) {
  const calls = claudeCalls()
  const [firstIndex, secondIndex] = [calls.indexOf(first), calls.indexOf(second)]
  assert.ok(
    firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex,
    `"${first}" before "${second}" in:\n${calls.join('\n')}`,
  )
}

/**
 * Runs without a terminal, with only HOME, PATH and `env`, nothing from the
 * test's environment.
 *
 * @param {string[]} args
 * @param {string} [cli] another copy of bin/cli.js
 * @param {Record<string, string>} [env]
 * @returns {{ status: number | null, output: string }} stdout followed by stderr in `output`
 */
export function runCli(args, cli = CLI, env = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { HOME: home, PATH: binDir, ...env },
  })
  return { status: result.status, output: result.stdout + result.stderr }
}

/** @param {string} name */
export function skillPath(name) {
  return path.join(home, '.claude/skills', name)
}

/**
 * A skill copied into ~/.claude/skills by an earlier version, with its marker.
 *
 * @param {string} name
 */
export function addOldSkill(name) {
  fs.mkdirSync(skillPath(name), { recursive: true })
  fs.writeFileSync(path.join(skillPath(name), '.claude-config'), '')
}
