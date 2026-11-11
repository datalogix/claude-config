// @ts-check
// Plain-text contracts of the skills: the `## Pendências` items the topics mod parses, in every Markdown file; the
// steps and items one skill follows in another; phrases the rules rely on; and the supporting files review names.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, test } from 'vitest'

// @ts-ignore Vitest takes the .ts extension; tsc only with allowImportingTsExtensions, and there is no tsconfig here.
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
// With any list marker and also a malformed mark, so only at the start of a line: **Text** (`span`) reads as ** ().
const LINE_ITEM = /^\s*[-*+]\s+(?:\[[ xX]?\]|\([ xX•●]?\))/m

/**
 * A span the skill wraps is joined into one line. A bare mark such as `- [x]`
 * only names the format and is left out.
 *
 * @param {string} markdown
 */
const itemsOf = (markdown) =>
  [...markdown.matchAll(CODE_SPAN)]
    .map((match) => match[2].replace(/\s*\n\s*/g, ' ').trim())
    .filter((span) => /^[-*+]\s+[[(]/.test(span) && !/^[-*+]\s+(?:\[[ xX]\]|\([ xX•●]\))$/.test(span))

const markdownFiles = fs
  .readdirSync(skillsDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.md'))
const skillNames = fs.readdirSync(skillsDir).filter((name) => fs.existsSync(new URL(`${name}/SKILL.md`, skillsDir)))

describe.each(skillNames)('/datalogix:%s', (name) => {
  // A skill that lost all its items would leave the checks below nothing to run on, with no test failing.
  test('still has items, under the topic topics looks for', () => {
    const skill = read(`${name}/SKILL.md`)
    assert.ok(itemsOf(skill).length > 0)
    assert.ok(skill.includes(`\`## ${ACTIONS_TITLE}\``))
  })
})

describe.each(markdownFiles)('%s', (file) => {
  test('has no item outside a code span', () => {
    const text = read(file).replace(CODE_SPAN, '')
    assert.doesNotMatch(text, ITEM_MARK)
    assert.doesNotMatch(text, LINE_ITEM)
  })

  test('no backtick inside an item cuts it short', () => {
    const text = read(file)
    for (const match of text.matchAll(CODE_SPAN)) {
      if (!/^[-*+]\s+[[(]/.test(match[2].trim())) continue
      assert.doesNotMatch(text.slice(match.index + match[0].length), /^[^\s.,;:)/]/, match[2])
    }
  })

  test.each(itemsOf(read(file)))('topics parses %s', (span) => {
    const { items: parsed } = parseActions(span)
    assert.equal(parsed.length, 1)
    const [item] = parsed
    // Two items in one span read as one, with the second inside its text.
    assert.doesNotMatch(item.text, / - (?:\[[ xX]\]|\([ xX•●]\)) /)
    assert.equal(item.isRadio, /^[-*+]\s+\(/.test(span))
    assert.equal(item.isSuggested, /^[-*+]\s+(?:\[[xX]\]|\([xX•●]\))/.test(span))
    // topics reads a ver: only on an indented line below the item.
    assert.doesNotMatch(item.text, /\bver:/i)
    // Skills write a stance only at the start, with a word of the format. parse.ts also takes "(recomendado)" and a
    // mark at the end, from older answers; anywhere else or with another word it reads as plain text, with no mark.
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

test('the language item asks instead of guessing from the commits, and records the answer by default', () => {
  const skill = flat('issue/SKILL.md')
  assert.ok(skill.includes('não o deduza dos commits'))
  assert.ok(skill.includes('`- [ ] (recomendo) Gravar no CLAUDE.md`'))
  assert.doesNotMatch(skill, /títulos de commit/)
})

test('the review skill keeps no language fallback of its own', () => {
  assert.doesNotMatch(flat('review/SKILL.md'), /sem essa linha[^.]*portugu[êe]s/i)
  assert.ok(flat('review/SKILL.md').includes('defina-os como na seção 2 antes de sugerir o primeiro commit'))
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

test('the skills that follow the commit skill format item still find it', () => {
  const step1 = /^## 1\. .*\n([\s\S]*?)^## 2\. /m.exec(read('commit/SKILL.md'))
  assert.ok(step1, 'commit/SKILL.md has no step 1 followed by step 2')
  assert.match(step1[1], /^- Formato:/m)

  for (const skill of ['pr', 'review']) {
    assert.ok(
      flat(`${skill}/SKILL.md`).includes('item "Formato" do passo 1 de `${CLAUDE_SKILL_DIR}/../commit/SKILL.md`'),
    )
  }
})

test('the format item asks instead of guessing from the commits, and records the answer by default', () => {
  const skill = flat('commit/SKILL.md')
  for (const line of [
    '`- Commits: Conventional Commits`',
    '`- Commits: no type prefix`',
    '`- [ ] (recomendo) Gravar no CLAUDE.md`',
  ]) {
    assert.ok(skill.includes(line), line)
  }
  assert.ok(skill.includes('não o deduza dos commits'))
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
  assert.ok(flat('commit/SKILL.md').includes('Com grupos marcados, os commits são esses grupos'))
})

test('the commit skill still takes the groups as an argument', () => {
  assert.match(read('commit/SKILL.md'), /^- `grupos: <título> \(<arquivos>\); \.\.\.`:/m)
  assert.ok(flat('commit/SKILL.md').includes('Com `grupos:` nos argumentos e algo em stage'))
  assert.ok(flat('commit/SKILL.md').includes('Com `grupos:` nos argumentos, parta deles'))
})

test('the commit skill still reads paths safely', () => {
  const commit = flat('commit/SKILL.md')
  assert.ok(commit.includes('core.quotePath=false'))
  assert.ok(commit.includes('--name-only --no-renames'))
})

describe('the text the skills keep in copies', () => {
  /**
   * From `start` up to `end`, with line breaks as spaces, since each file wraps it by hand.
   *
   * @param {string} file
   * @param {string} start
   * @param {RegExp} end
   */
  const copyOf = (file, start, end) => {
    const text = read(file)
    const from = text.indexOf(start)
    assert.ok(from >= 0, `${file}: ${start}`)
    const rest = text.slice(from + start.length)
    return `${start}${rest.slice(0, rest.search(end))}`.replace(/\s+/g, ' ')
  }

  const ANSWERS = 'Respostas às seções `## Pendências`'

  test('issue and pr read the answers to their lists the same way', () => {
    assert.equal(copyOf('issue/SKILL.md', ANSWERS, /\n\n/), copyOf('pr/SKILL.md', ANSWERS, /\n\n/))
  })

  test.each(['commit', 'ci'])('%s starts the answers from the same rules', (skill) => {
    const answers = copyOf(`${skill}/SKILL.md`, ANSWERS, /\n\n/)
    assert.ok(answers.includes('- Cada caixa vale como chega na resposta: marcada é sim; desmarcada, não faça aquilo.'))
    assert.ok(
      answers.includes(
        '- Resposta só em texto, sem a lista: nenhuma caixa conta como marcada, salvo as que o texto citar',
      ),
    )
  })

  test('issue and pr pass the title the same safe way', () => {
    const start = '- O título vai como literal'
    assert.equal(copyOf('issue/SKILL.md', start, /\n(?:- |\n)/), copyOf('pr/SKILL.md', start, /\n(?:- |\n)/))
  })
})

describe('the supporting files of the review skill', () => {
  /** @param {string} file */
  const exists = (file) => fs.existsSync(new URL(`review/${file}`, skillsDir))
  const reviewFiles = markdownFiles.filter((file) => file.startsWith('review'))

  const typeFiles = fs.readdirSync(new URL('review/types/', skillsDir)).filter((file) => file.endsWith('.md'))

  test.each(typeFiles)('every step of %s has its checklist', (type) => {
    const steps = [...read(`review/types/${type}`).matchAll(/^\d+\. `?([\w-]+)`?/gm)].map((match) => match[1])
    assert.ok(steps.length > 0, 'lists no steps')
    for (const step of steps) assert.ok(exists(`steps/${step}.md`), step)
  })

  test('every file they name exists', () => {
    for (const file of reviewFiles) {
      for (const [name] of read(file).matchAll(/\b(?:steps|types|modes)\/[\w-]+\.md\b|\btemplates\/[\w.-]+/g)) {
        assert.ok(exists(name), `${file}: ${name}`)
      }
    }
  })

  test('the bare names in steps/ are files of that folder', () => {
    for (const file of reviewFiles.filter((name) => name.startsWith('review/steps/'))) {
      for (const [, name] of read(file).matchAll(/(?<![/\w])`([a-z][\w-]*\.md)`/g)) {
        assert.ok(exists(`steps/${name}`), `${file}: ${name}`)
      }
    }
  })

  test.each(['http', 'jobs'])('the code step names its extra checklist %s, which exists', (extra) => {
    assert.ok(exists(`steps/${extra}.md`))
    assert.ok(read('review/steps/code.md').includes(`\`${extra}.md\``))
  })
})
