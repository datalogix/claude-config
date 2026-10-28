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

import { parseAnswer, previewOf, RECOMMENDED_MARK, submitText, toggleChecked, withoutRecommendedMark } from './parse'

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

const mountPane = ($: TestEngine) =>
  $.ui.mount({ plugin: 'topics', surface: 'terminal', component: 'Pane', requestId: 'topics', props: PANE_PROPS })

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

const startTurn = (extra: Partial<TurnStartInput> = {}): TurnStartInput => ({ text: 'oi', turnId: 't1', ...extra })

const completeTurn = (extra: Partial<TurnCompleteInput> = {}): TurnCompleteInput =>
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

/** Tags the text so no other message in the test is drawn with the same answer: the pane keeps its own state. */
const paneOnly = (text: string, tag: string) => text.replace('\n\n## ', `\n\n(${tag})\n\n## `)

const WITH_ALTERNATIVES = [
  'Achei um problema no badge.',
  '',
  '## O caso',
  'O X fica dentro do link.',
  '## Pendências',
  'Close dentro do link: o que fazer?',
  '- ( ) Manter como está (recomendado)',
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
  ] as const) {
    test(name, () => {
      expect(parseAnswer(lines.join('\n')).topics.map((t) => t.title)).toEqual(titles)
    })
  }

  for (const title of ['Pendencias', '**Pendências**', '__Pendências__', 'Pendências:']) {
    test(`"${title}" is the Pendências list`, () => {
      expect(parseAnswer(`## ${title}\n- [ ] Revisar`)).toEqual({
        intro: '',
        topics: [],
        actions: {
          items: [{ text: 'Revisar', isSuggested: false, isRadio: false, details: [] }],
          parts: [{ item: 0 }],
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
    expect(parsed.actions?.parts).toEqual([{ item: 0 }, { item: 1 }, { text: 'Qualquer dúvida me avise.' }])
  })

  test('reads the indented details, the topic pointed to and the text between items', () => {
    const actions = parseAnswer(WITH_ALTERNATIVES).actions!
    expect(actions.items).toEqual([
      {
        text: 'Manter como está (recomendado)',
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
      { item: 0 },
      { item: 1 },
      { text: 'Outra coisa:' },
      { item: 2 },
    ])
  })
})

describe('parseActions', () => {
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

  test('an item inside a loose code block is not an item', () => {
    const actions = parseAnswer(
      ['## Pendências', 'Rode isto:', '```', '- [ ] não é item', '```', '- [ ] Item real'].join('\n'),
    ).actions!
    expect(actions.items.map((i) => i.text)).toEqual(['Item real'])
    expect(actions.parts).toEqual([{ text: 'Rode isto:\n```\n- [ ] não é item\n```' }, { item: 0 }])
  })

  test('the recommended mark may end in a period or bold', () => {
    const actions = parseAnswer('## Pendências\nQual?\n- ( ) A (recomendado).\n- ( ) B **(recomendada)**').actions!
    expect(actions.items.map((i) => RECOMMENDED_MARK.test(i.text))).toEqual([true, true])
  })

  test('a fully bold recommended item loses both bold marks', () => {
    expect(withoutRecommendedMark('**Usar Redis (recomendado)**')).toBe('Usar Redis')
    expect(withoutRecommendedMark('A ** B (recomendado)**')).toBe('A B')
    expect(withoutRecommendedMark('B **(recomendada)**')).toBe('B')
    expect(withoutRecommendedMark('**Usar** Redis')).toBe('**Usar** Redis')
    expect(withoutRecommendedMark('**Redis** com **cache local (recomendado)**')).toBe('**Redis** com cache local')
  })

  test('a recommended mark without bold leaves a ** in code alone', () => {
    expect(withoutRecommendedMark('Passar `**kwargs` adiante (recomendado)')).toBe('Passar `**kwargs` adiante')
  })

  test('a ** in code does not hide the bold the mark left unpaired', () => {
    expect(withoutRecommendedMark('`**kwargs` com **cache local (recomendado)**')).toBe('`**kwargs` com cache local')
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
    'A (recomendado)!',
    'A (RECOMENDADO)',
    'A **(recomendado)**',
  ]) {
    test(`"${text}" carries the recommended mark`, () => {
      expect(RECOMMENDED_MARK.test(text)).toBe(true)
      expect(withoutRecommendedMark(text)).toBe('A')
    })
  }
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
      parts: [{ item: 0 }, { text: 'Nota:\n  recuada' }],
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

  test('an unindented code block after an item stays loose text', () => {
    const actions = parseAnswer('## Pendências\n- [ ] A\n```sh\nnpm test\n```\nQual?\n- ( ) X').actions!
    expect(actions.items[0]?.details).toEqual([])
    expect(actions.parts).toEqual([{ item: 0 }, { text: '```sh\nnpm test\n```\nQual?' }, { item: 1 }])
  })

  test('an indented code block after loose text stays with that text', () => {
    const actions = parseAnswer('## Pendências\n- [ ] A\nRode antes:\n  ```sh\n  npm test\n  ```\n- [ ] B').actions!
    expect(actions.items[0]?.details).toEqual([])
    expect(actions.parts).toEqual([{ item: 0 }, { text: 'Rode antes:\n  ```sh\n  npm test\n  ```' }, { item: 1 }])
  })

  test('with two "Pendências", the last one holds the items', () => {
    const parsed = parseAnswer('## Pendências\n- [ ] Primeiro\n## Outro\nx\n## Pendências\n- [ ] Segundo')
    expect(parsed.actions?.items.map((i) => i.text)).toEqual(['Segundo'])
    expect(parsed.topics.map((t) => t.title)).toEqual(['Pendências', 'Outro'])
  })
})

describe('previewOf', () => {
  test('drops list and title markup', () => {
    expect(previewOf('- **Todos** passaram.')).toBe('Todos passaram.')
    expect(previewOf('### Sub\nresto')).toBe('Sub')
  })

  test('skips a leading code block', () => {
    expect(previewOf('```bash\nnpm test\n```\nRode os testes.')).toBe('Rode os testes.')
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
})

describe('checking and sending', () => {
  test('the submit text carries each group question and leaves the details out', () => {
    expect(submitText(parseAnswer(WITH_ALTERNATIVES).actions!, [1])).toBe(
      [
        'Pendências:',
        'Close dentro do link: o que fazer?',
        '- ( ) Manter como está (recomendado)',
        '- (x) Desfazer',
        'Outra coisa:',
        '- [ ] Rodar os testes',
      ].join('\n'),
    )
  })

  test('the submit text carries only the question line, not the text before it', () => {
    const actions = parseAnswer('## Pendências\nContexto longo.\n```\nnpm test\n```\nQual?\n- ( ) X\n- ( ) Y').actions!
    expect(submitText(actions, [0])).toBe('Pendências:\nQual?\n- (x) X\n- ( ) Y')
    const afterCode = parseAnswer('## Pendências\nRode:\n```\nnpm test\n```\n- [ ] Rodar').actions!
    expect(submitText(afterCode, [])).toBe('Pendências:\n- [ ] Rodar')
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
    expect(submitText(suggested, [])).toBe('Pendências:\nQual?\n- ( ) A\n- ( ) B')
    expect(toggleChecked(suggested, [], 1)).toEqual([1])
    expect(submitText(suggested, [1])).toBe('Pendências:\nQual?\n- ( ) A\n- (x) B')
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

  test('a radio written checked starts unchecked, marked as a suggestion unless recommended', async ($) => {
    const ui = await mountMessage($, '## Pendências\nQual?\n- (x) A (recomendado)\n- (x) B', 'row9')
    expect((await ui.find({ key: 'row9-action-0' }))?.text).toBe('( ) A')
    expect((await ui.find({ key: 'row9-action-1' }))?.text).toBe('( ) B')
    expect(await ui.findAll({ type: 'Text', text: ' ★ recomendado' })).toHaveLength(1)
    expect(await ui.findAll({ type: 'Text', text: ' sugerido' })).toHaveLength(1)
    await ui.press({ key: 'row9-action-1' })
    await ui.press({ key: 'row9-action-1' })
    // Unchecking the checked alternative leaves the group empty on purpose.
    expect((await ui.find({ key: 'row9-action-1' }))?.text).toBe('( ) B')
  })

  test('on screen, checking the second alternative unchecks the first', async ($) => {
    const ui = await mountMessage($, WITH_ALTERNATIVES, 'row5')
    await ui.press({ key: 'row5-action-0' })
    await ui.press({ key: 'row5-action-2' })
    expect((await ui.find({ key: 'row5-action-0' }))?.text).toBe('(●) Manter como está')
    await ui.press({ key: 'row5-action-1' })
    expect((await ui.find({ key: 'row5-action-0' }))?.text).toBe('( ) Manter como está')
    expect((await ui.find({ key: 'row5-action-1' }))?.text).toBe('(●) Desfazer')
    expect((await ui.find({ key: 'row5-action-2' }))?.text).toBe('2. [✔] Rodar os testes')
  })

  test('each alternative shows its details and the recommended mark on its own row', async ($) => {
    const ui = await mountMessage($, WITH_ALTERNATIVES, 'row4')
    expect((await ui.find({ key: 'row4-action-0' }))?.text).toBe('( ) Manter como está')
    expect((await ui.findAll({ type: 'Box', text: /Manter como está/ })).at(-1)?.text).toBe(
      '     ( ) Manter como está ★ recomendado',
    )
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
    const row4 = 'row4b'
    expect((await ui.find({ key: `${row4}-action-0-explanation` }))?.text).toBe('▸ explicação: O caso')
    expect(await ui.find({ type: 'Markdown', text: /dentro do link\./ })).toBeUndefined()
    await ui.press({ key: `${row4}-action-0-explanation` })
    expect((await ui.find({ key: `${row4}-action-0-explanation` }))?.text).toBe('▾ explicação: O caso')
    expect(await ui.find({ type: 'Markdown', text: /dentro do link\./ })).toBeDefined()
    expect((await ui.find({ key: `${row4}-topic-0` }))?.text).toBe('▸ O caso')
  })

  test('radios with no question before them get a number and a prompt', async ($) => {
    const ui = await mountMessage($, '## Pendências\n- [ ] A\n- ( ) X\n- ( ) Y', 'row8')
    expect((await ui.findAll({ type: 'Box', text: /escolha uma opção/ })).at(-1)?.text).toBe('2. escolha uma opção')
    expect((await ui.find({ key: 'row8-action-1' }))?.text).toBe('( ) X')
  })

  test('"Pendências" with only text has no send button', async ($) => {
    const ui = await mountMessage($, '## Pendências\nSó um aviso.', 'row9')
    expect(await ui.find({ type: 'Markdown', text: /Só um aviso/ })).toBeDefined()
    expect(await ui.find({ key: 'row9-actions-submit' })).toBeUndefined()
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
      expect(await ui.find({ key: `${id}-actions-submit` })).toBeDefined()
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
    expect((await ui.find({ key: 'bold-action-0-explanation' }))?.text).toBe('▸ explicação: **Escolha do banco**')
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
    expect(await ui.find({ key: 'grow-actions-submit' })).toBeUndefined()
    await ui.redraw({ text: '## A\nx\n## B\ny\n## Pendências\n- [ ] Fazer', isFirstOfReply: true })
    expect(await ui.find({ key: 'grow-actions-submit' })).toBeDefined()
  })

  test('button labels drop code backticks', async ($) => {
    const ui = await mountMessage($, '## O `config.php`\nX.\n## Outro\nY.', 'ticks')
    expect((await ui.find({ key: 'ticks-topic-0' }))?.text).toBe('▸ O config.php')
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
    await ui.press({ key: 'row3-actions-submit' })
    expect(sent).toEqual([
      {
        text: 'Pendências:\n- [x] Rodar `npm test`\n- [ ] Já aprovado',
        origin: { kind: 'plugin', name: 'topics', asUser: true },
      },
    ])
  })

  // Runs between the drawing and the button's own press handler, as an answer landing right before the press would.
  const pressAfter = (on: On) => {
    const between: { run?: () => Promise<unknown> } = {}
    on('ui.press', async (_$, e, next) => {
      await between.run?.()
      return next(e)
    })
    return between
  }

  test('a press drawn before a turn started does not send', async ($, on) => {
    const sent: string[] = []
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: '' } as never
    })
    const between = pressAfter(on)
    const ui = await mountMessage($, WITH_ACTIONS, 'late')

    between.run = () => $.turn.start(startTurn())
    await ui.press({ key: 'late-actions-submit' })

    expect(sent).toEqual([])
  })

  test('a pane press drawn before another answer landed does not send', async ($, on) => {
    const sent: string[] = []
    on('turn.complete', () => ({ text: '' }))
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: '' } as never
    })
    const between = pressAfter(on)
    await $.turn.complete(completeTurn({ answer: paneOnly(WITH_ACTIONS, 'before') }))
    const pane = await mountPane($)

    between.run = () => $.turn.complete(completeTurn({ answer: paneOnly(WITH_ACTIONS, 'after'), turnId: 't2' }))
    await pane.press({ key: 'topics-actions-submit' })

    expect(sent).toEqual([])
  })

  test('after sending, the button becomes "enviadas" and does not send again', async ($, on) => {
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: '' } as never
    })
    const ui = await mountMessage($, WITH_ACTIONS, 'sent')
    await Promise.all([ui.press({ key: 'sent-actions-submit' }), ui.press({ key: 'sent-actions-submit' })])
    expect(sent).toHaveLength(1)
    expect(await ui.find({ key: 'sent-actions-submit' })).toBeUndefined()
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
    await ui.press({ key: 'failed-actions-submit' })
    expect(await ui.find({ key: 'failed-actions-submit' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeUndefined()
    expect(toasts).toEqual(['⚠️ Não foi possível enviar as pendências'])
  })

  test('while Claude answers, sending waits', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await $.turn.start(startTurn())
    const ui = await mountMessage($, WITH_ACTIONS, 'busy')
    expect(await ui.find({ key: 'busy-actions-submit' })).toBeUndefined()
    expect(
      await ui.find({ type: 'Text', text: 'o envio fica disponível quando o Claude terminar de responder' }),
    ).toBeDefined()
    await $.turn.complete(completeTurn({ answer: WITH_ACTIONS }))
    expect(await ui.find({ key: 'busy-actions-submit' })).toBeDefined()
  })

  test('an agent turn neither blocks sending nor replaces the last answer', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(completeTurn({ answer: WITH_ACTIONS }))

    await $.turn.start(startTurn({ turnId: 't2', agentId: 'sub1' }))
    const ui = await mountMessage($, WITH_ACTIONS, 'sub')
    expect(await ui.find({ key: 'sub-actions-submit' })).toBeDefined()

    await $.turn.complete(completeTurn({ answer: ANSWER, turnId: 't2', agentId: 'sub1' }))
    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-topic-0' }))?.text).toBe('▸ Mudança')
  })
})

