// Also covers what install does the same way; run without a terminal.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'vitest'
import {
  GITHUB_MARKETPLACE_REPLY,
  assertCalledBefore,
  CLI,
  PLAIN_MOD,
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

describe('update', { skip: process.platform === 'win32' }, () => {
  test('updates its own mods and leaves the rest alone', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD, 'other@elsewhere'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace update claude-config'))
    assert.ok(calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    assert.ok(!calls.includes('plugin update other@elsewhere --json'))
    assert.ok(!calls.includes('plugin install datalogix@claude-config'))
  })

  test('fails when the marketplace list is not a list, instead of reading as nothing installed', () => {
    fakeClaude({ 'plugin marketplace list --json': 'echo Update available' })

    const { status, output } = runCli(['update'])

    assert.equal(status, 1, output)
    assert.match(output, /could not list the marketplaces: unexpected reply \(Update available\)/)
    assert.doesNotMatch(output, /mods not installed/)
  })

  test('skips the mods and keeps the old skills when the claude CLI is missing', () => {
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.match(output, /mods skipped: the claude CLI is not installed/)
    assert.doesNotMatch(output, /could not list/)
    assert.ok(fs.existsSync(skillPath('review')))
  })

  test('keeps the old skills and installs nothing when the installed mods cannot be listed', () => {
    fakeClaude({
      'plugin list --json': 'echo broken >&2; exit 1',
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 1, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin install')))
    assert.ok(fs.existsSync(skillPath('review')))
  })

  test('leaves alone a mod that is only in the scope of another project', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config","scope":"project"}]'`,
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
  })

  test('updates a marketplace added from another source', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${tmpDir}"}]'`,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(claudeCalls().includes('plugin marketplace update claude-config'))
    assert.ok(claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
  })

  test('says failed when claude fails with nothing on stderr', () => {
    fakeClaude({
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin marketplace update claude-config': 'exit 1',
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 1, output)
    assert.match(output, /marketplace: failed/)
  })

  test('shows at most 200 characters of an unexpected reply', () => {
    fakeClaude({ 'plugin marketplace list --json': `echo ${'x'.repeat(300)}` })

    const { status, output } = runCli(['update'])

    assert.equal(status, 1, output)
    assert.match(output.replace(/\s+/g, ''), new RegExp(`unexpectedreply\\(x{200}\\)`))
  })

  test.each([
    ['does not ask for /reload-plugins', 'abc', false],
    ['asks for /reload-plugins', 'def', true],
  ])('%s when the update brings version %s', (_, newVersion, asksReload) => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [`plugin update ${PLAIN_MOD}@claude-config --json`]: `echo '{"oldVersion":"abc","newVersion":"${newVersion}"}'`,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`updated: ${PLAIN_MOD}\\n`))
    assert.equal(/reload-plugins/.test(output), asksReload, output)
  })

  test.each([
    ['text that is not JSON', 'echo not json'],
    ['null', 'echo null'],
  ])('counts an update reply of %s as a change', (_, reply) => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [`plugin update ${PLAIN_MOD}@claude-config --json`]: reply,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.match(output, /reload-plugins/)
  })

  test('asks for /reload-plugins when uninstalling the earlier name is the only change', () => {
    fakeClaude({
      'plugin list --json': installedMods('passos', 'steps'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin update steps@claude-config --json': `echo '{"oldVersion":"a","newVersion":"a"}'`,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.match(output, /and \/reload-plugins/)
  })

  test('replaces the skills copied by earlier versions with datalogix', () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })
    addOldSkill('review')
    fs.mkdirSync(skillPath('foreign'))

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin install datalogix@claude-config'))
    assert.ok(!calls.includes('plugin update datalogix@claude-config --json'))
    assert.ok(!fs.existsSync(skillPath('review')))
    assert.ok(fs.existsSync(skillPath('foreign')))
  })

  test('removes the old skills without installing datalogix again when it is already installed', () => {
    fakeClaude({
      'plugin list --json': installedMods('datalogix'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
  })

  test('keeps the old skills when the marketplace update fails', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin marketplace update claude-config': 'echo offline >&2; exit 1',
    })
    addOldSkill('review')

    const { status } = runCli(['update'])

    assert.equal(status, 1)
    assert.ok(!claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.ok(fs.existsSync(skillPath('review')))
  })

  test('does not reinstall the new name of a renamed mod already there', () => {
    fakeClaude({
      'plugin list --json': installedMods('passos', 'steps'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin install steps@claude-config'))
    assert.ok(calls.includes('plugin uninstall --keep-data passos@claude-config'))
    assert.ok(calls.includes('plugin update steps@claude-config --json'))
  })

  test('keeps a renamed mod when the marketplace update fails', () => {
    fakeClaude({
      'plugin list --json': installedMods('passos'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin marketplace update claude-config': 'echo offline >&2; exit 1',
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 1, output)
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin install steps@claude-config'))
    assert.ok(!calls.includes('plugin uninstall --keep-data passos@claude-config'))
    assert.match(output, /kept: passos/)
  })

  test('without a terminal, neither reads nor configures the options', () => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin configure')))
  })

  // Root writes through the read-only mode below.
  test.skipIf(process.getuid?.() === 0)('still updates the mods when an old skill cannot be removed', () => {
    fakeClaude({
      'plugin list --json': installedMods('datalogix', PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })
    addOldSkill('review')
    fs.writeFileSync(path.join(skillPath('review'), 'SKILL.md'), '')
    const skills = path.join(home, '.claude/skills')
    fs.chmodSync(skills, 0o555)

    try {
      const { status, output } = runCli(['update'])

      assert.equal(status, 1, output)
      assert.ok(fs.existsSync(path.join(skillPath('review'), 'SKILL.md')), 'removed something before failing')
      assert.match(output, /could not remove ~\/\.claude\/skills\/review/)
      assert.match(output, /Finished with errors/)
      assert.ok(claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    } finally {
      fs.chmodSync(skills, 0o755)
    }
    // It failed before removing anything, so the next run still knows the folder and removes it.
    assert.ok(fs.existsSync(path.join(skillPath('review'), '.claude-config')))
  })

  // Root writes through the read-only mode below.
  test.skipIf(process.getuid?.() === 0)('keeps the marker of an old skill removed only halfway', () => {
    fakeClaude({
      'plugin list --json': installedMods('datalogix'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })
    addOldSkill('review')
    const locked = path.join(skillPath('review'), 'locked')
    fs.mkdirSync(locked)
    fs.writeFileSync(path.join(locked, 'SKILL.md'), '')
    fs.chmodSync(locked, 0o555)

    try {
      const { status, output } = runCli(['update'])

      assert.equal(status, 1, output)
      assert.match(output, /could not remove ~\/\.claude\/skills\/review/)
      assert.ok(fs.existsSync(path.join(skillPath('review'), '.claude-config')))
    } finally {
      fs.chmodSync(locked, 0o755)
    }
  })

  // Root reads through the mode below too.
  test.skipIf(process.getuid?.() === 0)('reports an unreadable ~/.claude/skills once', () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })
    const skills = path.join(home, '.claude/skills')
    fs.mkdirSync(skills, { recursive: true })
    fs.chmodSync(skills, 0o300)

    try {
      const { status, output } = runCli(['update'])

      assert.equal(status, 1, output)
      assert.equal(output.match(/could not read ~\/\.claude\/skills/g)?.length, 1, output)
    } finally {
      fs.chmodSync(skills, 0o755)
    }
  })

  test('installs every mod when nothing is installed, as with no command', () => {
    fakeClaude()
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(claudeCalls().includes('plugin marketplace add datalogix/claude-config'))
    assert.ok(claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
  })

  test('without the marketplace, removes the old skills when datalogix is installed', () => {
    fakeClaude({ 'plugin list --json': installedMods('datalogix') })
    addOldSkill('review')
    fs.mkdirSync(skillPath('foreign'))

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(claudeCalls().includes('plugin marketplace add datalogix/claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
    assert.ok(fs.existsSync(skillPath('foreign')))
  })

  test('without the marketplace, keeps the old skills when the installed mods cannot be listed', () => {
    fakeClaude({ 'plugin list --json': 'echo broken >&2; exit 1' })
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 1, output)
    assert.match(output, /could not list the installed mods: broken/)
    assert.ok(fs.existsSync(skillPath('review')))
  })

  /** @param {string} configDir */
  const writeOldOptions = (configDir) => {
    fs.mkdirSync(configDir)
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({ pluginConfigs: { 'status@claude-config': { options: { notificar: 'nunca' } } } }),
    )
  }

  test('reads the old options from CLAUDE_CONFIG_DIR when set', () => {
    const configDir = path.join(tmpDir, 'config')
    writeOldOptions(configDir)
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['update'], CLI, { CLAUDE_CONFIG_DIR: configDir })

    assert.equal(status, 0, output)
    assert.match(output, /notificar="nunca"/)
    assert.ok(output.includes(path.join(configDir, 'settings.json')), output)
  })

  test('looks for the old skills in ~/.claude even with CLAUDE_CONFIG_DIR set', () => {
    const configDir = path.join(tmpDir, 'config')
    fs.mkdirSync(path.join(configDir, 'skills/foreign'), { recursive: true })
    fs.writeFileSync(path.join(configDir, 'skills/foreign/.claude-config'), '')
    fakeClaude({
      'plugin list --json': installedMods('datalogix'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })
    addOldSkill('review')

    const { status, output } = runCli(['update'], CLI, { CLAUDE_CONFIG_DIR: configDir })

    assert.equal(status, 0, output)
    assert.ok(!fs.existsSync(skillPath('review')))
    assert.ok(fs.existsSync(path.join(configDir, 'skills/foreign')))
  })

  test('shows a CLAUDE_CONFIG_DIR that only starts like HOME in full', () => {
    const configDir = `${home}-x`
    writeOldOptions(configDir)
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['update'], CLI, { CLAUDE_CONFIG_DIR: configDir })

    assert.equal(status, 0, output)
    assert.ok(output.includes(path.join(configDir, 'settings.json')), output)
    assert.doesNotMatch(output, /~-x/)
  })

  test.each([
    ['broken JSON', '{'],
    ['options of null', JSON.stringify({ pluginConfigs: { 'status@claude-config': { options: null } } })],
    ['options of text', JSON.stringify({ pluginConfigs: { 'status@claude-config': { options: 'x' } } })],
    ['options of a list', JSON.stringify({ pluginConfigs: { 'status@claude-config': { options: ['x'] } } })],
  ])('ignores a settings.json with %s', (_, settings) => {
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })
    fs.mkdirSync(path.join(home, '.claude'))
    fs.writeFileSync(path.join(home, '.claude/settings.json'), settings)

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /ignoring options/)
  })

  test('fails a claude call that hangs and still updates the mods', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      // exec, so the timeout kills sleep itself and no child keeps the output open
      'plugin marketplace update claude-config': 'exec /bin/sleep 10',
    })

    const { status, output } = runCli(['update'], CLI, { DATALOGIX_CLAUDE_TIMEOUT_MS: '3000' })

    assert.equal(status, 1, output)
    assert.match(output, /marketplace: timed out after 3s/)
    assert.match(output, /Finished with errors/)
    assert.ok(claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
  })

  test('turns off git credential prompts for claude', () => {
    fakeClaude({ '--version': `echo "$GIT_TERMINAL_PROMPT" > "${path.join(tmpDir, 'prompt')}"` })

    runCli(['update'])

    assert.equal(fs.readFileSync(path.join(tmpDir, 'prompt'), 'utf8'), '0\n')
  })
})

