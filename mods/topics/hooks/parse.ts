export type Topic = { title: string; body: string }
export type ActionItem = {
  text: string
  /** Written checked (`[x]`, `(x)`): only a suggestion, the item still starts unchecked. */
  isSuggested: boolean
  /** Written `- ( )`: an exclusive alternative of the `( )` items next to it. */
  isRadio: boolean
  /** The indented lines below the item; a code block among them is one entry. */
  details: string[]
  /** From the item's first `ver:`, not yet matched to a topic. */
  explanationTitle?: string
}
/** Loose text (a question, a note) or an index into `items`, in written order. */
export type ActionPart = { text: string } | { item: number }
export type Actions = { items: ActionItem[]; parts: ActionPart[] }
export type ParsedAnswer = { intro: string; topics: Topic[]; actions?: Actions }

export const ACTIONS_TITLE = 'Pendências'

export const RECOMMENDED_MARK = /\s*\**\(recomendad[oa]\)\**[.!]?\s*$/i

/** Also drops the `**` left unpaired when the mark took a bold's closing one: `**cache local (recomendado)**`. */
export const withoutRecommendedMark = (t: string) => {
  const mark = RECOMMENDED_MARK.exec(t)?.[0] ?? ''
  const text = t.replace(RECOMMENDED_MARK, ' ').trim()
  // Code spans are blanked out (same length) so a ** in code (`**kwargs`) is not counted.
  const outsideCode = text.replace(/(`+).*?(?<!`)\1(?!`)/g, (span) => ' '.repeat(span.length))
  if (!mark.includes('**') || outsideCode.split('**').length % 2 !== 0) return text
  const last = outsideCode.lastIndexOf('**')
  return `${text.slice(0, last)}${text.slice(last + 2)}`.replace(/\s{2,}/g, ' ').trim()
}

const PREVIEW_MAX = 90

// A fence of backticks cannot have a backtick in its info string (CommonMark). mods/status/hooks/register.ts keeps a
// copy of this regex and of createCodeBlockTracker's closing rule (same character, at least as long, nothing after),
// since each mod installs on its own: change both.
const FENCE = /^\s*(`{3,}(?!.*`)|~{3,})/

/** Only tests the line: whether it opens or closes a block is createCodeBlockTracker's job. */
export const isFence = (line: string) => FENCE.test(line)

const normalizeTitle = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
const isActionsTitle = (title: string) =>
  normalizeTitle(title.replace(/[*_]/g, '').replace(/:\s*$/, '')) === normalizeTitle(ACTIONS_TITLE)

/** For button labels, which do not draw markdown. */
export const stripBackticks = (t: string) => t.replace(/`/g, '')

const plainTitle = (t: string) => normalizeTitle(stripBackticks(t).replace(/[*_]/g, ''))

export const isSameTitle = (a: string, b: string) => plainTitle(a) === plainTitle(b)

export const toggle = (list: readonly number[], i: number): number[] =>
  list.includes(i) ? list.filter((x) => x !== i) : [...list, i]

/** The returned function is called with each line in order; `'code'` is a line inside a block. */
const createCodeBlockTracker = () => {
  let openFence = ''
  return (line: string): 'open' | 'close' | 'code' | false => {
    const fence = FENCE.exec(line)?.[1]
    if (fence && !openFence) {
      openFence = fence
      return 'open'
    }
    if (
      fence &&
      fence[0] === openFence[0] &&
      fence.length >= openFence.length &&
      !line.trim().slice(fence.length).trim()
    ) {
      openFence = ''
      return 'close'
    }
    return openFence !== '' && 'code'
  }
}

export const parseActions = (body: string): Actions => {
  const items: ActionItem[] = []
  const parts: ActionPart[] = []
  let looseLines: string[] = []
  const closeLooseText = () => {
    const text = looseLines.join('\n').trim()
    if (text) parts.push({ text })
    looseLines = []
  }
  const codeLineKind = createCodeBlockTracker()
  // The indent of the fence that opened a block among the last item's details; undefined for a block in loose text.
  let detailIndent: number | undefined
  for (const line of body.split('\n')) {
    const lastItem = items[items.length - 1]
    const kind = codeLineKind(line)
    if (kind) {
      const isOpening = kind === 'open'
      const indent = /^\s*/.exec(line)![0].length
      if (isOpening) detailIndent = lastItem && looseLines.length === 0 && indent > 0 ? indent : undefined
      // The whole block is one detail, so it draws as one code block.
      if (detailIndent === undefined) looseLines.push(line)
      else if (isOpening) lastItem!.details.push(line.slice(indent))
      else lastItem!.details[lastItem!.details.length - 1] += `\n${line.slice(Math.min(indent, detailIndent))}`
      continue
    }
    const match = /^\s*[-*+]\s+(?:\[([ xX])\]|\(([ xX•●])\))\s+(.+?)\s*$/.exec(line)
    if (match) {
      closeLooseText()
      parts.push({ item: items.length })
      const mark = match[1] ?? match[2]
      items.push({ text: match[3] ?? '', isSuggested: mark !== ' ', isRadio: match[2] !== undefined, details: [] })
    } else if (looseLines.length === 0 && !line.trim()) {
      continue
    } else if (lastItem && looseLines.length === 0 && /^\s+\S/.test(line)) {
      const explanationMatch = /^\s+ver:\s*(.+?)\s*$/i.exec(line)
      // The first ver: wins; a later one stays as a detail.
      if (explanationMatch && lastItem.explanationTitle === undefined) lastItem.explanationTitle = explanationMatch[1]!
      else lastItem.details.push(line.trim())
    } else {
      looseLines.push(line)
    }
  }
  closeLooseText()
  return { items, parts }
}

/** Titles inside code blocks don't count; the last "Pendências" topic goes to `actions` instead of `topics`. */
export const parseAnswer = (text: string): ParsedAnswer => {
  const intro: string[] = []
  const headings: { title: string; lines: string[] }[] = []
  const codeLineKind = createCodeBlockTracker()

  for (const line of text.split('\n')) {
    // A closing run of # only counts after a space, so "## Usar C#" keeps its #.
    const title = !codeLineKind(line) && /^##\s+(.+?)(?:\s+#+)?\s*$/.exec(line)
    if (title) {
      headings.push({ title: title[1] ?? '', lines: [] })
    } else if (headings.length > 0) {
      headings[headings.length - 1]!.lines.push(line)
    } else {
      intro.push(line)
    }
  }

  const allTopics = headings.map((h) => ({ title: h.title, body: h.lines.join('\n').trim() }))
  const actionsIndex = allTopics.findLastIndex((t) => isActionsTitle(t.title))

  return {
    intro: intro.join('\n').trim(),
    topics: allTopics.filter((_, i) => i !== actionsIndex),
    ...(actionsIndex >= 0 ? { actions: parseActions(allTopics[actionsIndex]!.body) } : {}),
  }
}

export const previewOf = (body: string): string => {
  const codeLineKind = createCodeBlockTracker()
  const line = body.split('\n').find((l) => !codeLineKind(l) && l.trim()) ?? ''
  const clean = line
    .replace(/^\s*(>\s*)*((#+|[-*+]|\d+[.)])\s+)?/, '')
    .replace(/`/g, '')
    // Emphasis pairs only: a lone * (2 * 3), globs (src/*.ts) and underscores inside words (user_id) stay.
    .replace(/(?<![\p{L}\p{N}*])(\*{1,3})(?=[^\s*])(.+?)(?<=[^\s*])\1(?![\p{L}\p{N}*])/gu, '$2')
    .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '')
    .trim()
  // By code point, so an emoji is not cut in half.
  const chars = [...clean]
  return chars.length > PREVIEW_MAX ? `${chars.slice(0, PREVIEW_MAX - 1).join('')}…` : clean
}

export const isRadioPart = (actions: Actions, p: number): boolean => {
  const part = actions.parts[p]
  return part !== undefined && 'item' in part && actions.items[part.item]!.isRadio
}

/** The `( )` radios next to item `i`, with no text or checkbox between them; just `i` for a checkbox. */
export const alternativesOf = (actions: Actions, i: number): number[] => {
  if (!actions.items[i]!.isRadio) return [i]

  let start = actions.parts.findIndex((part) => 'item' in part && part.item === i)
  while (isRadioPart(actions, start - 1)) start--

  const group: number[] = []
  for (let p = start; isRadioPart(actions, p); p++) group.push((actions.parts[p] as { item: number }).item)
  return group
}

/** `isSuggested` plays no part: sending a suggested item as checked would be an approval never given. */
export const toggleChecked = (actions: Actions, checked: readonly number[], i: number): number[] => {
  const after = toggle(checked, i)
  if (!after.includes(i)) return after

  const others = alternativesOf(actions, i).filter((j) => j !== i)
  return after.filter((j) => !others.includes(j))
}

export const questionOf = (part: ActionPart | undefined): string | undefined => {
  if (part === undefined || 'item' in part) return undefined
  const last = part.text.split('\n').at(-1)
  return last !== undefined && !isFence(last) ? last : undefined
}

/** Sent as the user by "enviar pendências"; of the loose text, only the question right before items goes. */
export const submitText = (actions: Actions, checked: readonly number[]): string =>
  [
    `${ACTIONS_TITLE}:`,
    ...actions.parts.flatMap((part, i) => {
      if ('item' in part) {
        const item = actions.items[part.item]!
        const x = checked.includes(part.item) ? 'x' : ' '
        return [item.isRadio ? `- (${x}) ${item.text}` : `- [${x}] ${item.text}`]
      }
      const next = actions.parts[i + 1]
      const question = next && 'item' in next ? questionOf(part) : undefined
      return question === undefined ? [] : [question]
    }),
  ].join('\n')
