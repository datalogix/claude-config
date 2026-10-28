import type { CommandRunInput, On, RenderComponent, RenderPropsOf, ToolGroupCall } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Mounted, Engine as TestEngine } from 'claude-code/testing'

/** Stands in for Claude Code's own row, so a test sees whether it was drawn. */
const drawOriginal = (on: On, component: 'ToolUse' | 'ToolResult' | 'ToolProgress' | 'ToolGroup') =>
  // One registration per call: on() takes a single component, not the union.
  on('ui.render', { component: component as 'ToolUse' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>original</Text>
  })

/** Each mount takes its own requestId, so one test can mount several rows. */
let mountCount = 0
const mount = <C extends RenderComponent>($: TestEngine, component: C, props: RenderPropsOf[C]) =>
  $.ui.mount({ plugin: 'steps', surface: 'terminal', component, requestId: `r${++mountCount}`, props })

const isOriginalShown = async (ui: Pick<Mounted, 'find'>) =>
  (await ui.find({ type: 'Text', text: 'original' })) !== undefined

/**
 * A failing hook is skipped and the original drawn instead, so "shown" alone does not prove steps chose it. Keys each
 * row `steps-ok` when steps' hook answered (`returned` or `passed`), else `steps-<outcome>`. Uses only literals: an
 * inline plugin cannot reach this file's variables.
 */
const watcher = {
  name: 'watcher',
  tier: 'prepend',
  register(on: On) {
    for (const component of ['ToolUse', 'ToolResult', 'ToolProgress', 'ToolGroup', 'Spinner'] as const) {
      on('ui.render', { component: component as 'ToolUse' }, async ($, e, next) => {
        const drawn = await next(e)
        const outcome = next.trace.find((t) => t.plugin === 'steps')?.outcome ?? 'none'
        const { Box } = $.ui.resolve(e)
        return <Box key={outcome === 'returned' || outcome === 'passed' ? 'steps-ok' : `steps-${outcome}`}>{drawn}</Box>
      })
    }
  },
} as const
const withWatcher = { plugins: [watcher as never] }

/** Whether the original is drawn because steps' hook passed it on, not because the hook failed. */
const isShownBySteps = async (ui: Pick<Mounted, 'find'>) =>
  (await isOriginalShown(ui)) && (await ui.find({ key: 'steps-ok' })) !== undefined

const runStepsCommand = ($: TestEngine) => $.command.run({ command: 'steps', args: '' } as CommandRunInput)

