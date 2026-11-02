// Run without a terminal; what install and update do the same way is in
// cli-update.test.js.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'vitest'
import {
  ADDED_MARKETPLACE,
  CLI,
  PLAIN_MOD,
  MODS,
  ROOT,
  claudeCalls,
  fakeClaude,
  home,
  installedMods,
  addOldSkill,
  runCli,
  skillPath,
  tmpDir,
  useTempHome,
} from './helpers/cli.js'

useTempHome()

describe('install', { skip: process.platform === 'win32' }, () => {
  test('installs every mod', () => {
    fakeClaude()

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /Done\./)
    assert.ok(!fs.existsSync(path.join(home, '.claude/skills')))
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace add datalogix/claude-config'))
    for (const name of MODS) {
      assert.ok(calls.includes(`plugin install ${name}@claude-config`), `${name} not installed`)
    }
    assert.ok(!calls.includes('plugin marketplace update claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin update ')))
  })

  describe('once datalogix is installed, among the skills copied by earlier versions', () => {
    const lstatOrUndefined = (/** @type {string} */ file) => fs.lstatSync(file, { throwIfNoEntry: false })

    /**
     * @param {string} name
     * @param {string} marketplaceName
     * @returns {string} the skill folder inside a new clone of that marketplace
     */
    const addClone = (name, marketplaceName) => {
      const clone = path.join(tmpDir, 'clone')
      fs.mkdirSync(path.join(clone, '.claude-plugin'), { recursive: true })
      fs.writeFileSync(path.join(clone, '.claude-plugin/marketplace.json'), JSON.stringify({ name: marketplaceName }))
      const folder = path.join(clone, 'skills', name)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'SKILL.md'), '')
      fs.mkdirSync(path.dirname(skillPath(name)), { recursive: true })
      return folder
    }

    test('removes a copy with the marker', () => {
      fakeClaude()
      addOldSkill('review')

      const { status, output } = runCli(['install'])

      assert.equal(status, 0, output)
      assert.ok(claudeCalls().includes('plugin install datalogix@claude-config'))
      assert.ok(!lstatOrUndefined(skillPath('review')))
      assert.match(output, /removed: ~\/\.claude\/skills\/review \(skills now ship in the datalogix mod\)/)
    })

    test.each([
      ['an absolute link', (/** @type {string} */ folder) => folder],
      ['a relative link', (/** @type {string} */ folder) => path.relative(path.dirname(skillPath('pr')), folder)],
    ])('removes %s into a clone of this marketplace, not the clone', (_, target) => {
      fakeClaude()
      const folder = addClone('pr', 'claude-config')
      fs.symlinkSync(target(folder), skillPath('pr'))

      const { status, output } = runCli(['install'])

      assert.equal(status, 0, output)
      assert.ok(!lstatOrUndefined(skillPath('pr')))
      assert.ok(fs.existsSync(path.join(folder, 'SKILL.md')), 'the clone was removed through the link')
    })

    test.each([
      [
        'a link into a clone of another marketplace',
        () => fs.symlinkSync(addClone('review', 'other'), skillPath('review')),
      ],
      ['a folder without the marker', () => fs.mkdirSync(skillPath('review'), { recursive: true })],
      [
        'a broken link',
        () => {
          fs.mkdirSync(path.dirname(skillPath('review')), { recursive: true })
          fs.symlinkSync(path.join(tmpDir, 'nowhere'), skillPath('review'))
        },
      ],
      [
        'a plain file',
        () => {
          fs.mkdirSync(path.dirname(skillPath('review')), { recursive: true })
          fs.writeFileSync(skillPath('review'), '')
        },
      ],
    ])('keeps %s', (_, addSkill) => {
      fakeClaude()
      addSkill()

      const { status, output } = runCli(['install'])

      assert.equal(status, 0, output)
      assert.ok(lstatOrUndefined(skillPath('review')))
    })
  })

  test('skips the mods and keeps the old skills when the claude CLI is missing', () => {
    addOldSkill('review')

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /mods skipped/)
    assert.ok(fs.existsSync(skillPath('review')))
  })

  test('fails the run when claude --version hangs, instead of calling it not installed', () => {
    fakeClaude({ '--version': 'exec /bin/sleep 10' })

    const { status, output } = runCli(['install'], CLI, { CLAUDE_CONFIG_TIMEOUT_MS: '500' })

    assert.equal(status, 1, output)
    assert.match(output, /mods skipped: claude --version timed out after 0\.5s/)
    assert.doesNotMatch(output, /not installed/)
    assert.match(output, /Finished with errors/)
  })

  test('skips the mods when claude --version fails', () => {
    fakeClaude({ '--version': 'exit 1' })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /mods skipped: the claude CLI is not installed/)
    assert.deepEqual(claudeCalls(), ['--version'])
  })

  // Anything but a list says nothing about what is there: read as empty, it would install everything again.
  describe.each([
    ['output that is not JSON', 'echo not json'],
    ['JSON of another shape', "echo '{}'"],
    ['no output', 'true'],
    ['items that are not objects', "echo '[null, 1]'"],
    ['items without the field they need', `echo '[{"other":1}]'`],
    ['items whose field is not text', `echo '[{"id":1,"name":1}]'`],
  ])('with claude replying %s', (_, reply) => {
    test('fails on the marketplace list, adding nothing', () => {
      fakeClaude({ 'plugin marketplace list --json': reply })

      const { status, output } = runCli(['install'])

      assert.equal(status, 1, output)
      assert.match(output, /could not list the marketplaces: unexpected reply/)
      assert.doesNotMatch(output, /SyntaxError|TypeError/)
      assert.deepEqual(claudeCalls(), ['--version', 'plugin marketplace list --json'])
    })

    test('fails on the mod list, installing nothing', () => {
      fakeClaude({ 'plugin list --json': reply, 'plugin marketplace list --json': ADDED_MARKETPLACE })

      const { status, output } = runCli(['install'])

      assert.equal(status, 1, output)
      assert.match(output, /could not list the installed mods: unexpected reply/)
      assert.ok(!claudeCalls().some((call) => call.startsWith('plugin install')))
    })
  })

  test('ends with exit code 1 when the marketplace cannot be added', () => {
    fakeClaude({ 'plugin marketplace add datalogix/claude-config': 'echo denied >&2; exit 1' })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1)
    assert.match(output, /could not add datalogix\/claude-config: denied/)
    assert.match(
      output,
      /mods skipped \(.+\); check access with "git ls-remote https:\/\/github\.com\/datalogix\/claude-config\.git"/,
    )
    assert.match(output, /Finished with errors/)
    assert.doesNotMatch(output, /reload-plugins/)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin install')))
  })

  test('does not suggest git ls-remote when the clone cannot be added with --link', () => {
    fakeClaude({ [`plugin marketplace add ${ROOT}`]: 'echo denied >&2; exit 1' })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 1)
    assert.match(output, /mods skipped \(/)
    assert.doesNotMatch(output, /git ls-remote/)
  })

  test('refreshes the mods already installed when the marketplace was just added', () => {
    fakeClaude({ 'plugin list --json': installedMods(PLAIN_MOD) })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace add datalogix/claude-config'))
    assert.ok(calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
  })

  test('warns about a mod also loaded inline, even when already installed', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD, `${PLAIN_MOD}@inline`),
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`${PLAIN_MOD} is also loaded inline`))
  })

  test('warns about a mod also loaded inline when the marketplace cannot be added', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD, `${PLAIN_MOD}@inline`),
      'plugin marketplace add datalogix/claude-config': 'echo denied >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1)
    assert.match(output, new RegExp(`${PLAIN_MOD} is also loaded inline`))
  })

  test('does not warn about a mod loaded inline that failed to install', () => {
    fakeClaude({
      'plugin list --json': installedMods(`${PLAIN_MOD}@inline`),
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [`plugin install ${PLAIN_MOD}@claude-config`]: 'echo broken >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1)
    assert.doesNotMatch(output, new RegExp(`${PLAIN_MOD} is also loaded inline`))
  })

  test('ends with exit code 1 when a mod fails to install', () => {
    fakeClaude({ [`plugin install ${PLAIN_MOD}@claude-config`]: 'echo broken >&2; exit 1' })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1)
    assert.match(output, new RegExp(`${PLAIN_MOD}: broken`))
  })

  test('adds the marketplace from the clone with --link', () => {
    fakeClaude()

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes(`plugin marketplace add ${ROOT}`))
    assert.ok(!calls.includes('plugin marketplace add datalogix/claude-config'))
  })

  test('warns when --link finds the marketplace added from GitHub', () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin marketplace add')))
    assert.match(
      output,
      /comes from datalogix\/claude-config, not .+; to switch, run "claude plugin marketplace remove/,
    )
  })

  test('neither updates the marketplace nor refreshes the mods when it comes from another source', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.match(output, /; not updated/)
    assert.match(output, new RegExp(`ok: ${PLAIN_MOD}\\n`))
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin marketplace update claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin update ')))
  })

  test('neither updates a marketplace added from a clone nor refreshes its mods when installing from GitHub', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /comes from .+, not datalogix\/claude-config;.+; not updated/)
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin marketplace update claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin update ')))
  })

  test.each([
    ['repo', '"repo":"other/claude-config"'],
    ['git URL', '"source":"git","url":"https://github.com/other/claude-config.git"'],
  ])('neither updates nor refreshes when the %s is another GitHub repository', (_, source) => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': `echo '[{"name":"claude-config",${source}}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /; not updated/)
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin marketplace update claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin update ')))
  })

  test('warns when --link finds the marketplace added from a path that no longer exists', () => {
    const gone = path.join(tmpDir, 'gone')
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${gone}"}]'` })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.match(output, /; not updated/)
  })

  test('warns when --link finds the marketplace added from another clone', () => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'` })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.match(output, /comes from .+, not .+; not updated/)
    assert.ok(!claudeCalls().includes('plugin marketplace update claude-config'))
  })

  test('warns about a marketplace whose source is given as text', () => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","source":"github:x/y"}]'` })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /comes from github:x\/y, not datalogix\/claude-config/)
    assert.ok(!claudeCalls().includes('plugin marketplace update claude-config'))
  })

  test.each([
    'datalogix/claude-config',
    'github:datalogix/claude-config',
    'https://github.com/datalogix/claude-config',
    'https://github.com/datalogix/claude-config.git',
    'git@github.com:datalogix/claude-config.git',
    'Datalogix/Claude-Config',
    'https://www.github.com/datalogix/claude-config#main',
    'git+https://github.com/datalogix/claude-config.git',
    'ssh://git@github.com/datalogix/claude-config.git',
    'github:datalogix/claude-config@main',
  ])('updates a marketplace whose source is given as the text %s', (source) => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","source":"${source}"}]'` })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /comes from/)
    assert.ok(claudeCalls().includes('plugin marketplace update claude-config'))
  })

  test.each(['./datalogix/claude-config', '../claude-config', 'datalogix/..'])(
    'warns about a marketplace whose source is the relative path %s',
    (source) => {
      fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","source":"${source}"}]'` })

      const { status, output } = runCli(['install'])

      assert.equal(status, 0, output)
      assert.match(output, /comes from .+, not datalogix\/claude-config/)
    },
  )

  test('updates a marketplace added from a GitHub git URL', () => {
    fakeClaude({
      'plugin marketplace list --json': `echo '[{"name":"claude-config","source":"git","url":"https://github.com/datalogix/claude-config.git"}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /comes from/)
    assert.ok(claudeCalls().includes('plugin marketplace update claude-config'))
  })

  test('does not warn when --link finds the clone given as a text source', () => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","source":"${ROOT}"}]'` })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /comes from/)
    assert.ok(claudeCalls().includes('plugin marketplace update claude-config'))
  })

  test('updates a marketplace listed without its source as the one asked for', () => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config"}]'` })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /marketplace: claude-config \(already added\)/)
    assert.doesNotMatch(output, /comes from/)
    assert.ok(claudeCalls().includes('plugin marketplace update claude-config'))
  })

  test('ignores the source fields of a listed marketplace that are not text', () => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","repo":123,"path":{},"url":[]}]'` })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /marketplace: claude-config \(already added\)/)
    assert.doesNotMatch(output, /startsWith|comes from/)
    assert.ok(claudeCalls().includes('plugin marketplace update claude-config'))
  })

  test('does not warn when --link finds the clone added through a symlink', () => {
    const link = path.join(tmpDir, 'clone-link')
    fs.symlinkSync(ROOT, link)
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${link}"}]'` })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /comes from/)
    assert.match(output, /already added from/)
  })

  test('notes and updates the marketplace already added from the requested source', () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /already added from datalogix\/claude-config/)
    assert.doesNotMatch(output, /comes from/)
  })

  test('updates the marketplace and refreshes the mods already installed', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`refreshed: ${PLAIN_MOD}\\n`))
    // The fake update prints no versions, which counts as a change.
    assert.match(output, /reload-plugins/)
    assert.doesNotMatch(output, /ok: /)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace update claude-config'))
    assert.ok(calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    assert.ok(!calls.includes(`plugin install ${PLAIN_MOD}@claude-config`))
    assert.ok(!calls.includes('plugin update topics@claude-config --json'))
  })

  test('ends with exit code 1 when an installed mod fails to refresh', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [`plugin update ${PLAIN_MOD}@claude-config --json`]: 'echo broken >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1)
    assert.match(output, new RegExp(`${PLAIN_MOD}: broken`))
    assert.doesNotMatch(output, /refreshed:/)
  })

  test('refuses --link outside a clone', () => {
    // A copy where npx leaves it; @clack/prompts is linked so the copy loads.
    const copy = path.join(tmpDir, 'node_modules/claude-config')
    fs.mkdirSync(path.join(copy, 'bin'), { recursive: true })
    fs.cpSync(path.join(ROOT, 'bin'), path.join(copy, 'bin'), { recursive: true })
    fs.cpSync(path.join(ROOT, '.claude-plugin'), path.join(copy, '.claude-plugin'), { recursive: true })
    fs.symlinkSync(path.join(ROOT, 'node_modules/@clack'), path.join(tmpDir, 'node_modules/@clack'))

    fakeClaude()

    const { status, output } = runCli(['install', '--link'], path.join(copy, 'bin/cli.js'))

    assert.equal(status, 1)
    assert.match(output, /--link needs a clone/)
    assert.deepEqual(claudeCalls(), [])
  })
})

