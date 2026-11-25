/** One simple command: its words, quotes removed, and the files it reads through `<` or `<>`. */
export type Command = { words: string[]; inputs: string[] }

const OPERATORS = ['&&', '||', ';;', '|&', ';', '|', '&', '\n', '(', ')']
const SPACE = /[ \t\r]/

/**
 * Splits a shell command line into its simple commands, quotes aware. Each `$( )` and backtick holds commands of its
 * own, listed with the others; heredoc bodies are skipped, so a commit message is never read as commands.
 */
export const parseShell = (source: string): Command[] => {
  const commands: Command[] = []
  parse(source, 0, false, commands)
  return commands
}

/** Parses from `start` up to the end, or to the `)` that closes a `$(` when `isSub`; returns where it stopped. */
const parse = (src: string, start: number, isSub: boolean, out: Command[]): number => {
  let command: Command = { words: [], inputs: [] }
  let word = ''
  let hasWord = false
  let redirect: string | undefined
  let depth = 0
  const heredocs: { delimiter: string; stripsTabs: boolean }[] = []
  let i = start

  const endWord = () => {
    if (!hasWord) return
    if (redirect === undefined) command.words.push(word)
    else if (redirect.startsWith('<<') && redirect !== '<<<')
      heredocs.push({ delimiter: word, stripsTabs: redirect === '<<-' })
    else if (redirect === '<' || redirect === '<>') command.inputs.push(word)
    redirect = undefined
    word = ''
    hasWord = false
  }
  const endCommand = () => {
    endWord()
    if (command.words.length > 0 || command.inputs.length > 0) out.push(command)
    command = { words: [], inputs: [] }
  }
  /** Skips the heredoc bodies that start after the newline at `i`; returns the index of the newline ending the last. */
  const skipHeredocs = () => {
    for (const { delimiter, stripsTabs } of heredocs.splice(0)) {
      while (i < src.length) {
        const end = src.indexOf('\n', i + 1)
        const line = src.slice(i + 1, end === -1 ? src.length : end)
        i = end === -1 ? src.length : end
        if ((stripsTabs ? line.replace(/^\t+/, '') : line) === delimiter) break
      }
    }
  }
  /** Reads a `$(`, `${` or backtick at `i` inside a word; returns the index after it. */
  const substitution = (): number => {
    if (src[i] === '`') {
      let end = i + 1
      while (end < src.length && src[end] !== '`') end += src[end] === '\\' ? 2 : 1
      parse(src.slice(i + 1, end), 0, false, out)
      return end + 1
    }
    if (src[i + 1] === '(') return parse(src, i + 2, true, out) + 1
    const end = src.indexOf('}', i)
    word += src.slice(i, end === -1 ? src.length : end + 1)
    return end === -1 ? src.length : end + 1
  }

  while (i < src.length) {
    const c = src.charAt(i)

    if (c === '\\') {
      if (src[i + 1] !== '\n') {
        word += src[i + 1] ?? ''
        hasWord = true
      }
      i += 2
      continue
    }
    if (c === "'" || (c === '$' && src[i + 1] === "'")) {
      const open = c === '$' ? i + 2 : i + 1
      const end = src.indexOf("'", open)
      word += src.slice(open, end === -1 ? src.length : end)
      hasWord = true
      i = end === -1 ? src.length : end + 1
      continue
    }
    if (c === '"') {
      hasWord = true
      i++
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && '"\\$`\n'.includes(src[i + 1] ?? '')) {
          word += src[i + 1]
          i += 2
        } else if ((src[i] === '$' && '({'.includes(src[i + 1] ?? '')) || src[i] === '`') i = substitution()
        else word += src[i++]
      }
      i++
      continue
    }
    if (c === '`' || (c === '$' && '({'.includes(src[i + 1] ?? ''))) {
      hasWord = true
      i = substitution()
      continue
    }
    if (c === '#' && !hasWord) {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (SPACE.test(c)) {
      endWord()
      i++
      continue
    }
    if (c === '<' || c === '>') {
      // A word of digits right before the operator is the file descriptor it redirects, not an argument.
      if (/^\d+$/.test(word)) {
        word = ''
        hasWord = false
      }
      endWord()
      const op = /^(<<<|<<-|<<|<>|<&|>>|>&|>\||<|>)/.exec(src.slice(i))?.[0] ?? c
      redirect = op
      i += op.length
      continue
    }
    if (c === '&' && src[i + 1] === '>') {
      endWord()
      redirect = src[i + 2] === '>' ? '&>>' : '&>'
      i += redirect.length
      continue
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i))
    if (op) {
      if (op === ')' && depth === 0 && isSub) {
        endCommand()
        return i
      }
      if (op === '(') depth++
      if (op === ')') depth--
      endCommand()
      if (op === '\n') skipHeredocs()
      i += op.length
      continue
    }
    word += c
    hasWord = true
    i++
  }
  endCommand()
  return i
}
