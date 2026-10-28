#!/usr/bin/env node
// @ts-check
import * as p from '@clack/prompts'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { answerFor, optionChanges, configuredKeys, currentValues, defaultChoice, initialValue } from './options.js'
import { quoteForCmd } from './quote.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'datalogix/claude-config'
const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills')
/** Old skills were always in ~/.claude; settings follow $CLAUDE_CONFIG_DIR. */
const SETTINGS_FILE = path.join(process.env.CLAUDE_CONFIG_DIR || CLAUDE_DIR, 'settings.json')

/** Written by earlier versions into each copied skill: only those are removed. */
const MARKER_FILE = '.claude-config'

const USAGE = `Usage:
  claude-config [install]       ask which mods to install; updates the
                                installed ones
  claude-config install --link  add the marketplace from this clone instead
                                of GitHub (for editing the repository)
  claude-config update          refresh what is installed, without questions
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
 * @typedef {{ ok: boolean, stdout: string, stderr: string }} Result
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
 * @param {T | symbol} value
 * @returns {T}
 */
function exitIfCancelled(value) {
  if (p.isCancel(value)) {
    p.cancel(`Cancelled. ${reloadHint()}`)
    process.exit(1)
  }
  return /** @type {T} */ (value)
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

/** @returns {Mod[]} */
function listMods() {
  return marketplace.plugins.map((/** @type {{ name: string, source: string }} */ plugin) => {
    const manifest = readJson(path.join(ROOT, plugin.source, '.claude-plugin/plugin.json'))
    return {
      name: plugin.name,
      id: `${plugin.name}@${marketplace.name}`,
      description: manifest.description ?? '',
      userConfig: manifest.userConfig ?? {},
    }
  })
}

/**
 * @param {string} message
 * @param {{ name: string, description: string }[]} mods
 * @returns {Promise<string[]>}
 */
async function chooseMods(message, mods) {
  const names = mods.map((mod) => mod.name)
  if (!isInteractive) {
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
    reportFailure(`could not read ${tildify(SKILLS_DIR)}: ${error instanceof Error ? error.message : error}`)
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
 * Only once their mod is installed or unchecked: a failed install never leaves
 * them out.
 *
 * @param {Set<string>} installed
 * @param {string[]} [unchecked] mods the user chose not to install
 * @param {string[]} [names] the old skills, when already listed
 */
function removeOldSkills(installed, unchecked = [], names = listOldSkills()) {
  if (names.length === 0) {
    return
  }
  if (!installed.has(`${SKILLS_MOD}@${marketplace.name}`) && !unchecked.includes(SKILLS_MOD)) {
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
      reportFailure(`could not remove ${tildify(folder)}: ${error instanceof Error ? error.message : error}`)
    }
  }
}

/**
 * @param {string[]} args
 * @param {string} [input]
 * @returns {Result}
 */
function runClaude(args, input) {
  let result = spawnSync('claude', args, { encoding: 'utf8', input })
  // The native installer's claude.exe runs directly; npm's claude.cmd, which
  // Node cannot find without a shell, only through cmd.
  if (isWindows && /** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code === 'ENOENT') {
    result = spawnSync(['claude', ...args.map(quoteForCmd)].join(' '), { encoding: 'utf8', input, shell: true })
  }
  return { ok: !result.error && result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** @returns {boolean} */
function checkClaudeCli() {
  if (runClaude(['--version']).ok) {
    return true
  }
  p.log.warn('mods skipped: the claude CLI is not installed')
  return false
}

/**
 * Undefined when claude fails: an empty list would read as nothing installed.
 *
 * @param {string} label
 * @param {string[]} args
 * @returns {Record<string, unknown>[] | undefined}
 */
function runClaudeList(label, args) {
  const result = runClaude(args)
  if (!checkResult(label, result)) {
    return undefined
  }
  const value = parseJson(result.stdout, [])
  return Array.isArray(value) ? value.filter((item) => item !== null && typeof item === 'object') : []
}

/** @returns {Set<string> | undefined} undefined when claude could not list them */
function listInstalledModIds() {
  const plugins = runClaudeList('could not list the installed mods', ['plugin', 'list', '--json'])
  if (!plugins) {
    return undefined
  }
  return new Set(plugins.map((plugin) => plugin.id).filter((id) => typeof id === 'string'))
}

const RENAMED_MODS = { passos: 'steps', topicos: 'topics' }

/**
 * Only once the new name is installed or unchecked: a failed install never
 * leaves the mod out.
 *
 * @param {Set<string>} installed
 * @param {string[]} [unchecked] mods the user chose not to install
 */
function uninstallRenamedMods(installed, unchecked = []) {
  for (const [oldName, newName] of Object.entries(RENAMED_MODS)) {
    const id = `${oldName}@${marketplace.name}`
    if (!installed.has(id)) {
      continue
    }
    if (!installed.has(`${newName}@${marketplace.name}`) && !unchecked.includes(newName)) {
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
function readOptions(mod) {
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
  const oldEntries = Object.entries(options)
    .filter(([key]) => !Object.hasOwn(mod.userConfig, key))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  if (oldEntries.length > 0) {
    p.log.warn(
      `${mod.name}: ignoring options it no longer has (${oldEntries.join(', ')}); set their replacements, if any, with the install command, and remove them from ${tildify(SETTINGS_FILE)} to stop this warning`,
    )
  }
}

/**
 * `entry` is absent when not added; undefined when claude could not list.
 *
 * @returns {{ entry?: { name: string, repo?: string, path?: string, url?: string, source?: unknown } } | undefined}
 */
function findMarketplace() {
  const list = runClaudeList('marketplace: could not list the marketplaces', [
    'plugin',
    'marketplace',
    'list',
    '--json',
  ])
  return list && { entry: /** @type {any} */ (list.find((item) => item.name === marketplace.name)) }
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
 * Added from another source, it is only pointed out and not refreshed:
 * refreshing would move the mods away from the source asked for (with
 * --link, to GitHub's main).
 *
 * @param {boolean} shouldLink
 * @returns {{ canInstall: boolean, canRefresh: boolean } | undefined}
 */
function ensureMarketplace(shouldLink) {
  const listed = findMarketplace()
  if (!listed) {
    return undefined
  }
  const current = listed.entry
  const requestedSource = shouldLink ? ROOT : REPO
  if (current) {
    const textSource = typeof current.source === 'string' ? current.source : undefined
    const currentSource = current.repo ?? current.path ?? current.url ?? textSource
    const localPath = current.path ?? textSource
    const isOtherSource = shouldLink
      ? localPath === undefined || !isSamePath(localPath, ROOT)
      : githubRepo(current.repo ?? current.url ?? textSource) !== REPO
    if (currentSource && isOtherSource) {
      p.log.warn(
        `marketplace: ${marketplace.name} comes from ${tildify(currentSource)}, not ${tildify(requestedSource)}; to switch, run "claude plugin marketplace remove ${marketplace.name}" (this uninstalls its mods and deletes their options and data) and install again; not updated`,
      )
      return { canInstall: true, canRefresh: false }
    }
    p.log.info(
      `marketplace: ${marketplace.name} (already added${currentSource ? ` from ${tildify(currentSource)}` : ''})`,
    )
    updateMarketplace()
    return { canInstall: true, canRefresh: true }
  }

  const isAdded = checkResult(
    `marketplace: could not add ${requestedSource}`,
    runClaude(['plugin', 'marketplace', 'add', requestedSource]),
  )
  if (isAdded) {
    p.log.success(`marketplace: ${marketplace.name} (${tildify(requestedSource)})`)
  }
  return { canInstall: isAdded, canRefresh: isAdded }
}

/** @returns {boolean} whether the marketplace was updated */
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
function refreshMod(name, id) {
  const result = runClaude(['plugin', 'update', id, '--json'])
  if (!checkResult(name, result)) {
    return
  }
  p.log.success(`refreshed: ${name}`)
  // claude refreshes even when nothing changed; only a new version needs
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
 * @returns {Promise<{ toStore: Record<string, string>, hasChanges: boolean, isSkipped?: boolean }>}
 */
async function askOptions(mod, isInstalled) {
  const options = Object.entries(mod.userConfig)
  if (!isInteractive || options.length === 0) {
    return { toStore: {}, hasChanges: false }
  }

  const currentOptions = isInstalled ? readOptions(mod) : { values: {}, configured: new Set() }
  if (!currentOptions) {
    // Asking from the defaults would show them as the current values.
    return { toStore: {}, hasChanges: false, isSkipped: true }
  }
  const { values: current, configured } = currentOptions

  /** @type {Record<string, string>} */
  const answers = {}
  for (const [key, option] of options) {
    const initial = initialValue(option, current[key], configured.has(key))
    const message = `${mod.name} · ${option.title ?? key}${option.description ? ` — ${option.description}` : ''}`

    let value
    if (option.type === 'boolean') {
      value = String(exitIfCancelled(await p.confirm({ message, initialValue: initial === 'true' })))
    } else if (option.options) {
      value = exitIfCancelled(
        await p.select({
          message,
          options: option.options.map((choice) => ({ value: choice, label: choice })),
          initialValue: option.options.includes(initial) ? initial : defaultChoice(option),
        }),
      )
    } else {
      const prompt = option.sensitive ? p.password : p.text
      value = exitIfCancelled(
        await prompt({
          message,
          initialValue: option.sensitive ? undefined : initial,
          validate: (input) => {
            // Digits only: Number() also takes spaces, line breaks, 0x10 and 1e3.
            if (option.type === 'number' && input && !/^-?\d+(\.\d+)?$/.test(input)) {
              return 'Enter a number.'
            }
          },
        }),
      )
    }

    const answer = answerFor(option, value, initial)
    if (answer !== undefined) {
      answers[key] = answer
    }
  }
  return optionChanges(mod.userConfig, answers, current, configured)
}

/**
 * @param {string} name
 * @param {Set<string>} installed
 */
function warnInline(name, installed) {
  if (installed.has(`${name}@inline`)) {
    p.log.warn(`${name} is also loaded inline from ~/.claude/mods; remove one of them.`)
  }
}

/** @param {boolean} shouldLink */
async function installMods(shouldLink) {
  if (!checkClaudeCli()) {
    return
  }

  const mods = listMods()
  const chosenMods = await chooseMods('Which mods to install?', mods)
  // Nothing chosen: the marketplace is left alone and the installed mods are still uninstalled below.
  const marketplaceState =
    chosenMods.length === 0 ? { canInstall: true, canRefresh: false } : ensureMarketplace(shouldLink)
  if (!marketplaceState) {
    return
  }
  const { canInstall, canRefresh } = marketplaceState
  if (!canInstall) {
    const hint = shouldLink ? '' : `; check access with "git ls-remote https://github.com/${REPO}.git"`
    p.log.warn(`mods skipped (${chosenMods.join(', ')})${hint}`)
  }

  // Without the list every mod would look new: installed again, asked from the defaults.
  const installed = listInstalledModIds()
  if (!installed) {
    return
  }
  for (const mod of mods) {
    const isInstalled = installed.has(mod.id)
    try {
      if (!chosenMods.includes(mod.name)) {
        if (isInstalled && checkResult(mod.name, runClaude(['plugin', 'uninstall', '--keep-data', mod.id]))) {
          p.log.info(`uninstalled: ${mod.name}`)
          installed.delete(mod.id)
          hasModChanges = true
        }
        continue
      }
      if (!canInstall) {
        continue
      }
      // Refreshed first, so the options asked match its userConfig. A failed
      // refresh still asks: configuring does not need the network.
      if (isInstalled && canRefresh) {
        refreshMod(mod.name, mod.id)
      }
      if (isInstalled) {
        warnOldOptions(mod)
      }
      const { toStore, hasChanges, isSkipped } = await askOptions(mod, isInstalled)
      if (isInstalled && !hasChanges) {
        // Without a refresh nothing else names it; a skipped one already has its error.
        if (!canRefresh && !isSkipped) {
          p.log.info(`ok: ${mod.name}`)
        }
        continue
      }
      if (!isInstalled && !installMod(mod.name, installed)) {
        continue
      }
      // Through stdin and not --config: no answer goes through cmd.exe, and a
      // sensitive one stays out of the process list.
      const hasValuesToStore = Object.keys(toStore).length > 0
      if (
        hasValuesToStore &&
        !checkResult(mod.name, runClaude(['plugin', 'configure', mod.id, '--values-stdin'], JSON.stringify(toStore)))
      ) {
        continue
      }
      if (hasValuesToStore) {
        p.log.success(`configured: ${mod.name}`)
        hasModChanges = true
      }
    } finally {
      if (installed.has(mod.id)) {
        warnInline(mod.name, installed)
      }
    }
  }

  const unchecked = mods.map((mod) => mod.name).filter((name) => !chosenMods.includes(name))
  uninstallRenamedMods(installed, unchecked)
  removeOldSkills(installed, unchecked)
}

/** @param {boolean} shouldLink */
async function install(shouldLink) {
  if (shouldLink && ROOT.split(path.sep).includes('node_modules')) {
    throw new Error('--link needs a clone of the repository: run "node bin/cli.js install --link" inside it.')
  }
  await installMods(shouldLink)
}

/**
 * @param {string} name
 * @param {Set<string>} installed gets the mod's id when it installs
 * @returns {boolean} whether it installed
 */
function installMod(name, installed) {
  const id = `${name}@${marketplace.name}`
  if (!checkResult(name, runClaude(['plugin', 'install', id]))) {
    return false
  }
  p.log.success(`installed: ${name}`)
  installed.add(id)
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
    const installed = listInstalledModIds()
    if (installed) {
      removeOldSkills(installed)
    }
    return
  }

  const isUpdated = updateMarketplace()
  const installed = listInstalledModIds()
  if (!installed) {
    return
  }
  // Only after a marketplace update: an older one may not list the new name.
  const installedAfterRenames = new Set(installed)
  for (const [oldName, newName] of Object.entries(RENAMED_MODS)) {
    const id = `${newName}@${marketplace.name}`
    if (!isUpdated || !installed.has(`${oldName}@${marketplace.name}`) || installed.has(id)) {
      continue
    }
    installMod(newName, installedAfterRenames)
  }
  uninstallRenamedMods(installedAfterRenames)
  // Old skills come back as their mod, the same way.
  const skillsModId = `${SKILLS_MOD}@${marketplace.name}`
  const oldSkills = listOldSkills()
  if (isUpdated && !installed.has(skillsModId) && oldSkills.length > 0) {
    installMod(SKILLS_MOD, installedAfterRenames)
  }
  removeOldSkills(installedAfterRenames, [], oldSkills)
  for (const mod of listMods()) {
    if (installed.has(mod.id)) {
      refreshMod(mod.name, mod.id)
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
if (!isCommand || unknownFlag) {
  const problem = isCommand ? `Unknown flag "${unknownFlag}" for ${command}` : `Unknown command "${command}"`
  console.error(`${problem}.\n\n${USAGE}`)
  process.exit(1)
}

p.intro(`claude-config ${command}`)
try {
  await (command === 'install' ? install(flags.includes('--link')) : update())
} catch (error) {
  p.cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
if (hasFailed) {
  p.outro(`Finished with errors (see above). ${reloadHint()}`)
  process.exitCode = 1
} else {
  p.outro(`Done. ${reloadHint()}`)
}
