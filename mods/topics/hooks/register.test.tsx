import type {
  On,
  PromptComposeInput,
  RenderPropsOf,
  RenderSurface,
  TurnCompleteInput,
  TurnStartInput,
  UiFocusInput,
} from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine as TestEngine } from 'claude-code/testing'

import {
  parseActions,
  parseAnswer,
  plainText,
  previewOf,
  questionOf,
  STANCE_MARK,
  stanceOf,
  sentText,
  toggleChecked,
  withoutStanceMark,
  defaultChecked,
} from './parse'

let mountCount = 0
const mountMessage = (
  $: TestEngine,
  text: string,
  requestId = `m${++mountCount}`,
  surface: RenderSurface = 'terminal',
) =>
  $.ui.mount({
    plugin: 'topics',
    surface,
    component: 'AssistantMessage',
    requestId,
    props: { text, isFirstOfReply: true },
  })

const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Tópicos',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const mountPane = ($: TestEngine, props = PANE_PROPS) =>
  $.ui.mount({ plugin: 'topics', surface: 'terminal', component: 'Pane', requestId: 'topics', props })

/**
 * A failing hook is skipped and the original drawn, so this wraps each message in a Box keyed `topics-<outcome>` to
 * tell that topics passed it on. Only literals: an inline plugin cannot reach this file's variables.
 */
const watcher = {
  name: 'watcher',
  tier: 'prepend',
  register(on: On) {
    on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
      const drawn = await next(e)
      const outcome = next.trace.find((t) => t.plugin === 'topics')?.outcome ?? 'none'
      const { Box } = $.ui.resolve(e)
      return <Box key={`topics-${outcome}`}>{drawn}</Box>
    })
  },
} as const
const withWatcher = { plugins: [watcher as never] }

/** Answers prompt.submit and collects what was sent. */
const collectSent = (on: On) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: '' } as never
  })
  return sent
}

const turnStartInput = (extra: Partial<TurnStartInput> = {}): TurnStartInput => ({ text: 'oi', turnId: 't1', ...extra })

const turnCompleteInput = (extra: Partial<TurnCompleteInput> = {}): TurnCompleteInput =>
  ({
    answer: '',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    ...extra,
  }) as TurnCompleteInput

const ANSWER = [
  'Resumo: três coisas mudaram.',
  '',
  '## Banco de dados',
  'Adicionei um índice na tabela de pedidos.',
  '```md',
  '## isto é código, não tópico',
  '```',
  '## Testes',
  '- Todos passaram.',
].join('\n')

const WITH_ACTIONS = [
  'Pronto, falta pouco.',
  '',
  '## Mudança',
  'Troquei a config.',
  '## Pendências',
  '- [ ] Rodar `npm test`',
  '- [x] Já aprovado',
  'Qualquer dúvida me avise.',
].join('\n')

/** For answers of a test that must differ from each other. */
const withTag = (text: string, tag: string) => text.replace('\n\n## ', `\n\n(${tag})\n\n## `)

const WITH_ALTERNATIVES = [
  'Achei um problema no badge.',
  '',
  '## O caso',
  'O X fica dentro do link.',
  '## Pendências',
  'Close dentro do link: o que fazer?',
  '- ( ) (recomendo) Manter como está',
  '  O X fecha o badge, mas o link ainda abre.',
  '  Ex.: clicar no X vai para /tags/php.',
  '  ver: o caso',
  '- ( ) Desfazer',
  '',
  '  Volta ao comportamento anterior.',
  '',
  'Outra coisa:',
  '- [ ] Rodar os testes',
].join('\n')

describe('parseAnswer', () => {
  test('splits intro and topics, ignoring titles inside code', () => {
    const parsed = parseAnswer(ANSWER)
    expect(parsed.intro).toBe('Resumo: três coisas mudaram.')
    expect(parsed.topics.map((t) => t.title)).toEqual(['Banco de dados', 'Testes'])
    expect(parsed.topics[0]?.body).toContain('## isto é código')
  })

  for (const [name, lines, titles] of [
    [
      'a backtick block only closes with as long a fence',
      ['## A', '````md', '```', '## dentro', '~~~', '````', '## B'],
      ['A', 'B'],
    ],
    ['a tilde block only closes with tildes', ['## A', '~~~', '```', '## dentro', '~~~', '## B'], ['A', 'B']],
    [
      'a fence with text after it does not close the block',
      ['## A', '```', '```js', '## dentro', '```', '## B'],
      ['A', 'B'],
    ],
    ['a line with backticks after the opening ones is not a fence', ['## A', '```js const```', '## B'], ['A', 'B']],
    [
      'a title ending in # keeps it; a closing run after a space goes',
      ['## Usar C#', 'x', '## Outro ##', 'y'],
      ['Usar C#', 'Outro'],
    ],
    ['a ### title stays inside its topic', ['## A', '### Sub', 'x', '## B'], ['A', 'B']],
    ['a longer fence closes the block', ['## A', '```', '## dentro', '`````', '## B'], ['A', 'B']],
    ['a tilde fence may have a backtick after it', ['## A', '~~~ a`b', '## dentro', '~~~', '## B'], ['A', 'B']],
    ['a fence opened on a numbered item closes', ['1. ```bash', '   ## dentro', '   ```', '## A', '## B'], ['A', 'B']],
    ['a fence opened on a bullet item closes', ['- ```bash', '  ## dentro', '  ```', '## A', '## B'], ['A', 'B']],
    [
      'a fence after a list marker does not close a block',
      ['## A', '```', '- ```', '## dentro', '```', '## B'],
      ['A', 'B'],
    ],
    ['a title of only spaces is not a topic', ['x', '##  ', 'y', '## A', 'z'], ['A']],
    ['the end of a list item ends a fence opened on it', ['- ~~~riscado~~~ texto', '', '## A', '## B'], ['A', 'B']],
    ['the end of a quote ends a fence opened in it', ['> ```', '> code', '', '## A', '## B'], ['A', 'B']],
    ['the end of a list item ends an indented fence', ['- item', '  ```', '  x', '## A', '## B'], ['A', 'B']],
    ['a fence at column 0 closes an indented one', ['## A', '  ```', '  x', '```', '## B'], ['A', 'B']],
    [
      'a quoted fence does not close a block opened outside',
      ['## A', '```', '> ```', '## dentro', '```', '## B'],
      ['A', 'B'],
    ],
  ] as const) {
    test(name, () => {
      expect(parseAnswer(lines.join('\n')).topics.map((t) => t.title)).toEqual(titles)
    })
  }

  for (const title of [
    'Pendencias',
    '**Pendências**',
    '__Pendências__',
    'Pendências:',
    'PENDÊNCIAS',
    'Pendências :',
    '**Pendências: **',
  ]) {
    test(`"${title}" is the Pendências list`, () => {
      expect(parseAnswer(`## ${title}\n- [ ] Revisar`)).toEqual({
        intro: '',
        topics: [],
        actions: {
          items: [{ text: 'Revisar', isSuggested: false, isRadio: false, details: [] }],
          parts: [{ itemIndex: 0 }],
        },
      })
    })
  }

  test('takes "Pendências" out of the topics and reads the checkboxes', () => {
    const parsed = parseAnswer(WITH_ACTIONS)
    expect(parsed.topics.map((t) => t.title)).toEqual(['Mudança'])
    expect(parsed.actions?.items).toEqual([
      { text: 'Rodar `npm test`', isSuggested: false, isRadio: false, details: [] },
      { text: 'Já aprovado', isSuggested: true, isRadio: false, details: [] },
    ])
    expect(parsed.actions?.parts).toEqual([{ itemIndex: 0 }, { itemIndex: 1 }, { text: 'Qualquer dúvida me avise.' }])
  })

  test('reads the indented details, the topic pointed to and the text between items', () => {
    const actions = parseAnswer(WITH_ALTERNATIVES).actions!
    expect(actions.items).toEqual([
      {
        text: '(recomendo) Manter como está',
        isSuggested: false,
        isRadio: true,
        details: ['O X fecha o badge, mas o link ainda abre.', 'Ex.: clicar no X vai para /tags/php.'],
        explanationTitle: 'o caso',
      },
      { text: 'Desfazer', isSuggested: false, isRadio: true, details: ['Volta ao comportamento anterior.'] },
      { text: 'Rodar os testes', isSuggested: false, isRadio: false, details: [] },
    ])
    expect(actions.parts).toEqual([
      { text: 'Close dentro do link: o que fazer?' },
      { itemIndex: 0 },
      { itemIndex: 1 },
      { text: 'Outra coisa:' },
      { itemIndex: 2 },
    ])
  })

  test('a ### title stays in the body of its topic', () => {
    expect(parseAnswer('## A\n### Sub\nx\n## B').topics[0]?.body).toBe('### Sub\nx')
  })

  test('a title that only starts with "Pendências" is a topic', () => {
    const parsed = parseAnswer('## Pendências abertas\n- [ ] A')
    expect(parsed.actions).toBeUndefined()
    expect(parsed.topics.map((t) => t.title)).toEqual(['Pendências abertas'])
  })
})

