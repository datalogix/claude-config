import { atom, memberOf, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import {
  ACTIONS_TITLE,
  alternativesOf,
  isRadioPart,
  isSameTitle,
  parseAnswer,
  previewOf,
  questionOf,
  RECOMMENDED_MARK,
  stripBackticks,
  submitText,
  toggle,
  toggleChecked,
  withoutRecommendedMark,
} from './parse'
import type { Actions, ParsedAnswer, Topic } from './parse'

const PANE_ID = 'topics'
const lastAnswerAtom = atom({ plugin: 'topics', key: 'lastAnswer' } as const, '')
const openTopicsAtom = atom({ plugin: 'topics', key: 'openTopics' } as const, [])
const explainedItemsAtom = atom({ plugin: 'topics', key: 'explainedItems' } as const, [])
const checkedItemsAtom = atom({ plugin: 'topics', key: 'checkedItems' } as const, [])
const isSentAtom = atom({ plugin: 'topics', key: 'isSent' } as const, false)
const isAnsweringAtom = atom({ plugin: 'topics', key: 'isAnswering' } as const, false)
const focusedKeyAtom = atom({ plugin: 'topics', key: 'focusedKey' } as const, '')

// Width of the thin rule after a topic title; HEADER_MARGIN is left for the arrow and gaps.
const RULE_MIN = 3
const RULE_MAX = 48
const HEADER_MARGIN = 6
/** Details sit under the item text, past the "❯ 1. [ ] " prefix (or "❯    ( ) " for a radio). */
const DETAIL_INDENT = 9
/** An open explanation sits under the text of its "▸ explicação" button, two columns further in. */
const EXPLANATION_INDENT = 11

const FORMAT_INSTRUCTION = [
  'Organização das respostas: quando a resposta tiver mais de um assunto ou passar de umas 10 linhas,',
  'comece com uma frase curta de resumo e depois agrupe o resto em tópicos, cada um com',
  'um título `## ` curto e descritivo (2 a 6 palavras). Cada tópico trata de um só assunto.',
  'Não use `## ` para outra coisa. Respostas curtas ficam sem tópicos.',
  'Quando algo depender do usuário (decidir, aprovar, rodar um comando, testar, responder uma pergunta),',
  `termine a resposta, mesmo curta, com um último tópico \`## ${ACTIONS_TITLE}\` listando cada ação como`,
  'checkbox de markdown (`- [ ] ação objetiva`), uma por linha; texto solto só se não couber em checkbox.',
  `Se nada depender do usuário, não inclua \`## ${ACTIONS_TITLE}\`.`,
  'O usuário responde marcando as caixas e devolvendo a lista, então cada caixa é uma única opção, escrita de modo que',
  'marcar signifique "sim, faça isto": nunca junte alternativas ("aprovar X, usar Y ou recusar") na mesma caixa.',
  'O texto da caixa diz sozinho o que será feito, sem remeter a números, letras ou nomes que só aparecem em outro',
  'lugar da resposta: escreva "Corrigir o total do pedido com cupom", nunca "Aplicar #1" nem "Fazer a opção B".',
  'Há dois tipos de caixa. Checkbox `- [ ] ação` é uma ação independente, que pode ser marcada junto com qualquer outra.',
  'Radio `- ( ) opção` é uma alternativa exclusiva: os radios seguidos formam um grupo em que só um fica marcado.',
  'Quando houver alternativas, escreva antes uma linha de texto com a pergunta, terminada em "?", e depois um radio por',
  'alternativa, a recomendada primeiro e terminando em "(recomendado)". Um grupo de radios só tem alternativas da mesma',
  'decisão: depois dele, uma ação independente é checkbox `[ ]`, e outra decisão começa com a sua própria pergunta.',
  'Nunca use radio para ações que podem ser feitas juntas, nem checkbox para opções que se excluem.',
  'Uma caixa escrita já marcada (`[x]`, `(x)`) aparece ao usuário desmarcada, só como sugestão: na resposta dele,',
  'uma caixa desmarcada quer dizer só que ele não a marcou, nunca que recusou.',
  'Logo abaixo de cada caixa, em linhas recuadas com dois espaços, diga só o que aquela opção tem de próprio: o que',
  'acontece se ela for marcada e um exemplo curto do resultado ("Ex.: ..."), para a decisão caber na própria lista;',
  'uma ideia por linha, no máximo três linhas. Não repita nos detalhes a pergunta, o contexto comum a todas as opções',
  'nem o que um tópico já explica; se a opção não tiver nada de próprio a dizer, deixe-a sem detalhes.',
  'Se um tópico acima explica a decisão, acrescente uma linha recuada `ver: Título exato do tópico` uma única vez por',
  'decisão, na primeira alternativa do grupo (ou na própria checkbox): ela vira um botão que abre a explicação junto',
  'da caixa.',
  'Os tópicos aparecem fechados para o usuário, que vê só o resumo, os títulos e as pendências: o resumo e as caixas',
  'precisam bastar para decidir, e os tópicos guardam o detalhe.',
].join(' ')

type ResolvedElements = Elements[keyof Elements]

const REMEMBERED_MAX = 200
/** Per message (and the pane, under PANE_ID), so a redraw does not parse every answer again. */
const parsedMessages = new Map<string, { text: string; parsed: ParsedAnswer }>()

const parseMessage = (requestId: string, text: string) => {
  const cached = parsedMessages.get(requestId)
  if (cached?.text === text) return cached.parsed
  const parsed = parseAnswer(text)
  parsedMessages.delete(requestId)
  parsedMessages.set(requestId, { text, parsed })
  // The oldest entry goes first: Map keeps insertion order.
  if (parsedMessages.size > REMEMBERED_MAX) parsedMessages.delete(parsedMessages.keys().next().value!)
  return parsed
}

/** Answer text to the newest message drawing it with Pendências, so the pane checks and sends with its state. */
const answerMessages = new Map<string, string>()
/** So a redraw of an older message with the same answer does not take the answer from a newer one. */
const messageTexts = new Map<string, string>()

const rememberMessage = (requestId: string, text: string) => {
  if (messageTexts.get(requestId) === text) return
  messageTexts.delete(requestId)
  messageTexts.set(requestId, text)
  if (messageTexts.size > REMEMBERED_MAX) messageTexts.delete(messageTexts.keys().next().value!)
  answerMessages.delete(text)
  answerMessages.set(text, requestId)
  if (answerMessages.size > REMEMBERED_MAX) answerMessages.delete(answerMessages.keys().next().value!)
}

const renderTopicHeader = (
  { Box, Button, Text }: ResolvedElements,
  key: string,
  title: string,
  isOpen: boolean,
  width: number,
  onToggle: () => unknown,
  hotkey?: string,
) => {
  const label = stripBackticks(title)
  return (
    <Box>
      <Button key={key} plain hotkey={hotkey} label={`${isOpen ? '▾' : '▸'} ${label}`} onPress={onToggle} />
      <Text dimColor> {'─'.repeat(Math.max(RULE_MIN, Math.min(RULE_MAX, width - label.length - HEADER_MARGIN)))}</Text>
    </Box>
  )
}

const renderTopics = (
  els: ResolvedElements,
  topics: readonly Topic[],
  openTopics: readonly number[],
  toggleTopic: (i: number) => unknown,
  width: number,
  id: string,
  hasHotkeys = false,
) => {
  const { Box, Markdown, Text } = els
  return topics.map((t, i) => {
    const isOpen = openTopics.includes(i)
    return (
      <Box key={`${id}-topic-${i}-box`} flexDirection="column" marginTop={1}>
        {renderTopicHeader(
          els,
          `${id}-topic-${i}`,
          t.title,
          isOpen,
          width,
          () => toggleTopic(i),
          hasHotkeys && i < 9 ? String(i + 1) : undefined,
        )}
        <Box paddingLeft={2}>
          {isOpen ? (
            <Markdown text={t.body} />
          ) : (
            <Text dimColor italic>
              {previewOf(t.body)}
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}

type ActionsState = {
  checkedItems: readonly number[]
  explainedItems: readonly number[]
  isSent: boolean
  isAnswering: boolean
  toggleItem: (i: number) => unknown
  toggleExplanation: (i: number) => unknown
  submit: () => unknown
}

const renderActions = (
  { Box, Button, Markdown, Text }: ResolvedElements,
  actions: Actions,
  topics: readonly Topic[],
  state: ActionsState,
  id: string,
  focusedKey = '',
) => {
  const isCheckedAt = actions.items.map((_, i) => state.checkedItems.includes(i))
  // One number per checkbox and one per radio group, on the group's first radio.
  let decisionCount = 0
  const numbers = actions.parts.map((part, p) =>
    'item' in part && !(isRadioPart(actions, p) && isRadioPart(actions, p - 1)) ? ++decisionCount : 0,
  )
  const answeredCount = actions.parts.filter(
    (part, p) => numbers[p] && 'item' in part && alternativesOf(actions, part.item).some((i) => isCheckedAt[i]),
  ).length
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box gap={2}>
        <Text bold color="yellow">
          {ACTIONS_TITLE}
        </Text>
        {decisionCount > 0 && (
          <Text dimColor>
            {answeredCount} de {decisionCount}
          </Text>
        )}
      </Box>
      {actions.parts.map((part, p) => {
        if (!('item' in part)) {
          const lines = part.text.split('\n')
          const question = isRadioPart(actions, p + 1) ? questionOf(part) : undefined
          if (question !== undefined) lines.pop()
          return (
            <Box key={`${id}-actions-text-${p}`} flexDirection="column" paddingLeft={2} marginTop={1}>
              {lines.length > 0 && <Markdown text={lines.join('\n')} />}
              {question !== undefined && (
                <Box marginTop={lines.length > 0 ? 1 : 0}>
                  <Text bold>{numbers[p + 1]}. </Text>
                  <Markdown text={question} />
                </Box>
              )}
            </Box>
          )
        }

        const i = part.item
        const item = actions.items[i]!
        const itemKey = `${id}-action-${i}`
        const isRecommended = RECOMMENDED_MARK.test(item.text)
        const explanationTopic =
          item.explanationTitle === undefined
            ? undefined
            : topics.find((t) => isSameTitle(t.title, item.explanationTitle!))
        const isExplained = state.explainedItems.includes(i)
        const previous = actions.parts[p - 1]
        const lacksQuestion = item.isRadio && numbers[p]! > 0 && questionOf(previous) === undefined
        const text = stripBackticks(withoutRecommendedMark(item.text))
        const hasGapAbove = item.isRadio
          ? lacksQuestion
          : !(previous && 'item' in previous && !isRadioPart(actions, p - 1))
        return (
          <Box key={`${itemKey}-box`} flexDirection="column" marginTop={hasGapAbove ? 1 : 0}>
            {lacksQuestion && (
              <Box paddingLeft={2}>
                <Text bold>{numbers[p]}. </Text>
                <Text dimColor>escolha uma opção</Text>
              </Box>
            )}
            <Box>
              <Text color="cyan">
                {focusedKey === itemKey ? '❯ ' : '  '}
                {item.isRadio ? '   ' : ''}
              </Text>
              <Button
                key={itemKey}
                plain
                label={
                  item.isRadio
                    ? `${isCheckedAt[i] ? '(●)' : '( )'} ${text}`
                    : `${numbers[p]}. ${isCheckedAt[i] ? '[✔]' : '[ ]'} ${text}`
                }
                onPress={() => state.toggleItem(i)}
              />
              {isRecommended && <Text color="success"> ★ recomendado</Text>}
              {/* Only a suggestion until the user checks it; ★ recomendado alone marks a recommended one. */}
              {item.isSuggested && !isCheckedAt[i] && !isRecommended && <Text dimColor> sugerido</Text>}
            </Box>
            {item.details.map((detail, d) => (
              <Box key={`${itemKey}-detail-${d}`} paddingLeft={DETAIL_INDENT}>
                <Markdown text={detail} />
              </Box>
            ))}
            {item.explanationTitle !== undefined && !explanationTopic && (
              // No topic by that title: the reference stays as a plain detail.
              <Box paddingLeft={DETAIL_INDENT}>
                <Markdown text={`ver: ${item.explanationTitle}`} />
              </Box>
            )}
            {explanationTopic && (
              <Box paddingLeft={DETAIL_INDENT}>
                <Button
                  key={`${itemKey}-explanation`}
                  plain
                  label={`${isExplained ? '▾' : '▸'} explicação: ${stripBackticks(explanationTopic.title)}`}
                  onPress={() => state.toggleExplanation(i)}
                />
              </Box>
            )}
            {explanationTopic && isExplained && (
              <Box paddingLeft={EXPLANATION_INDENT}>
                <Markdown text={explanationTopic.body} />
              </Box>
            )}
          </Box>
        )
      })}
      {actions.items.length > 0 && (
        <Box paddingLeft={2} marginTop={1}>
          {state.isSent ? (
            <Text color="success">✓ pendências enviadas</Text>
          ) : state.isAnswering ? (
            <Text dimColor>o envio fica disponível quando o Claude terminar de responder</Text>
          ) : (
            <Button
              key={`${id}-actions-submit`}
              variant="primary"
              label="enviar pendências"
              onPress={() => state.submit()}
            />
          )}
        </Box>
      )}
    </Box>
  )
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'topics',
      description: 'Mostra a última resposta em tópicos que abrem e fecham',
    })

    return next(e)
  })

  on('command.run', { command: 'topics' }, async ($) => {
    await $.ui.open({ id: PANE_ID, title: 'Tópicos', focus: true, closeOnEscape: true })

    return { text: 'Painel de tópicos aberto (Esc fecha).' }
  })

  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)

    return { sections: [...sections, { id: 'topics:instruction', text: FORMAT_INSTRUCTION, scope: 'session' }] }
  })

  // While Claude answers, the items may still be half written: sending waits. Only the main turn counts.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isAnsweringAtom, () => true)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isAnsweringAtom, () => false)
      if (e.answer) {
        await update($, lastAnswerAtom, () => e.answer)
        // The pane shows another answer: what was open and checked belonged to the previous one.
        const pane = { requestId: PANE_ID }
        await update($, memberOf(openTopicsAtom, pane), () => [])
        await update($, memberOf(explainedItemsAtom, pane), () => [])
        await update($, memberOf(checkedItemsAtom, pane), () => [])
        await update($, memberOf(isSentAtom, pane), () => false)
      }
    }

    return next(e)
  })

  // AssistantMessage has no isExpanded, so the topics stay closed in the ctrl+o transcript too.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const { intro, topics, actions } = parseMessage(e.requestId, e.props.text)
    if (topics.length < 2 && !actions) return next(e)
    if (actions) rememberMessage(e.requestId, e.props.text)

    const els = $.ui.resolve(e)
    const { Box, Markdown } = els
    const openTopics = memberOf(openTopicsAtom, e)

    return (
      <Box flexDirection="column">
        {intro && <Markdown text={intro} />}
        {renderTopics(
          els,
          topics,
          await read($, openTopics),
          (i) => update($, openTopics, (list) => toggle(list, i)),
          e.viewport?.columns ?? 80,
          e.requestId,
        )}
        {/* Keys carry the requestId: with the same key in several messages, a press would reach another
            message's button. */}
        {actions && renderActions(els, actions, topics, await actionsStateOf($, actions, e), e.requestId)}
      </Box>
    )
  })

  on('ui.focus', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    await update($, focusedKeyAtom, () => e.element ?? '')

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = els
    const answer = await read($, lastAnswerAtom)
    const { intro, topics, actions } = parseMessage(PANE_ID, answer)
    // A new answer may land between this drawing and a press of its submit button.
    const isCurrent = async () => (await read($, lastAnswerAtom)) === answer

    if (topics.length === 0 && !actions) {
      return <Text dimColor>A última resposta não tem tópicos ainda.</Text>
    }

    const openTopics = memberOf(openTopicsAtom, e)
    const setAllOpen = (isOpen: boolean) => update($, openTopics, () => (isOpen ? topics.map((_, i) => i) : []))

    return (
      <Box flexDirection="column">
        {intro && <Markdown text={intro} />}
        <Box gap={1} marginTop={1}>
          <Button key={`${PANE_ID}-open-all`} hotkey="a" label="abrir todos" onPress={() => setAllOpen(true)} />
          <Button key={`${PANE_ID}-close-all`} hotkey="f" label="fechar todos" onPress={() => setAllOpen(false)} />
        </Box>
        {renderTopics(
          els,
          topics,
          await read($, openTopics),
          (i) => update($, openTopics, (list) => toggle(list, i)),
          e.props.bodyColumns,
          PANE_ID,
          true,
        )}
        {actions &&
          renderActions(
            els,
            actions,
            topics,
            // The message of this answer, if drawn: checking or sending in one shows in the other.
            await actionsStateOf($, actions, { requestId: answerMessages.get(answer) ?? PANE_ID }, isCurrent),
            PANE_ID,
            await read($, focusedKeyAtom),
          )}
      </Box>
    )
  })
}

