// The review skill ships its own copy of the license, used as the model for
// packages; it must stay identical to this repository's.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'vitest'

test('the review skill license template matches LICENSE', () => {
  /** @param {string} file */
  const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')
  assert.equal(read('../mods/datalogix/skills/review/templates/LICENSE'), read('../LICENSE'))
})