describe('parseActions', () => {
  test('the list survives an indented fence with no close above it', () => {
    const { actions } = parseAnswer(['## A', '- item', '  ```', '  x', '## Pendências', '- [ ] B'].join('\n'))
    expect(actions?.items.map((item) => item.text)).toEqual(['B'])
  })

  test('the next item ends an indented fence with no close', () => {
    const { items } = parseActions(['- [ ] A', '  ```', '  x', '- [ ] B'].join('\n'))
    expect(items.map((item) => item.text)).toEqual(['A', 'B'])
    expect(items[0]?.details).toEqual(['```\nx'])
  })

  test('text of only spaces makes no item and no ver:', () => {
    expect(parseActions('- [ ]  ').items).toEqual([])
    expect(parseActions('- [ ] A\n  ver: \n').items[0]).toEqual({
      text: 'A',
      isSuggested: false,
      isRadio: false,
      details: ['ver:'],
    })
  })

  for (const [loose, question] of [
    ['Q\n> ```\n> x\n> ```', undefined],
    ['Q?\n---', 'Q?'],
    ['Q?\n\n<!-- c -->', 'Q?'],
    ['---', undefined],
    ['> Q?', '> Q?'],
  ] as const) {
    test(`the question of ${JSON.stringify(loose)} is ${JSON.stringify(question)}`, () => {
      expect(questionOf(parseActions(`${loose}\n- ( ) A`).parts[0])).toBe(question)
    })
  }

  test('a code block under an item is one detail', () => {
    const actions = parseAnswer(
      ['## Pendências', '- [ ] Rodar a migração', '  ```bash', '  php artisan migrate', '  ```', '  ver: Banco'].join(
        '\n',
      ),
    ).actions!
    expect(actions.items).toEqual([
      {
        text: 'Rodar a migração',
        isSuggested: false,
        isRadio: false,
        details: ['```bash\nphp artisan migrate\n```'],
        explanationTitle: 'Banco',
      },
    ])
  })

  test('a code block under an item keeps its relative indentation', () => {
    const body = '## Pendências\n- [ ] A\n  ```yaml\n  a:\n    b: 1\n  ```'
    expect(parseAnswer(body).actions?.items[0]?.details).toEqual(['```yaml\na:\n  b: 1\n```'])
  })

  test('an item inside a loose code block is not an item', () => {
    const actions = parseAnswer(
      ['## Pendências', 'Rode isto:', '```', '- [ ] não é item', '```', '- [ ] Item real'].join('\n'),
    ).actions!
    expect(actions.items.map((i) => i.text)).toEqual(['Item real'])
    expect(actions.parts).toEqual([{ text: 'Rode isto:\n```\n- [ ] não é item\n```' }, { itemIndex: 0 }])
  })
})