describe('the format instruction', () => {
  test('adds the instruction to the system prompt, after the sections already there', async ($, on) => {
    on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'x', scope: 'session' }] }) as never)
    const input: PromptComposeInput = {
      model: 'm',
      promptModel: 'm',
      surfaces: ['terminal'],
      tools: [],
      outputStyle: null,
      traits: [],
    }
    const { sections } = await $.prompt.compose(input)
    expect(sections.map((s) => s.id)).toEqual(['base', 'topics:instruction'])
    expect(sections[1]).toMatchObject({ scope: 'session' })
    expect(sections[1]?.text).toContain('termine a resposta, mesmo curta, com um último tópico `## Pendências`')
  })
})

describe('the /topics pane', () => {
  test('the command opens the pane', async ($, on) => {
    const opened: string[] = []
    on('ui.open', ($, e) => {
      opened.push(e.id)
      return { value: {} } as never
    })
    const result = await $.command.run({ command: 'topics', args: '' } as never)
    expect(opened).toEqual(['topics'])
    expect(result).toMatchObject({ text: 'Painel de tópicos aberto (Esc fecha).' })
  })

  test('the pane topics carry the hotkeys 1–9, and a message none', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = Array.from({ length: 10 }, (_, i) => `## T${i}\nx`).join('\n')
    await $.turn.complete(completeTurn({ answer }))

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
    await $.turn.complete(completeTurn({ answer: ANSWER }))

    const ui = await mountPane($)
    expect(await ui.findAll({ type: 'Markdown', text: /índice|Todos/ })).toHaveLength(0)
    await ui.press({ key: 'topics-open-all' })
    expect(await ui.findAll({ type: 'Markdown', text: /índice|Todos/ })).toHaveLength(2)
    await ui.press({ key: 'topics-close-all' })
    expect(await ui.findAll({ type: 'Markdown', text: /índice|Todos/ })).toHaveLength(0)
  })

  test('sends the items from the pane', async ($, on) => {
    const sent: string[] = []
    on('turn.complete', () => ({ text: '' }))
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: '' } as never
    })
    await $.turn.complete(completeTurn({ answer: WITH_ACTIONS }))

    const ui = await mountPane($)
    await ui.press({ key: 'topics-actions-submit' })
    // An item the answer wrote checked is only a suggestion: it goes unchecked unless the user checks it.
    expect(sent).toEqual(['Pendências:\n- [ ] Rodar `npm test`\n- [ ] Já aprovado'])
  })

  test('marks the focused item with ❯', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    on('ui.focus', () => ({ value: {} }) as never)
    await $.turn.complete(completeTurn({ answer: WITH_ACTIONS }))

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
  })

  test('starts clean for each new answer', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    on('prompt.submit', () => ({ text: '' }) as never)
    const answer = paneOnly(WITH_ALTERNATIVES, 'clean')
    await $.turn.complete(completeTurn({ answer }))
    const ui = await mountPane($)
    await ui.press({ key: 'topics-action-0' })
    await ui.press({ key: 'topics-topic-0' })
    await ui.press({ key: 'topics-action-0-explanation' })
    await ui.press({ key: 'topics-actions-submit' })
    expect(await ui.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeDefined()

    await $.turn.complete(completeTurn({ answer, turnId: 't2' }))
    expect((await ui.find({ key: 'topics-action-0' }))?.text).toBe('( ) Manter como está')
    expect((await ui.find({ key: 'topics-topic-0' }))?.text).toBe('▸ O caso')
    expect((await ui.find({ key: 'topics-action-0-explanation' }))?.text).toBe('▸ explicação: O caso')
    expect(await ui.find({ key: 'topics-actions-submit' })).toBeDefined()
  })

  test('an empty answer keeps the previous one in the pane', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    await $.turn.complete(completeTurn({ answer: paneOnly(WITH_ACTIONS, 'empty') }))
    const ui = await mountPane($)
    await ui.press({ key: 'topics-action-0' })

    await $.turn.complete(completeTurn({ answer: '', turnId: 't2' }))
    expect((await ui.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
  })

  test('shares the checks and the send with the message of the same answer', async ($, on) => {
    const sent: string[] = []
    on('turn.complete', () => ({ text: '' }))
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: '' } as never
    })
    const answer = paneOnly(WITH_ACTIONS, 'shared')
    const message = await mountMessage($, answer, 'shared')
    await $.turn.complete(completeTurn({ answer }))
    const pane = await mountPane($)

    await message.press({ key: 'shared-action-0' })
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
    await pane.press({ key: 'topics-actions-submit' })
    expect(await message.find({ type: 'Text', text: '✓ pendências enviadas' })).toBeDefined()
    expect(await message.find({ key: 'shared-actions-submit' })).toBeUndefined()
    expect(sent).toEqual(['Pendências:\n- [x] Rodar `npm test`\n- [ ] Já aprovado'])
  })

  test('forgets the message of an answer after 200 newer ones', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = paneOnly(WITH_ACTIONS, 'evicted')
    const message = await mountMessage($, answer, 'evicted')
    await message.press({ key: 'evicted-action-0' })
    for (let i = 0; i < 200; i++) await mountMessage($, paneOnly(WITH_ACTIONS, `newer ${i}`))
    await $.turn.complete(completeTurn({ answer }))

    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [ ] Rodar npm test')
  })

  test('still shares with the message of an answer after 199 newer ones', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = paneOnly(WITH_ACTIONS, 'kept')
    const message = await mountMessage($, answer, 'kept')
    await message.press({ key: 'kept-action-0' })
    for (let i = 0; i < 199; i++) await mountMessage($, paneOnly(WITH_ACTIONS, `kept newer ${i}`))
    await $.turn.complete(completeTurn({ answer }))

    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [✔] Rodar npm test')
  })

  test('shares with the newest message of an answer, even after an older one with the same text redraws', async ($, on) => {
    on('turn.complete', () => ({ text: '' }))
    const answer = paneOnly(WITH_ACTIONS, 'twice')
    const older = await mountMessage($, answer, 'older')
    await older.press({ key: 'older-action-0' })
    await $.turn.complete(completeTurn({ answer }))
    const newer = await mountMessage($, answer, 'newer')
    await older.redraw({ text: answer, isFirstOfReply: true })

    const pane = await mountPane($)
    expect((await pane.find({ key: 'topics-action-0' }))?.text).toBe('1. [ ] Rodar npm test')
    await newer.press({ key: 'newer-action-1' })
    expect((await pane.find({ key: 'topics-action-1' }))?.text).toBe('2. [✔] Já aprovado')
  })
})
