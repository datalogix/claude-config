#!/usr/bin/env node
// @ts-check
import * as p from '@clack/prompts'
import { spawnSync } from 'node:child_process'
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

/** Written by earlier versions into each copied skill: a copy without it is never removed. */
const MARKER_FILE = '.claude-config'

const USAGE = `Usage:
  claude-config [install]       ask which mods to install; updates the
                                installed ones
  claude-config install --link  add the marketplace from this clone instead
                                of GitHub (for editing the repository)
  claude-config update          update what is installed, without questions
  claude-config --help          show this help

Through npx, put the command after the package:
  npx --allow-git=root github:${REPO}#main [update]`

/** @type {Record<string, string[]>} */
const COMMANDS = { install: ['--link'], update: [] }

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
  p.log.error(message)
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

/** @returns {Mod[]} */
function listMods() {
  return marketplace.plugins.map((/** @type {{ name: string, source: string }} */ plugin) => {
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
 * @returns {Promise<string[]>}
 */
async function selectMods(mods) {
  const names = mods.map((mod) => mod.name)
  if (!isInteractive) {
    return names
  }
  return exitIfCancelled(
    await p.multiselect({
      message: 'Which mods to install?',
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
 * @param {string[]} [unselectedNames] mods the user chose not to install
 * @param {string[]} [names] the old skills, when already listed
 */
function removeOldSkills(installedIds, unselectedNames = [], names = listOldSkills()) {
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
 * @param {string[]} args
 * @param {string} [input]
 * @returns {Result}
 */
function runClaude(args, input) {
  /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
  const options = {
    encoding: 'utf8',
    input,
    timeout: CLAUDE_TIMEOUT_MS,
    // A git asking for credentials would wait on a prompt nobody sees: it fails instead.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }
  let result = spawnSync('claude', args, options)
  // The native installer's claude.exe runs directly; npm's claude.cmd, which
  // Node cannot find without a shell, only through cmd.
  if (isWindows && errorCode(result.error) === 'ENOENT') {
    result = spawnSync(cmdLine('claude', args), { ...options, shell: true })
  }
  if (errorCode(result.error) === 'ETIMEDOUT') {
    return { ok: false, stdout: '', stderr: `timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`, isTimedOut: true }
  }
  return { ok: !result.error && result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** @param {Error | undefined} error */
function errorCode(error) {
  return /** @type {NodeJS.ErrnoException | undefined} */ (error)?.code
}

/** @returns {boolean} */
function checkClaudeCli() {
  const result = runClaude(['--version'])
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
 * @returns {Record<string, unknown>[] | undefined}
 */
function runClaudeList(label, args, key) {
  const result = runClaude(args)
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

/** @returns {Set<string> | undefined} undefined when claude could not list them */
function listInstalledModIds() {
  const mods = runClaudeList('could not list the installed mods', ['plugin', 'list', '--json'], 'id')
  if (!mods) {
    return undefined
  }
  return new Set(mods.map((mod) => /** @type {string} */ (mod.id)))
}

const RENAMED_MODS = { passos: 'steps', topicos: 'topics' }

/**
 * Only once the new name is installed or unselected: a failed install never
 * leaves the mod out.
 *
 * @param {Set<string>} installedIds
 * @param {string[]} [unselectedNames] mods the user chose not to install
 */
function uninstallRenamedMods(installedIds, unselectedNames = []) {
  for (const [oldName, newName] of Object.entries(RENAMED_MODS)) {
    const id = modId(oldName)
    if (!installedIds.has(id)) {
      continue
    }
    if (!installedIds.has(modId(newName)) && !unselectedNames.includes(newName)) {
      p.log.warn(`kept: ${oldName} (${newName} is not installed yet; run again to replace it)`)
      continue
    }
    if (checkResult(oldName, runClaude(['plugin', 'uninstall', '--keep-data', id]))) {
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
 * @returns {{ values: Record<string, string>, configured: Set<string> } | undefined}
 */
function readOptionState(mod) {
  const result = runClaude(['plugin', 'configure', mod.id, '--json'])
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
  if (options === null || typeof options !== 'object') {
    return
  }
  // Values are shown so they can be set again; a sensitive option renamed
  // later would be printed too, so rename those with care.
  const oldPairs = Object.entries(options)
    .filter(([key]) => !Object.hasOwn(mod.userConfig, key))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  if (oldPairs.length > 0) {
    p.log.warn(
      `${mod.name}: ignoring options it no longer has (${oldPairs.join(', ')}); set their replacements, if any, with the install command, and remove them from ${tildify(SETTINGS_FILE)} to stop this warning`,
    )
  }
}

/**
 * `entry` is absent when not added; undefined when claude could not list.
 *
 * @returns {{ entry?: Record<string, unknown> } | undefined}
 */
function findMarketplace() {
  const list = runClaudeList(
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
 * Lowercased owner/repo of owner/repo, github:, https://, git+https://,
 * ssh:// or git@github.com: sources, with an optional #ref or @ref. A relative
 * path such as ./owner/repo is not one: GitHub owners hold no dots.
 *
 * @param {unknown} source
 */
function githubRepo(source) {
  if (typeof source !== 'string') {
    return undefined
  }
  const match =
    /^(?:github:|(?:git\+)?(?:https?|ssh):\/\/(?:git@)?(?:www\.)?github\.com\/|git@github\.com:)?([a-z\d-]+\/(?!\.{1,2}(?:[/#@]|$))[\w.-]+?)(?:\.git)?\/?(?:[#@].*)?$/i.exec(
      source,
    )
  return match?.[1].toLowerCase()
}

/**
 * Added from another source, it is only pointed out and not updated:
 * updating would move the mods away from the source asked for (with
 * --link, to GitHub's main).
 *
 * @param {boolean} shouldLink
 * @returns {{ canInstall: boolean, canUpdate: boolean } | undefined}
 */
function ensureMarketplace(shouldLink) {
  const listed = findMarketplace()
  if (!listed) {
    return undefined
  }
  const current = listed.entry
  const requestedSource = shouldLink ? ROOT : REPO
  if (current) {
    const repo = textOrUndefined(current.repo)
    const listedPath = textOrUndefined(current.path)
    const url = textOrUndefined(current.url)
    const textSource = textOrUndefined(current.source)
    const currentSource = repo ?? listedPath ?? url ?? textSource
    const localPath = listedPath ?? textSource
    const isOtherSource = shouldLink
      ? localPath === undefined || !isSamePath(localPath, ROOT)
      : githubRepo(repo ?? url ?? textSource) !== REPO
    if (currentSource && isOtherSource) {
      p.log.warn(
        `marketplace: ${marketplace.name} comes from ${tildify(currentSource)}, not ${tildify(requestedSource)}; to switch, run "claude plugin marketplace remove ${marketplace.name}" (this uninstalls its mods and deletes their options and data) and install again; not updated`,
      )
      return { canInstall: true, canUpdate: false }
    }
    p.log.info(
      `marketplace: ${marketplace.name} (already added${currentSource ? ` from ${tildify(currentSource)}` : ''})`,
    )
    updateMarketplace()
    return { canInstall: true, canUpdate: true }
  }

  const isAdded = checkResult(
    `marketplace: could not add ${requestedSource}`,
    runClaude(['plugin', 'marketplace', 'add', requestedSource]),
  )
  if (isAdded) {
    p.log.success(`marketplace: ${marketplace.name} (${tildify(requestedSource)})`)
  }
  return { canInstall: isAdded, canUpdate: isAdded }
}

/** @returns {boolean} */
function updateMarketplace() {
  const isUpdated = checkResult('marketplace', runClaude(['plugin', 'marketplace', 'update', marketplace.name]))
  if (isUpdated) {
    p.log.success(`marketplace: ${marketplace.name} updated`)
  }
  return isUpdated
}

/**
 * @param {string} name
 * @param {string} id
 */
function updateMod(name, id) {
  const result = runClaude(['plugin', 'update', id, '--json'])
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
    ? readOptionState(mod)
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
function warnInline(name, installedIds) {
  if (installedIds.has(`${name}@inline`)) {
    p.log.warn(`${name} is also loaded inline from ~/.claude/mods; remove one of them.`)
  }
}

/**
 * @param {Mod} mod
 * @param {Set<string>} installedIds loses or gets the mod's id when it changes
 * @param {{ isSelected: boolean, canInstall: boolean, canUpdate: boolean }} state
 */
async function syncMod(mod, installedIds, { isSelected, canInstall, canUpdate }) {
  const isInstalled = installedIds.has(mod.id)
  if (!isSelected) {
    if (isInstalled && checkResult(mod.name, runClaude(['plugin', 'uninstall', '--keep-data', mod.id]))) {
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
    updateMod(mod.name, mod.id)
  }
  if (isInstalled) {
    warnOldOptions(mod)
  }
  const { toStore, hasChanges, hasReadFailed } = await askOptions(mod, isInstalled)
  if (isInstalled && !hasChanges) {
    // Without an update nothing else names it; a skipped one already has its error.
    if (!canUpdate && !hasReadFailed) {
      p.log.info(`unchanged: ${mod.name}`)
    }
    return
  }
  if (!isInstalled && !installMod(mod.name, installedIds)) {
    return
  }
  // Through stdin and not --config: no answer goes through cmd.exe, and a
  // sensitive one stays out of the process list.
  const hasValuesToStore = Object.keys(toStore).length > 0
  if (
    hasValuesToStore &&
    checkResult(mod.name, runClaude(['plugin', 'configure', mod.id, '--values-stdin'], JSON.stringify(toStore)))
  ) {
    p.log.success(`configured: ${mod.name}`)
    hasModChanges = true
  }
}

/** @param {boolean} shouldLink */
async function syncMods(shouldLink) {
  if (!checkClaudeCli()) {
    return
  }

  const mods = listMods()
  const selectedNames = await selectMods(mods)
  // Nothing selected: the marketplace is left alone and the installed mods are still uninstalled below.
  const marketplaceState =
    selectedNames.length === 0 ? { canInstall: true, canUpdate: false } : ensureMarketplace(shouldLink)
  if (!marketplaceState) {
    return
  }
  const { canInstall, canUpdate } = marketplaceState
  if (!canInstall) {
    const hint = shouldLink ? '' : `; check access with "git ls-remote https://github.com/${REPO}.git"`
    p.log.warn(`mods skipped (${selectedNames.join(', ')})${hint}`)
  }

  // Without the list every mod would look new: installed again, asked from the defaults.
  const installedIds = listInstalledModIds()
  if (!installedIds) {
    return
  }
  for (const mod of mods) {
    await syncMod(mod, installedIds, { isSelected: selectedNames.includes(mod.name), canInstall, canUpdate })
    if (installedIds.has(mod.id)) {
      warnInline(mod.name, installedIds)
    }
  }

  const unselectedNames = mods.map((mod) => mod.name).filter((name) => !selectedNames.includes(name))
  uninstallRenamedMods(installedIds, unselectedNames)
  removeOldSkills(installedIds, unselectedNames)
}

/** @param {boolean} shouldLink */
async function install(shouldLink) {
  if (shouldLink && ROOT.split(path.sep).includes('node_modules')) {
    throw new Error('--link needs a clone of the repository: run "node bin/cli.js install --link" inside it.')
  }
  await syncMods(shouldLink)
}

/**
 * @param {string} name
 * @param {Set<string>} installedIds gets the mod's id when it installs
 * @returns {boolean}
 */
function installMod(name, installedIds) {
  const id = modId(name)
  if (!checkResult(name, runClaude(['plugin', 'install', id]))) {
    return false
  }
  p.log.success(`installed: ${name}`)
  installedIds.add(id)
  hasModChanges = true
  return true
}

async function update() {
  if (!checkClaudeCli()) {
    return
  }
  const listed = findMarketplace()
  if (!listed) {
    return
  }
  if (!listed.entry) {
    p.log.warn('mods not installed: run the install command to add them')
    // Skills copied by an earlier version stay, but are pointed out.
    const installedIds = listInstalledModIds()
    if (installedIds) {
      removeOldSkills(installedIds)
    }
    return
  }

  const isMarketplaceUpdated = updateMarketplace()
  const installedIds = listInstalledModIds()
  if (!installedIds) {
    return
  }
  // Apart from installedIds: the update below only goes through the mods that
  // were already installed, not the ones installed here.
  const currentIds = new Set(installedIds)
  // Only after a marketplace update: an older one may not list the new name.
  for (const [oldName, newName] of Object.entries(RENAMED_MODS)) {
    const id = modId(newName)
    if (!isMarketplaceUpdated || !installedIds.has(modId(oldName)) || installedIds.has(id)) {
      continue
    }
    installMod(newName, currentIds)
  }
  uninstallRenamedMods(currentIds)
  // Old skills come back as their mod, the same way.
  const oldSkills = listOldSkills()
  if (isMarketplaceUpdated && !installedIds.has(modId(SKILLS_MOD)) && oldSkills.length > 0) {
    installMod(SKILLS_MOD, currentIds)
  }
  removeOldSkills(currentIds, [], oldSkills)
  for (const mod of listMods()) {
    if (installedIds.has(mod.id)) {
      updateMod(mod.name, mod.id)
      warnOldOptions(mod)
    }
  }
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

const [command = 'install', ...flags] = args
// hasOwn: names from Object.prototype, like toString, are not commands.
const isCommand = Object.hasOwn(COMMANDS, command)
const unknownFlag = isCommand ? flags.find((flag) => !COMMANDS[command].includes(flag)) : undefined
if (!isCommand || unknownFlag !== undefined) {
  const problem = isCommand ? `Unknown flag "${unknownFlag}" for ${command}` : `Unknown command "${command}"`
  console.error(`${problem}.\n\n${USAGE}`)
  process.exit(1)
}

p.intro(`claude-config ${command}`)
try {
  await (command === 'install' ? install(flags.includes('--link')) : update())
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