describe('arguments', () => {
  test.each(['--help', '-h'])('%s shows the usage', (flag) => {
    const { status, output } = runCli([flag])

    assert.equal(status, 0)
    assert.match(output, /Usage:/)
    assert.match(output, /npx --allow-git=root github:datalogix\/claude-config#main/)
  })

  test('installs when no command is given', { skip: process.platform === 'win32' }, () => {
    fakeClaude()

    const { status, output } = runCli([])

    assert.equal(status, 0, output)
    assert.match(output, /claude-config install/)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace add datalogix/claude-config'))
    for (const name of MODS) {
      assert.ok(calls.includes(`plugin install ${name}@claude-config`), `${name} not installed`)
    }
  })

  test('shows the usage for --help after a command, without running it', () => {
    fakeClaude()

    const { status, output } = runCli(['update', '--help'])

    assert.equal(status, 0)
    assert.match(output, /Usage:/)
    assert.equal(fs.existsSync(path.join(tmpDir, 'calls')), false)
  })

  test('rejects an unknown command', () => {
    const { status, output } = runCli(['instal'])

    assert.equal(status, 1)
    assert.match(output, /Unknown command "instal"/)
  })

  test('rejects names from Object.prototype as commands', () => {
    const { status, output } = runCli(['toString'])

    assert.equal(status, 1)
    assert.match(output, /Unknown command "toString"/)
  })

  test.each([
    ['update', '--link'],
    ['install', '--force'],
    ['update', ''],
  ])('rejects a flag the command does not take (%s "%s")', (command, flag) => {
    const { status, output } = runCli([command, flag])

    assert.equal(status, 1)
    assert.match(output, new RegExp(`Unknown flag "${flag}" for ${command}`))
  })
})