/** `isCurrent` turns false once the pane got a new answer: sending then does nothing. */
const actionsStateOf = async (
  $: EngineInterface,
  actions: Actions,
  member: { requestId: string },
  isCurrent: () => Promise<boolean> = async () => true,
): Promise<ActionsState> => {
  const checkedItems = memberOf(checkedItemsAtom, member)
  const explainedItems = memberOf(explainedItemsAtom, member)
  const isSent = memberOf(isSentAtom, member)
  return {
    checkedItems: await read($, checkedItems),
    explainedItems: await read($, explainedItems),
    isSent: await read($, isSent),
    isAnswering: await read($, isAnsweringAtom),
    toggleItem: (i) => update($, checkedItems, (list) => toggleChecked(actions, list, i)),
    toggleExplanation: (i) => update($, explainedItems, (list) => toggle(list, i)),
    // Reads the state at press time: the drawing it came from may be older than the last check or send.
    submit: async () => {
      if ((await read($, isAnsweringAtom)) || !(await isCurrent())) return
      // Read and set in one update, so of two quick presses only the first finds it unsent and sends.
      let wasSent = false
      await update($, isSent, (v) => {
        wasSent = v
        return true
      })
      if (wasSent) return
      try {
        await $.prompt.submit({ text: submitText(actions, await read($, checkedItems)), asUser: true })
      } catch {
        await update($, isSent, () => false)
        $.ui.toast('⚠️ Não foi possível enviar as pendências', { timeoutMs: 8000 })
      }
    },
  }
}
