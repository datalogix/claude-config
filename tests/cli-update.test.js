// Also covers what install does the same way; run without a terminal.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'vitest'
import {
  ADDED_MARKETPLACE,
  assertCalledBefore,
  CLI,
  PLAIN_MOD,
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

describe('update', { skip: process.platform === 'win32' }, () => {
  test('refreshes its own mods and leaves the rest alone', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"},{"id":"other@elsewhere"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace update claude-config'))
    assert.ok(calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    assert.ok(!calls.includes('plugin update other@elsewhere --json'))
    assert.ok(!calls.includes('plugin install datalogix@claude-config'))
  })

  test('asks for /reload-plugins only when a refresh brings a new version', () => {
    /** @param {string} newVersion */
    const refreshTo = (newVersion) => {
      fakeClaude({
        'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
        'plugin marketplace list --json': ADDED_MARKETPLACE,
        [`plugin update ${PLAIN_MOD}@claude-config --json`]: `echo '{"oldVersion":"abc","newVersion":"${newVersion}"}'`,
      })
      return runCli(['update'])
    }

    const unchanged = refreshTo('abc')
    assert.equal(unchanged.status, 0, unchanged.output)
    assert.match(unchanged.output, new RegExp(`refreshed: ${PLAIN_MOD}\\n`))
    assert.doesNotMatch(unchanged.output, /reload-plugins/)

    assert.match(refreshTo('def').output, /reload-plugins/)
  })

  test('counts a refresh reply that is not JSON as a change', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      [`plugin update ${PLAIN_MOD}@claude-config --json`]: 'echo not json',
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.match(output, /reload-plugins/)
  })

  test('replaces the skills copied by earlier versions with datalogix', () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })
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

  test('only removes the old skills when datalogix is already installed', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"datalogix@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().includes('plugin install datalogix@claude-config'))
    assert.ok(!fs.existsSync(skillPath('review')))
  })

  test('keeps the old skills when the marketplace update fails', () => {
    fakeClaude({
      'plugin marketplace list --json': ADDED_MARKETPLACE,
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
      'plugin list --json': `echo '[{"id":"passos@claude-config"},{"id":"steps@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
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
      'plugin list --json': `echo '[{"id":"passos@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin marketplace update claude-config': 'echo offline >&2; exit 1',
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 1)
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin install steps@claude-config'))
    assert.ok(!calls.includes('plugin uninstall --keep-data passos@claude-config'))
    assert.match(output, /kept: passos/)
  })

  test('neither reads nor configures the options', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin configure')))
  })

  // Root writes through the read-only modes below.
  test.skipIf(process.getuid?.() === 0)('still refreshes the mods when an old skill cannot be removed', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"datalogix@claude-config"},{"id":"steps@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })
    addOldSkill('review')
    fs.writeFileSync(path.join(skillPath('review'), 'SKILL.md'), '')
    const skills = path.join(home, '.claude/skills')
    fs.chmodSync(skills, 0o555)

    try {
      const { status, output } = runCli(['update'])

      assert.equal(status, 1)
      assert.ok(fs.existsSync(skillPath('review')))
      assert.match(output, /could not remove ~\/\.claude\/skills\/review/)
      assert.match(output, /Finished with errors/)
      assert.ok(claudeCalls().includes('plugin update steps@claude-config --json'))
    } finally {
      fs.chmodSync(skills, 0o755)
    }
    // The marker went last, so the next run still knows the folder and removes
    // it ("only removes the old skills when datalogix is already installed").
    assert.ok(fs.existsSync(path.join(skillPath('review'), '.claude-config')))
  })

  // Root reads through the mode below too.
  test.skipIf(process.getuid?.() === 0)('reports an unreadable ~/.claude/skills once', () => {
    fakeClaude({ 'plugin marketplace list --json': ADDED_MARKETPLACE })
    const skills = path.join(home, '.claude/skills')
    fs.mkdirSync(skills, { recursive: true })
    fs.chmodSync(skills, 0o300)

    try {
      const { status, output } = runCli(['update'])

      assert.equal(status, 1)
      assert.equal(output.match(/could not read ~\/\.claude\/skills/g)?.length, 1, output)
    } finally {
      fs.chmodSync(skills, 0o755)
    }
  })

  test('stops when the marketplace was never added', () => {
    fakeClaude()
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.match(output, /mods not installed: run the install command/)
    assert.match(output, /kept: review in ~\/\.claude\/skills/)
    assert.doesNotMatch(output, /reload-plugins/)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin marketplace update')))
    assert.ok(fs.existsSync(skillPath('review')))
  })

  test('without the marketplace, removes the old skills when datalogix is installed', () => {
    fakeClaude({ 'plugin list --json': `echo '[{"id":"datalogix@claude-config"}]'` })
    addOldSkill('review')
    fs.mkdirSync(skillPath('foreign'))

    const { status, output } = runCli(['update'])

    assert.equal(status, 0, output)
    assert.match(output, /mods not installed/)
    assert.ok(!fs.existsSync(skillPath('review')))
    assert.ok(fs.existsSync(skillPath('foreign')))
  })

  test('without the marketplace, keeps the old skills when the installed mods cannot be listed', () => {
    fakeClaude({ 'plugin list --json': 'echo broken >&2; exit 1' })
    addOldSkill('review')

    const { status, output } = runCli(['update'])

    assert.equal(status, 1)
    assert.match(output, /could not list the installed mods: broken/)
    assert.ok(fs.existsSync(skillPath('review')))
  })

  test('reads the old options from CLAUDE_CONFIG_DIR when set', () => {
    const configDir = path.join(tmpDir, 'config')
    fs.mkdirSync(configDir)
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({ pluginConfigs: { 'status@claude-config': { options: { notificar: 'nunca' } } } }),
    )
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['update'], CLI, { CLAUDE_CONFIG_DIR: configDir })

    assert.equal(status, 0, output)
    assert.match(output, /notificar="nunca"/)
    assert.ok(output.includes(path.join(configDir, 'settings.json')), output)
  })

  test('shows a CLAUDE_CONFIG_DIR that only starts like HOME in full', () => {
    const configDir = `${home}-x`
    fs.mkdirSync(configDir)
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({ pluginConfigs: { 'status@claude-config': { options: { notificar: 'nunca' } } } }),
    )
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli(['update'], CLI, { CLAUDE_CONFIG_DIR: configDir })

    assert.equal(status, 0, output)
    assert.ok(output.includes(path.join(configDir, 'settings.json')), output)
    assert.doesNotMatch(output, /~-x/)
  })

  test('ignores a settings.json it cannot read the options from', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })
    fs.mkdirSync(path.join(home, '.claude'))

    for (const settings of ['{', JSON.stringify({ pluginConfigs: { 'status@claude-config': { options: 'x' } } })]) {
      fs.writeFileSync(path.join(home, '.claude/settings.json'), settings)

      const { status, output } = runCli(['update'])

      assert.equal(status, 0, output)
      assert.doesNotMatch(output, /ignoring options/)
    }
  })

  test('fails a claude call that hangs and still refreshes the mods', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      // exec, so the timeout kills sleep itself and no child keeps the output open
      'plugin marketplace update claude-config': 'exec /bin/sleep 10',
    })

    const { status, output } = runCli(['update'], CLI, { CLAUDE_CONFIG_TIMEOUT_MS: '500' })

    assert.equal(status, 1)
    assert.match(output, /marketplace: timed out after 0\.5s/)
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
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli([command])

    assert.equal(status, 1)
    assert.match(output, /could not list the installed mods: broken/)
    assert.match(output, /Finished with errors/)
    assert.doesNotMatch(output, /reload-plugins/)
    assert.ok(!claudeCalls().some((call) => /^plugin (install|update|uninstall) /.test(call)))
  })

  test.each(COMMANDS)('stops before the mods when the marketplaces cannot be listed (%s)', (command) => {
    fakeClaude({ 'plugin marketplace list --json': 'echo broken >&2; exit 1' })

    const { status, output } = runCli([command])

    assert.equal(status, 1)
    assert.match(output, /marketplace: could not list the marketplaces: broken/)
    assert.doesNotMatch(output, /mods not installed/)
    assert.ok(!claudeCalls().some((call) => /^plugin (marketplace add|marketplace update|install) /.test(call)))
  })

  test.each(COMMANDS)(
    'still refreshes the mods when the marketplace update fails, ending with exit code 1 (%s)',
    (command) => {
      fakeClaude({
        'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config"}]'`,
        'plugin marketplace list --json': ADDED_MARKETPLACE,
        'plugin marketplace update claude-config': 'echo offline >&2; exit 1',
      })

      const { status, output } = runCli([command])

      assert.equal(status, 1)
      assert.match(output, /marketplace: offline/)
      assert.ok(claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    },
  )

  test.each(COMMANDS)('keeps the old skills when datalogix fails to install (%s)', (command) => {
    fakeClaude({
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin install datalogix@claude-config': 'echo broken >&2; exit 1',
    })
    addOldSkill('review')

    const { status, output } = runCli([command])

    assert.equal(status, 1)
    assert.ok(fs.existsSync(skillPath('review')))
    assert.match(output, /kept: review in ~\/\.claude\/skills \(datalogix is not installed yet/)
  })

  test.each(COMMANDS)('replaces the mods under their earlier names (%s)', (command) => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"passos@claude-config"},{"id":"topicos@claude-config"},{"id":"passos@other"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
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
      'plugin list --json': `echo '[{"id":"passos@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
      'plugin install steps@claude-config': 'echo "not found" >&2; exit 1',
    })

    const { status, output } = runCli([command])

    assert.equal(status, 1)
    assert.ok(!claudeCalls().includes('plugin uninstall --keep-data passos@claude-config'))
    assert.match(output, /kept: passos \(steps is not installed yet/)
  })

  test.each(COMMANDS)('ends with exit code 1 when a mod under its earlier name fails to uninstall (%s)', (command) => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"passos@claude-config"},{"id":"steps@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
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
      'plugin list --json': `echo '[{"id":"status@claude-config"}]'`,
      'plugin marketplace list --json': ADDED_MARKETPLACE,
    })

    const { status, output } = runCli([command])

    assert.equal(status, 0, output)
    assert.match(output, /status: ignoring options it no longer has \(notificar="nunca"\);.+to stop this warning/)
  })
})