describe('the stance marks', () => {
  for (const [text, stripped] of [
    ['*(recomendo) A*', 'A'],
    ['***(recomendo) A***', 'A'],
    ['*A (recomendo)*', 'A'],
    ['***A (recomendo)***', 'A'],
    ['_(recomendo) A_', 'A'],
    ['__(recomendo) A__', 'A'],
    ['*(recomendo)* A', 'A'],
    ['(recomendo) *A*', '*A*'],
    ['**(recomendo)** A **B**', 'A **B**'],
    ['_(recomendo) `__init__`_', '`__init__`'],
    ['(recomendo) ._cache', '._cache'],
  ] as const) {
    test(`"${text}" carries the mark and leaves "${stripped}"`, () => {
      expect(stanceOf(text)).toBe('recommended')
      expect(withoutStanceMark(text)).toBe(stripped)
    })
  }

  test('a long run of backticks takes no quadratic time', () => {
    const start = Date.now()
    withoutStanceMark(`**(recomendo) ${'`'.repeat(100_000)}**`)
    plainText('`'.repeat(100_000))
    expect(Date.now() - start).toBeLessThan(1_000)
  })

  test('each mark reads as its stance, at the start or at the end', () => {
    expect(stanceOf('(recomendo) A')).toBe('recommended')
    expect(stanceOf('(não recomendo) A')).toBe('notRecommended')
    expect(stanceOf('(nao recomendo) A')).toBe('notRecommended')
    expect(stanceOf('(avalie) A')).toBe('evaluate')
    expect(stanceOf('A (avalie)')).toBe('evaluate')
    expect(stanceOf('(recomendado) A')).toBe('recommended')
    expect(stanceOf('A')).toBeUndefined()
    expect(withoutStanceMark('(não recomendo) A')).toBe('A')
  })

  test('a mark in capitals reads as its own stance, so a (NÃO RECOMENDO) does not start checked', () => {
    expect(stanceOf('(NÃO RECOMENDO) A')).toBe('notRecommended')
    expect(stanceOf('(AVALIE) A')).toBe('evaluate')
    expect(defaultChecked(parseAnswer('## Pendências\n- [ ] (NÃO RECOMENDO) A').actions!)).toEqual([])
  })

  test('only recommended items start checked, one per radio group', () => {
    const actions = parseAnswer(
      '## Pendências\nQual?\n- ( ) (recomendo) A\n- ( ) (recomendo) B\n- [ ] (recomendo) C\n- [ ] (avalie) D\n- [ ] (não recomendo) E\n- [x] F',
    ).actions!
    expect(defaultChecked(actions)).toEqual([0, 2])
  })

  test('a fully bold recommended item loses both bold marks', () => {
    expect(withoutStanceMark('**Usar Redis (recomendado)**')).toBe('Usar Redis')
    expect(withoutStanceMark('A ** B (recomendado)**')).toBe('A B')
    expect(withoutStanceMark('B **(recomendada)**')).toBe('B')
    expect(withoutStanceMark('**Redis** com **cache local (recomendado)**')).toBe('**Redis** com cache local')
  })

  test('text without a mark keeps its bold', () => {
    expect(withoutStanceMark('**Usar** Redis')).toBe('**Usar** Redis')
  })

  test('a recommended mark without bold leaves a ** in code alone', () => {
    expect(withoutStanceMark('Passar `**kwargs` adiante (recomendado)')).toBe('Passar `**kwargs` adiante')
  })

  test('a mark at the start takes the opening bold it left unpaired', () => {
    expect(withoutStanceMark('**(recomendado) Usar Redis**')).toBe('Usar Redis')
    expect(withoutStanceMark('**(recomendado)** Usar Redis')).toBe('Usar Redis')
    expect(withoutStanceMark('**(recomendado) cache local** com **Redis**')).toBe('cache local com **Redis**')
    expect(withoutStanceMark('(recomendado) **Usar** Redis')).toBe('**Usar** Redis')
  })

  test('a mark in the middle of the text is not the mark', () => {
    expect(STANCE_MARK.test('Usar A (recomendado) com B')).toBe(false)
  })

  test('a ** in code does not hide the bold the mark left unpaired', () => {
    expect(withoutStanceMark('`**kwargs` com **cache local (recomendado)**')).toBe('`**kwargs` com cache local')
  })

  test('a ** in a code span of more backticks does not hide the bold the mark left unpaired', () => {
    expect(withoutStanceMark('``**a`` com **c (recomendado)**')).toBe('``**a`` com c')
  })

  test('takes the marks closing after the separator with the stance mark', () => {
    expect(withoutStanceMark('**(recomendo):** A')).toBe('A')
    expect(withoutStanceMark('**(não recomendo) —** A')).toBe('A')
    expect(withoutStanceMark('*(avalie):* A')).toBe('A')
    expect(withoutStanceMark('**(recomendo):** **A** e B')).toBe('**A** e B')
    expect(withoutStanceMark('**(recomendo):**A')).toBe('A')
  })

  test('takes the marks closing after the punctuation of a stance at the end', () => {
    expect(withoutStanceMark('Cache local **(recomendo).**')).toBe('Cache local')
    expect(withoutStanceMark('Cache *(avalie)!*')).toBe('Cache')
    expect(withoutStanceMark('**Cache local (recomendo).**')).toBe('Cache local')
    expect(stanceOf('Cache local **(recomendo).**')).toBe('recommended')
  })

  test('keeps what follows a stance mark as written', () => {
    expect(withoutStanceMark('(recomendo) .env fora do pacote')).toBe('.env fora do pacote')
    expect(withoutStanceMark('(avalie) --force no push')).toBe('--force no push')
    expect(withoutStanceMark('(recomendo) -x flag')).toBe('-x flag')
  })
})

describe('the item marks', () => {
  const item = (text: string, isSuggested: boolean, isRadio: boolean) => ({ text, isSuggested, isRadio, details: [] })
  for (const [line, expected] of [
    ['- [ ] A', item('A', false, false)],
    ['- [x] A', item('A', true, false)],
    ['- [X] A', item('A', true, false)],
    ['* [ ] A', item('A', false, false)],
    ['+ [x] A', item('A', true, false)],
    ['- ( ) A', item('A', false, true)],
    ['- (x) A', item('A', true, true)],
    ['- (X) A', item('A', true, true)],
    ['- (•) A', item('A', true, true)],
    ['- (●) A', item('A', true, true)],
  ] as const) {
    test(`"${line}" is an item`, () => {
      expect(parseAnswer(`## Pendências\n${line}`).actions?.items).toEqual([expected])
    })
  }

  for (const text of [
    'A (recomendado)',
    'A (recomendada).',
    '(recomendo). A',
    '(recomendo)! A',
    '(recomendo) — A',
    '(recomendo) – A',
    'A (recomendado)!',
    'A (RECOMENDADO)',
    'A **(recomendado)**',
    '(recomendado) A',
    '(recomendada): A',
    '(RECOMENDADO) - A',
    '**(recomendado)** A',
  ]) {
    test(`"${text}" carries the recommended mark`, () => {
      expect(stanceOf(text)).toBe('recommended')
      expect(withoutStanceMark(text)).toBe('A')
    })
  }

  for (const line of [
    '- [ ]',
    '- [] A',
    '[ ] A',
    '( ) A',
    '-[ ] A',
    '- [ ]A',
    '- ( )A',
    '1. [ ] A',
    '- [y] A',
    '- A',
  ]) {
    test(`"${line}" is not an item`, () => {
      expect(parseAnswer(`## Pendências\n${line}`).actions).toEqual({ items: [], parts: [{ text: line }] })
    })
  }

  test('an indented item is an item, and spaces after its text go', () => {
    const items = parseAnswer('## Pendências\n- [ ] A   \n  - [ ] B').actions!.items
    expect(items.map((i) => i.text)).toEqual(['A', 'B'])
    expect(items[0]?.details).toEqual([])
  })
})

describe('the Pendências list', () => {
  test('"Ver:" in capitals points to a topic too', () => {
    expect(parseAnswer('## Pendências\n- [ ] A\n  Ver: Título').actions?.items[0]).toMatchObject({
      explanationTitle: 'Título',
    })
  })

  test('an indented line after loose text stays loose text', () => {
    expect(parseAnswer('## Pendências\n- [ ] A\nNota:\n  recuada').actions).toEqual({
      items: [{ text: 'A', isSuggested: false, isRadio: false, details: [] }],
      parts: [{ itemIndex: 0 }, { text: 'Nota:\n  recuada' }],
    })
  })

  test('a code block closed less indented than it opened stays whole', () => {
    expect(parseAnswer('## Pendências\n- [ ] A\n    ```\n    x\n  ```').actions?.items[0]?.details).toEqual([
      '```\nx\n```',
    ])
  })

  test('only the first ver: of an item points to a topic', () => {
    const actions = parseAnswer('## Pendências\n- [ ] A\n  ver: Um\n  ver: Dois').actions!
    expect(actions.items[0]).toMatchObject({ explanationTitle: 'Um', details: ['ver: Dois'] })
  })

  test('a "ver:" with no title stays a detail', () => {
    expect(parseAnswer('## Pendências\n- [ ] A\n  ver:').actions?.items[0]).toEqual({
      text: 'A',
      isSuggested: false,
      isRadio: false,
      details: ['ver:'],
    })
  })

  test('an unindented "ver:" stays loose text', () => {
    expect(parseAnswer('## Pendências\n- [ ] A\nver: X').actions?.parts).toEqual([{ itemIndex: 0 }, { text: 'ver: X' }])
  })

  test('a blank line inside loose text stays', () => {
    expect(parseAnswer('## Pendências\nUm.\n\nDois.\n- [ ] A').actions?.parts[0]).toEqual({ text: 'Um.\n\nDois.' })
  })

  test('an unindented code block after an item stays loose text', () => {
    const actions = parseAnswer('## Pendências\n- [ ] A\n```sh\nnpm test\n```\nQual?\n- ( ) X').actions!
    expect(actions.items[0]?.details).toEqual([])
    expect(actions.parts).toEqual([{ itemIndex: 0 }, { text: '```sh\nnpm test\n```\nQual?' }, { itemIndex: 1 }])
  })

  test('an indented code block after loose text stays with that text', () => {
    const actions = parseAnswer('## Pendências\n- [ ] A\nRode antes:\n  ```sh\n  npm test\n  ```\n- [ ] B').actions!
    expect(actions.items[0]?.details).toEqual([])
    expect(actions.parts).toEqual([
      { itemIndex: 0 },
      { text: 'Rode antes:\n  ```sh\n  npm test\n  ```' },
      { itemIndex: 1 },
    ])
  })

  test('with two "Pendências", the last one holds the items', () => {
    const parsed = parseAnswer('## Pendências\n- [ ] Primeiro\n## Outro\nx\n## Pendências\n- [ ] Segundo')
    expect(parsed.actions?.items.map((i) => i.text)).toEqual(['Segundo'])
    expect(parsed.topics.map((t) => t.title)).toEqual(['Pendências', 'Outro'])
  })

  test('a title in backticks is the list too', () => {
    const parsed = parseAnswer('## `Pendências`\n- [ ] A')
    expect(parsed.actions?.items.map((i) => i.text)).toEqual(['A'])
    expect(parsed.topics).toEqual([])
  })
})

describe('plainText', () => {
  for (const [text, plain] of [
    ['[docs](http://x.y/a_b_c)', 'docs'],
    ['![logo](a.png) e **b**', 'logo e b'],
    ['~~old~~ new', 'old new'],
    ['\\*not\\* e \\[a\\](b)', '*not* e [a](b)'],
    ['`[a](b)` e `~~c~~`', '[a](b) e ~~c~~'],
    ['`a` e ``b`c``', 'a e b`c'],
    ['a ~ b ~~ c', 'a ~ b ~~ c'],
  ] as const) {
    test(`${JSON.stringify(text)} is ${JSON.stringify(plain)}`, () => expect(plainText(text)).toBe(plain))
  }
})

describe('previewOf', () => {
  for (const [body, preview] of [
    ['---\nFeito', 'Feito'],
    ['| a | b |\n|---|---|\nFeito', 'Feito'],
    ['<!-- c -->\nFeito', 'Feito'],
    ['- [ ] Feito', 'Feito'],
    ['- ( ) Feito', 'Feito'],
  ] as const) {
    test(`${JSON.stringify(body)} is ${JSON.stringify(preview)}`, () => expect(previewOf(body)).toBe(preview))
  }

  test('takes well under the quadratic time on a huge first line', () => {
    const start = Date.now()
    expect(previewOf('*a '.repeat(40_000)).endsWith('…')).toBe(true)
    expect(Date.now() - start).toBeLessThan(1_000)
  })

  test('drops the emphasis of a long line', () => {
    expect(previewOf(`**${'a'.repeat(400)}**`).startsWith('aaa')).toBe(true)
  })

  test('skips a code block in a quote', () => {
    expect(previewOf('> ```js\n> code\n> ```\nFeito')).toBe('Feito')
  })

  test('drops list and title markup', () => {
    expect(previewOf('- **Todos** passaram.')).toBe('Todos passaram.')
    expect(previewOf('### Sub\nresto')).toBe('Sub')
    expect(previewOf('* Item')).toBe('Item')
    expect(previewOf('+ Item')).toBe('Item')
  })

  test('skips a leading code block', () => {
    expect(previewOf('```bash\nnpm test\n```\nRode os testes.')).toBe('Rode os testes.')
  })

  test('skips the blank line after a leading code block', () => {
    expect(previewOf('```bash\nnpm test\n```\n\nRode os testes.')).toBe('Rode os testes.')
  })

  test('is empty for a body with only a code block', () => {
    expect(previewOf('```\nx\n```')).toBe('')
  })

  test('drops the number of a numbered list', () => {
    expect(previewOf('1. Passo')).toBe('Passo')
    expect(previewOf('1) Passo')).toBe('Passo')
    expect(previewOf('- 2024. foi o ano')).toBe('2024. foi o ano')
  })

  test('drops a blockquote marker', () => {
    expect(previewOf('> Atenção: a migração apaga dados')).toBe('Atenção: a migração apaga dados')
    expect(previewOf('> - Item')).toBe('Item')
  })

  test('keeps 90 characters and cuts what goes past them', () => {
    expect(previewOf('a'.repeat(90))).toBe('a'.repeat(90))
    expect(previewOf('a'.repeat(91))).toBe(`${'a'.repeat(89)}…`)
  })

  test('does not cut a character in half', () => {
    expect(previewOf(`${'a'.repeat(88)}😀😀`)).toBe(`${'a'.repeat(88)}😀😀`)
    expect(previewOf(`${'a'.repeat(88)}😀😀😀`)).toBe(`${'a'.repeat(88)}😀…`)
  })

  test('keeps underscores and asterisks that are not emphasis', () => {
    expect(previewOf('Use `user_id` em `created_at`')).toBe('Use user_id em created_at')
    expect(previewOf('Calcula 2 * 3 * 4')).toBe('Calcula 2 * 3 * 4')
    expect(previewOf('Use o padrão src/*.ts ou 2*3 linhas')).toBe('Use o padrão src/*.ts ou 2*3 linhas')
    expect(previewOf('Use *isso* e ***aquilo***.')).toBe('Use isso e aquilo.')
    expect(previewOf('_ênfase_ e __forte__')).toBe('ênfase e forte')
  })

  test('keeps globs, paths and names outside a code span', () => {
    expect(previewOf('Apagar src/*.ts e lib/*.ts')).toBe('Apagar src/*.ts e lib/*.ts')
    expect(previewOf('Ver *.md e *.txt')).toBe('Ver *.md e *.txt')
    expect(previewOf('Ver src/**/foo e **/bar')).toBe('Ver src/**/foo e **/bar')
    expect(previewOf('Ler $_ENV e $_POST')).toBe('Ler $_ENV e $_POST')
    expect(previewOf('Apagar _cache/ e _tmp/')).toBe('Apagar _cache/ e _tmp/')
    expect(previewOf('Editar __init__.py e __tests__/a')).toBe('Editar __init__.py e __tests__/a')
    expect(previewOf('Usar **isto**. E _aquilo_.')).toBe('Usar isto. E aquilo.')
  })

  test('keeps what a code span holds as written', () => {
    expect(previewOf('Edite `__init__.py` e rode')).toBe('Edite __init__.py e rode')
    expect(previewOf('Use `src/*.ts` e `lib/*.js` no glob')).toBe('Use src/*.ts e lib/*.js no glob')
    expect(previewOf('Ver `foo_` e `_bar`')).toBe('Ver foo_ e _bar')
    expect(previewOf('**usar `foo*`** agora')).toBe('usar foo* agora')
    expect(previewOf('Use ``a`b`` agora')).toBe('Use a`b agora')
  })

  test('drops bold that starts with a dot or a slash, and keeps a glob', () => {
    expect(previewOf('**.env.example** novo')).toBe('.env.example novo')
    expect(previewOf('**/etc/hosts** novo')).toBe('/etc/hosts novo')
    expect(previewOf('Veja **/*.ts e *.md')).toBe('Veja **/*.ts e *.md')
  })

  test('drops a backtick left unpaired', () => {
    expect(previewOf('Um ` solto')).toBe('Um  solto')
  })
})

const TWO_GROUPS = '## Pendências\nQ1?\n- ( ) (recomendo) A\n- ( ) B\nQ2?\n- ( ) (recomendo) C\n- ( ) D'

describe('checking and sending', () => {
  test('two radio groups do not exclude each other', () => {
    const actions = parseAnswer(TWO_GROUPS).actions!
    expect(defaultChecked(actions)).toEqual([0, 2])
    expect(toggleChecked(actions, [0, 2], 1)).toEqual([2, 1])
    expect(toggleChecked(actions, [0, 2], 3)).toEqual([0, 3])
  })

  test('checking an earlier alternative unchecks a later one', () => {
    const actions = parseAnswer('## Pendências\nQual?\n- ( ) A\n- ( ) B').actions!
    expect(toggleChecked(actions, [1], 0)).toEqual([0])
  })

  test('the sent text carries each group question and leaves the details out', () => {
    expect(sentText(parseAnswer(WITH_ALTERNATIVES).actions!, [1])).toBe(
      [
        'Pendências:',
        'Close dentro do link: o que fazer?',
        '- ( ) (recomendo) Manter como está',
        '- (x) Desfazer',
        'Outra coisa:',
        '- [ ] Rodar os testes',
      ].join('\n'),
    )
  })

  test('the sent text carries only the question line, not the text before it', () => {
    const actions = parseAnswer('## Pendências\nContexto longo.\n```\nnpm test\n```\nQual?\n- ( ) X\n- ( ) Y').actions!
    expect(sentText(actions, [0])).toBe('Pendências:\nQual?\n- (x) X\n- ( ) Y')
    const afterCode = parseAnswer('## Pendências\nRode:\n```\nnpm test\n```\n- [ ] Rodar').actions!
    expect(sentText(afterCode, [])).toBe('Pendências:\n- [ ] Rodar')
  })

  test('checking an alternative unchecks the others in its group, and only those', () => {
    const actions = parseAnswer(WITH_ALTERNATIVES).actions!
    expect(toggleChecked(actions, [], 0)).toEqual([0])
    expect(toggleChecked(actions, [0, 2], 1)).toEqual([2, 1])
    expect(toggleChecked(actions, [1], 1)).toEqual([])
    expect(toggleChecked(actions, [0], 2)).toEqual([0, 2])
  })

  test('an item written checked is sent unchecked unless the user checks it', () => {
    const suggested = parseAnswer('## Pendências\nQual?\n- (x) A\n- ( ) B').actions!
    expect(sentText(suggested, [])).toBe('Pendências:\nQual?\n- ( ) A\n- ( ) B')
    expect(toggleChecked(suggested, [], 1)).toEqual([1])
    expect(sentText(suggested, [1])).toBe('Pendências:\nQual?\n- ( ) A\n- (x) B')
  })

  test('a checkbox right after radios is not in the group, nor checkboxes under a question', () => {
    const actions = parseAnswer('## Pendências\nQual?\n- ( ) A\n- ( ) B\n- [ ] Rodar testes\n- [ ] Commitar').actions!
    expect(toggleChecked(actions, [0], 1)).toEqual([1])
    expect(toggleChecked(actions, [1], 2)).toEqual([1, 2])
    expect(toggleChecked(actions, [1, 2], 3)).toEqual([1, 2, 3])

    const checkboxesOnly = parseAnswer('## Pendências\nO que faço?\n- [ ] X\n- [ ] Y').actions!
    expect(toggleChecked(checkboxesOnly, [0], 1)).toEqual([0, 1])
  })
})

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`in the conversation (${surface})`, () => {
    test('shows the topics closed and opens one when pressed', async ($) => {
      const ui = await mountMessage($, ANSWER, 'row1', surface)

      expect((await ui.find({ key: 'row1-topic-0' }))?.text).toBe('▸ Banco de dados')
      expect(await ui.find({ type: 'Markdown', text: /índice/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /Adicionei um índice/ })).toBeDefined()

      await ui.press({ key: 'row1-topic-0' })
      expect((await ui.find({ key: 'row1-topic-0' }))?.text).toBe('▾ Banco de dados')
      expect(await ui.find({ type: 'Markdown', text: /índice/ })).toBeDefined()
      expect(await ui.find({ type: 'Markdown', text: /Todos passaram/ })).toBeUndefined()
    })
  })
}

