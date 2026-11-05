// @ts-check
// The rules CLAUDE.md sets for every mod, the code two mods keep the same, and the files CI names by hand.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'vitest'
import { ROOT } from './helpers/cli.js'

/** @param {string} file */
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
/** @param {string} file */
const readJson = (file) => JSON.parse(read(file))

const marketplace = readJson('.claude-plugin/marketplace.json')
const testCommands = readJson('package.json').scripts.test.split(' && ')
// A folder without a manifest is no mod: a .DS_Store, or the ignored types of one removed since.
const modNames = fs
  .readdirSync(path.join(ROOT, 'mods'))
  .filter((name) => fs.existsSync(path.join(ROOT, `mods/${name}/.claude-plugin/plugin.json`)))

describe.each(modNames)('the mod %s', (name) => {
  const manifest = readJson(`mods/${name}/.claude-plugin/plugin.json`)
  const entry = marketplace.plugins.find((/** @type {{ name: string }} */ plugin) => plugin.name === name)
  const hasHooks = fs.existsSync(path.join(ROOT, `mods/${name}/hooks/hooks.json`))

  test('has the name of its folder', () => {
    assert.equal(manifest.name, name)
  })

  test('has no version, so every push reaches update', () => {
    assert.equal(manifest.version, undefined)
    assert.equal(entry?.version, undefined)
  })

  test('declares its license and author', () => {
    assert.equal(manifest.license, 'MIT')
    assert.deepEqual(manifest.author, { name: 'datalogix' })
  })

  test('is in the marketplace', () => {
    assert.equal(entry?.source, `./mods/${name}`)
  })

  test('has its tests in the test script when it has hooks', () => {
    assert.equal(testCommands.includes(`claude plugin test mods/${name}`), hasHooks)
  })

  test('has hooks, unless it is datalogix', () => {
    assert.equal(hasHooks, name !== 'datalogix')
  })

  test('points to a types file that exists', () => {
    if (manifest.types) assert.ok(fs.existsSync(path.join(ROOT, `mods/${name}`, manifest.types)), manifest.types)
  })

  test('extends the generated types when it has hooks', () => {
    if (hasHooks) assert.equal(readJson(`mods/${name}/tsconfig.json`).extends, './.claude-plugin/types/tsconfig.json')
  })
})

test('the windows job names only test files that exist', () => {
  const job = /^ {2}windows:\n[\s\S]*?^\s+- run: npx vitest run (.+)$/m.exec(read('.github/workflows/ci.yml'))
  assert.ok(job)
  const files = job[1].split(' ')
  for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), file)
  // It skips itself anywhere else, so this job is the only one that runs it.
  assert.ok(files.includes('tests/quote-cmd.test.js'))
})

test('the marketplace lists only mods that exist', () => {
  assert.deepEqual(
    marketplace.plugins.map((/** @type {{ name: string }} */ plugin) => plugin.name).sort(),
    [...modNames].sort(),
  )
})

describe('status keeps the copies of topics the same', () => {
  const topics = read('mods/topics/hooks/parse.ts')
  const status = read('mods/status/hooks/register.ts')
  const lineOf = (/** @type {string} */ text, /** @type {string} */ name) =>
    new RegExp(`^const ${name} = .+$`, 'm').exec(text)?.[0]
  /** From its declaration to the first closing brace at column 0, without the export. */
  const functionOf = (/** @type {string} */ text, /** @type {string} */ name) =>
    new RegExp(`^(?:export )?(const ${name} = [\\s\\S]*?^}$)`, 'm').exec(text)?.[1]

  test.each(['FENCE', 'QUOTE', 'LIST_ITEM', 'CODE_MARK', 'INLINE_MAX'])('%s', (name) => {
    const line = lineOf(topics, name)
    assert.ok(line)
    assert.equal(lineOf(status, name), line)
  })

  test('plainText', () => {
    const code = functionOf(topics, 'plainText')
    assert.ok(code)
    assert.equal(functionOf(status, 'plainText'), code)
  })

  // status only asks whether a line is code, so its copy returns a boolean; the rest is the same.
  test('createCodeBlockTracker, apart from what it returns', () => {
    const code = functionOf(topics, 'createCodeBlockTracker')
    assert.ok(code)
    assert.equal(
      functionOf(status, 'createCodeBlockTracker'),
      code
        .replace("(rawLine: string): 'open' | 'close' | 'code' | false", '(rawLine: string): boolean')
        .replace("return 'open'", 'return true')
        .replace("return 'close'", 'return true')
        .replace(" && 'code'", ''),
    )
  })
})
