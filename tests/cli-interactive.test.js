// bin/cli.js runs in this process, as if in a terminal, with mocked prompts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'
import {
  GITHUB_MARKETPLACE_REPLY,
  assertCalledBefore,
  CLI,
  MODS,
  ROOT,
  binDir,
  claudeCalls,
  claudeStdin,
  fakeClaude,
  home,
  installedMods,
  addOldSkill,
  skillPath,
  tmpDir,
  useTempHome,
} from './helpers/cli.js'

// Hoisted so the vi.mock factory, which runs before the imports, can reach it.
const prompts = vi.hoisted(() => ({
  CANCEL: Symbol('cancel'),
  /** @type {unknown[]} */
  answers: [],
  /** @type {string[]} */
  unexpected: [],
  /** @type {string[]} */
  messages: [],
  /** @type {Record<string, any>[]} */
  questions: [],
}))

vi.mock('@clack/prompts', () => {
  const show = (/** @type {string} */ message) => {
    prompts.messages.push(message)
  }
  const ask = (/** @type {Record<string, any>} */ question) => {
    prompts.questions.push(question)
    if (prompts.answers.length === 0) {
      prompts.unexpected.push(question.message)
      return Promise.reject(new Error(`unexpected prompt: ${question.message}`))
    }
    return Promise.resolve(prompts.answers.shift())
  }
  const askAs = (/** @type {string} */ kind) => (/** @type {Record<string, any>} */ question) =>
    ask({ ...question, kind })
  return {
    intro: show,
    outro: show,
    cancel: show,
    log: { info: show, warn: show, success: show, error: show },
    multiselect: askAs('multiselect'),
    confirm: askAs('confirm'),
    select: askAs('select'),
    text: askAs('text'),
    password: (/** @type {Record<string, any>} */ question) => ask({ ...question, kind: 'password', isPassword: true }),
    isCancel: (/** @type {unknown} */ value) => value === prompts.CANCEL,
  }
})

useTempHome()

/**
 * Every answer must be asked for, and nothing more.
 *
 * @param {unknown[]} answers
 * @param {string[]} [args]
 * @param {{ isStdinTty?: boolean, isStdoutTty?: boolean }} [terminal]
 * @returns {Promise<{ status: number, output: string }>} the exit code, and the
 *   messages shown (intro, log, cancel, outro) up to the first exit
 */
async function runInteractive(answers, args = ['install'], { isStdinTty = true, isStdoutTty = true } = {}) {
  prompts.answers = [...answers]
  prompts.messages = []
  prompts.questions = []
  prompts.unexpected = []
  vi.stubEnv('HOME', home)
  vi.stubEnv('PATH', binDir)
  // Empty reads as unset (cli.js uses ||): settings.json comes from HOME.
  vi.stubEnv('CLAUDE_CONFIG_DIR', '')
  const { argv } = process
  const tty = [process.stdin.isTTY, process.stdout.isTTY]
  const { exitCode } = process
  process.argv = [process.execPath, CLI, ...args]
  process.stdin.isTTY = isStdinTty
  process.stdout.isTTY = isStdoutTty
  // The output ends at the first exit: the CLI's own catch sees the thrown
  // error and would print it.
  /** @type {number | undefined} */
  let shownCount
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    shownCount ??= prompts.messages.length
    throw new Error(`exit ${code}`)
  })
  try {
    // In a worker thread os.homedir() ignores the stub: the CLI would work on the real ~/.claude.
    assert.equal(os.homedir(), home, 'bin/cli.js would see the real HOME')
    // A fresh module each run: it reads HOME and the terminal when loaded.
    vi.resetModules()
    await import('../bin/cli.js').catch((error) => {
      if (!/^exit /.test(error.message)) throw error
    })
    assert.deepEqual(prompts.unexpected, [], 'prompts without an answer')
    assert.deepEqual(prompts.answers, [], 'answers never asked for')
    const status = exitSpy.mock.calls[0]?.[0] ?? process.exitCode ?? 0
    return { status: Number(status), output: prompts.messages.slice(0, shownCount).join('\n') }
  } finally {
    exitSpy.mockRestore()
    vi.unstubAllEnvs()
    process.argv = argv
    ;[process.stdin.isTTY, process.stdout.isTTY] = tty
    process.exitCode = exitCode
  }
}