describe('in the conversation', () => {
  for (const [name, text] of [
    ['no topics', 'Feito!'],
    ['a single topic', 'Oi.\n## Único\nx'],
  ] as const) {
    test(`an answer with ${name} stays as it is`, withWatcher, async ($, on) => {
      on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>original: {e.props.text}</Text>
      })
      const ui = await mountMessage($, text)
      // Only the watcher's Box: topics passed the original on.
      expect((await ui.findAll({ type: 'Box' })).map((box) => box.key)).toEqual(['topics-returned'])
      expect((await ui.find({ type: 'Text' }))?.text).toBe(`original: ${text}`)
    })
  }

  for (const [columns, width] of [
    [10, 3],
    [40, 20],
    [200, 48],
  ] as const) {
    test(`a title's rule is ${width} wide in ${columns} columns`, async ($) => {
      const ui = await $.ui.mount({
        plugin: 'topics',
        surface: 'terminal',
        component: 'AssistantMessage',
        requestId: `rule${columns}`,
        viewport: { columns, rows: 40 },
        props: { text: ANSWER, isFirstOfReply: true },
      } as never)
      // "Banco de dados" is 14 characters, and the arrow and gaps take 6.
      const [rule] = await ui.findAll({ type: 'Text', text: /─/ })
      expect(rule?.text).toBe(` ${'─'.repeat(width)}`)
    })
  }

  test("a title's rule counts the title as drawn, without its marks", async ($) => {
    const ui = await $.ui.mount({
      plugin: 'topics',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId: 'rule-marks',
      viewport: { columns: 40, rows: 40 },
      props: { text: '## **Banco** de dados\nx\n## B\ny', isFirstOfReply: true },
    } as never)
    const [rule] = await ui.findAll({ type: 'Text', text: /─/ })
    expect(rule?.text).toBe(` ${'─'.repeat(20)}`)
  })

  test('"Pendências" stays open at the end, below the closed topics', async ($) => {
    const ui = await mountMessage($, WITH_ACTIONS, 'row2')
    expect((await ui.find({ key: 'row2-action-0' }))?.text).toBe('1. [ ] Rodar npm test')
    expect(await ui.find({ type: 'Markdown', text: /Qualquer dúvida/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /Troquei/ })).toBeUndefined()
  })

  test('a checkbox checks when pressed, and the count follows', async ($) => {
    const ui = await mountMessage($, WITH_ACTIONS, 'count')
    expect((await ui.findAll({ type: 'Text', text: / de / })).map((t) => t.text)).toEqual(['0 de 2'])
    await ui.press({ key: 'count-action-0' })
    expect((await ui.find({ key: 'count-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
    expect((await ui.findAll({ type: 'Text', text: / de / })).map((t) => t.text)).toEqual(['1 de 2'])
  })

  test('a checkbox written checked starts unchecked, as a suggestion, until the user checks it', async ($) => {
    const ui = await mountMessage($, WITH_ACTIONS, 'suggested')
    expect((await ui.find({ key: 'suggested-action-1' }))?.text).toBe('2. [ ] Já aprovado')
    const rowOf = async () => (await ui.findAll({ type: 'Box', text: /Já aprovado/ })).at(-1)?.text
    expect(await rowOf()).toBe('  2. [ ] Já aprovado sugerido')
    await ui.press({ key: 'suggested-action-1' })
    expect(await rowOf()).toBe('  2. [✔] Já aprovado')
  })

  test('a radio written checked starts unchecked, as a suggestion, and a recommended one starts checked', async ($) => {
    const ui = await mountMessage($, '## Pendências\nQual?\n- (x) (recomendo) A\n- (x) B', 'row9')
    expect((await ui.find({ key: 'row9-action-0' }))?.text).toBe('(●) recomendo: A')
    expect((await ui.find({ key: 'row9-action-1' }))?.text).toBe('( ) B')
    expect(await ui.findAll({ type: 'Text', text: ' sugerido' })).toHaveLength(1)
    await ui.press({ key: 'row9-action-1' })
    await ui.press({ key: 'row9-action-1' })
    // Unchecking the checked alternative leaves the group empty on purpose.
    expect((await ui.find({ key: 'row9-action-1' }))?.text).toBe('( ) B')
  })

  test('unchecking the checked alternative leaves the group empty', async ($) => {
    const ui = await mountMessage($, '## Pendências\nQual?\n- (x) (recomendo) A\n- (x) B', 'empty-group')
    await ui.press({ key: 'empty-group-action-1' })
    await ui.press({ key: 'empty-group-action-1' })
    expect((await ui.find({ key: 'empty-group-action-0' }))?.text).toBe('( ) recomendo: A')
    expect((await ui.find({ key: 'empty-group-action-1' }))?.text).toBe('( ) B')
  })

  test('an item written checked with a stance starts unchecked, and the stance alone marks it', async ($) => {
    const ui = await mountMessage($, '## Pendências\n- [x] (avalie) A', 'stance-suggested')
    expect((await ui.find({ key: 'stance-suggested-action-0' }))?.text).toBe('1. [ ] avalie: A')
    expect(await ui.find({ type: 'Text', text: ' sugerido' })).toBeUndefined()
  })

  test('each stance is drawn in its color before the text', async ($) => {
    const ui = await mountMessage(
      $,
      '## Pendências\n- [ ] (recomendo) A\n- [ ] (não recomendo) B\n- [ ] (avalie) C',
      'row8',
    )
    expect((await ui.find({ key: 'row8-action-1' }))?.text).toBe('2. [ ] não recomendo: B')
    expect((await ui.find({ type: 'Text', text: 'recomendo: ' }))?.props.color).toBe('success')
    expect((await ui.find({ type: 'Text', text: 'não recomendo: ' }))?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: 'avalie: ' }))?.props.color).toBe('blue')
  })

  test('on screen, checking the second alternative unchecks the first', async ($) => {
    const ui = await mountMessage($, WITH_ALTERNATIVES, 'row5')
    await ui.press({ key: 'row5-action-2' })
    expect((await ui.find({ key: 'row5-action-0' }))?.text).toBe('(●) recomendo: Manter como está')
    await ui.press({ key: 'row5-action-1' })
    expect((await ui.find({ key: 'row5-action-0' }))?.text).toBe('( ) recomendo: Manter como está')
    expect((await ui.find({ key: 'row5-action-1' }))?.text).toBe('(●) Desfazer')
    expect((await ui.find({ key: 'row5-action-2' }))?.text).toBe('2. [✔] Rodar os testes')
  })

  test('each alternative shows its details on its own row, with the recommended mark before the text', async ($) => {
    const ui = await mountMessage($, WITH_ALTERNATIVES, 'row4')
    expect((await ui.find({ key: 'row4-action-0' }))?.text).toBe('(●) recomendo: Manter como está')
    expect((await ui.findAll({ type: 'Markdown' })).map((m) => m.text)).toEqual([
      'Achei um problema no badge.',
      'Close dentro do link: o que fazer?',
      'O X fecha o badge, mas o link ainda abre.',
      'Ex.: clicar no X vai para /tags/php.',
      'Volta ao comportamento anterior.',
      'Outra coisa:',
    ])
    // Only the question of the radios is numbered; the text before the checkbox is not.
    expect((await ui.findAll({ type: 'Text', text: /^\d+\. $/ })).map((t) => t.text)).toEqual(['1. '])
  })

  test('an alternative opens its explanation in place', async ($) => {
    const ui = await mountMessage($, WITH_ALTERNATIVES, 'row4b')
    expect(await ui.find({ key: 'row4b-action-1-explanation' })).toBeUndefined()
    expect((await ui.find({ key: 'row4b-action-0-explanation' }))?.text).toBe('▸ explicação: O caso')
    expect(await ui.find({ type: 'Markdown', text: /dentro do link\./ })).toBeUndefined()
    await ui.press({ key: 'row4b-action-0-explanation' })
    expect((await ui.find({ key: 'row4b-action-0-explanation' }))?.text).toBe('▾ explicação: O caso')
    expect(await ui.find({ type: 'Markdown', text: /dentro do link\./ })).toBeDefined()
    expect((await ui.find({ key: 'row4b-topic-0' }))?.text).toBe('▸ O caso')
  })

  test('on screen, each radio group has its number and counts once', async ($) => {
    const ui = await mountMessage($, TWO_GROUPS, 'groups')
    expect((await ui.findAll({ type: 'Text', text: /^\d+\. $/ })).map((t) => t.text)).toEqual(['1. ', '2. '])
    expect(await ui.find({ type: 'Text', text: '2 de 2' })).toBeDefined()
    await ui.press({ key: 'groups-action-3' })
    expect((await ui.find({ key: 'groups-action-0' }))?.text).toBe('(●) recomendo: A')
    expect((await ui.find({ key: 'groups-action-2' }))?.text).toBe('( ) recomendo: C')
    expect((await ui.find({ key: 'groups-action-3' }))?.text).toBe('(●) D')
  })

  test('a blank line between the question and its radios keeps the question', async ($) => {
    const text = '## Pendências\nQual?\n\n- ( ) A\n- ( ) B'
    expect(sentText(parseAnswer(text).actions!, [0])).toBe('Pendências:\nQual?\n- (x) A\n- ( ) B')
    const ui = await mountMessage($, text, 'blank-question')
    expect(await ui.find({ type: 'Markdown', text: 'Qual?' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'escolha uma opção' })).toBeUndefined()
  })

  test('radios with no question before them get a number and a prompt', async ($) => {
    const ui = await mountMessage($, '## Pendências\n- [ ] A\n- ( ) X\n- ( ) Y', 'no-question')
    expect((await ui.findAll({ type: 'Box', text: /escolha uma opção/ })).at(-1)?.text).toBe('2. escolha uma opção')
    expect((await ui.find({ key: 'no-question-action-1' }))?.text).toBe('( ) X')
  })

  test('"Pendências" with only text has no send button', async ($) => {
    const ui = await mountMessage($, '## Pendências\nSó um aviso.', 'text-only')
    expect(await ui.find({ type: 'Markdown', text: /Só um aviso/ })).toBeDefined()
    expect(await ui.find({ key: 'text-only-actions-send' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: / de / })).toBeUndefined()
  })

  test('a "ver:" pointing to a missing topic draws no explanation button', async ($) => {
    const ui = await mountMessage($, '## Pendências\n- [ ] Fazer\n  ver: Não existe', 'row7')
    expect(await ui.find({ key: 'row7-action-0' })).toBeDefined()
    expect(await ui.find({ key: 'row7-action-0-explanation' })).toBeUndefined()
    expect(await ui.find({ type: 'Markdown', text: 'ver: Não existe' })).toBeDefined()
  })

  test('a code block right before radios is not taken as their question', async ($) => {
    const text = '## Pendências\nRode:\n```\nnpm test\n```\n- ( ) A\n- ( ) B'
    const ui = await mountMessage($, text, 'row10')
    expect(await ui.find({ type: 'Markdown', text: 'Rode:\n```\nnpm test\n```' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'escolha uma opção' })).toBeDefined()
  })

  for (const [title, id] of [
    ['**Pendências**', 'row11'],
    ['Pendências:', 'row12'],
  ] as const) {
    test(`"${title}" is still the Pendências list`, async ($) => {
      const ui = await mountMessage($, `## ${title}\n- [ ] Fazer`, id)
      expect(await ui.find({ key: `${id}-actions-send` })).toBeDefined()
    })
  }

  test('numbers per pending decision: the question carries the number and the alternatives none', async ($) => {
    const text = [
      '## Mudança',
      'Nada.',
      '## Pendências',
      'Teste do grupo: qual opção?',
      '- ( ) Opção 1',
      '- ( ) Opção 2',
      '- [ ] Ação X',
      '- [ ] Ação Y',
    ].join('\n')
    const ui = await mountMessage($, text, 'row6')
    expect((await ui.findAll({ type: 'Text', text: /^\d+\. $/ })).map((t) => t.text)).toEqual(['1. '])
    expect((await ui.findAll({ type: 'Markdown' })).map((m) => m.text)).toEqual(['Teste do grupo: qual opção?'])
    expect((await ui.find({ key: 'row6-action-0' }))?.text).toBe('( ) Opção 1')
    expect((await ui.find({ key: 'row6-action-1' }))?.text).toBe('( ) Opção 2')
    expect((await ui.find({ key: 'row6-action-2' }))?.text).toBe('2. [ ] Ação X')
    expect((await ui.find({ key: 'row6-action-3' }))?.text).toBe('3. [ ] Ação Y')
    expect(await ui.find({ type: 'Text', text: '0 de 3' })).toBeDefined()
    await ui.press({ key: 'row6-action-1' })
    expect(await ui.find({ type: 'Text', text: '1 de 3' })).toBeDefined()
  })

  test('each message has its own keys: checking in the second does not touch the first', async ($) => {
    const first = await mountMessage($, WITH_ACTIONS, 'a')
    const second = await mountMessage($, WITH_ACTIONS, 'b')
    await second.press({ key: 'b-action-0' })
    expect((await second.find({ key: 'b-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
    expect((await first.find({ key: 'a-action-0' }))?.text).toBe('1. [ ] Rodar npm test')
  })

  test('"ver:" matches a title in bold or italics', async ($) => {
    const ui = await mountMessage(
      $,
      '## **Escolha do banco**\nx\n## Pendências\n- [ ] Fazer\n  ver: Escolha do banco',
      'bold',
    )
    expect((await ui.find({ key: 'bold-action-0-explanation' }))?.text).toBe('▸ explicação: Escolha do banco')
  })

  test('"ver:" matches a title ignoring case, accents and backticks, the first one winning', async ($) => {
    const text = '## Opção `B`\nprimeiro\n## Opção B\nsegundo\n## Pendências\n- [ ] Fazer\n  ver: opcao b'
    const ui = await mountMessage($, text, 'explanation')
    expect((await ui.find({ key: 'explanation-action-0-explanation' }))?.text).toBe('▸ explicação: Opção B')
    await ui.press({ key: 'explanation-action-0-explanation' })
    expect(await ui.find({ type: 'Markdown', text: 'primeiro' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: 'segundo' })).toBeUndefined()
  })

  test('a message drawn again with more text, as it streams, shows the new text', async ($) => {
    const ui = await mountMessage($, '## A\nx\n## B\ny', 'grow')
    expect(await ui.find({ key: 'grow-actions-send' })).toBeUndefined()
    await ui.redraw({ text: '## A\nx\n## B\ny\n## Pendências\n- [ ] Fazer', isFirstOfReply: true })
    expect(await ui.find({ key: 'grow-actions-send' })).toBeDefined()
  })

  test('button labels drop code backticks', async ($) => {
    const ui = await mountMessage($, '## O `config.php`\nX.\n## Outro\nY.', 'ticks')
    expect((await ui.find({ key: 'ticks-topic-0' }))?.text).toBe('▸ O config.php')
  })

  test('button labels drop emphasis, not what looks like it inside code or a word', async ($) => {
    const text =
      '## **Banco** de _dados_\nX.\n## O `__init__.py` e user_id\nY.\n## Pendências\n- ( ) (recomendo) **Foo** bar'
    const ui = await mountMessage($, text, 'bold-labels')
    expect((await ui.find({ key: 'bold-labels-topic-0' }))?.text).toBe('▸ Banco de dados')
    expect((await ui.find({ key: 'bold-labels-topic-1' }))?.text).toBe('▸ O __init__.py e user_id')
    expect((await ui.find({ key: 'bold-labels-action-0' }))?.text).toBe('(●) recomendo: Foo bar')
  })

  test('a title has its rule on a terminal that does not give its width', async ($) => {
    const ui = await $.ui.mount({
      plugin: 'topics',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId: 'rule-no-width',
      props: { text: ANSWER, isFirstOfReply: true },
    } as never)
    const [rule] = await ui.findAll({ type: 'Text', text: /─/ })
    expect(rule?.text).toBe(` ${'─'.repeat(48)}`)
  })

  test('draws the rule after a title on the terminal only', async ($) => {
    const onTerminal = await mountMessage($, ANSWER, 'rule1', 'terminal')
    expect((await onTerminal.findAll({ type: 'Text', text: /─/ })).length).toBeGreaterThan(0)

    for (const surface of ['desktop', 'vscode'] as const) {
      const ui = await mountMessage($, ANSWER, `rule-${surface}`, surface)
      expect(await ui.findAll({ type: 'Text', text: /─/ })).toEqual([])
    }
  })
})

describe('sending the items', () => {
  test('the button sends the items as shown on screen, as the user', async ($, on) => {
    const sent: { text: string; origin: unknown }[] = []
    on('prompt.submit', ($, e) => {
      sent.push({ text: e.text, origin: e.origin })
      return { text: '' } as never
    })
    const ui = await mountMessage($, WITH_ACTIONS, 'row3')
    await ui.press({ key: 'row3-action-0' })
    await ui.press({ key: 'row3-actions-send' })
    expect(sent).toEqual([
      {
        text: 'Pendências:\n- [x] Rodar `npm test`\n- [ ] Já aprovado',
        origin: { kind: 'plugin', name: 'topics', asUser: true },
      },
    ])
  })

  // Runs between the drawing and the button's own press handler, as a turn starting or an answer landing right before
  // the press would.
  const interceptPress = (on: On) => {
    const between: { run?: () => Promise<unknown> } = {}
    on('ui.press', async (_$, e, next) => {
      await between.run?.()
      return next(e)
    })
    return between
  }

  test('a press drawn before a turn started does not send', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    const sent = collectSent(on)
    const between = interceptPress(on)
    const ui = await mountMessage($, WITH_ACTIONS, 'late')

    between.run = () => $.turn.start(turnStartInput())
    await ui.press({ key: 'late-actions-send' })

    expect(sent).toEqual([])
  })

  test('a pane press drawn before another answer landed does not check', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const between = interceptPress(on)
    await $.turn.complete(turnCompleteInput({ answer: withTag(WITH_ACTIONS, 'before') }))
    const pane = await mountPane($)

    const answer = '## Pendências\n- [ ] (recomendo) A\n- [ ] B'
    between.run = () => $.turn.complete(turnCompleteInput({ answer, turnId: 't2' }))
    await pane.press({ key: 'topics-action-1' })
    between.run = undefined

    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] recomendo: A')
    expect((await pane.find({ key: 'topics-action-1' }))?.text).toBe('2. [ ] B')
  })

  test('a pane press drawn before another answer landed does not send', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const sent = collectSent(on)
    const between = interceptPress(on)
    await $.turn.complete(turnCompleteInput({ answer: withTag(WITH_ACTIONS, 'before') }))
    const pane = await mountPane($)

    between.run = () => $.turn.complete(turnCompleteInput({ answer: withTag(WITH_ACTIONS, 'after'), turnId: 't2' }))
    await pane.press({ key: 'topics-actions-send' })

    expect(sent).toEqual([])
  })

  test('after sending, the button becomes "enviadas" and does not send again', async ($, on) => {
    const sent = collectSent(on)
    const ui = await mountMessage($, WITH_ACTIONS, 'sent')
    await Promise.all([ui.press({ key: 'sent-actions-send' }), ui.press({ key: 'sent-actions-send' })])
    expect(sent).toHaveLength(1)
    expect(await ui.find({ key: 'sent-actions-send' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeDefined()
  })

  test('when sending fails, the button comes back and a toast says so', async ($, on) => {
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('prompt.submit', () => {
      throw new Error('busy')
    })
    const ui = await mountMessage($, WITH_ACTIONS, 'failed')
    await ui.press({ key: 'failed-actions-send' })
    expect(await ui.find({ key: 'failed-actions-send' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeUndefined()
    expect(toasts).toEqual(['⚠️ Não foi possível enviar as pendências'])
  })

  test('while Claude answers, sending waits', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await $.turn.start(turnStartInput())
    const ui = await mountMessage($, WITH_ACTIONS, 'busy')
    expect(await ui.find({ key: 'busy-actions-send' })).toBeUndefined()
    expect(
      await ui.find({ type: 'Text', text: 'o envio fica disponível quando o Claude terminar de responder' }),
    ).toBeDefined()
    await $.turn.complete(turnCompleteInput({ answer: WITH_ACTIONS }))
    expect(await ui.find({ key: 'busy-actions-send' })).toBeDefined()
  })

  test('an agent ending while Claude answers does not release sending', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await $.turn.start(turnStartInput())
    const ui = await mountMessage($, WITH_ACTIONS, 'agent-end')

    await $.turn.complete(turnCompleteInput({ answer: ANSWER, turnId: 't2', agentId: 'sub1' }))

    expect(await ui.find({ key: 'agent-end-actions-send' })).toBeUndefined()
    expect(
      await ui.find({ type: 'Text', text: 'o envio fica disponível quando o Claude terminar de responder' }),
    ).toBeDefined()
  })

  test('a turn with an empty answer releases sending', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await $.turn.start(turnStartInput())
    const ui = await mountMessage($, WITH_ACTIONS, 'empty-end')

    await $.turn.complete(turnCompleteInput({ answer: '' }))

    expect(await ui.find({ key: 'empty-end-actions-send' })).toBeDefined()
  })

  test('sending takes the checks as they are at the press, not as they were drawn', async ($, on) => {
    const sent = collectSent(on)
    const ui = await mountMessage($, WITH_ACTIONS, 'press-time')

    await Promise.all([ui.press({ key: 'press-time-action-0' }), ui.press({ key: 'press-time-actions-send' })])

    expect(sent).toEqual(['Pendências:\n- [x] Rodar `npm test`\n- [ ] Já aprovado'])
  })

  test('while Claude answers, a press does not check, so a (recomendo) written later still starts checked', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await $.turn.start(turnStartInput())
    const ui = await mountMessage($, '## Pendências\n- [ ] A', 'streaming')

    await ui.press({ key: 'streaming-action-0' })
    expect((await ui.find({ key: 'streaming-action-0' }))?.text).toBe('1. [ ] A')

    await ui.redraw({ text: '## Pendências\n- [ ] A\n- [ ] (recomendo) B', isFirstOfReply: true })
    expect((await ui.find({ key: 'streaming-action-1' }))?.text).toBe('2. [✔] recomendo: B')

    await $.turn.complete(turnCompleteInput({ answer: '## Pendências\n- [ ] A\n- [ ] (recomendo) B' }))
    await ui.press({ key: 'streaming-action-0' })
    expect((await ui.find({ key: 'streaming-action-0' }))?.text).toBe('1. [✔] A')
  })

  test('after sending, a press does not change what was sent', async ($, on) => {
    on('prompt.submit', () => ({ text: '' }) as never)
    const ui = await mountMessage($, WITH_ACTIONS, 'frozen')
    await ui.press({ key: 'frozen-action-0' })
    await ui.press({ key: 'frozen-actions-send' })

    await ui.press({ key: 'frozen-action-1' })
    await ui.press({ key: 'frozen-action-0' })

    expect((await ui.find({ key: 'frozen-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
    expect((await ui.find({ key: 'frozen-action-1' }))?.text).toBe('2. [ ] Já aprovado')
  })

  test('while Claude answers, topics and explanations still open', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    await $.turn.start(turnStartInput())
    const ui = await mountMessage($, WITH_ALTERNATIVES, 'reading')
    await ui.press({ key: 'reading-topic-0' })
    expect((await ui.find({ key: 'reading-topic-0' }))?.text).toBe('▾ O caso')
    await ui.press({ key: 'reading-action-0-explanation' })
    expect((await ui.find({ key: 'reading-action-0-explanation' }))?.text).toBe('▾ explicação: O caso')
  })

  test('after sending, an explanation still opens', async ($, on) => {
    on('prompt.submit', () => ({ text: '' }) as never)
    const ui = await mountMessage($, WITH_ALTERNATIVES, 'read-after')
    await ui.press({ key: 'read-after-actions-send' })
    await ui.press({ key: 'read-after-action-0-explanation' })
    expect((await ui.find({ key: 'read-after-action-0-explanation' }))?.text).toBe('▾ explicação: O caso')
  })

  test('an agent turn neither blocks sending nor replaces the last answer', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: WITH_ACTIONS }))

    await $.turn.start(turnStartInput({ turnId: 't2', agentId: 'sub1' }))
    const ui = await mountMessage($, WITH_ACTIONS, 'sub')
    expect(await ui.find({ key: 'sub-actions-send' })).toBeDefined()

    await $.turn.complete(turnCompleteInput({ answer: ANSWER, turnId: 't2', agentId: 'sub1' }))
    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-topic-0' }))?.text).toBe('▸ Mudança')
  })
})

