// @ts-check
// Run without a terminal; what install and update do the same way is in
// cli-update.test.js.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'vitest'
import {
  GITHUB_MARKETPLACE_REPLY,
  assertCalledBefore,
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
     * @param {string} skillName
     * @param {string} marketplaceName
     * @returns {string} the skill folder inside a new clone of that marketplace
     */
    const addSkillInClone = (skillName, marketplaceName) => {
      const clone = path.join(tmpDir, 'clone')
      fs.mkdirSync(path.join(clone, '.claude-plugin'), { recursive: true })
      fs.writeFileSync(path.join(clone, '.claude-plugin/marketplace.json'), JSON.stringify({ name: marketplaceName }))
      const folder = path.join(clone, 'skills', skillName)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'SKILL.md'), '')
      fs.mkdirSync(path.dirname(skillPath(skillName)), { recursive: true })
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
      const folder = addSkillInClone('pr', 'claude-config')
      fs.symlinkSync(target(folder), skillPath('pr'))

      const { status, output } = runCli(['install'])

      assert.equal(status, 0, output)
      assert.ok(!lstatOrUndefined(skillPath('pr')))
      assert.ok(fs.existsSync(path.join(folder, 'SKILL.md')), 'the clone was removed through the link')
    })

    test.each([
      [
        'a link into a clone of another marketplace',
        () => fs.symlinkSync(addSkillInClone('review', 'other'), skillPath('review')),
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
    ])('keeps %s', (_, addEntry) => {
      fakeClaude()
      addEntry()

      const { status, output } = runCli(['install'])

      assert.equal(status, 0, output)
      assert.ok(lstatOrUndefined(skillPath('review')))
    })
  })

  test('fails the run when claude --version hangs, instead of calling it not installed', () => {
    fakeClaude({ '--version': 'exec /bin/sleep 10' })

    const { status, output } = runCli(['install'], CLI, { DATALOGIX_CLAUDE_TIMEOUT_MS: '500' })

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
      assert.deepEqual(claudeCalls(), ['--version', 'plugin list --json', 'plugin marketplace list --json'])
    })

    test('fails on the mod list, installing nothing', () => {
      fakeClaude({ 'plugin list --json': reply })

      const { status, output } = runCli(['install'])

      assert.equal(status, 1, output)
      assert.match(output, /could not list the installed mods: unexpected reply/)
      assert.ok(!claudeCalls().some((call) => call.startsWith('plugin install')))
    })
  })

  test('shows what claude wrote on stderr when its reply to a list is empty', () => {
    fakeClaude({ 'plugin marketplace list --json': 'echo "warn on stderr" >&2' })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1, output)
    assert.match(output, /unexpected reply \(warn on stderr\)/)
  })

  test('finds this marketplace after another one in the list', () => {
    fakeClaude({
      'plugin marketplace list --json': `echo '[{"name":"other","repo":"a/b"},{"name":"claude-config","repo":"datalogix/claude-config"}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace update claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin marketplace add')))
  })

  test('adds this marketplace when the list only has another one', () => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"other","repo":"a/b"}]'` })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.ok(claudeCalls().includes('plugin marketplace add datalogix/claude-config'))
  })

  test('keeps the reload hint in the closing line after a failure', () => {
    fakeClaude({
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [`plugin install ${PLAIN_MOD}@claude-config`]: 'echo broken >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1, output)
    assert.match(output, /Finished with errors \(see above\)\. Run \/clear and \/reload-plugins/)
  })

  test('ends with exit code 1 when the marketplace cannot be added', () => {
    fakeClaude({ 'plugin marketplace add datalogix/claude-config': 'echo denied >&2; exit 1' })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1, output)
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

    assert.equal(status, 1, output)
    assert.match(output, /mods skipped \(/)
    assert.doesNotMatch(output, /git ls-remote/)
  })

  test('updates the mods already installed when the marketplace was just added', () => {
    fakeClaude({ 'plugin list --json': installedMods(PLAIN_MOD) })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace add datalogix/claude-config'))
    assert.ok(calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
  })

  test('installs a mod that is only installed in the scope of another project', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config","scope":"project"}]'`,
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes(`plugin install ${PLAIN_MOD}@claude-config`))
    assert.ok(!calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    assert.match(output, new RegExp(`installed: ${PLAIN_MOD}`))
  })

  test('points out a mod installed in the scope of this project', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config","scope":"local","projectPath":"${fs.realpathSync(process.cwd())}"}]'`,
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`${PLAIN_MOD}@claude-config is installed in this project's local scope`))
  })

  test('says nothing of a mod installed in the scope of another project', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config","scope":"project","projectPath":"/elsewhere"}]'`,
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /scope, which this command leaves alone/)
  })

  test('warns about a copy in the skills folder of a project', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config","scope":"user"},{"id":"${PLAIN_MOD}@skills-dir","scope":"project"}]'`,
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`${PLAIN_MOD} is also loaded from a skills folder`))
  })

  test('takes a mod in the user scope as installed', () => {
    fakeClaude({
      'plugin list --json': `echo '[{"id":"${PLAIN_MOD}@claude-config","scope":"user"}]'`,
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    assert.ok(!calls.includes(`plugin install ${PLAIN_MOD}@claude-config`))
  })

  test('warns about a mod also loaded from a skills folder, even when already installed', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD, `${PLAIN_MOD}@skills-dir`),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`${PLAIN_MOD} is also loaded from a skills folder`))
  })

  test('warns about a mod also loaded from a skills folder when the marketplace cannot be added', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD, `${PLAIN_MOD}@skills-dir`),
      'plugin marketplace add datalogix/claude-config': 'echo denied >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1, output)
    assert.match(output, new RegExp(`${PLAIN_MOD} is also loaded from a skills folder`))
  })

  test('does not warn about a mod in a skills folder that failed to install', () => {
    fakeClaude({
      'plugin list --json': installedMods(`${PLAIN_MOD}@skills-dir`),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [`plugin install ${PLAIN_MOD}@claude-config`]: 'echo broken >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1, output)
    assert.doesNotMatch(output, new RegExp(`${PLAIN_MOD} is also loaded from a skills folder`))
  })

  test('ends with exit code 1 when a mod fails to install', () => {
    fakeClaude({ [`plugin install ${PLAIN_MOD}@claude-config`]: 'echo broken >&2; exit 1' })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1, output)
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
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.ok(!claudeCalls().some((call) => call.startsWith('plugin marketplace add')))
    assert.match(
      output,
      /comes from datalogix\/claude-config, not .+; to switch, run "claude plugin marketplace remove/,
    )
  })

  test('neither updates the marketplace nor the mods when it comes from another source', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.match(output, /; not updated/)
    assert.match(output, new RegExp(`unchanged: ${PLAIN_MOD}\\n`))
    const calls = claudeCalls()
    assert.ok(!calls.includes('plugin marketplace update claude-config'))
    assert.ok(!calls.some((call) => call.startsWith('plugin update ')))
  })

  test.each([
    ['a clone', () => `"path":"${tmpDir}"`],
    ['another repo', () => '"repo":"other/claude-config"'],
    ['another git URL', () => '"source":"git","url":"https://github.com/other/claude-config.git"'],
    ['another text source', () => '"source":"github:x/y"'],
  ])('without --link, updates a marketplace added from %s', (_, source) => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': `echo '[{"name":"claude-config",${source()}}]'`,
    })

    const { status, output } = runCli([])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /comes from/)
    assert.ok(claudeCalls().includes('plugin marketplace update claude-config'))
    assert.ok(claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
  })

  test.each([
    ['a path that no longer exists', 'gone'],
    ['another clone', ''],
  ])('warns when --link finds the marketplace added from %s', (_, folder) => {
    const source = path.join(tmpDir, folder)
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","path":"${source}"}]'` })

    const { status, output } = runCli(['install', '--link'])

    assert.equal(status, 0, output)
    assert.match(output, /comes from .+, not .+; not updated/)
    assert.ok(!claudeCalls().includes('plugin marketplace update claude-config'))
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

  test.each([
    ['no source', '{"name":"claude-config"}'],
    ['source fields that are not text', '{"name":"claude-config","repo":123,"path":{},"url":[]}'],
  ])('with --link, updates a marketplace listed with %s', (_, entry) => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[${entry}]'` })

    const { status, output } = runCli(['--link'])

    assert.equal(status, 0, output)
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

  test('keeps the credentials of the marketplace URL out of the output', () => {
    fakeClaude({
      'plugin marketplace list --json': `echo '[{"name":"claude-config","url":"https://user:p@ss@example.invalid/x.git"}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /already added from https:\/\/example\.invalid\/x\.git/)
    assert.doesNotMatch(output, /p@ss/)
  })

  test('keeps the credentials of the marketplace URL out of the --link warning', () => {
    fakeClaude({
      'plugin marketplace list --json': `echo '[{"name":"claude-config","url":"https://user:p@ss@example.invalid/x.git"}]'`,
    })

    const { output } = runCli(['--link'])

    assert.match(output, /comes from https:\/\/example\.invalid\/x\.git/)
    assert.doesNotMatch(output, /p@ss/)
  })

  test('keeps the credentials of a marketplace URL with an uppercase scheme out of the output', () => {
    fakeClaude({
      'plugin marketplace list --json': `echo '[{"name":"claude-config","url":"HTTPS://user:secret@example.invalid/x.git"}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.doesNotMatch(output, /secret/)
  })

  test.each([
    ['a password with a slash', 'https://user:p/secret@example.invalid/x.git', 'https://example.invalid/x.git'],
    ['a token in the query', 'https://example.invalid/x.git?token=secret', 'https://example.invalid/x.git'],
    ['a token in the fragment', 'https://example.invalid/x.git#secret', 'https://example.invalid/x.git'],
    ['a password in an ssh URL', 'ssh://git:secret@example.invalid/x.git', 'ssh://example.invalid/x.git'],
  ])('keeps %s out of the output', (_, url, shown) => {
    fakeClaude({ 'plugin marketplace list --json': `echo '[{"name":"claude-config","url":"${url}"}]'` })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.ok(output.includes(`already added from ${shown}`), output)
    assert.doesNotMatch(output, /secret/)
  })

  test('keeps the user of an ssh marketplace URL in the output', () => {
    fakeClaude({
      'plugin marketplace list --json': `echo '[{"name":"claude-config","url":"ssh://git@example.invalid/x.git"}]'`,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /already added from ssh:\/\/git@example\.invalid\/x\.git/)
  })

  test('notes the marketplace already added from the requested source', () => {
    fakeClaude({ 'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, /already added from datalogix\/claude-config/)
    assert.doesNotMatch(output, /comes from/)
  })

  test('updates the marketplace and the mods already installed', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 0, output)
    assert.match(output, new RegExp(`updated: ${PLAIN_MOD}\\n`))
    assertCalledBefore('plugin marketplace update claude-config', `plugin update ${PLAIN_MOD}@claude-config --json`)
    // The fake update prints no versions, which counts as a change.
    assert.match(output, /reload-plugins/)
    assert.doesNotMatch(output, /unchanged: /)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace update claude-config'))
    assert.ok(calls.includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
    assert.ok(!calls.includes(`plugin install ${PLAIN_MOD}@claude-config`))
    assert.ok(!calls.includes('plugin update topics@claude-config --json'))
  })

  test('ends with exit code 1 when an installed mod fails to update', () => {
    fakeClaude({
      'plugin list --json': installedMods(PLAIN_MOD),
      'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      [`plugin update ${PLAIN_MOD}@claude-config --json`]: 'echo broken >&2; exit 1',
    })

    const { status, output } = runCli(['install'])

    assert.equal(status, 1, output)
    assert.match(output, new RegExp(`${PLAIN_MOD}: broken`))
    assert.doesNotMatch(output, /updated:/)
  })

  test('installs from a copy with only the published files', () => {
    // What npm always ships, plus package.json's files; @clack/prompts is linked so the copy loads.
    const copy = path.join(tmpDir, 'node_modules/claude-config')
    fs.mkdirSync(copy, { recursive: true })
    fs.cpSync(path.join(ROOT, 'package.json'), path.join(copy, 'package.json'))
    const { files } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    for (const file of fs.globSync(files, { cwd: ROOT })) {
      fs.cpSync(path.join(ROOT, file), path.join(copy, file), { recursive: true })
    }
    fs.symlinkSync(path.join(ROOT, 'node_modules/@clack'), path.join(tmpDir, 'node_modules/@clack'))

    fakeClaude()

    const { status, output } = runCli(['install'], path.join(copy, 'bin/cli.js'))

    assert.equal(status, 0, output)
    for (const name of MODS) {
      assert.ok(claudeCalls().includes(`plugin install ${name}@claude-config`), name)
    }
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

    assert.equal(status, 1, output)
    assert.match(output, /--link needs a clone/)
    assert.deepEqual(claudeCalls(), [])
  })
})

describe('arguments', () => {
  test.each(['--help', '-h'])('%s shows the usage', (flag) => {
    const { status, output } = runCli([flag])

    assert.equal(status, 0, output)
    assert.match(output, /Usage:/)
    assert.match(output, /npx --allow-git=root github:datalogix\/claude-config#main/)
  })

  test('installs when no command is given', { skip: process.platform === 'win32' }, () => {
    fakeClaude()

    const { status, output } = runCli([])

    assert.equal(status, 0, output)
    const calls = claudeCalls()
    assert.ok(calls.includes('plugin marketplace add datalogix/claude-config'))
    for (const name of MODS) {
      assert.ok(calls.includes(`plugin install ${name}@claude-config`), `${name} not installed`)
    }
  })

  test(
    'without a terminal, leaves a new mod out once any mod is installed',
    { skip: process.platform === 'win32' },
    () => {
      fakeClaude({
        'plugin list --json': installedMods(PLAIN_MOD),
        'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      })

      const { status, output } = runCli([])

      assert.equal(status, 0, output)
      assert.ok(claudeCalls().includes(`plugin update ${PLAIN_MOD}@claude-config --json`))
      assert.ok(!claudeCalls().some((call) => call.startsWith('plugin install')))
    },
  )

  test.each([[['--configure']], [['install', '--configure']]])(
    'without a terminal, %j installs every mod',
    { skip: process.platform === 'win32' },
    (args) => {
      fakeClaude({
        'plugin list --json': installedMods(PLAIN_MOD),
        'plugin marketplace list --json': GITHUB_MARKETPLACE_REPLY,
      })

      const { status, output } = runCli(args)

      assert.equal(status, 0, output)
      for (const name of MODS.filter((name) => name !== PLAIN_MOD)) {
        assert.ok(claudeCalls().includes(`plugin install ${name}@claude-config`), `${name} not installed`)
      }
    },
  )

  test('takes --link without a command', { skip: process.platform === 'win32' }, () => {
    fakeClaude()

    const { status, output } = runCli(['--link'])

    assert.equal(status, 0, output)
    assert.ok(claudeCalls().includes(`plugin marketplace add ${ROOT}`))
  })

  test('shows the usage for --help after a command, without running it', () => {
    fakeClaude()

    const { status, output } = runCli(['update', '--help'])

    assert.equal(status, 0, output)
    assert.match(output, /Usage:/)
    assert.equal(fs.existsSync(path.join(tmpDir, 'calls')), false)
  })

  // toString: a name from Object.prototype.
  test.each(['instal', 'toString'])('rejects %s as a command', (command) => {
    const { status, output } = runCli([command])

    assert.equal(status, 1, output)
    assert.match(output, new RegExp(`Unknown command "${command}"`))
  })

  test.each([
    ['update', '--link'],
    ['update', '--configure'],
    ['install', '--force'],
    ['update', ''],
  ])('rejects a flag the command does not take (%s "%s")', (command, flag) => {
    const { status, output } = runCli([command, flag])

    assert.equal(status, 1, output)
    assert.match(output, new RegExp(`Unknown flag "${flag}" for ${command}`))
  })
})
