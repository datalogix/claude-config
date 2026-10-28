import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

/** Not persisted: every session starts with the tool rows hidden. */
const areToolRowsVisibleAtom = atom({ plugin: 'steps', key: 'areToolRowsVisible' } as const, false)

const MODE_LABELS = {
  requesting: 'aguardando o modelo',
  thinking: 'pensando',
  responding: 'escrevendo a resposta',
  'tool-input': 'preparando uma ferramenta',
  'tool-use': 'usando ferramentas',
} as const

const shouldShow = async ($: EngineInterface, isAlwaysShown: boolean): Promise<boolean> =>
  isAlwaysShown || read($, areToolRowsVisibleAtom)

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'steps',
      description: 'Mostra ou esconde as linhas de ferramentas na conversa',
    })

    return next(e)
  })

  on('command.run', { command: 'steps' }, async ($) => {
    const areToolRowsVisible = await update($, areToolRowsVisibleAtom, (v) => !v)

    return { text: areToolRowsVisible ? 'Linhas de ferramentas visíveis.' : 'Linhas de ferramentas escondidas.' }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { isExpanded, isErrored, isInterrupted } = e.props
    if (await shouldShow($, Boolean(isExpanded) || isErrored || isInterrupted)) return next(e)

    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (await shouldShow($, Boolean(e.props.isExpanded) || e.props.isErrored)) return next(e)

    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (await shouldShow($, false)) return next(e)

    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // A group with other rows than calls (isCallsOnly false: recalled memory,
  // hook timing) also stays, so they are not hidden with it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const hasFailure = e.props.calls.some((c) => c.isErrored || c.isInterrupted)
    if (await shouldShow($, e.props.isExpanded || hasFailure || e.props.isCallsOnly === false)) return next(e)

    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // A mode added by a newer Claude Code has no label: the spinner stays alone.
    const label: string | undefined = MODE_LABELS[e.props.mode]
    if (!label) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box paddingLeft={2}>
          <Text dimColor>{label}</Text>
        </Box>
      </Box>
    )
  })
}