describe('install and update', { skip: process.platform === 'win32' }, () => {
  const COMMANDS = ['install', 'update']

  test.each(COMMANDS)('stops before the mods when the installed ones cannot be listed (%s)', (command) => {
    fakeClaude({
      'plugin list --json': 'echo broken >&2; exit 1',
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli([command])

    assert.equal(status, 1, output)
    assert.match(output, /could not list the installed mods: broken/)
    assert.match(output, /Finished with errors/)
    assert.doesNotMatch(output, /reload-plugins/)
    assert.ok(!claudeCalls().some((call) => /^plugin (install|update|uninstall) /.test(call)))
  })

  test.each(COMMANDS)('stops before the mods when the marketplaces cannot be listed (%s)', (command) => {
    fakeClaude({ 'plugin marketplace list --json': 'echo broken >&2; exit 1' })

    const { status, output } = runCli([command])

    assert.equal(status, 1, output)
    assert.match(output, /marketplace: could not list the marketplaces: broken/)
    assert.doesNotMatch(output, /mods not installed/)
    assert.ok(!claudeCalls().some((call) => /^plugin (marketplace add|marketplace update|install) /.test(call)))
  })

  test.each(COMMANDS)(
    'still updates the mods when the marketplace update fails, ending with exit code 1 (%s)',
    (command) => {
      fakeClaude({
        'plugin list --json': installedMods(PLAIN_MOD),
        'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
        'plugin marketplace update claude-config': 'echo offline >&2; exit 1',
      })

      const { status, output } = runCli([command])

      assert.equal(status, 1, output)
      assert.match(output, /marketplace: offline/)
      assert.ok(claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    },
  )

  test.each(COMMANDS)('keeps the old skills when datalogix fails to install (%s)', (command) => {
    fakeClaude({
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin install datalogix@claude-config': 'echo broken >&2; exit 1',
    })
    addOldSkill('review')

    const { status, output } = runCli([command])

    assert.equal(status, 1, output)
    assert.ok(fs.existsSync(skillPath('review')))
    assert.match(output, /kept: review in ~\/\.claude\/skills \(datalogix is not installed yet/)
  })

  test.each(COMMANDS)('replaces the mods under their earlier names (%s)', (command) => {
    fakeClaude({
      'plugin list --json': installedMods('passos', 'topicos', 'passos@other'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli([command])

    assert.equal(status, 0, output)
    assertCalledBefore('plugin install steps@claude-config', 'plugin uninstall --keep-data passos@claude-config')
    assertCalledBefore('plugin install topics@claude-config', 'plugin uninstall --keep-data topicos@claude-config')
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin update passos@claude-config --json'))
    assert.ok(!calls.some((call) => call.includes('passos@other')))
    assert.match(output, /uninstalled: passos \(renamed to steps\)/)
  })

  test.each(COMMANDS)('keeps a mod under its earlier name when the new one fails to install (%s)', (command) => {
    fakeClaude({
      'plugin list --json': installedMods('passos'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin install steps@claude-config': 'echo "not found" >&2; exit 1',
    })

    const { status, output } = runCli([command])

    assert.equal(status, 1, output)
    assert.ok(!claudeCalls().includes('plugin uninstall --keep-data passos@claude-config'))
    assert.match(output, /kept: passos \(steps is not installed yet/)
  })

  test.each(COMMANDS)('ends with exit code 1 when a mod under its earlier name fails to uninstall (%s)', (command) => {
    fakeClaude({
      'plugin list --json': installedMods('passos', 'steps'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      'plugin uninstall --keep-data passos@claude-config': 'echo busy >&2; exit 1',
    })

    const { status, output } = runCli([command])

    assert.equal(status, 1, output)
    assert.match(output, /passos: busy/)
    assert.doesNotMatch(output, /uninstalled: passos/)
  })

  test.each(COMMANDS)('warns about options stored under keys the mod no longer has (%s)', (command) => {
    fs.mkdirSync(path.join(home, '.claude'))
    fs.writeFileSync(
      path.join(home, '.claude/settings.json'),
      JSON.stringify({
        pluginConfigs: { 'status@claude-config': { options: { notify: 'never', notificar: 'nunca' } } },
      }),
    )
    fakeClaude({
      'plugin list --json': installedMods('status'),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli([command])

    assert.equal(status, 0, output)
    assert.match(output, /status: ignoring options it no longer has \(notificar="nunca"\);.+to stop this warning/)
  })
})
