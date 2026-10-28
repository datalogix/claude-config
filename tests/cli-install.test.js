// Run without a terminal; what install and update do the same way is in
// cli-update.test.js.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'vitest'
import {
  ADDED_MARKETPLACE,
  PLAIN_MOD,
  MODS,
  ROOT,
  claudeCalls,
  fakeClaude,
  home,
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

  test('removes the skills copied by earlier versions once datalogix is installed', () => {
    fakeClaude()
    // Removed: a copy with the marker (review), and links into a clone of this
    // marketplace, absolute (issue) and relative (pr). Kept: a link into a clone
    // of another marketplace, a folder without the marker, a broken link and a
    // plain file.
    addOldSkill('review')
    const clone = path.join(tmpDir, 'clone')
    fs.cpSync(path.join(ROOT, '.claude-plugin'), path.join(clone, '.claude-plugin'), { recursive: true })
    fs.mkdirSync(path.join(clone, 'skills/issue'), { recursive: true })
    fs.writeFileSync(path.join(clone, 'skills/issue/SKILL.md'), '')
    fs.symlinkSync(path.join(clone, 'skills/issue'), skillPath('issue'))
    fs.mkdirSync(path.join(clone, 'skills/pr'))
    fs.symlinkSync(path.relative(path.dirname(skillPath('pr')), path.join(clone, 'skills/pr')), skillPath('pr'))
    const otherClone = path.join(tmpDir, 'other-clone')
    fs.mkdirSync(path.join(otherClone, '.claude-plugin'), { recursive: true })
    fs.writeFileSync(path.join(otherClone, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'other' }))
    fs.mkdirSync(path.join(otherClone, 'skills/review'), { recursive: true })
    fs.symlinkSync(path.join(otherClone, 'skills/review'), skillPath('other-link'))
    fs.mkdirSync(skillPath('foreign'))
    fs.symlinkSync(path.join(tmpDir, 'nowhere'), skillPath('foreign-link'))
    fs.writeFileSync(skillPath('notes.md'), '')

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin install datalogix@claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
    assert.throws(() => fs.lstatSync(skillPath('issue')))
    assert.throws(() => fs.lstatSync(skillPath('pr')), 'the relative link was kept')
    assert.ok(fs.existsSync(path.join(clone, 'skills/issue/SKILL.md')), 'the clone was removed through the link')
    assert.ok(fs.lstatSync(skillPath('other-link')).isSymbolicLink())
    assert.ok(fs.existsSync(skillPath('foreign')))
    assert.ok(fs.lstatSync(skillPath('foreign-link')).isSymbolicLink())
    assert.ok(fs.existsSync(skillPath('notes.md')))
    assert.match(output, /removed: ~\/\.claude\/skills\/review \(skills now ship in the datalogix mod\)/)
  })

  test('skips the mods and keeps the old skills when the claude CLI is missing', () => {
    addOldSkill('review')

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /mods skipped/)
    assert.ok(fs.existsSync(skillPath('review')))
  })

  test('skips the mods when claude --version fails', () => {
    fakeClaude({ '--version': 'exit 1' })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /mods skipped: the claude CLI is not installed/)
    assert.deepEqual(claudeCalls(), ['--version'])
  })

  // Anything but a list of objects reads as an empty list: nothing added, nothing installed.
  test.each([
    ['output that is not JSON', 'echo not json', 'echo not json'],
    ['JSON of another shape', "echo '{}'", "echo '[null]'"],
  ])('takes claude %s as empty lists', (_, mods, marketplaces) => {
    fakeClaude({ 'plugin list --json': mods, 'plugin marketplace list --json': marketplaces })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /SyntaxError|TypeError/)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace add datalogix/claude-config'))
    for (const name of MODS) {
      assert.ok(calls.includes(`plugin install ${name}@claude-config`), `${name} not installed`)
    }
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

  test('warns about a mod also loaded inline, even when already installed', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"},{"id":"${PLAIN_MOD}@inline"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`${PLAIN_MOD} is also loaded inline`))
  })

  test('warns about a mod also loaded inline when the marketplace cannot be added', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"},{"id":"${PLAIN_MOD}@inline"}]'`,
      'plugin marketplace add datalogix/claude-config': 'echo denied >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1)
    assert.match(output, new RegExp(`${PLAIN_MOD} is also loaded inline`))
  })

  test('does not warn about a mod loaded inline that failed to install', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@inline"}]'`,
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
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
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
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
      'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /comes from .+, not datalogix\/claude-config;.+; not updated/)
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin marketplace update claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin update ')))
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

  test('does not warn when --link finds the clone added through a symlink', () => {
    const link = path.join(tmpDir, 'clone-link')
    fs.symlinkSync(ROOT, link)
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${link}"}]'` })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /comes from/)
    assert.match(output, /already added from/)
  })

  test('only notes the marketplace already added from the requested source', () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /already added from datalogix\/claude-config/)
    assert.doesNotMatch(output, /comes from/)
  })

  test('updates the marketplace and refreshes the mods already installed', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
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
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
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
  ])('rejects a flag the command does not take (%s %s)', (command, flag) => {
    const { status, output } = runCli([command, flag])

    assert.equal(status, 1)
    assert.match(output, new RegExp(`Unknown flag "${flag}" for ${command}`))
  })
})