describe('the format instruction', () => {
  const input: PromptComposeInput = {
    model: 'm',
    promptModel: 'm',
    surfaces: ['terminal'],
    tools: [],
    outputStyle: null,
    traits: [],
  }

  test('adds the instruction to the system prompt, after the sections already there', async ($, on) => {
    on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'x', scope: 'session' }] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections.map((s) => s.id)).toEqual(['base', 'topics:instruction'])
    expect(sections[1]).toMatchObject({ scope: 'session' })
    expect(sections[1]?.text).toContain('termine a resposta, mesmo curta, com um último tópico `## Pendências`')
  })

  test('asks for unique topic titles and one (recomendo) per radio group', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('que nenhum outro tópico da resposta repita')
    expect(sections[0]?.text).toContain('só uma do grupo leva `(recomendo)`')
  })

  test('keeps destructive actions out of (recomendo)', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain(
      'uma ação destrutiva, difícil de desfazer ou visível para outras pessoas nunca leva `(recomendo)`',
    )
  })
})

describe('the events topics watches', () => {
  test('go on to the next hook', async ($, on) => {
    const seen: string[] = []
    on('turn.start', (_$, e) => {
      seen.push('turn.start')
      return { turnId: e.turnId }
    })
    on('turn.complete', () => {
      seen.push('turn.complete')
      return { text: '' }
    })
    on('ui.focus', () => {
      seen.push('ui.focus')
      return { value: {} } as never
    })
    await $.turn.start(turnStartInput())
    await $.turn.complete(turnCompleteInput({ answer: ANSWER }))
    await $.ui.focus({ component: 'Pane', requestId: 'topics', origin: { kind: 'person' } } as never)
    expect(seen).toEqual(['turn.start', 'turn.complete', 'ui.focus'])
  })
})

