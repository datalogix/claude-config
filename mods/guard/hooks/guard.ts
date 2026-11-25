import { parseShell } from './shell'

/** Commands that print, search or send a file they are given. Copying one (cp, mv, ln) is allowed. */
const READERS = new Set([
  'cat', 'tac', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'sed', 'awk', 'gawk', 'bat',
  'batcat', 'strings', 'xxd', 'od', 'hexdump', 'base64', 'nl', 'cut', 'sort', 'uniq', 'diff', 'jq', 'source', '.',
  'curl', 'wget', 'scp',
]) // prettier-ignore

/** Words that run the command after them, each with its options that take a value. */
const WRAPPERS: Record<string, string[]> = {
  sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U'],
  doas: ['-u', '-C'],
  env: ['-u', '-C', '-S'],
  command: [],
  builtin: [],
  exec: ['-a'],
  nohup: [],
  time: [],
  nice: ['-n'],
  xargs: ['-I', '-n', '-P', '-L', '-d', '-E', '-s'],
  '!': [],
  '{': [],
  if: [],
  then: [],
  else: [],
  elif: [],
  do: [],
  while: [],
  until: [],
}
/** Readers whose first argument is a pattern or a script, not a file: `grep .env config/` searches for text. */
const PATTERN_FIRST = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'sed', 'awk', 'gawk'])
const GREPS = new Set(['grep', 'egrep', 'fgrep'])
/** grep's quiet flags, alone or in a cluster such as `-qE` (not after `e` or `f`, whose value follows them). */
const QUIET = /^(--quiet|--silent|-[a-dg-zA-Z]*q[a-zA-Z]*)$/
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

const DESTRUCTIVE_ARTISAN = ['migrate:fresh', 'migrate:refresh', 'migrate:reset', 'migrate:rollback', 'db:wipe']
const ARTISAN_RUNNERS = /^(php[\d.]*|sail|herd)$/
/** git's options before the subcommand that take the next word as their value. */
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'])
const PUSH_FLAGS = new Set(['--force', '--force-with-lease', '--force-if-includes', '--delete', '--mirror', '--prune'])
/** git push's options that take the next word as their value. */
const PUSH_VALUED = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])

const HOME = String.raw`(?:~|\$HOME|\$\{HOME\}|/Users/[^/]+|/home/[^/]+|/root)`
const SECRET_PATHS = [
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.config\/gh\/hosts\.yml$/,
  new RegExp(`^${HOME}/\\.npmrc$`),
  /(^|\/)storage\/(.+\/)?[^/]*\.key$/,
]

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** Whether a path names a secret file (a `.env*` glob included), but not an example of one. */
export const isSecretPath = (path: string): boolean => {
  const name = basename(path)
  if (name === '.env' || /^\.env[*?[]/.test(name)) return true
  if (name.startsWith('.env.')) return !/\.(example|dist|sample)$/.test(name)
  if (name === 'auth.json' || name.endsWith('.pem') || /^id_(rsa|ed25519)/.test(name)) return true
  return SECRET_PATHS.some((pattern) => pattern.test(path))
}

/** The paths a word may name: itself, an option's value after `=`, and a curl `@file`. */
const pathsOf = (word: string): string[] => {
  const value = word.includes('=') ? word.slice(word.indexOf('=') + 1) : word
  return [word, value, value.replace(/^@/, '')]
}

/** Drops leading assignments and wrappers such as sudo, so the words start at the command that runs. */
const unwrap = (words: string[]): string[] => {
  let i = 0
  for (let word = words[0]; word !== undefined; word = words[i]) {
    if (ASSIGNMENT.test(word)) {
      i++
      continue
    }
    const valued = WRAPPERS[basename(word)]
    if (!valued) break
    i++
    for (let option = words[i]; option !== undefined; option = words[i]) {
      if (!option.startsWith('-') && !(word === 'env' && ASSIGNMENT.test(option))) break
      i += valued.includes(option) ? 2 : 1
    }
  }
  return words.slice(i)
}

const why = (what: string) =>
  `guard: bloqueado (${what}). Se for mesmo necessário, o usuário pode rodar o comando ele mesmo com \`!\` no prompt.`

const checkRead = (name: string, args: string[], inputs: string[]): string | undefined => {
  const pattern = PATTERN_FIRST.has(name) ? args.findIndex((w) => !w.startsWith('-')) : -1
  // A quiet grep prints nothing, only its exit code: `grep -q '^APP_KEY=$' .env` checks a value without showing it.
  const isQuiet = GREPS.has(name) && args.some((w) => QUIET.test(w))
  const files = READERS.has(name) && !isQuiet ? args.filter((_, i) => i !== pattern) : []
  const secret = inputs.find(isSecretPath) ?? files.flatMap(pathsOf).find(isSecretPath)
  return secret === undefined ? undefined : why(`lê o arquivo secreto ${secret}`)
}

const checkArtisan = (words: string[]): string | undefined => {
  const at = words.findIndex(
    (w, i) => basename(w) === 'artisan' && (i === 0 || ARTISAN_RUNNERS.test(basename(words[i - 1] ?? ''))),
  )
  if (at === -1) return undefined
  const sub = words.slice(at + 1).find((w) => !w.startsWith('-'))
  if (!sub?.includes(':')) return undefined
  // Artisan accepts any unambiguous abbreviation, such as `migrate:f` or `m:fresh`.
  const [space = '', name = ''] = sub.split(':')
  const match = DESTRUCTIVE_ARTISAN.find((command) => {
    const [s = '', n = ''] = command.split(':')
    return name !== '' && s.startsWith(space) && n.startsWith(name)
  })
  return match && why(`artisan ${match} apaga dados do banco`)
}

const checkGitPush = (words: string[]): string | undefined => {
  if (basename(words[0] ?? '') !== 'git') return undefined
  let i = 1
  for (let word = words[1]; word?.startsWith('-'); word = words[i]) i += GIT_VALUED.has(word) ? 2 : 1
  if (words[i] !== 'push') return undefined
  for (let j = i + 1, word = words[j]; word !== undefined; word = words[++j]) {
    if (PUSH_VALUED.has(word)) j++
    else if (PUSH_FLAGS.has(word.split('=')[0] ?? '') || /^-[a-zA-Z]*[fd]/.test(word))
      return why(`git push com ${word} reescreve ou apaga branches remotas`)
    else if (!word.startsWith('-') && /^[+:]/.test(word))
      return why(`git push de ${word} reescreve ou apaga uma branch remota`)
  }
  return undefined
}

/** Why a Bash command is blocked, or undefined when it may run. */
export const checkCommand = (source: string): string | undefined => {
  for (const { words: all, inputs } of parseShell(source)) {
    const words = unwrap(all)
    const name = basename(words[0] ?? '')
    const reason = checkRead(name, words.slice(1), inputs) ?? checkArtisan(words) ?? checkGitPush(words)
    if (reason) return reason
    // A shell anywhere in the words, so `docker compose exec app bash -c '...'` is read too.
    const shell = words.findIndex((w) => SHELLS.has(basename(w)))
    const flag = shell === -1 ? -1 : words.findIndex((w, i) => i > shell && /^-[a-z]*c[a-z]*$/.test(w))
    const script = flag === -1 ? undefined : words[flag + 1]
    const inner = script === undefined ? undefined : checkCommand(script)
    if (inner) return inner
    if (name === 'eval') {
      const inner = checkCommand(words.slice(1).join(' '))
      if (inner) return inner
    }
  }
  return undefined
}
