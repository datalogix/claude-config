// The skills' `## Pendências` items (parsed by the topics mod) and the issue
// skill's step 2 (followed by pr and commit) are plain-text contracts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, test } from 'vitest'

import { RECOMMENDED_MARK, parseActions, withoutRecommendedMark } from '../mods/topics/hooks/parse.ts'

const skillsDir = new URL('../mods/datalogix/skills/', import.meta.url)
/** @param {string} file */
const read = (file) => fs.readFileSync(new URL(file, skillsDir), 'utf8')

/**
 * A span the skill wraps is joined into one line. A bare mark such as `- [x]`
 * only names the format and is left out.
 *
 * @param {string} markdown
 */
const itemsOf = (markdown) =>
  [...markdown.matchAll(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g)]
    .map((match) => match[2].replace(/\s*\n\s*/g, ' ').trim())
    .filter((span) => /^- [[(]/.test(span) && !/^- (?:\[[ xX]\]|\([ xX•●]\))$/.test(span))

const skills = fs
  .readdirSync(skillsDir)
  .filter((name) => fs.existsSync(new URL(`${name}/SKILL.md`, skillsDir)))
  .map((name) => [name, itemsOf(read(`${name}/SKILL.md`))])
  // Skills with no items have nothing to check; an empty suite would fail.
  .filter(([, items]) => items.length > 0)

describe.each(skills)('/datalogix:%s', (_skill, items) => {
  test.each(items)('topics parses %s', (span) => {
    const { items: parsed } = parseActions(span)
    assert.equal(parsed.length, 1)
    const [item] = parsed
    // Two items in one span read as one, with the second inside its text.
    assert.doesNotMatch(item.text, / - (?:\[[ xX]\]|\([ xX•●]\)) /)
    assert.equal(item.isRadio, span.startsWith('- ('))
    assert.equal(item.isSuggested, /^- (?:\[[xX]\]|\([xX•●]\))/.test(span))
    if (/\(recomendad[oa]\)/.test(span)) {
      assert.match(item.text, RECOMMENDED_MARK)
      assert.notEqual(withoutRecommendedMark(item.text), '')
    }
  })
})

test('the skills that follow the issue skill language item still find it', () => {
  const step2 = /^## 2\. .*\n([\s\S]*?)^## 3\. /m.exec(read('issue/SKILL.md'))
  assert.ok(step2, 'issue/SKILL.md has no step 2 followed by step 3')
  assert.match(step2[1], /^- Idioma:/m)

  for (const skill of ['pr', 'commit']) {
    assert.match(
      read(`${skill}/SKILL.md`),
      /item "Idioma" do passo 2 de\s+`\$\{CLAUDE_SKILL_DIR\}\/\.\.\/issue\/SKILL\.md`/,
    )
  }
})

test('the pr skill still follows the issue skill from its step 2', () => {
  assert.match(read('pr/SKILL.md'), /`\$\{CLAUDE_SKILL_DIR\}\/\.\.\/issue\/SKILL\.md` e\s+siga-o a partir do passo 2/)
  assert.match(read('issue/SKILL.md'), /^## 2\. Contexto do projeto$/m)
})

test('the review skill still follows the commit skill from its step 2', () => {
  assert.match(
    read('review/SKILL.md'),
    /`\$\{CLAUDE_SKILL_DIR\}\/\.\.\/commit\/SKILL\.md`\s+e\s+siga-o a partir do passo 2/,
  )
  const commit = read('commit/SKILL.md')
  assert.match(commit, /^## 2\. Contexto$/m)
  assert.match(commit, /grupos marcados no passo 1/)
})