describe('the /topics pane', () => {
  test('registers /topics when the session starts', async ($, on) => {
    const commands: string[] = []
    on('command.register', (_$, e) => {
      commands.push(e.name)
      return { value: { command: e.name } }
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    expect(commands).toEqual(['topics'])
  })

  test('the command opens the pane, which Esc closes', async ($, on) => {
    const opened: unknown[] = []
    on('ui.open', ($, e) => {
      opened.push(e)
      return { value: {} } as never
    })
    const result = await $.command.run({ command: 'topics', args: '' } as never)
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ id: 'topics', focus: true, closeOnEscape: true })
    expect(result).toMatchObject({ text: 'Painel de tópicos aberto (Esc fecha).' })
  })

  test('another command does not open the pane', async ($, on) => {
    const opened: unknown[] = []
    on('ui.open', ($, e) => {
      opened.push(e)
      return { value: {} } as never
    })
    on('command.run', { command: 'other' }, () => ({ text: 'outro' }))
    const result = await $.command.run({ command: 'other', args: '' } as never)
    expect(result).toMatchObject({ text: 'outro' })
    expect(opened).toEqual([])
  })

  test('another pane is not drawn by topics', async ($, on) => {
    on('ui.render', { component: 'Pane', requestId: 'other' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>outro painel</Text>
    })
    const ui = await $.ui.mount({
      plugin: 'topics',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'other',
      props: PANE_PROPS,
    })
    expect(await ui.find({ type: 'Text', text: 'outro painel' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'A última resposta não tem tópicos ainda.' })).toBeUndefined()
  })

  test('says so when the last answer has no topics', async ($) => {
    const ui = await mountPane($)
    expect(await ui.find({ type: 'Text', text: 'A última resposta não tem tópicos ainda.' })).toBeDefined()
  })

  test('shows the intro of the answer', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: ANSWER }))
    const ui = await mountPane($)
    expect(await ui.find({ type: 'Markdown', text: 'Resumo: três coisas mudaram.' })).toBeDefined()
  })

  test('opens a single topic', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: ANSWER }))
    const ui = await mountPane($)

    await ui.press({ key: 'topics-topic-0' })

    expect((await ui.find({ key: 'topics-topic-0' }))?.text).toBe('▾ Banco de dados')
    expect(await ui.find({ type: 'Markdown', text: /índice/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /Todos passaram/ })).toBeUndefined()
  })

  test('shows an answer with a single topic', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: 'Oi.\n## Único\nx' }))
    const ui = await mountPane($)
    expect((await ui.find({ key: 'topics-topic-0' }))?.text).toBe('▸ Único')
  })

  test('draws no rule off the terminal', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: ANSWER }))
    const ui = await $.ui.mount({
      plugin: 'topics',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'topics',
      props: PANE_PROPS,
    })
    expect((await ui.find({ key: 'topics-topic-0' }))?.text).toBe('▸ Banco de dados')
    expect(await ui.findAll({ type: 'Text', text: /─/ })).toEqual([])
  })

  test('fits the rule after a title to the width of the pane', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: ANSWER }))
    const ui = await mountPane($, { ...PANE_PROPS, bodyColumns: 40 })
    const [rule] = await ui.findAll({ type: 'Text', text: /─/ })
    expect(rule?.text).toBe(` ${'─'.repeat(20)}`)
  })

  test('the pane topics carry the hotkeys 1–9, and a message none', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = Array.from({ length: 10 }, (_, i) => `## T${i}\nx`).join('\n')
    await $.turn.complete(turnCompleteInput({ answer }))

    const ui = await mountPane($)
    const hotkeys = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => (await ui.find({ key: `topics-topic-${i}` }))?.props.hotkey),
    )
    expect(hotkeys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', undefined])
    const message = await mountMessage($, answer, 'nokeys')
    expect((await message.find({ key: 'nokeys-topic-0' }))?.props.hotkey).toBeUndefined()
  })

  test('shows the last answer closed and opens all', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: ANSWER }))

    const ui = await mountPane($)
    expect((await ui.find({ key: 'topics-open-all' }))?.props.hotkey).toBe('a')
    expect((await ui.find({ key: 'topics-close-all' }))?.props.hotkey).toBe('f')
    expect(await ui.findAll({ type: 'Markdown', text: /índice|Todos/ })).toHaveLength(0)
    await ui.press({ key: 'topics-open-all' })
    expect(await ui.findAll({ type: 'Markdown', text: /índice|Todos/ })).toHaveLength(2)
    await ui.press({ key: 'topics-close-all' })
    expect(await ui.findAll({ type: 'Markdown', text: /índice|Todos/ })).toHaveLength(0)
  })

  test('has no open and close all for an answer without topics', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: '## Pendências\n- [ ] Rodar' }))

    const ui = await mountPane($)
    expect(await ui.find({ key: 'topics-open-all' })).toBeUndefined()
    expect(await ui.find({ key: 'topics-close-all' })).toBeUndefined()
  })

  test('sends the items from the pane', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const sent = collectSent(on)
    await $.turn.complete(turnCompleteInput({ answer: WITH_ACTIONS }))

    const ui = await mountPane($)
    await ui.press({ key: 'topics-actions-send' })
    // An item the answer wrote checked is only a suggestion: it goes unchecked unless the user checks it.
    expect(sent).toEqual(['Pendências:\n- [ ] Rodar `npm test`\n- [ ] Já aprovado'])
  })

  test('sends the recommended items checked without a touch, and not after the user unchecks them', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const sent = collectSent(on)
    const answer = '## Pendências\n- [ ] (recomendo) A\n- [ ] (avalie) B'
    await $.turn.complete(turnCompleteInput({ answer }))
    const ui = await mountPane($)
    await ui.press({ key: 'topics-actions-send' })
    expect(sent.at(-1)).toBe('Pendências:\n- [x] (recomendo) A\n- [ ] (avalie) B')

    await $.turn.complete(turnCompleteInput({ answer, turnId: 't2' }))
    await ui.press({ key: 'topics-action-0' })
    await ui.press({ key: 'topics-actions-send' })
    expect(sent.at(-1)).toBe('Pendências:\n- [ ] (recomendo) A\n- [ ] (avalie) B')
  })

  test('marks the focused item with ❯', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    on('ui.focus', () => ({ value: {} }) as never)
    await $.turn.complete(turnCompleteInput({ answer: WITH_ACTIONS }))

    const ui = await mountPane($)
    expect(await ui.find({ type: 'Text', text: /❯/ })).toBeUndefined()
    // Raises ui.focus as the engine does when the person moves the ring: it passes the event's input (origin person),
    // not $.ui.focus's args, hence the cast.
    const focus: UiFocusInput = {
      component: 'Pane',
      requestId: 'topics',
      element: 'topics-action-1',
      origin: { kind: 'person' },
    }
    await $.ui.focus(focus as never)
    expect(await ui.findAll({ type: 'Text', text: /❯/ })).toHaveLength(1)
    expect((await ui.findAll({ type: 'Box', text: /^❯/ })).at(-1)?.text).toBe('❯ 2. [ ] Já aprovado sugerido')

    // The engine's close mark: the event comes with no element.
    await $.ui.focus({ component: 'Pane', requestId: 'topics', origin: { kind: 'person' } } as never)
    expect(await ui.find({ type: 'Text', text: /❯/ })).toBeUndefined()
  })

  test('focus moving in another pane leaves the mark alone', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    on('ui.focus', () => ({ value: {} }) as never)
    await $.turn.complete(turnCompleteInput({ answer: WITH_ACTIONS }))
    const ui = await mountPane($)
    const origin = { kind: 'person' }
    await $.ui.focus({ component: 'Pane', requestId: 'topics', element: 'topics-action-1', origin } as never)
    await $.ui.focus({ component: 'Pane', requestId: 'other', element: 'x', origin } as never)
    expect((await ui.findAll({ type: 'Box', text: /^❯/ })).at(-1)?.text).toBe('❯ 2. [ ] Já aprovado sugerido')
  })

  test('starts clean for each new answer', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    on('prompt.submit', () => ({ text: '' }) as never)
    const answer = WITH_ALTERNATIVES
    await $.turn.complete(turnCompleteInput({ answer }))
    const ui = await mountPane($)
    await ui.press({ key: 'topics-action-0' })
    await ui.press({ key: 'topics-topic-0' })
    await ui.press({ key: 'topics-action-0-explanation' })
    await ui.press({ key: 'topics-actions-send' })
    expect(await ui.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeDefined()

    await $.turn.complete(turnCompleteInput({ answer, turnId: 't2' }))
    expect((await ui.find({ key: 'topics-action-0' }))?.text).toBe('(●) recomendo: Manter como está')
    expect((await ui.find({ key: 'topics-topic-0' }))?.text).toBe('▸ O caso')
    expect((await ui.find({ key: 'topics-action-0-explanation' }))?.text).toBe('▸ explicação: O caso')
    expect(await ui.find({ key: 'topics-actions-send' })).toBeDefined()
  })

  test('an empty answer keeps the previous one in the pane', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(turnCompleteInput({ answer: WITH_ACTIONS }))
    const ui = await mountPane($)
    await ui.press({ key: 'topics-action-0' })

    await $.turn.complete(turnCompleteInput({ answer: '', turnId: 't2' }))
    expect((await ui.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
  })

  test('shares the checks and the send with the message of the same answer', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const sent = collectSent(on)
    const answer = WITH_ACTIONS
    const message = await mountMessage($, answer, 'shared')
    await $.turn.complete(turnCompleteInput({ answer }))
    const pane = await mountPane($)

    await message.press({ key: 'shared-action-0' })
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
    await pane.press({ key: 'topics-actions-send' })
    expect(await message.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeDefined()
    expect(await message.find({ key: 'shared-actions-send' })).toBeUndefined()
    expect(sent).toEqual(['Pendências:\n- [x] Rodar `npm test`\n- [ ] Já aprovado'])
  })

  // These draw 200 messages, which takes more than the 5 s default on a busy machine.
  const MANY_MESSAGES = { timeoutMs: 30_000 }

  test('forgets the message of an answer after 200 newer ones', MANY_MESSAGES, async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = WITH_ACTIONS
    const message = await mountMessage($, answer, 'evicted')
    await message.press({ key: 'evicted-action-0' })
    for (let i = 0; i < 200; i++) await mountMessage($, withTag(WITH_ACTIONS, `newer ${i}`))
    await $.turn.complete(turnCompleteInput({ answer }))

    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [ ] Rodar npm test')
  })

  test('a streamed message does not push out an answer already sent', MANY_MESSAGES, async ($, on) => {
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    const sent = collectSent(on)
    await mountMessage($, WITH_ACTIONS, 'previous')
    await $.turn.complete(turnCompleteInput({ answer: WITH_ACTIONS }))
    const pane = await mountPane($)
    await pane.press({ key: 'topics-actions-send' })
    expect(sent).toHaveLength(1)

    await $.turn.start(turnStartInput())
    let partial = '## Pendências\n'
    const streaming = await mountMessage($, partial, 'streaming')
    for (let i = 0; i < 200; i++) {
      partial += `- [ ] item ${i}\n`
      await streaming.redraw({ text: partial, isFirstOfReply: true })
    }
    await $.turn.complete(turnCompleteInput({ answer: '' }))

    expect(await pane.find({ key: 'topics-actions-send' })).toBeUndefined()
    expect(await pane.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeDefined()
  })

  test('still shares with the message of an answer after 199 newer ones', MANY_MESSAGES, async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = WITH_ACTIONS
    const message = await mountMessage($, answer, 'kept')
    await message.press({ key: 'kept-action-0' })
    for (let i = 0; i < 199; i++) await mountMessage($, withTag(WITH_ACTIONS, `kept newer ${i}`))
    await $.turn.complete(turnCompleteInput({ answer }))

    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
  })

  test(
    'a message drawn again with the same answer starts over the count of newer ones',
    MANY_MESSAGES,
    async ($, on) => {
      on('turn.complete', () => ({ text: '' }))
      const answer = WITH_ACTIONS
      await mountMessage($, answer, 'old')
      for (let i = 0; i < 100; i++) await mountMessage($, withTag(WITH_ACTIONS, `first ${i}`))
      const fresh = await mountMessage($, answer, 'fresh')
      for (let i = 0; i < 150; i++) await mountMessage($, withTag(WITH_ACTIONS, `then ${i}`))
      await fresh.press({ key: 'fresh-action-0' })
      await $.turn.complete(turnCompleteInput({ answer }))

      const pane = await mountPane($)
      expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
    },
  )

  test('shares with the newest message of an answer, even after an older one with the same text redraws', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = WITH_ACTIONS
    const older = await mountMessage($, answer, 'older')
    await older.press({ key: 'older-action-0' })
    await $.turn.complete(turnCompleteInput({ answer }))
    const newer = await mountMessage($, answer, 'newer')
    await older.redraw({ text: answer, isFirstOfReply: true })

    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [ ] Rodar npm test')
    await newer.press({ key: 'newer-action-1' })
    expect((await pane.find({ key: 'topics-action-1' }))?.text).toBe('2. [✔] Já aprovado')
  })
})
