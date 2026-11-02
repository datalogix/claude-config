// Plain-text contracts: the `## Pendências` items the topics mod parses, in every Markdown file of the skills, the
// steps and items one skill follows in another, and the supporting files the review skill names.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, test } from 'vitest'

import { ACTIONS_TITLE, parseActions, withoutStanceMark } from '../mods/topics/hooks/parse.ts'

const skillsDir = new URL('../mods/datalogix/skills/', import.meta.url)
/** @param {string} file */
const read = (file) => fs.readFileSync(new URL(file, skillsDir), 'utf8')
/**
 * For phrases: skills are wrapped by hand, so a line break says nothing.
 *
 * @param {string} file
 */
const flat = (file) => read(file).replace(/\s+/g, ' ')

const CODE_SPAN = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g
const ITEM_MARK = /- (?:\[[ xX]\]|\([ xX•●]\))(?=\s|$)/

/**
 * A span the skill wraps is joined into one line. A bare mark such as `- [x]`
 * only names the format and is left out.
 *
 * @param {string} markdown
 */
const itemsOf = (markdown) =>
  [...markdown.matchAll(CODE_SPAN)]
    .map((match) => match[2].replace(/\s*\n\s*/g, ' ').trim())
    .filter((span) => /^- [[(]/.test(span) && !/^- (?:\[[ xX]\]|\([ xX•●]\))$/.test(span))

const markdownFiles = fs
  .readdirSync(skillsDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.md'))
const skillNames = fs.readdirSync(skillsDir).filter((name) => fs.existsSync(new URL(`${name}/SKILL.md`, skillsDir)))

describe.each(skillNames)('/datalogix:%s', (name) => {
  // A stray backtick swaps text and spans, which would take its items out of the check below with no test failing.
  test('still has items, under the topic topics looks for', () => {
    const skill = read(`${name}/SKILL.md`)
    assert.ok(itemsOf(skill).length > 0)
    assert.ok(skill.includes(`## ${ACTIONS_TITLE}`))
  })
})

describe.each(markdownFiles)('%s', (file) => {
  test('has no item outside a code span', () => {
    assert.doesNotMatch(read(file).replace(CODE_SPAN, ''), ITEM_MARK)
  })

  test.each(itemsOf(read(file)))('topics parses %s', (span) => {
    const { items: parsed } = parseActions(span)
    assert.equal(parsed.length, 1)
    const [item] = parsed
    // Two items in one span read as one, with the second inside its text.
    assert.doesNotMatch(item.text, / - (?:\[[ xX]\]|\([ xX•●]\)) /)
    assert.equal(item.isRadio, span.startsWith('- ('))
    assert.equal(item.isSuggested, /^- (?:\[[xX]\]|\([xX•●]\))/.test(span))
    // A stance only at the start and with a known word: any other reads as plain text, with no mark on screen.
    assert.doesNotMatch(
      item.text.replace(/^\((?:recomendo|não recomendo|avalie)\) /, ''),
      /\((?:n[ãa]o )?recomend|\(avalie/i,
    )
    assert.notEqual(withoutStanceMark(item.text), '')
  })
})

test('the skills that follow the issue skill language item still find it', () => {
  const step2 = /^## 2\. .*\n([\s\S]*?)^## 3\. /m.exec(read('issue/SKILL.md'))
  assert.ok(step2, 'issue/SKILL.md has no step 2 followed by step 3')
  assert.match(step2[1], /^- Idioma:/m)

  for (const skill of ['pr', 'commit', 'review']) {
    assert.ok(flat(`${skill}/SKILL.md`).includes('item "Idioma" do passo 2 de `${CLAUDE_SKILL_DIR}/../issue/SKILL.md`'))
  }
})

test('the issue skill still writes the language line the skills look for', () => {
  assert.ok(flat('issue/SKILL.md').includes('`- Issues and pull requests: <idioma>`'))
})

test('the language item still starts from the commit titles, and review keeps no fallback of its own', () => {
  assert.ok(flat('issue/SKILL.md').includes('detecte pelos últimos títulos de commit'))
  assert.ok(!flat('review/SKILL.md').includes('sem essa linha, em português'))
})

test('the skills that follow the commit skill dated branch item still find it', () => {
  const step1 = /^## 1\. .*\n([\s\S]*?)^## 2\. /m.exec(read('commit/SKILL.md'))
  assert.ok(step1, 'commit/SKILL.md has no step 1 followed by step 2')
  assert.match(step1[1], /^- Branch com data:/m)

  for (const skill of ['pr', 'review']) {
    assert.ok(
      flat(`${skill}/SKILL.md`).includes(
        'item "Branch com data" do passo 1 de `${CLAUDE_SKILL_DIR}/../commit/SKILL.md`',
      ),
    )
  }
})

test('the pr skill still follows the issue skill from its step 2', () => {
  assert.ok(flat('pr/SKILL.md').includes('`${CLAUDE_SKILL_DIR}/../issue/SKILL.md` e siga-o a partir do passo 2'))
  assert.match(read('issue/SKILL.md'), /^## 2\. Contexto do projeto$/m)
})

test('the review skill still follows the commit skill from its step 2, with its commits as the groups', () => {
  const review = flat('review/SKILL.md')
  assert.ok(review.includes('`${CLAUDE_SKILL_DIR}/../commit/SKILL.md` e siga-o a partir do passo 2'))
  assert.ok(review.includes('fossem os grupos marcados no passo 1 dele'))
  assert.match(read('commit/SKILL.md'), /^## 2\. Contexto$/m)
  assert.ok(flat('commit/SKILL.md').includes('grupos marcados no passo 1'))
})

test('the commit skill still takes the groups as an argument', () => {
  assert.match(read('commit/SKILL.md'), /^- `grupos: <título> \(<arquivos>\); \.\.\.`:/m)
  assert.ok(flat('commit/SKILL.md').includes('Com `grupos:` nos argumentos'))
})

test('the commit skill still reads paths safely', () => {
  const commit = flat('commit/SKILL.md')
  assert.ok(commit.includes('core.quotePath=false'))
  assert.ok(commit.includes('--name-only --no-renames'))
})

describe('the supporting files of the review skill', () => {
  /** @param {string} file */
  const exists = (file) => fs.existsSync(new URL(`review/${file}`, skillsDir))
  const reviewFiles = markdownFiles.filter((file) => file.startsWith('review'))

  test.each(fs.readdirSync(new URL('review/types/', skillsDir)))('every step of %s has its checklist', (type) => {
    const steps = [...read(`review/types/${type}`).matchAll(/^\d+\. `([\w-]+)` /gm)].map((match) => match[1])
    assert.ok(steps.length > 0, 'lists no steps')
    for (const step of steps) assert.ok(exists(`steps/${step}.md`), step)
  })

  test('every file they name exists', () => {
    for (const file of reviewFiles) {
      for (const [name] of read(file).matchAll(/\b(?:steps|types|modes)\/[\w-]+\.md\b/g)) {
        assert.ok(exists(name), `${file}: ${name}`)
      }
    }
  })

  test.each(['http', 'jobs'])('the code step has its extra checklist %s', (extra) => {
    assert.ok(exists(`steps/${extra}.md`))
  })
})
