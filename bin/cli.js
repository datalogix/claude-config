#!/usr/bin/env node
// @ts-check
import * as p from '@clack/prompts'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { answerFor, optionChanges, configuredKeys, currentValues, defaultChoice, initialValue } from './options.js'
import { cmdLine } from './quote.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'datalogix/claude-config'
const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills')
/** Old skills were always in ~/.claude; settings follow $CLAUDE_CONFIG_DIR. */
const SETTINGS_FILE = path.join(process.env.CLAUDE_CONFIG_DIR || CLAUDE_DIR, 'settings.json')

/** A claude call that hangs (network, a git waiting for input) fails after this; tests lower it. */
const CLAUDE_TIMEOUT_MS = Number(process.env.DATALOGIX_CLAUDE_TIMEOUT_MS) || 120_000
/** How long a timed-out claude has to clean up after SIGTERM, before SIGKILL. */
const CLAUDE_KILL_GRACE_MS = 5000
/** How long the output of a finished claude has to close, since a child of it may hold it open. */
const CLAUDE_CLOSE_GRACE_MS = 5000

/** Written by earlier versions into each copied skill: a copy without it is never removed. */
const MARKER_FILE = '.claude-config'

const USAGE = `Usage:
  claude-config               first run: asks the mods and their options;
                              then updates what is installed and asks only
                              about mods not installed yet
  claude-config --configure   ask every mod and option again (also how to
                              remove a mod); without a terminal, installs
                              every mod
  claude-config --link        add the marketplace from this clone instead
                              of GitHub (for editing the repository)
  claude-config --help        show this help

"install" and "update" are still accepted as the command, with the same result.

Through npx, put the flags after the package:
  npx --allow-git=root github:${REPO}#main [--configure]`

/** @type {Record<string, string[]>} */
const COMMANDS = { install: ['--link', '--configure'], update: [] }

const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
const isWindows = process.platform === 'win32'
const marketplace = readJson(path.join(ROOT, '.claude-plugin/marketplace.json'))

let hasFailed = false
let hasModChanges = false

/**
 * @typedef {import('./options.js').Option} Option
 * @typedef {{ name: string, id: string, description: string, userConfig: Record<string, Option> }} Mod
 * @typedef {{ ok: boolean, stdout: string, stderr: string, isTimedOut?: boolean }} Result
 */

/** @param {string} file */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * @param {string} text
 * @param {unknown} fallback
 */
