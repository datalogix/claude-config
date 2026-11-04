import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ResolveInput } from 'claude-code'

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

const hidden = ($: EngineInterface, e: ResolveInput) => {
  const { Box } = $.ui.resolve(e)
  return <Box />
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'steps',
      description: 'Mostra ou esconde as linhas de ferramentas na conversa',
      immediate: true,
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

    return hidden($, e)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (await shouldShow($, Boolean(e.props.isExpanded) || e.props.isErrored)) return next(e)

    return hidden($, e)
  })

  // Only the ctrl+b hint: a kind added by a newer Claude Code has no way back but /steps, so it stays.
  on('ui.render', { component: 'ToolProgress', props: { kind: 'background_hint' } }, async ($, e, next) => {
    if (await read($, areToolRowsVisibleAtom)) return next(e)

    return hidden($, e)
  })

  // A group with other rows than calls (isCallsOnly false: recalled memory,
  // hook timing) also stays, so they are not hidden with it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    // The folded row is only a count, with no mark of the failure: unfolded, it shows the error and the calls around it.
    const hasFailure = e.props.calls.some((c) => c.isErrored || c.isInterrupted)
    if (hasFailure && !e.props.isExpanded) return next({ ...e, props: { ...e.props, isExpanded: true } })
    if (await shouldShow($, e.props.isExpanded || e.props.isCallsOnly === false)) return next(e)

    return hidden($, e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // A mode added by a newer Claude Code has no label: the spinner stays alone.
    const label: string | undefined = MODE_LABELS[e.props.mode]
    if (!label) return next(e)
    // VS Code draws a tree as a box of its own under the conversation: the step goes in the spinner's own row, as the
    // word. While a message overrides the word, the row shows that message alone, so there is nothing to rewrite.
    if (e.surface === 'vscode') return e.props.message ? next(e) : next({ ...e, props: { ...e.props, word: label } })
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
