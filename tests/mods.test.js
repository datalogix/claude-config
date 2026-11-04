// @ts-check
// The rules CLAUDE.md sets for every mod, the copy of a regex two mods keep the same, and the files CI names by hand.
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
  for (const file of job[1].split(' ')) assert.ok(fs.existsSync(path.join(ROOT, file)), file)
})

test('the marketplace lists only mods that exist', () => {
  assert.deepEqual(
    marketplace.plugins.map((/** @type {{ name: string }} */ plugin) => plugin.name).sort(),
    [...modNames].sort(),
  )
})

test('status keeps the same FENCE as topics', () => {
  const fenceOf = (/** @type {string} */ file) => read(file).match(/^const FENCE = .+$/m)?.[0]
  const fence = fenceOf('mods/topics/hooks/parse.ts')
  assert.ok(fence)
  assert.equal(fenceOf('mods/status/hooks/register.ts'), fence)
})
