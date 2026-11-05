export type Topic = { title: string; body: string }
type ActionItem = {
  text: string
  /** Written checked (`[x]`, `(x)`): only a suggestion, the mark checks nothing; `(recomendo)` still does. */
  isSuggested: boolean
  /** Written `- ( )`: an exclusive alternative of the `( )` items next to it. */
  isRadio: boolean
  /** The indented lines below the item; a code block among them is one entry. */
  details: string[]
  /** From the item's first `ver:`, not yet matched to a topic. */
  explanationTitle?: string
}
/** Loose text (a question, a note) or an index into `items`, in written order. */
type ActionPart = { text: string } | { itemIndex: number }
export type Actions = { items: ActionItem[]; parts: ActionPart[] }
export type ParsedAnswer = { intro: string; topics: Topic[]; actions?: Actions }

export const ACTIONS_TITLE = 'Pendências'

export type Stance = 'recommended' | 'notRecommended' | 'evaluate'

const STANCE_WORDS = 'recomendo|recomendad[oa]|n[ãa]o recomendo|avalie'
/** The instruction asks for it at the start of the item; "(recomendado)" and the end are how older answers wrote it. */
export const STANCE_MARK = new RegExp(
  // A separator only with a space after it: in "(recomendo) .env" or "(avalie) --force" it is the item's own text.
  `^\\s*[*_]*\\((${STANCE_WORDS})\\)[*_]*\\s*(?:[:.!–—-](?:\\*+|_+(?=\\s|$)|(?=\\s|$)))?\\s*|\\s*[*_]*\\((${STANCE_WORDS})\\)[*_]*[.!]?[*_]*\\s*$`,
  'i',
)

export const stanceOf = (t: string): Stance | undefined => {
  const match = STANCE_MARK.exec(t)
  if (!match) return undefined
  const word = (match[1] ?? match[2]!).toLowerCase()
  return word.startsWith('n') ? 'notRecommended' : word === 'avalie' ? 'evaluate' : 'recommended'
}

/** Also drops the emphasis left unpaired when the mark took one side of it: `**(recomendo) cache local**`. */
export const withoutStanceMark = (t: string) => {
  const match = STANCE_MARK.exec(t)
  const mark = match?.[0] ?? ''
  const text = t.replace(STANCE_MARK, ' ').trim()
  const before = mark.slice(0, mark.indexOf('(')).replace(/[^*_]/g, '')
  const after = mark.slice(mark.indexOf(')') + 1).replace(/[^*_]/g, '')
  const run = before.length > after.length ? before.slice(after.length) : after.slice(before.length)
  if (!run) return text
  // Code spans are blanked out (same length) so a ** in code (`**kwargs`) is not counted.
  const outsideCode = text.replace(/(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g, (span) => ' '.repeat(span.length))
  const delimiter = `\\${run[0]}`
  const runs = [
    ...outsideCode.matchAll(new RegExp(`(?<!${delimiter})${delimiter}{${run.length}}(?!${delimiter})`, 'g')),
  ]
  if (runs.length % 2 === 0) return text
  const unpaired = (match?.index === 0 ? runs[0] : runs.at(-1))!.index
  return `${text.slice(0, unpaired)}${text.slice(unpaired + run.length)}`.replace(/\s{2,}/g, ' ').trim()
}

const PREVIEW_MAX = 90

// A fence of backticks cannot have a backtick in its info string (CommonMark). mods/status/hooks/register.ts keeps a
// copy of FENCE, QUOTE, LIST_ITEM, THEMATIC_BREAK, TABLE_ROW, HTML_COMMENT, CODE_MARK, INLINE_MAX, plainText and
// createCodeBlockTracker, since each mod installs on its own: change both. tests/mods.test.js compares them.
const FENCE = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(`{3,}(?!.*`)|~{3,})/
const QUOTE = /^\s*(?:>\s?)+/
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/
/** Emphasis or a code span no longer than this comes off: unbounded, a line of openers took quadratic time. */
const INLINE_MAX = 1000

/** Only tests the line: whether it opens or closes a block is createCodeBlockTracker's job. */
const isFence = (line: string) => FENCE.test(line.replace(QUOTE, ''))

// Lines with no text to show, as extractExcerpt in mods/status/hooks/register.ts skips them.
const THEMATIC_BREAK = /^\s*([-*_]\s*){3,}$/
const TABLE_ROW = /^\s*\|/
const HTML_COMMENT = /^\s*(<!--((?!-->).)*-->\s*)+$/

