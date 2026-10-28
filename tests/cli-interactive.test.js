// bin/cli.js runs in this process, as if in a terminal, with mocked prompts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test, vi } from 'vitest'
import {
  ADDED_MARKETPLACE,
  assertCalledBefore,
  CLI,
  MODS,
  ROOT,
  binDir,
  claudeCalls,
  claudeStdin,
  fakeClaude,
  home,
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
  return {
    intro: show,
    outro: show,
    cancel: show,
    log: { info: show, warn: show, success: show, error: show },
    multiselect: ask,
    confirm: ask,
    select: ask,
    text: ask,
    password: ask,
    isCancel: (/** @type {unknown} */ value) => value === prompts.CANCEL,
  }
})

useTempHome()

/**
 * Every answer must be asked for, and nothing more.
 *
 * @param {unknown[]} answers
 * @param {string[]} [args]
 * @returns {Promise<{ status: number, output: string }>} the exit code, and the
 *   messages shown (intro, log, outro) up to the first exit
 */
async function runInteractive(answers, args = ['install']) {
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
  process.stdin.isTTY = true
  process.stdout.isTTY = true
  // The output ends at the first exit: the CLI's own catch sees the thrown
  // error and would print it.
  /** @type {number | undefined} */
  let shownCount
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    shownCount ??= prompts.messages.length
    throw new Error(`exit ${code}`)
  })
  try {
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

describe('interactive install', { skip: process.platform === 'win32' }, () => {
  const READ_STATUS_OPTIONS = 'plugin configure status@claude-config --json'
  const STATUS_DEFAULTS_REPLY = `echo '{"inputs":{"minSeconds":30,"planAlert":90,"notify":"always","excerpt":false},"configured":[]}'`
  // Answers at the defaults: an empty text keeps where the question started
  // (answerFor), and notify and excerpt get their default. The status mod asks
  // minSeconds, planAlert, notify and excerpt, in that order.
  const STATUS_KEPT_ANSWERS = ['', '', 'always', false]
  // A refresh that found no new version, so it needs no /reload-plugins.
  const UNCHANGED_REFRESH_REPLY = `echo '{"oldVersion":"a","newVersion":"a"}'`

  test('uninstalls an installed mod left unchecked, keeping its data', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"},{"id":"steps@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
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

  test('ends with exit code 1 when an unchecked mod fails to uninstall', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin uninstall --keep-data status@claude-config': 'echo busy >&2; exit 1',
    })

    const { status, output } = await runInteractive([MODS.filter((name) => name !== 'status')])

    assert.equal(status, 1, output)
    assert.match(output, /status: busy/)
    assert.doesNotMatch(output, /uninstalled: status/)
  })

  test('warns about an unchecked mod also loaded inline only while it stays installed', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"},{"id":"status@inline"},{"id":"steps@claude-config"},{"id":"steps@inline"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin uninstall --keep-data status@claude-config': 'echo busy >&2; exit 1',
    })

    const { output } = await runInteractive([MODS.filter((name) => name !== 'status' && name !== 'steps')])

    assert.match(output, /status is also loaded inline/)
    assert.match(output, /uninstalled: steps/)
    assert.doesNotMatch(output, /steps is also loaded inline/)
  })

  test('with nothing checked, uninstalls every mod, renamed ones and old skills included', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"steps@claude-config"},{"id":"passos@claude-config"}]'`,
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

  test('removes the old skills when datalogix is left unchecked', async () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })
    addOldSkill('review')

    const { status, output } = await runInteractive([['steps']])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
  })

  test('stores through stdin only the answers that differ from the default', async () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    const { status, output } = await runInteractive([['status'], '10', '', 'always', false])

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
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin configure status@claude-config --values-stdin': 'echo invalid >&2; exit 1',
    })

    const { status, output } = await runInteractive([['status'], '10', '', 'always', false])

    assert.equal(status, 1, output)
    assert.match(output, /status: invalid/)
    assert.doesNotMatch(output, /configured: status/)
  })

  test('stores nothing for an installed mod answered with its current values', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_KEPT_ANSWERS])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().some((call) => call.endsWith('--values-stdin')))
    assert.doesNotMatch(output, /configured: status|ok: status/)
  })

  test('asks for /reload-plugins when storing the options is the only change', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
      'plugin update status@claude-config --json': UNCHANGED_REFRESH_REPLY,
    })

    const { status, output } = await runInteractive([['status'], '10', '', 'always', false])

    assert.equal(status, 0, output)
    assert.match(output, /configured: status/)
    assert.match(output, /and \/reload-plugins/)
  })

  test('names an unchanged mod with ok when it was not refreshed', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'`,
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_KEPT_ANSWERS])

    assert.equal(status, 0, output)
    assert.match(output, /ok: status/)
  })

  test('starts each question from the configured value, else from the default in this checkout', async () => {
    // minSeconds is configured, so it starts from 45; planAlert is not, so it
    // starts from this checkout's 90, not the installed version's 75.
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [READ_STATUS_OPTIONS]: `echo '{"inputs":{"minSeconds":45,"planAlert":75,"notify":"agents","excerpt":true},"configured":["minSeconds","notify","excerpt"]}'`,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_KEPT_ANSWERS])

    assert.equal(status, 0, output)
    const [, minSeconds, planAlert, notify, excerpt] = prompts.questions
    assert.equal(minSeconds.initialValue, '45')
    assert.equal(planAlert.initialValue, '90')
    assert.equal(notify.initialValue, 'agents')
    assert.equal(excerpt.initialValue, true)
  })

  test('names the mod, the title and the description in each question', async () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    const { status, output } = await runInteractive([['status'], ...STATUS_KEPT_ANSWERS])

    assert.equal(status, 0, output)
    const userConfig = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'mods/status/.claude-plugin/plugin.json'), 'utf8'),
    ).userConfig
    assert.deepEqual(
      prompts.questions.slice(1).map((question) => question.message),
      Object.values(userConfig).map(
        (/** @type {{ title: string, description: string }} */ option) =>
          `status · ${option.title} — ${option.description}`,
      ),
    )
  })

  test('starts a select holding a value that is not one of its choices from the default in this checkout', async () => {
    // With "agents" as the default, the default and the first choice differ.
    const statusManifest = path.join(ROOT, 'mods/status/.claude-plugin/plugin.json')
    const { readFileSync } = fs
    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      const text = readFileSync(file, options)
      if (file !== statusManifest) return text
      const manifest = JSON.parse(String(text))
      manifest.userConfig.notify.default = 'agents'
      return JSON.stringify(manifest)
    })
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [READ_STATUS_OPTIONS]: `echo '{"inputs":{"minSeconds":30,"planAlert":90,"notify":"bogus","excerpt":false},"configured":["notify"]}'`,
    })

    try {
      const { status, output } = await runInteractive([['status'], ...STATUS_KEPT_ANSWERS])

      assert.equal(status, 0, output)
      assert.equal(prompts.questions[3].initialValue, 'agents')
    } finally {
      readSpy.mockRestore()
    }
  })

  test('counts as configured the options that differ from the default when the reply has no configured list', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [READ_STATUS_OPTIONS]: `echo '{"inputs":{"minSeconds":45,"planAlert":90,"notify":"always","excerpt":false}}'`,
    })

    const { status, output } = await runInteractive([['status'], ...STATUS_KEPT_ANSWERS])

    assert.equal(status, 0, output)
    assert.equal(prompts.questions[1].initialValue, '45')
    // minSeconds kept at 45 is no change; the rest stay unstored defaults.
    assert.ok(!claudeCalls().some((call) => call.endsWith('--values-stdin')))
  })

  test('still asks the options when the refresh fails', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin update status@claude-config --json': 'echo offline >&2; exit 1',
      [READ_STATUS_OPTIONS]: STATUS_DEFAULTS_REPLY,
    })

    const { status, output } = await runInteractive([['status'], '10', '', 'always', false])

    assert.equal(status, 1, output)
    assert.match(output, /status: offline/)
    assert.deepEqual(claudeStdin(), ['{"minSeconds":"10"}'])
    assert.match(output, /configured: status/)
  })

  test('does not configure a mod that fails to install', async () => {
    fakeClaude({
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin install status@claude-config': 'echo broken >&2; exit 1',
    })

    const { status, output } = await runInteractive([['status'], '10', '', 'always', false])

    assert.equal(status, 1, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin configure')))
    assert.doesNotMatch(output, /configured: status/)
  })

  test('without the marketplace, still uninstalls the unchecked mods and installs none', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace add datalogix/claude-config': 'echo denied >&2; exit 1',
    })

    const { status, output } = await runInteractive([['steps']])

    assert.equal(status, 1, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin uninstall --keep-data status@claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin install')))
    assert.match(output, /mods skipped \(steps\)/)
  })

  test('accepts only digits in a number option', async () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    await runInteractive([['status'], ...STATUS_KEPT_ANSWERS])

    const { validate } = prompts.questions[1]
    for (const input of ['1e3', '0x10', ' 5', '5\n', 'abc']) {
      assert.equal(validate(input), 'Enter a number.', JSON.stringify(input))
    }
    for (const input of ['', '5', '-5', '2.5']) {
      assert.equal(validate(input), undefined, JSON.stringify(input))
    }
  })

  test.each([
    ['fails', 'echo broken >&2; exit 1', /could not read its options \(skipped configuring\)/, 1],
    ['replies without inputs', "echo '{}'", /could not read its options; skipped configuring/, 0],
  ])('skips configuring a mod when claude %s reading its options', async (_, reply, message, code) => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [READ_STATUS_OPTIONS]: reply,
    })

    const { status, output } = await runInteractive([['status']])

    assert.equal(status, code, output)
    assert.match(output, message)
    assert.equal(prompts.questions.length, 1, 'asked only which mods')
    assert.ok(!claudeCalls().some((call) => call.endsWith('--values-stdin')))
  })

  test('does not name a mod with ok when its options cannot be read and it was not refreshed', async () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'`,
      [READ_STATUS_OPTIONS]: 'echo broken >&2; exit 1',
    })

    const { status, output } = await runInteractive([['status']])

    assert.equal(status, 1, output)
    assert.match(output, /could not read its options \(skipped configuring\)/)
    assert.doesNotMatch(output, /ok: status/)
  })

  test('a cancelled prompt ends with exit code 1, without /reload-plugins when nothing changed', async () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    const { status, output } = await runInteractive([prompts.CANCEL])

    assert.equal(status, 1)
    assert.match(output, /Cancelled\. Run \/clear in open Claude Code sessions\./)
    assert.doesNotMatch(output, /reload-plugins/)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin install')))
  })

  test('a prompt cancelled after a mod changed still asks for /reload-plugins', async () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    // datalogix installs before status asks its first option.
    const { status, output } = await runInteractive([['datalogix', 'status'], prompts.CANCEL])

    assert.equal(status, 1)
    assert.ok(claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.match(output, /Cancelled\. Run \/clear and \/reload-plugins/)
  })
})
