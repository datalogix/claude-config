// The rules CLAUDE.md sets for every mod, and the copy of a regex two mods keep the same.
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
const modNames = fs.readdirSync(path.join(ROOT, 'mods'))

describe.each(modNames)('the mod %s', (name) => {
  const manifest = readJson(`mods/${name}/.claude-plugin/plugin.json`)
  const entry = marketplace.plugins.find((/** @type {{ name: string }} */ plugin) => plugin.name === name)

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
    const hasHooks = fs.existsSync(path.join(ROOT, `mods/${name}/hooks/hooks.json`))
    assert.equal(testCommands.includes(`claude plugin test mods/${name}`), hasHooks)
  })
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