describe('prompts', { skip: process.platform === 'win32' }, () => {
  const STATUS_MANIFEST = path.join(ROOT, 'mods/status/.claude-plugin/plugin.json')
  // Fixed, so an option added to or changed in the status mod does not touch tests about the installer.
  const STATUS_OPTIONS = {
    minSeconds: { type: 'number', title: 'Seconds', description: 'Minimum', default: 30 },
    planAlert: { type: 'number', title: 'Alert', description: 'Percent', default: 90 },
    notify: { type: 'string', title: 'Notify', description: 'When', options: ['always', 'agents'], default: 'always' },
    excerpt: { type: 'boolean', title: 'Excerpt', description: 'Show it', default: false },
  }
  /** The options the status manifest declares for this test; undefined leaves the real ones. */
  let statusOptions = /** @type {Record<string, unknown> | undefined} */ (STATUS_OPTIONS)

  beforeEach(() => {
    statusOptions = STATUS_OPTIONS
    const { readFileSync } = fs
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      const text = readFileSync(file, options)
      if (file !== STATUS_MANIFEST || !statusOptions) return text
      return JSON.stringify({ ...JSON.parse(String(text)), userConfig: statusOptions })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const READ_STATUS_OPTIONS = 'plugin configure status@claude-config --json'
  const STATUS_DEFAULTS_REPLY = `echo '{"inputs":{"minSeconds":30,"planAlert":90,"notify":"always","excerpt":false},"configured":[]}'`
  // Answers at the defaults: an empty answer to a number keeps where the question started
  // (answerFor), and notify and excerpt get their default. STATUS_OPTIONS asks
  // minSeconds, planAlert, notify and excerpt, in that order.
  const STATUS_DEFAULT_ANSWERS = ['', '', 'always', false]
  const STATUS_CHANGED_ANSWERS = ['10', '', 'always', false]
  // An update that found no new version, so it needs no /reload-plugins.
  const UNCHANGED_UPDATE_REPLY = `echo '{"oldVersion":"a","newVersion":"a"}'`

  test('uninstalls an installed mod left unselected, keeping its data', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status', 'steps'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = await runInteractive([MODS.filter((name) => name !== 'status')])

    assert.equal(status, 0, output)
    assert.match(output, /uninstalled: status/)
    const calls = claudeCalls()
    assert.deepEqual(
      calls.filter((call) => call.startsWith('plugin uninstall')),
      ['plugin uninstall --keep-data status@claude-config'],
    )
    assert.ok(!calls.includes('plugin update status@claude-config --json'))
    assert.ok(!calls.includes(READ_STATUS_OPTIONS))
    assert.match(output, /reload-plugins/)
  })

  test('ends with exit code 1 when an unselected mod fails to uninstall', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin uninstall --keep-data status@claude-config': 'echo busy >&2; exit 1',
    })

    const { status, output } = await runInteractive([MODS.filter((name) => name !== 'status')])

    assert.equal(status, 1, output)
    assert.match(output, /status: busy/)
    assert.doesNotMatch(output, /uninstalled: status/)
  })

  test('does not uninstall an unselected mod that is only in the scope of another project', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config","scope":"project"}]'`,
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = await runInteractive([MODS.filter((name) => name !== 'status')])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin uninstall')))
  })

  test('warns about an unselected mod also loaded from a skills folder only while it stays installed', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status', 'status@skills-dir', 'steps', 'steps@skills-dir'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin uninstall --keep-data status@claude-config': 'echo busy >&2; exit 1',
    })

    const { output } = await runInteractive([MODS.filter((name) => name !== 'status' && name !== 'steps')])

    assert.match(output, /status is also loaded from a skills folder/)
    assert.match(output, /uninstalled: steps/)
    assert.doesNotMatch(output, /steps is also loaded from a skills folder/)
  })

  test('with nothing selected, uninstalls every mod, renamed ones and old skills included', async () => {
    fakeClaude({
      'plugin list --json': installedMods('steps', 'passos'),
    })
    addOldSkill('review')

    const { status, output } = await runInteractive([[]])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(!calls.some((call) => call.startsWith('plugin marketplace')))
    assert.ok(!calls.some((call) => call.startsWith('plugin install')))
    assert.ok(calls.includes('plugin uninstall --keep-data steps@claude-config'))
    assert.ok(calls.includes('plugin uninstall --keep-data passos@claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
  })

  test('removes the old skills when datalogix is left unselected', async () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })
    addOldSkill('review')

    const { status, output } = await runInteractive([['steps']])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
  })

  test('stores through stdin only the answers that differ from the default', async () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    const { status, output } = await runInteractive([['status'], ...STATUS_CHANGED_ANSWERS])

    assert.equal(status, 0, output)
    assert.deepEqual(claudeStdin(), ['{"minSeconds":"10"}'])
    const calls = claudeCalls()
    assert.ok(!calls.includes(READ_STATUS_OPTIONS), 'a mod not installed has no options to read')
    assertCalledBefore('plugin install status@claude-config', 'plugin configure status@claude-config --values-stdin')
    assert.ok(!calls.some((call) => call.includes('10')), 'an answer went through the arguments')
    assert.match(output, /configured: status/)
  })

  test('ends with exit code 1, not configured, when the answers fail to store', async () => {
    fakeClaude({
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin configure status@claude-config --values-stdin': 'echo invalid >&2; exit 1',
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_CHANGED_ANSWERS])

    assert.equal(status, 1, output)
    assert.match(output, /status: invalid/)
    assert.doesNotMatch(output, /configured: status/)
  })

  test('stores nothing for an installed mod answered with its current values', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().some((call) => call.endsWith('--values-stdin')))
    assert.doesNotMatch(output, /configured: status|unchanged: status/)
  })

  test('asks for /reload-plugins when storing the options is the only change', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
      'plugin update status@claude-config --json': UNCHANGED_UPDATE_REPLY,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_CHANGED_ANSWERS])

    assert.equal(status, 0, output)
    assert.match(output, /configured: status/)
    assert.match(output, /and \/reload-plugins/)
  })

  test('names an unchanged mod when it was not updated', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'`,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.equal(status, 0, output)
    assert.match(output, /unchanged: status/)
  })

  test('starts each question from the configured value, else from the default in this checkout', async () => {
    // minSeconds is configured, so it starts from 45; planAlert is not, so it
    // starts from this checkout's 90, not the installed version's 75.
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: `echo '{"inputs":{"minSeconds":45,"planAlert":75,"notify":"agents","excerpt":true},"configured":["minSeconds","notify","excerpt"]}'`,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.equal(status, 0, output)
    const [, minSeconds, planAlert, notify, excerpt] = prompts.questions
    assert.equal(minSeconds.initialValue, '45')
    assert.equal(planAlert.initialValue, '90')
    assert.equal(notify.initialValue, 'agents')
    assert.equal(excerpt.initialValue, true)
  })

  test('names the mod, the title and the description in each question of the real status manifest', async () => {
    statusOptions = undefined
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })
    /** @type {{ title: string, description: string, type: string, default: unknown, options?: string[] }[]} */
    const options = Object.values(JSON.parse(fs.readFileSync(STATUS_MANIFEST, 'utf8')).userConfig)
    const answers = options.map((option) => (option.type === 'boolean' ? false : option.options ? option.default : ''))

    const { status, output } = await runInteractive([['status'], ...answers])

    assert.equal(status, 0, output)
    assert.deepEqual(
      prompts.questions.slice(1).map((question) => question.message),
      options.map((option) => `status · ${option.title} — ${option.description}`),
    )
  })

  test.each([
    ['stdin', { isStdinTty: false }],
    ['stdout', { isStdoutTty: false }],
  ])('asks nothing and installs every mod when %s is not a terminal', async (_, terminal) => {
    fakeClaude()

    const { status, output } = await runInteractive([], ['install'], terminal)

    assert.equal(status, 0, output)
    assert.deepEqual(prompts.questions, [])
    for (const name of MODS) assert.ok(claudeCalls().includes(`plugin install ${name}@claude-config`), name)
  })

  test('starts a select holding a value that is not one of its choices from the default in this checkout', async () => {
    // With "agents" as the default, the default and the first choice differ.
    statusOptions = { ...STATUS_OPTIONS, notify: { ...STATUS_OPTIONS.notify, default: 'agents' } }
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: `echo '{"inputs":{"minSeconds":30,"planAlert":90,"notify":"bogus","excerpt":false},"configured":["notify"]}'`,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.equal(status, 0, output)
    assert.equal(prompts.questions[3].initialValue, 'agents')
  })

  describe('a sensitive option', () => {
    const SECRET = 's3cret'

    /** @param {string} answer */
    async function answerSensitiveOption(answer) {
      statusOptions = { token: { type: 'string', title: 'Token', sensitive: true } }
      fakeClaude({
        'plugin list --json': installedMods('status'),
        'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
        [READ_STATUS_OPTIONS]: `echo '{"inputs":{"token":"****"},"configured":["token"]}'`,
      })
      return runInteractive([['status'], answer])
    }

    test('is asked without showing its current value', async () => {
      const { status, output } = await answerSensitiveOption('')

      assert.equal(status, 0, output)
      assert.equal(prompts.questions[1].isPassword, true)
      assert.equal(prompts.questions[1].initialValue, undefined)
    })

    test('stores nothing when the answer is empty', async () => {
      const { status, output } = await answerSensitiveOption('')

      assert.equal(status, 0, output)
      assert.ok(!claudeCalls().some((call) => call.includes('--values-stdin')))
      assert.doesNotMatch(output, /configured: status/)
    })

    test('sends a filled answer only through stdin', async () => {
      const { status, output } = await answerSensitiveOption(SECRET)

      assert.equal(status, 0, output)
      assert.deepEqual(claudeStdin(), [JSON.stringify({ token: SECRET })])
      assert.ok(!claudeCalls().some((call) => call.includes(SECRET)))
      assert.doesNotMatch(output, new RegExp(SECRET))
    })
  })

  test('counts as configured the options that differ from the default when the reply has no configured list', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: `echo '{"inputs":{"minSeconds":45,"planAlert":90,"notify":"always","excerpt":false}}'`,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.equal(status, 0, output)
    assert.equal(prompts.questions[1].initialValue, '45')
    // minSeconds kept at 45 is no change; the rest stay unstored defaults.
    assert.ok(!claudeCalls().some((call) => call.endsWith('--values-stdin')))
  })

  test('still asks the options when the update fails', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin update status@claude-config --json': 'echo offline >&2; exit 1',
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_CHANGED_ANSWERS])

    assert.equal(status, 1, output)
    assert.match(output, /status: offline/)
    assert.deepEqual(claudeStdin(), ['{"minSeconds":"10"}'])
    assert.match(output, /configured: status/)
  })

  test('does not configure a mod that fails to install', async () => {
    fakeClaude({
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin install status@claude-config': 'echo broken >&2; exit 1',
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_CHANGED_ANSWERS])

    assert.equal(status, 1, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin configure')))
    assert.doesNotMatch(output, /configured: status/)
  })

  test('without the marketplace, still uninstalls the unselected mods and installs none', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace add datalogix/claude-config': 'echo denied >&2; exit 1',
    })

    const { status, output } = await runInteractive([['steps']])

    assert.equal(status, 1, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin uninstall --keep-data status@claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin install')))
    assert.match(output, /mods skipped \(steps\)/)
  })

  test('accepts only plain numbers in a number option', async () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    const { validate } = prompts.questions[1]
    for (const input of ['1e3', '0x10', ' 5', '5\n', 'abc']) {
      assert.equal(validate(input), 'Enter a number.', JSON.stringify(input))
    }
    for (const input of ['', '5', '-5', '2.5']) {
      assert.equal(validate(input), undefined, JSON.stringify(input))
    }
  })

  test('asks each option with the prompt of its type and its choices', async () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.deepEqual(
      prompts.questions.map((question) => question.kind),
      ['multiselect', 'text', 'text', 'select', 'confirm'],
    )
    assert.deepEqual(prompts.questions[3].options, [
      { value: 'always', label: 'always' },
      { value: 'agents', label: 'agents' },
    ])
  })

  test('offers each mod with its description', async () => {
    fakeClaude()

    await runInteractive([[]])

    const { options } = prompts.questions[0]
    assert.deepEqual(
      options.map((/** @type {{ value: string }} */ option) => option.value),
      MODS,
    )
    const { description } = JSON.parse(fs.readFileSync(STATUS_MANIFEST, 'utf8'))
    assert.equal(options.find((/** @type {{ value: string }} */ option) => option.value === 'status').hint, description)
  })

  test.each([
    ['its title', { type: 'string', title: 'Label' }, 'status · Label'],
    ['its key, without a title', { type: 'string' }, 'status · label'],
  ])('names an option without a description by %s', async (_, option, message) => {
    statusOptions = { label: option }
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    await runInteractive([['status'], ''])

    assert.equal(prompts.questions[1].message, message)
  })

  test('accepts any text in an option that is not a number', async () => {
    statusOptions = { label: { type: 'string', title: 'Label' } }
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    await runInteractive([['status'], ''])

    assert.equal(prompts.questions[1].validate('abc'), undefined)
  })

  test.each([
    ['fails', 'echo broken >&2; exit 1', /could not read its options \(skipped configuring\)/, 1],
    ['replies without inputs', "echo '{}'", /could not read its options; skipped configuring/, 0],
    ['replies with null', 'echo null', /could not read its options; skipped configuring/, 0],
    ['replies with something that is not JSON', 'echo not json', /could not read its options; skipped configuring/, 0],
  ])('skips configuring a mod when claude %s reading its options', async (_, reply, message, code) => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: reply,
    })

    const { status, output } = await runInteractive([['status']])

    assert.equal(status, code, output)
    assert.match(output, message)
    assert.equal(prompts.questions.length, 1, 'asked only which mods')
    assert.ok(!claudeCalls().some((call) => call.endsWith('--values-stdin')))
  })

  test('does not name a mod unchanged when its options cannot be read and it was not updated', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'`,
      [READ_STATUS_OPTIONS]: 'echo broken >&2; exit 1',
    })

    const { status, output } = await runInteractive([['status']])

    assert.equal(status, 1, output)
    assert.match(output, /could not read its options \(skipped configuring\)/)
    assert.doesNotMatch(output, /unchanged: status/)
  })

  test('asks for /reload-plugins when an uninstall is the only change', async () => {
    fakeClaude({ 'plugin list --json': installedMods('status') })

    const { status, output } = await runInteractive([[]])

    assert.equal(status, 0, output)
    assert.match(output, /and \/reload-plugins/)
  })

  test('offers every mod selected and lets the user select none', async () => {
    fakeClaude()

    const { status, output } = await runInteractive([[]])

    assert.equal(status, 0, output)
    assert.deepEqual(prompts.questions[0].initialValues, MODS)
    assert.equal(prompts.questions[0].required, false)
  })

  test('stores nothing for a new mod answered with the defaults', async () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    const { status, output } = await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.equal(status, 0, output)
    assert.ok(claudeCalls().includes('plugin install status@claude-config'))
    assert.ok(!claudeCalls().some((call) => call.endsWith('--values-stdin')))
    assert.doesNotMatch(output, /configured: status/)
  })

  test('updates an installed mod before reading its options', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_DEFAULT_ANSWERS])

    assert.equal(status, 0, output)
    assertCalledBefore('plugin update status@claude-config --json', READ_STATUS_OPTIONS)
  })

  test('update asks nothing in a terminal', async () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([], ['update'])

    assert.equal(status, 0, output)
    assert.deepEqual(prompts.questions, [])
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin configure')))
  })

  test.each([
    ['text', []],
    ['select', ['', '']],
    ['confirm', ['', '', 'always']],
  ])('a cancelled %s question stores nothing', async (_, answersBefore) => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    const { status, output } = await runInteractive([['status'], ...answersBefore, prompts.CANCEL])

    assert.equal(status, 1, output)
    assert.match(output, /Cancelled\./)
    assert.ok(!claudeCalls().some((call) => /^plugin (install|configure) /.test(call)))
  })

  test('a cancelled prompt ends with exit code 1, without /reload-plugins when nothing changed', async () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    const { status, output } = await runInteractive([prompts.CANCEL])

    assert.equal(status, 1, output)
    assert.match(output, /Cancelled\. Run \/clear in open Claude Code sessions\./)
    assert.doesNotMatch(output, /reload-plugins/)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin install')))
  })

  test('a prompt cancelled after a mod changed still asks for /reload-plugins', async () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    // datalogix installs before status asks its first option.
    const { status, output } = await runInteractive([['datalogix', 'status'], prompts.CANCEL])

    assert.equal(status, 1, output)
    assert.ok(claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.match(output, /Cancelled\. Run \/clear and \/reload-plugins/)
  })
})