const normalizeTitle = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
const withoutTitleMarks = (t: string) => t.replace(/[`*_]/g, '')
const isActionsTitle = (title: string) =>
  normalizeTitle(withoutTitleMarks(title).replace(/:\s*$/, '')) === normalizeTitle(ACTIONS_TITLE)

/** Stands in for a code span while emphasis comes off; a private use character, so no answer writes it. */
const CODE_MARK = ''

/** For button labels and previews, which do not draw markdown. What a code span holds stays as written. */
export const plainText = (t: string) => {
  const spans: string[] = []
  return (
    t
      .replace(
        new RegExp(`(?<!\`)(\`+)(?!\`)(.{0,${INLINE_MAX}}?)(?<!\`)\\1(?!\`)`, 'g'),
        (_, _ticks, code: string) => `${CODE_MARK}${spans.push(code) - 1}${CODE_MARK}`,
      )
      .replace(/`/g, '')
      // An escaped mark is text, so it stays out of the emphasis and link passes, as a code span does.
      .replace(/\\([\\*_~[\]])/g, (_, mark: string) => `${CODE_MARK}${spans.push(mark) - 1}${CODE_MARK}`)
      // Before emphasis, which could take the _ of a URL.
      .replace(new RegExp(`!?\\[([^\\][]{1,${INLINE_MAX}})\\]\\([^)]{0,${INLINE_MAX}}\\)`, 'g'), '$1')
      .replace(new RegExp(`(?<!~)~~(?=[^\\s~])(.{1,${INLINE_MAX}}?)(?<=[^\\s~])~~(?!~)`, 'g'), '$1')
      // Emphasis pairs only: a lone * (2 * 3), globs (src/*.ts, *.md), paths (__init__.py) and $_ENV stay. Bold may
      // start with . or / (**.env**): a glob's ** (**/*.ts) has no pair closing before a space.
      .replace(
        new RegExp(
          `(?<![\\p{L}\\p{N}*/.])(\\*{2,3}(?=[^\\s*])|\\*(?=[^\\s*/.]))(.{1,${INLINE_MAX}}?)(?<=[^\\s*])\\1(?![\\p{L}\\p{N}*/]|\\.[\\p{L}\\p{N}])`,
          'gu',
        ),
        '$2',
      )
      .replace(
        new RegExp(
          `(?<![\\p{L}\\p{N}_/.])(_{1,3})(?=[^\\s_/.])(.{1,${INLINE_MAX}}?)(?<=[^\\s_])\\1(?![\\p{L}\\p{N}_/]|\\.[\\p{L}\\p{N}])`,
          'gu',
        ),
        '$2',
      )
      .replace(new RegExp(`${CODE_MARK}(\\d+)${CODE_MARK}`, 'g'), (_, i: string) => spans[Number(i)]!)
  )
}

const comparableTitle = (t: string) => normalizeTitle(withoutTitleMarks(t))

export const isSameTitle = (a: string, b: string) => comparableTitle(a) === comparableTitle(b)

export const toggle = (list: readonly number[], i: number): number[] =>
  list.includes(i) ? list.filter((x) => x !== i) : [...list, i]

/** The returned function is called with each line in order; `'code'` is a line inside a block. */
const createCodeBlockTracker = () => {
  let openFence = ''
  // Where the list item that opened the block has its text, and whether a quote opened it: the block ends with them.
  let itemColumn = 0
  // Whether the text before a block is a list, and whether a block is indented in one: a line at column 0 ends the
  // item and the block with it, unless it is a fence closing the block. Outside a list, it is still code (CommonMark).
  let isInList = false
  let isIndentedInList = false
  let isInQuote = false
  return (rawLine: string): 'open' | 'close' | 'code' | false => {
    const isQuoteLine = QUOTE.test(rawLine)
    if (isInQuote && !isQuoteLine) openFence = ''
    // A > inside a block opened outside a quote is code.
    const line = !openFence || isInQuote ? rawLine.replace(QUOTE, '') : rawLine
    const column = line.search(/\S/)
    const fence = FENCE.exec(line)?.[1]
    const isClosing =
      fence !== undefined &&
      fence[0] === openFence[0] &&
      fence.length >= openFence.length &&
      !line.trim().slice(fence.length).trim()
    if (line.trim() && (column < itemColumn || (isIndentedInList && column === 0 && !isClosing))) openFence = ''
    if (!openFence && line.trim()) isInList = LIST_ITEM.test(line) || (isInList && column > 0)
    if (fence && !openFence) {
      openFence = fence
      const isOnMarker = !line.trimStart().startsWith(fence)
      itemColumn = isOnMarker ? line.indexOf(fence) : 0
      isIndentedInList = !isOnMarker && column > 0 && isInList
      isInQuote = isQuoteLine
      return 'open'
    }
    if (isClosing) {
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
  const trackCodeLine = createCodeBlockTracker()
  // The indent of the fence that opened a block among the last item's details; undefined for a block in loose text.
  let detailIndent: number | undefined
  for (const line of body.split('\n')) {
    const lastItem = items[items.length - 1]
    const kind = trackCodeLine(line)
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
    const match = /^\s*[-*+]\s+(?:\[([ xX])\]|\(([ xX•●])\))\s+(\S.*?)\s*$/.exec(line)
    if (match) {
      closeLooseText()
      parts.push({ itemIndex: items.length })
      const mark = match[1] ?? match[2]
      items.push({ text: match[3] ?? '', isSuggested: mark !== ' ', isRadio: match[2] !== undefined, details: [] })
    } else if (looseLines.length === 0 && !line.trim()) {
      continue
    } else if (lastItem && looseLines.length === 0 && /^\s+\S/.test(line)) {
      const explanationMatch = /^\s+ver:\s*(\S.*?)\s*$/i.exec(line)
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
  const trackCodeLine = createCodeBlockTracker()

  for (const line of text.split('\n')) {
    // A closing run of # only counts after a space, so "## Usar C#" keeps its #.
    const titleMatch = !trackCodeLine(line) && /^##\s+(\S.*?)(?:\s+#+)?\s*$/.exec(line)
    if (titleMatch) {
      headings.push({ title: titleMatch[1] ?? '', lines: [] })
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
  const trackCodeLine = createCodeBlockTracker()
  const line =
    body
      .split('\n')
      .find(
        (l) => !trackCodeLine(l) && l.trim() && !THEMATIC_BREAK.test(l) && !TABLE_ROW.test(l) && !HTML_COMMENT.test(l),
      ) ?? ''
  const clean = plainText(line.replace(/^\s*(>\s*)*((#+|[-*+]|\d+[.)])\s+([[(][ xX•●][\])]\s+)?)?/, '')).trim()
  // By code point, so an emoji is not cut in half.
  const chars = [...clean]
  return chars.length > PREVIEW_MAX ? `${chars.slice(0, PREVIEW_MAX - 1).join('')}…` : clean
}

export const isRadioPart = (actions: Actions, p: number): boolean => {
  const part = actions.parts[p]
  return part !== undefined && 'itemIndex' in part && actions.items[part.itemIndex]!.isRadio
}

/** The `( )` radios next to item `i`, with no text or checkbox between them; just `i` for a checkbox. */
export const alternativesOf = (actions: Actions, i: number): number[] => {
  if (!actions.items[i]!.isRadio) return [i]

  let start = actions.parts.findIndex((part) => 'itemIndex' in part && part.itemIndex === i)
  while (isRadioPart(actions, start - 1)) start--

  const group: number[] = []
  for (let p = start; isRadioPart(actions, p); p++) group.push((actions.parts[p] as { itemIndex: number }).itemIndex)
  return group
}

/**
 * What starts checked: the items written `(recomendo)`, and in a radio group only the first of them. `isSuggested`
 * plays no part: sending a suggested item as checked would be an approval never given.
 */
export const defaultChecked = (actions: Actions): number[] => {
  const checked: number[] = []
  actions.items.forEach((item, i) => {
    if (stanceOf(item.text) === 'recommended' && !alternativesOf(actions, i).some((j) => checked.includes(j))) {
      checked.push(i)
    }
  })
  return checked
}

export const toggleChecked = (actions: Actions, checked: readonly number[], i: number): number[] => {
  const after = toggle(checked, i)
  if (!after.includes(i)) return after

  const others = alternativesOf(actions, i).filter((j) => j !== i)
  return after.filter((j) => !others.includes(j))
}

export const questionOf = (part: ActionPart | undefined): string | undefined => {
  if (part === undefined || 'itemIndex' in part) return undefined
  const last = part.text
    .split('\n')
    .filter((line) => line.trim() && !THEMATIC_BREAK.test(line) && !HTML_COMMENT.test(line))
    .at(-1)
  return last !== undefined && !isFence(last) ? last : undefined
}

/** Sent as the user by "enviar pendências"; of the loose text, only the question right before items goes. */
export const sentText = (actions: Actions, checked: readonly number[]): string =>
  [
    `${ACTIONS_TITLE}:`,
    ...actions.parts.flatMap((part, i) => {
      if ('itemIndex' in part) {
        const item = actions.items[part.itemIndex]!
        const x = checked.includes(part.itemIndex) ? 'x' : ' '
        return [item.isRadio ? `- (${x}) ${item.text}` : `- [${x}] ${item.text}`]
      }
      const next = actions.parts[i + 1]
      const question = next && 'itemIndex' in next ? questionOf(part) : undefined
      return question === undefined ? [] : [question]
    }),
  ].join('\n')