const sessionStartInput = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('registers /steps when the session starts', async ($, on) => {
  const commands: { name: string; description?: string }[] = []
  on('command.register', (_$, e) => {
    commands.push({ name: e.name, description: e.description })
    return { value: { command: e.name } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start(sessionStartInput)

  expect(commands).toEqual([{ name: 'steps', description: 'Mostra ou esconde as linhas de ferramentas na conversa' }])
})

test('lets the session start go on', async ($, on) => {
  let hasReachedNext = false
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => {
    hasReachedNext = true
    return { cwd: e.cwd }
  })

  await $.session.start(sessionStartInput)

  expect(hasReachedNext).toBe(true)
})

describe('tool uses', () => {
  const toolUse = (overrides: Partial<RenderPropsOf['ToolUse']> = {}): RenderPropsOf['ToolUse'] => ({
    tool_use_id: 'tu1',
    tool: 'Bash',
    input: { command: 'ls' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    ...overrides,
  })

  test('are hidden from the conversation', async ($, on) => {
    drawOriginal(on, 'ToolUse')
    const ui = await mount($, 'ToolUse', toolUse())
    expect(await isOriginalShown(ui)).toBe(false)
  })

  test('are hidden while running', async ($, on) => {
    drawOriginal(on, 'ToolUse')
    const ui = await mount($, 'ToolUse', toolUse({ isRunning: true }))
    expect(await isOriginalShown(ui)).toBe(false)
  })

  for (const [name, overrides] of [
    ['an error stays visible', { isErrored: true }],
    ['an interruption stays visible', { isInterrupted: true }],
    ['the ctrl+o transcript shows them', { isExpanded: true }],
  ] as const) {
    test(name, withWatcher, async ($, on) => {
      drawOriginal(on, 'ToolUse')
      const ui = await mount($, 'ToolUse', toolUse(overrides))
      expect(await isShownBySteps(ui)).toBe(true)
    })
  }

  test('/steps shows them again and a second /steps hides them', withWatcher, async ($, on) => {
    drawOriginal(on, 'ToolUse')
    const ui = await mount($, 'ToolUse', toolUse())

    expect(await runStepsCommand($)).toMatchObject({ text: 'Linhas de ferramentas visíveis.' })
    expect(await isShownBySteps(ui)).toBe(true)

    expect(await runStepsCommand($)).toMatchObject({ text: 'Linhas de ferramentas escondidas.' })
    expect(await isOriginalShown(ui)).toBe(false)
  })
})

describe('tool results', () => {
  const toolResult = (overrides: Partial<RenderPropsOf['ToolResult']> = {}): RenderPropsOf['ToolResult'] => ({
    tool_use_id: 'tu1',
    tool: 'Bash',
    output: {},
    isErrored: false,
    ...overrides,
  })

  test('are hidden from the conversation', async ($, on) => {
    drawOriginal(on, 'ToolResult')
    expect(await isOriginalShown(await mount($, 'ToolResult', toolResult()))).toBe(false)
  })

  for (const [name, overrides] of [
    ['an errored result stays visible', { isErrored: true }],
    ['the ctrl+o transcript shows them', { isExpanded: true }],
  ] as const) {
    test(name, withWatcher, async ($, on) => {
      drawOriginal(on, 'ToolResult')
      expect(await isShownBySteps(await mount($, 'ToolResult', toolResult(overrides)))).toBe(true)
    })
  }

  test('come back after /steps', withWatcher, async ($, on) => {
    drawOriginal(on, 'ToolResult')
    const ui = await mount($, 'ToolResult', toolResult())

    await runStepsCommand($)

    expect(await isShownBySteps(ui)).toBe(true)
  })
})

describe('tool progress', () => {
  const toolProgress: RenderPropsOf['ToolProgress'] = { tool_use_id: 'tu1', kind: 'background_hint', hint: 'ctrl+b' }

  test('is hidden until /steps', withWatcher, async ($, on) => {
    drawOriginal(on, 'ToolProgress')
    const ui = await mount($, 'ToolProgress', toolProgress)
    expect(await isOriginalShown(ui)).toBe(false)

    await runStepsCommand($)
    expect(await isShownBySteps(ui)).toBe(true)
  })
})

describe('tool groups', () => {
  const call = (overrides: Partial<ToolGroupCall> = {}): ToolGroupCall => ({
    tool: 'Read',
    input: {},
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    ...overrides,
  })
  const group = (
    calls: ToolGroupCall[],
    overrides: Partial<RenderPropsOf['ToolGroup']> = {},
  ): RenderPropsOf['ToolGroup'] => ({
    calls,
    isActive: false,
    isExpanded: false,
    ...overrides,
  })

  test('are hidden when everything went well', async ($, on) => {
    drawOriginal(on, 'ToolGroup')
    const ui = await mount($, 'ToolGroup', group([call()]))
    expect(await isOriginalShown(ui)).toBe(false)
  })

  test('are hidden while the group is live', async ($, on) => {
    drawOriginal(on, 'ToolGroup')
    const ui = await mount($, 'ToolGroup', group([call(), call({ isRunning: true })], { isActive: true }))
    expect(await isOriginalShown(ui)).toBe(false)
  })

  for (const [name, props] of [
    ['a group with an error inside stays visible', group([call(), call({ isErrored: true })])],
    ['a group with an interruption inside stays visible', group([call({ isInterrupted: true })])],
    ['the ctrl+o transcript shows them', group([call()], { isExpanded: true })],
    ['a group holding other rows than calls stays visible', group([call()], { isCallsOnly: false })],
  ] as const) {
    test(name, withWatcher, async ($, on) => {
      drawOriginal(on, 'ToolGroup')
      expect(await isShownBySteps(await mount($, 'ToolGroup', props))).toBe(true)
    })
  }

  test('come back after /steps', withWatcher, async ($, on) => {
    drawOriginal(on, 'ToolGroup')
    const ui = await mount($, 'ToolGroup', group([call()]))

    await runStepsCommand($)
    expect(await isShownBySteps(ui)).toBe(true)
  })
})

describe('spinner', () => {
  const drawSpinner = (on: On) =>
    on('ui.render', { component: 'Spinner' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return (
        <Text>
          {e.props.word}
          {e.props.suffix}
        </Text>
      )
    })

  test('keeps the original with the current step below it', async ($, on) => {
    drawSpinner(on)
    const ui = await mount($, 'Spinner', { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' })

    const texts = (await ui.findAll({ type: 'Text' })).map((t) => t.text)
    expect(texts).toEqual(['Sauteing…', 'pensando'])
  })

  for (const [mode, label] of [
    ['requesting', 'aguardando o modelo'],
    ['thinking', 'pensando'],
    ['responding', 'escrevendo a resposta'],
    ['tool-input', 'preparando uma ferramenta'],
    ['tool-use', 'usando ferramentas'],
  ] as const) {
    test(`spells out ${mode} as "${label}", dim and indented on its own row`, async ($, on) => {
      drawSpinner(on)
      const ui = await mount($, 'Spinner', { word: 'Sauteing', message: null, suffix: '…', mode })

      const [column, labelRow] = await ui.findAll({ type: 'Box' })
      expect(column).toMatchObject({ props: { flexDirection: 'column' } })
      expect(labelRow).toMatchObject({ props: { paddingLeft: 2 } })
      expect(await ui.find({ type: 'Text', text: label })).toMatchObject({ props: { dimColor: true } })
    })
  }

  test('keeps only the original for a mode it has no label for', withWatcher, async ($, on) => {
    on('ui.render', { component: 'Spinner' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>{e.props.word}</Text>
    })
    const ui = await mount($, 'Spinner', { word: 'Sauteing', message: null, suffix: '…', mode: 'dreaming' } as never)

    expect(await ui.find({ type: 'Text', text: 'Sauteing' })).toBeDefined()
    // Only the watcher's Box: steps passed the original on with no label row around it.
    expect((await ui.findAll({ type: 'Box' })).map((box) => box.key)).toEqual(['steps-ok'])
  })
})