function parseJson(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** @param {string} value */
function tildify(value) {
  const home = os.homedir()
  // Not just a prefix: /Users/developer is not inside a HOME of /Users/dev.
  return value === home || value.startsWith(home + path.sep) ? `~${value.slice(home.length)}` : value
}

function reloadHint() {
  return `Run /clear${hasModChanges ? ' and /reload-plugins' : ''} in open Claude Code sessions.`
}

/**
 * @template T
 * @param {T} value
 * @returns {Exclude<T, symbol>}
 */
function exitIfCancelled(value) {
  if (p.isCancel(value)) {
    p.cancel(`Cancelled. ${reloadHint()}`)
    process.exit(1)
  }
  return /** @type {Exclude<T, symbol>} */ (value)
}

/** @param {string} message */
function reportFailure(message) {
  // A failure may quote a claude that names the marketplace's URL.
  p.log.error(message.replace(/\b(?:https?|ssh|git):\/\/\S+/gi, (url) => withoutCredentials(url)))
  hasFailed = true
}

/**
 * @param {string} label
 * @param {Result} result
 * @returns {boolean} whether the call succeeded
 */
function checkResult(label, result) {
  if (!result.ok) {
    reportFailure(`${label}: ${result.stderr.trim() || 'failed'}`)
  }
  return result.ok
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** @param {string} name */
function modId(name) {
  return `${name}@${marketplace.name}`
}

/**
 * A mod from another repository (`core`, from datalogix/workflows) has no folder here: its description comes
 * from the marketplace entry, and it has no options to ask.
 *
 * @returns {Mod[]}
 */
function listMods() {
  return marketplace.plugins.map((/** @type {{ name: string, source: unknown, description?: string }} */ plugin) => {
    if (typeof plugin.source !== 'string') {
      return { name: plugin.name, id: modId(plugin.name), description: plugin.description ?? '', userConfig: {} }
    }
    const manifest = readJson(path.join(ROOT, plugin.source, '.claude-plugin/plugin.json'))
    return {
      name: plugin.name,
      id: modId(plugin.name),
      description: manifest.description ?? '',
      userConfig: manifest.userConfig ?? {},
    }
  })
}

/**
 * @param {{ name: string, description: string }[]} mods
 * @param {string} message
 * @returns {Promise<string[]>}
 */
async function selectMods(mods, message) {
  const names = mods.map((mod) => mod.name)
  if (!isInteractive || names.length === 0) {
    return names
  }
  return exitIfCancelled(
    await p.multiselect({
      message,
      options: mods.map((mod) => ({ value: mod.name, label: mod.name, hint: mod.description })),
      initialValues: names,
      required: false,
    }),
  )
}

/**
 * A copy with the marker, or a link into a clone (made by install --link).
 *
 * @param {string} folder
 */
function isOwnedSkill(folder) {
  const stat = fs.lstatSync(folder)
  if (!stat.isSymbolicLink()) {
    return fs.existsSync(path.join(folder, MARKER_FILE))
  }
  const target = path.resolve(path.dirname(folder), fs.readlinkSync(folder))
  try {
    return readJson(path.join(target, '../../.claude-plugin/marketplace.json')).name === marketplace.name
  } catch {
    return false
  }
}

/** The mod that ships the skills earlier versions copied into ~/.claude/skills. */
const SKILLS_MOD = 'datalogix'

/** @returns {string[]} */
function listOldSkills() {
  try {
    const names = fs.existsSync(SKILLS_DIR) ? fs.readdirSync(SKILLS_DIR) : []
    return names.filter((name) => isOwnedSkill(path.join(SKILLS_DIR, name)))
  } catch (error) {
    reportFailure(`could not read ${tildify(SKILLS_DIR)}: ${errorMessage(error)}`)
    return []
  }
}

/**
 * Marker last: if this fails halfway, the next run still finds and removes
 * the rest. An unwritable ~/.claude/skills fails before removing anything.
 *
 * @param {string} folder
 */
function removeOldSkill(folder) {
  fs.accessSync(SKILLS_DIR, fs.constants.W_OK)
  if (!fs.lstatSync(folder).isSymbolicLink()) {
    for (const entry of fs.readdirSync(folder)) {
      if (entry !== MARKER_FILE) {
        fs.rmSync(path.join(folder, entry), { recursive: true, force: true })
      }
    }
  }
  fs.rmSync(folder, { recursive: true, force: true })
}

/**
 * Only once their mod is installed or unselected: a failed install never leaves
 * them out.
 *
 * @param {Set<string>} installedIds
 * @param {string[]} unselectedNames mods the user chose not to install
 * @param {string[]} names the old skills
 */
function removeOldSkills(installedIds, unselectedNames, names) {
  if (names.length === 0) {
    return
  }
  if (!installedIds.has(modId(SKILLS_MOD)) && !unselectedNames.includes(SKILLS_MOD)) {
    p.log.warn(
      `kept: ${names.join(', ')} in ~/.claude/skills (${SKILLS_MOD} is not installed yet; run again to replace them)`,
    )
    return
  }
  for (const name of names) {
    const folder = path.join(SKILLS_DIR, name)
    // One folder that cannot be removed does not stop the rest of the run.
    try {
      removeOldSkill(folder)
      p.log.info(`removed: ${tildify(folder)} (skills now ship in the ${SKILLS_MOD} mod)`)
    } catch (error) {
      reportFailure(`could not remove ${tildify(folder)}: ${errorMessage(error)}`)
    }
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {boolean} isShell
 * @param {string} [input]
 * @returns {Promise<{ status?: number | null, error?: Error, stdout: string, stderr: string, isTimedOut: boolean }>}
 */
function spawnClaude(command, args, isShell, input) {
  return new Promise((resolve) => {
    // A git asking for credentials would wait on a prompt nobody sees: it fails instead.
    const child = spawn(command, args, { shell: isShell, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    let stdout = ''
    let stderr = ''
    let isTimedOut = false
    /** @type {NodeJS.Timeout | undefined} */
    let killTimer
    /** @type {NodeJS.Timeout | undefined} */
    let closeTimer
    const timeoutTimer = setTimeout(() => {
      isTimedOut = true
      child.kill('SIGTERM')
      // A process can ignore SIGTERM.
      killTimer = setTimeout(() => child.kill('SIGKILL'), CLAUDE_KILL_GRACE_MS)
    }, CLAUDE_TIMEOUT_MS)
    /** @param {{ status?: number | null, error?: Error }} end */
    const finish = (end) => {
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      clearTimeout(closeTimer)
      // A child that outlives claude could keep these open, and with them this process.
      child.stdout.destroy()
      child.stderr.destroy()
      resolve({ ...end, stdout, stderr, isTimedOut })
    }
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    // A claude that exits without reading its stdin is reported by its exit code.
    child.stdin.on('error', () => {})
    child.stdin.end(input)
    child.on('error', (error) => finish({ error }))
    // Normally on close, which has all the output; a child of claude may hold it open, so exit starts a deadline.
    child.on('exit', (status) => {
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      closeTimer = setTimeout(() => finish({ status }), isTimedOut ? 0 : CLAUDE_CLOSE_GRACE_MS)
    })
    child.on('close', (status) => finish({ status }))
  })
}

/**
 * @param {string[]} args
 * @param {string} [input]
 * @returns {Promise<Result>}
 */
async function runClaude(args, input) {
  let result = await spawnClaude('claude', args, false, input)
  // The native installer's claude.exe runs directly; npm's claude.cmd, which
  // Node cannot find without a shell, only through cmd.
  if (isWindows && errorCode(result.error) === 'ENOENT') {
    result = await spawnClaude(cmdLine('claude', args), [], true, input)
  }
  if (result.isTimedOut) {
    return { ok: false, stdout: '', stderr: `timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`, isTimedOut: true }
  }
  return { ok: !result.error && result.status === 0, stdout: result.stdout, stderr: result.stderr }
}

/** @param {Error | undefined} error */
function errorCode(error) {
  return /** @type {NodeJS.ErrnoException | undefined} */ (error)?.code
}

/** @returns {Promise<boolean>} */
async function checkClaudeCli() {
  const result = await runClaude(['--version'])
  if (result.ok) {
    return true
  }
  // A claude that hangs is there, so skipping the mods is a failure, not a machine without it.
  if (result.isTimedOut) {
    reportFailure(`mods skipped: claude --version ${result.stderr}`)
    return false
  }
  p.log.warn('mods skipped: the claude CLI is not installed')
  return false
}

/**
 * Undefined when claude fails or replies with anything but a list of items
 * holding `key`: returning an empty list then would read as nothing installed.
 *
 * @param {string} label
 * @param {string[]} args
 * @param {string} key
 * @returns {Promise<Record<string, unknown>[] | undefined>}
 */
async function runClaudeList(label, args, key) {
  const result = await runClaude(args)
  if (!checkResult(label, result)) {
    return undefined
  }
  const items = parseJson(result.stdout, undefined)
  if (!Array.isArray(items) || !items.every((item) => typeof item?.[key] === 'string')) {
    const reply = (result.stdout.trim() || result.stderr.trim()).slice(0, 200)
    reportFailure(`${label}: unexpected reply${reply ? ` (${reply})` : ''}`)
    return undefined
  }
  return items
}

/** @returns {Promise<Set<string> | undefined>} undefined when claude could not list them */
async function listInstalledModIds() {
  const mods = await runClaudeList('could not list the installed mods', ['plugin', 'list', '--json'], 'id')
  if (!mods) {
    return undefined
  }
  const cwd = fs.realpathSync(process.cwd())
  const ids = new Set()
  for (const mod of mods) {
    const id = /** @type {string} */ (mod.id)
    // Only the user scope of this marketplace's mods: another project's install is off here and cannot be
    // uninstalled from here. A copy in a skills folder counts in any scope, for warnSkillsFolderCopy.
    if (!id.endsWith(`@${marketplace.name}`) || mod.scope === undefined || mod.scope === 'user') {
      ids.add(id)
    } else if (mod.projectPath === cwd) {
      p.log.warn(`${id} is installed in this project's ${mod.scope} scope, which this command leaves alone.`)
    }
  }
  return ids
}

const RENAMED_MODS = { passos: 'steps', topicos: 'topics' }

/**
 * Only once the new name is installed or unselected: a failed install never
 * leaves the mod out.
 *
 * @param {Set<string>} installedIds
 * @param {string[]} unselectedNames mods the user chose not to install
 */
async function uninstallRenamedMods(installedIds, unselectedNames) {
  for (const [oldName, newName] of Object.entries(RENAMED_MODS)) {
    const id = modId(oldName)
    if (!installedIds.has(id)) {
      continue
    }
    if (!installedIds.has(modId(newName)) && !unselectedNames.includes(newName)) {
      p.log.warn(`kept: ${oldName} (${newName} is not installed yet; run again to replace it)`)
      continue
    }
    if (checkResult(oldName, await runClaude(['plugin', 'uninstall', '--keep-data', id]))) {
      p.log.info(`uninstalled: ${oldName} (renamed to ${newName})`)
      hasModChanges = true
    }
  }
}

/**
 * claude returns every userConfig option, an unconfigured one with its
 * default, and never keys the userConfig no longer has (see warnOldOptions).
 *
 * @param {Mod} mod
 * @returns {Promise<{ values: Record<string, string>, configured: Set<string> } | undefined>}
 */
async function readOptionState(mod) {
  const result = await runClaude(['plugin', 'configure', mod.id, '--json'])
  if (!checkResult(`${mod.name}: could not read its options (skipped configuring)`, result)) {
    return undefined
  }
  const json = parseJson(result.stdout, {})
  const values = currentValues(json?.inputs, mod.userConfig)
  if (!values) {
    p.log.warn(`${mod.name}: could not read its options; skipped configuring`)
    return undefined
  }
  return { values, configured: configuredKeys(json.configured, values, mod.userConfig) }
}

/**
 * Options under keys the userConfig no longer has never reach the mod and
 * `plugin configure --json` leaves them out, so they are read from
 * settings.json (never written).
 *
 * @param {Mod} mod
 */
function warnOldOptions(mod) {
  let options
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    options = settings?.pluginConfigs?.[mod.id]?.options
  } catch {
    return
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return
  }
  // Values are shown so they can be set again; a sensitive option renamed
  // later would be printed too, so rename those with care.
  const oldPairs = Object.entries(options)
    .filter(([key]) => !Object.hasOwn(mod.userConfig, key))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  if (oldPairs.length > 0) {
    p.log.warn(
      `${mod.name}: ignoring options it no longer has (${oldPairs.join(', ')}); set their replacements, if any, with --configure, and remove them from ${tildify(SETTINGS_FILE)} to stop this warning`,
    )
  }
}

/**
 * `entry` is absent when not added; undefined when claude could not list.
 *
 * @returns {Promise<{ entry?: Record<string, unknown> } | undefined>}
 */
async function findMarketplace() {
  const list = await runClaudeList(
    'marketplace: could not list the marketplaces',
    ['plugin', 'marketplace', 'list', '--json'],
    'name',
  )
  return list && { entry: list.find((item) => item.name === marketplace.name) }
}

/** @param {unknown} value */
function textOrUndefined(value) {
  return typeof value === 'string' ? value : undefined
}

/**
 * @param {string} source
 * @returns {string}
 */
function withoutCredentials(source) {
  const url = /^((?:https?|ssh|git):\/\/)(.*)$/i.exec(source)
  if (!url) return source
  const scheme = url[1] ?? ''
  const address = (url[2] ?? '').replace(/[?#].*$/, '')
  const at = address.lastIndexOf('@')
  // The user of an ssh URL (git@host) is no secret; anything else before an @ may be, even with a raw /.
  const isPlainUser = !/^https?/i.test(scheme) && !/[:/]/.test(address.slice(0, at))
  return `${scheme}${at < 0 || isPlainUser ? address : address.slice(at + 1)}`
}

/**
 * Real paths: macOS's /var is a symlink to /private/var.
 *
 * @param {string} a
 * @param {string} b
 */
function isSamePath(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b)
  } catch {
    return path.resolve(a) === path.resolve(b)
  }
}

/**
 * Without --link, the marketplace is updated from whatever source it has. With
 * --link, one added from elsewhere is only pointed out and not updated: that
 * would move the mods away from this clone. `isUpdated` says whether it is
 * known to list this checkout's mods.
 *
 * @param {boolean} shouldLink
 * @returns {Promise<{ canInstall: boolean, canUpdate: boolean, isUpdated: boolean } | undefined>}
 */
async function ensureMarketplace(shouldLink) {
  const listed = await findMarketplace()
  if (!listed) {
    return undefined
  }
  const current = listed.entry
  const requestedSource = shouldLink ? ROOT : REPO
  if (current) {
    const listedPath = textOrUndefined(current.path)
    const textSource = textOrUndefined(current.source)
    const listedSource = textOrUndefined(current.repo) ?? listedPath ?? textOrUndefined(current.url) ?? textSource
    const currentSource = listedSource && withoutCredentials(listedSource)
    const localPath = listedPath ?? textSource
    const isOtherSource = shouldLink && (localPath === undefined || !isSamePath(localPath, ROOT))
    if (currentSource && isOtherSource) {
      p.log.warn(
        `marketplace: ${marketplace.name} comes from ${tildify(currentSource)}, not ${tildify(requestedSource)}; to switch, run "claude plugin marketplace remove ${marketplace.name}" (this uninstalls its mods and deletes their options and data) and run this again; not updated`,
      )
      return { canInstall: true, canUpdate: false, isUpdated: false }
    }
    p.log.info(
      `marketplace: ${marketplace.name} (already added${currentSource ? ` from ${tildify(currentSource)}` : ''})`,
    )
    return { canInstall: true, canUpdate: true, isUpdated: await updateMarketplace() }
  }

  const isAdded = checkResult(
    `marketplace: could not add ${requestedSource}`,
    await runClaude(['plugin', 'marketplace', 'add', requestedSource]),
  )
  if (isAdded) {
    p.log.success(`marketplace: ${marketplace.name} (${tildify(requestedSource)})`)
  }
  return { canInstall: isAdded, canUpdate: isAdded, isUpdated: isAdded }
}

/** @returns {Promise<boolean>} */
async function updateMarketplace() {
  const isUpdated = checkResult('marketplace', await runClaude(['plugin', 'marketplace', 'update', marketplace.name]))
  if (isUpdated) {
    p.log.success(`marketplace: ${marketplace.name} updated`)
  }
  return isUpdated
}

/**
 * @param {string} name
 * @param {string} id
 */
async function updateMod(name, id) {
  const result = await runClaude(['plugin', 'update', id, '--json'])
  if (!checkResult(name, result)) {
    return
  }
  p.log.success(`updated: ${name}`)
  // claude succeeds even when nothing changed; only a new version needs
  // /reload-plugins. A reply without the versions counts as a change.
  const json = parseJson(result.stdout, {})
  if (json?.oldVersion === undefined || json.oldVersion !== json.newVersion) {
    hasModChanges = true
  }
}

/**
 * An option never configured starts from this checkout's default, not the
 * installed version's (`initialValue`).
 *
 * @param {Mod} mod
 * @param {boolean} isInstalled whether to read its current options first
 * @returns {Promise<{ toStore: Record<string, string>, hasChanges: boolean, hasReadFailed?: boolean }>}
 */
async function askOptions(mod, isInstalled) {
  const options = Object.entries(mod.userConfig)
  if (!isInteractive || options.length === 0) {
    return { toStore: {}, hasChanges: false }
  }

  const optionState = isInstalled
    ? await readOptionState(mod)
    : { values: /** @type {Record<string, string>} */ ({}), configured: new Set() }
  if (!optionState) {
    // Asking from the defaults would show them as the current values.
    return { toStore: {}, hasChanges: false, hasReadFailed: true }
  }
  const { values: current, configured } = optionState

  /** @type {Record<string, string>} */
  const answers = {}
  for (const [key, option] of options) {
    const initial = initialValue(option, current[key], configured.has(key))
    const message = `${mod.name} · ${option.title ?? key}${option.description ? ` — ${option.description}` : ''}`

    let rawAnswer
    if (option.type === 'boolean') {
      rawAnswer = String(exitIfCancelled(await p.confirm({ message, initialValue: initial === 'true' })))
    } else if (option.options) {
      rawAnswer = exitIfCancelled(
        await p.select({
          message,
          options: option.options.map((choice) => ({ value: choice, label: choice })),
          initialValue: option.options.includes(initial) ? initial : defaultChoice(option),
        }),
      )
    } else {
      const prompt = option.sensitive ? p.password : p.text
      rawAnswer = exitIfCancelled(
        await prompt({
          message,
          initialValue: option.sensitive ? undefined : initial,
          validate: (input) => {
            // Plain decimals only: Number() also takes spaces, line breaks, 0x10 and 1e3.
            if (option.type === 'number' && input && !/^-?\d+(\.\d+)?$/.test(input)) {
              return 'Enter a number.'
            }
          },
        }),
      )
    }

    const answer = answerFor(option, rawAnswer, initial)
    if (answer !== undefined) {
      answers[key] = answer
    }
  }
  return optionChanges(mod.userConfig, answers, current, configured)
}

/**
 * @param {string} name
 * @param {Set<string>} installedIds
 */
function warnSkillsFolderCopy(name, installedIds) {
  if (installedIds.has(`${name}@skills-dir`)) {
    p.log.warn(`${name} is also loaded from a skills folder (${name}@skills-dir); remove one of them.`)
  }
  const otherId = OTHER_MARKETPLACE_IDS[name]
  if (otherId && installedIds.has(otherId)) {
    p.log.warn(
      `${name} is also installed as ${otherId}, from datalogix/workflows; uninstall that one ("claude plugin uninstall ${otherId}", with --scope for a project's).`,
    )
  }
}

/** The same plugin installed from its own marketplace, as datalogix/workflows' docs suggest. */
const OTHER_MARKETPLACE_IDS = /** @type {Record<string, string>} */ ({ core: 'core@datalogix' })

/**
 * @param {Mod} mod
 * @param {Set<string>} installedIds loses or gets the mod's id when it changes
 * @param {{ isSelected: boolean, canInstall: boolean, canUpdate: boolean, shouldAskInstalled: boolean }} state
 */
async function syncMod(mod, installedIds, { isSelected, canInstall, canUpdate, shouldAskInstalled }) {
  const isInstalled = installedIds.has(mod.id)
  if (!isSelected) {
    if (isInstalled && checkResult(mod.name, await runClaude(['plugin', 'uninstall', '--keep-data', mod.id]))) {
      p.log.info(`uninstalled: ${mod.name}`)
      installedIds.delete(mod.id)
      hasModChanges = true
    }
    return
  }
  if (!canInstall) {
    return
  }
  // Updated first, so the installed version has the options asked, which come
  // from this checkout's plugin.json. A failed update still asks: configuring
  // does not need the network.
  if (isInstalled && canUpdate) {
    await updateMod(mod.name, mod.id)
  }
  if (isInstalled) {
    warnOldOptions(mod)
  }
  const { toStore, hasChanges, hasReadFailed } =
    isInstalled && !shouldAskInstalled
      ? { toStore: {}, hasChanges: false, hasReadFailed: false }
      : await askOptions(mod, isInstalled)
  if (isInstalled && !hasChanges) {
    // Without an update nothing else names it; a skipped one already has its error.
    if (!canUpdate && !hasReadFailed) {
      p.log.info(`unchanged: ${mod.name}`)
    }
    return
  }
  if (!isInstalled && !(await installMod(mod.name, installedIds))) {
    return
  }
  // Through stdin and not --config: no answer goes through cmd.exe, and a
  // sensitive one stays out of the process list.
  const hasValuesToStore = Object.keys(toStore).length > 0
  if (
    hasValuesToStore &&
    checkResult(mod.name, await runClaude(['plugin', 'configure', mod.id, '--values-stdin'], JSON.stringify(toStore)))
  ) {
    p.log.success(`configured: ${mod.name}`)
    hasModChanges = true
  }
}

/**
 * Mods that replace something already on this machine, under another name or as
 * old skills: installed without asking, once the marketplace is known to list them.
 *
 * @param {Set<string>} installedIds
 * @param {string[]} oldSkills
 * @returns {string[]}
 */
function listReplacementMods(installedIds, oldSkills) {
  const names = Object.entries(RENAMED_MODS)
    .filter(([oldName]) => installedIds.has(modId(oldName)))
    .map(([, newName]) => newName)
  if (oldSkills.length > 0) {
    names.push(SKILLS_MOD)
  }
  return names.filter((name) => !installedIds.has(modId(name)))
}

/**
 * The questions depend on the machine. With nothing of this marketplace
 * installed, or with --configure, every mod and option is asked, and an
 * unselected mod is uninstalled. Otherwise what is installed only updates, and
 * only mods not installed yet are offered: nothing records a mod that was
 * refused, or an option answered with its default, so those would come back on
 * every run if they were asked as new.
 *
 * @param {boolean} shouldLink
 * @param {boolean} shouldConfigure
 */
async function run(shouldLink, shouldConfigure) {
  if (shouldLink && ROOT.split(path.sep).includes('node_modules')) {
    throw new Error('--link needs a clone of the repository: run "node bin/cli.js --link" inside it.')
  }
  if (!(await checkClaudeCli())) {
    return
  }
  // Without the list every mod would look new: installed again, asked from the defaults.
  const installedIds = await listInstalledModIds()
  if (!installedIds) {
    return
  }

  const mods = listMods()
  const oldSkills = listOldSkills()
  const isAskingAll = shouldConfigure || ![...installedIds].some((id) => id.endsWith(`@${marketplace.name}`))
  const replacementNames = isAskingAll ? [] : listReplacementMods(installedIds, oldSkills)
  const newMods = mods.filter((mod) => !installedIds.has(mod.id) && !replacementNames.includes(mod.name))
  let selectedNames
  if (isAskingAll) {
    selectedNames = await selectMods(mods, 'Which mods to install?')
  } else {
    // Without a terminal nobody can take a new mod in, or leave it out.
    const chosenNames = isInteractive ? await selectMods(newMods, 'New mods to install?') : []
    selectedNames = mods
      .map((mod) => mod.name)
      .filter((name) => installedIds.has(modId(name)) || chosenNames.includes(name))
  }

  // Nothing selected: the marketplace is left alone and the installed mods are still uninstalled below.
  const marketplaceState =
    isAskingAll && selectedNames.length === 0
      ? { canInstall: true, canUpdate: false, isUpdated: false }
      : await ensureMarketplace(shouldLink)
  if (!marketplaceState) {
    return
  }
  const { canInstall, canUpdate, isUpdated } = marketplaceState
  if (!canInstall) {
    const hint = shouldLink ? '' : `; check access with "git ls-remote https://github.com/${REPO}.git"`
    p.log.warn(`mods skipped (${[...selectedNames, ...replacementNames].join(', ')})${hint}`)
  }

  // Only after a marketplace update: an older one may not list the new name.
  const namesToSync = isUpdated ? [...selectedNames, ...replacementNames] : selectedNames
  for (const mod of mods) {
    await syncMod(mod, installedIds, {
      isSelected: namesToSync.includes(mod.name),
      canInstall,
      canUpdate,
      shouldAskInstalled: shouldConfigure,
    })
    if (installedIds.has(mod.id)) {
      warnSkillsFolderCopy(mod.name, installedIds)
    }
  }

  const unselectedNames = isAskingAll ? mods.map((mod) => mod.name).filter((name) => !selectedNames.includes(name)) : []
  await uninstallRenamedMods(installedIds, unselectedNames)
  removeOldSkills(installedIds, unselectedNames, oldSkills)
}

/**
 * @param {string} name
 * @param {Set<string>} installedIds gets the mod's id when it installs
 * @returns {Promise<boolean>}
 */
async function installMod(name, installedIds) {
  const id = modId(name)
  if (!checkResult(name, await runClaude(['plugin', 'install', id]))) {
    return false
  }
  p.log.success(`installed: ${name}`)
  installedIds.add(id)
  hasModChanges = true
  return true
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

// The command is optional, also before a flag.
const [command, ...flags] = args[0] === undefined || args[0].startsWith('-') ? ['install', ...args] : args
// hasOwn: names from Object.prototype, like toString, are not commands.
const isCommand = Object.hasOwn(COMMANDS, command)
const unknownFlag = isCommand ? flags.find((flag) => !COMMANDS[command].includes(flag)) : undefined
if (!isCommand || unknownFlag !== undefined) {
  const problem = isCommand ? `Unknown flag "${unknownFlag}" for ${command}` : `Unknown command "${command}"`
  console.error(`${problem}.\n\n${USAGE}`)
  process.exit(1)
}

p.intro('claude-config')
try {
  await run(flags.includes('--link'), flags.includes('--configure'))
} catch (error) {
  p.cancel(errorMessage(error))
  process.exit(1)
}
if (hasFailed) {
  p.outro(`Finished with errors (see above). ${reloadHint()}`)
  process.exitCode = 1
} else {
  p.outro(`Done. ${reloadHint()}`)
}
