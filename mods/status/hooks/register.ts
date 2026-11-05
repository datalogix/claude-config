/* global h */
import { atom, read, update } from 'claude-code'
import type {
  AgentInfo,
  EngineInterface,
  Register,
  RenderElement,
  SessionRateLimit,
  TurnCompleteReason,
} from 'claude-code'

import type { StatusLine } from '../types'

const statusLines = atom({ plugin: 'status', key: 'lines' } as const, [])

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 200
/**
 * Keeps "renova em" current when nothing else redraws the status, and sets how late the reset of a window at the limit
 * is noticed.
 */
const REFRESH_MS = 60_000
const FRAMES_PER_AGENT_LIST = 5
const GIT_TIMEOUT_MS = 5_000
const PR_TIMEOUT_MS = 10_000
/** `gh` goes over the network, so an answer ending reads the pull request at most this often. */
const PR_MIN_INTERVAL_MS = 5 * 60_000

const ACTIVE_STATUSES = new Set<AgentInfo['status']>(['pending', 'running', 'waiting'])

const WINDOW_NAMES: Partial<Record<string, string>> = {
  five_hour: '5h',
  seven_day: 'semana',
  spend_limit: 'gasto',
}

const windowName = (kind: string): string => WINDOW_NAMES[kind] ?? kind

export const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}min ${String(seconds % 60).padStart(2, '0')}s`
}

const formatElapsed = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export const formatTimeLeft = (ms: number): string => {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** By code points, so a surrogate pair is not cut in half. */
const truncate = (text: string, max: number): string => {
  const chars = [...text]
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : text
}

const NAME_MAX = 30

/** Short, so the status line does not wrap; notices use the full name. */
const shortName = (name: string): string => truncate(name, NAME_MAX)

const agentName = (a: AgentInfo): string => a.description || a.name || a.type

const shortAgentName = (a: AgentInfo): string => shortName(agentName(a))

const EXCERPT_MAX = 80

// A fence of backticks cannot have a backtick in its info string (CommonMark). mods/topics/hooks/parse.ts keeps a
// copy of this regex and of createCodeBlockTracker's closing rule (same character, at least as long, nothing after),
// since each mod installs on its own: change both. tests/mods.test.js compares only the regex, not the closing rule.
const FENCE = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(`{3,}(?!.*`)|~{3,})/
const QUOTE = /^\s*(?:>\s?)+/
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/

/** Called with each line in order: true for a fence or a line inside a code block. */
const createCodeBlockTracker = () => {
  let openFence = ''
  // Where the list item that opened the block has its text, and whether a quote opened it: the block ends with them.
  let itemColumn = 0
  // Whether the text before a block is a list, and whether a block is indented in one: a line at column 0 ends the
  // item and the block with it, unless it is a fence closing the block. Outside a list, it is still code (CommonMark).
  let isInList = false
  let isIndentedInList = false
  let isInQuote = false
  return (rawLine: string): boolean => {
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
      return true
    }
    if (isClosing) {
      openFence = ''
      return true
    }
    return openFence !== ''
  }
}

const THEMATIC_BREAK = /^\s*([-*_]\s*){3,}$/
const TABLE_ROW = /^\s*\|/
const HTML_COMMENT = /^\s*(<!--((?!-->).)*-->\s*)+$/

/** Underscores inside words (snake_case) and a lone * (2 * 3) are kept. */
export const extractExcerpt = (answer: string | undefined): string | undefined => {
  const isCode = createCodeBlockTracker()
  const line = answer
    ?.split('\n')
    .filter((line) => !isCode(line) && !THEMATIC_BREAK.test(line) && !TABLE_ROW.test(line) && !HTML_COMMENT.test(line))
    .map((line) =>
      line
        .replace(/^\s*(>\s*)*((#+|[-*+]|\d+[.)])\s+)?/, '')
        .replace(/^\[[ xX]\]\s+/, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*?|`)(\S.*?)\1/g, '$2')
        .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '')
        .trim(),
    )
    .find(Boolean)
  return line ? truncate(line, EXCERPT_MAX) : undefined
}

/** `{}` is replaced by who it was. */
const AGENT_FAILURE_TEXTS: Partial<Record<TurnCompleteReason, string>> = {
  error: '❌ {} parou com erro',
  aborted: '⏹️ {} foi interrompido',
  refusal: '⚠️ {} recusou a tarefa',
}

const formatRemainingAgents = (count: number): string => (count === 1 ? '1 agente segue' : `${count} agentes seguem`)

const formatRemainingWorkflows = (count: number): string =>
  count === 1 ? '1 workflow segue' : `${count} workflows seguem`

export const formatWorkflows = (names: string[]): string | undefined => {
  if (names.length === 0) return undefined
  if (names.length === 1) return `🔀 workflow: ${shortName(names[0]!)}`
  return `🔀 ${names.length} workflows`
}

/** One name only, so the status line does not wrap. */
export const formatAgents = (agents: AgentInfo[], endedCount = 0, failedCount = 0): string | undefined => {
  if (agents.length === 0) return undefined
  const total = endedCount + agents.length
  const name = shortAgentName(agents[0]!)
  if (total === 1) return `🤖 agente: ${name}`
  const failed = failedCount > 0 ? ` ⚠️${failedCount}` : ''
  const rest = agents.length > 1 ? ` +${agents.length - 1}` : ''
  return `🤖 ${endedCount}/${total}${failed}: ${name}${rest}`
}

/** Past its reset time, the usage claude reports is from before the reset until the next API response. */
const isStale = (window: SessionRateLimit, now: number): boolean =>
  window.resetsAt !== undefined && now >= Date.parse(window.resetsAt)

/** Rounded down, so the usage shown never reaches a level the raw value has not (99.5 is 99%, not the limit). */
const formatPercent = (window: SessionRateLimit): string => `${Math.floor(window.percentUsed)}%`

export const formatPlan = (windows: SessionRateLimit[], now: number, planAlert: number): string | undefined => {
  const current = windows.filter((window) => !isStale(window, now))
  if (current.length === 0) return undefined
  const parts = current.map((window) => {
    const name = windowName(window.kind)
    const pct = formatPercent(window)
    const resetsIn = window.resetsAt ? Date.parse(window.resetsAt) - now : NaN
    if (!(resetsIn > 0)) return `${name} ${pct}`
    return `${name} ${pct} (renova em ${formatTimeLeft(resetsIn)})`
  })
  const alert = current.some((window) => window.percentUsed >= planAlert) ? '⚠️ ' : ''
  return `${alert}plano: ${parts.join(' · ')}`
}

type GitState = {
  head: string // the branch, or the short commit when detached
  branch?: string
  upstream?: string // tracked and still on the remote
  counts: string
}

type PullRequest = { number: number; url?: string }

/** @param porcelain the output of `git status --porcelain=v2 --branch` */
export const parseGit = (porcelain: string): GitState | undefined => {
  let head: string | undefined
  let oid = ''
  let upstream: string | undefined
  let hasUpstreamCounts = false
  let ahead = 0
  let behind = 0
  let changed = 0
  for (const line of porcelain.split('\n')) {
    const ab = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line)
    if (ab) {
      ahead = Number(ab[1])
      behind = Number(ab[2])
      hasUpstreamCounts = true
    } else if (line.startsWith('# branch.upstream ')) upstream = line.slice('# branch.upstream '.length)
    else if (line.startsWith('# branch.head ')) head = line.slice('# branch.head '.length)
    else if (line.startsWith('# branch.oid ')) oid = line.slice('# branch.oid '.length)
    else if (line && !line.startsWith('#')) changed++
  }
  if (head === undefined) return undefined
  const counts = [changed > 0 && `●${changed}`, ahead > 0 && `↑${ahead}`, behind > 0 && `↓${behind}`]
    .filter(Boolean)
    .join(' ')
  if (head === '(detached)') return { head: oid.slice(0, 7), counts }
  // With no counts, the upstream is gone from the remote.
  return { head, branch: head, counts, ...(upstream && hasUpstreamCounts ? { upstream } : {}) }
}

/**
 * The web address of a remote, or undefined for a local path or an ssh alias (a host with no dot), whose host is not
 * a site. An http(s) remote is already a site, so it keeps its scheme and port; the port of ssh is not the site's. Any
 * user or token in the URL is left out, since this ends up on the screen.
 */
export const remoteWebUrl = (remote: string): string | undefined => {
  // Host and port only, and no @ in the path: a password with a raw / or @ must not end up in the link.
  const site = /^(https?):\/\/(?:[^@/]+@)?([^/:@]+(?::\d+)?)\/([^@]+?)(?:\.git)?\/?$/.exec(remote)
  if (site) return `${site[1]}://${site[2]}/${site[3]}`
  const match =
    /^(?:ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/.exec(remote) ??
    /^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.+?)(?:\.git)?\/?$/.exec(remote)
  return match?.[1]?.includes('.') ? `https://${match[1]}/${match[2]}` : undefined
}

/** @param upstream as in `git status`: `origin/feat/x` */
export const branchWebUrl = (webUrl: string, upstream: string): string =>
  `${webUrl}/tree/${upstream.split('/').slice(1).map(encodeURIComponent).join('/')}`

type GitSegment = NonNullable<StatusLine['segments']>[number]

/** @param branchUrl undefined when the branch is not on a remote, so there is nothing to open */
export const gitSegments = (git: GitState, pr?: PullRequest, branchUrl?: string): GitSegment[] => {
  const head = shortName(git.head)
  const segments: GitSegment[] = [branchUrl ? { text: head, href: branchUrl } : head]
  if (pr) segments.push(pr.url ? { text: `PR #${pr.number}`, href: pr.url } : `PR #${pr.number}`)
  if (git.counts) segments.push(git.counts)
  return segments.flatMap((segment, i) => (i > 0 ? [' · ', segment] : [segment]))
}

/** The engine's own line shows the pull request of the branch once it knows of it: once on the screen is enough. */
export const withoutPrInHint = (segments: GitSegment[], hint: string): GitSegment[] => {
  const textOf = (segment: GitSegment) => (typeof segment === 'string' ? segment : segment.text)
  const index = segments.findIndex((segment) => /^PR #\d+$/.test(textOf(segment)))
  if (index < 1 || !new RegExp(`${textOf(segments[index]!)}(?!\\d)`).test(hint)) return segments
  return segments.filter((_, i) => i !== index && i !== index - 1)
}

export const formatGit = (git: GitState, pr?: PullRequest): string =>
  `git: ${gitSegments(git, pr)
    .map((segment) => (typeof segment === 'string' ? segment : segment.text))
    .join('')}`

/** @param json the output of `gh pr view --json number,state,url`; a closed or merged pull request is not shown */
export const parsePr = (json: string): PullRequest | undefined => {
  const pr = JSON.parse(json) as { number?: unknown; state?: unknown; url?: unknown }
  if (pr.state !== 'OPEN' || typeof pr.number !== 'number') return undefined
  return typeof pr.url === 'string' ? { number: pr.number, url: pr.url } : { number: pr.number }
}

/** `agents`: system notifications only for notices about background agents; `never`: toast only. */
type NotifyMode = 'always' | 'agents' | 'never'

type State = {
  planAlert: number
  alertLevels: number[]
  notifyMode: NotifyMode
  shouldIncludeExcerpt: boolean
  project?: string
  spinner?: { cancel: () => void }
  refresher?: { cancel: () => void }
  frame: number
  mainTurnStartedAt?: number
  agents: AgentInfo[]
  endedAgentIds: Set<string> // a run of theirs ended, even if the list still shows them as active
  workflows: Map<string, string> // running in the background, task id → name; $.agent.list() does not show them
  failedBackgroundAgentIds: Set<string> // since the main turn started
  seenAgentIds: Set<string> // since the main turn started, with those it found running: the total of the progress
  failedAgentIds: Set<string> // of seenAgentIds, foreground too, which failedBackgroundAgentIds leaves out
  windows: SessionRateLimit[]
  git?: GitState
  remote?: { upstream: string; webUrl?: string } // read when the upstream changes
  pr?: PullRequest
  prBranch?: string // the branch `pr` is of
  prReadAt: number
  gitReadCount: number // so a slow read that ends after a newer one does not overwrite it
  outcome?: { text: string; isSuccess: boolean } // how the last answer, or the background agents after it, ended
  isWaitingForAgents: boolean // answered with agents still running
  alertedLevelKeys: Set<string>
  windowsAtLimit: Map<string, string | undefined> // kind at 100% → resetsAt
}

const hasBackgroundWork = (s: State): boolean => s.agents.length > 0 || s.workflows.size > 0

type StatusParts = { status: string; isFailure: boolean; isBusy: boolean; plan?: string; git?: string }

const branchUrlOf = (s: State): string | undefined =>
  s.remote?.webUrl && s.git?.upstream === s.remote.upstream
    ? branchWebUrl(s.remote.webUrl, s.remote.upstream)
    : undefined

const formatStatusParts = (s: State, now: number): StatusParts => {
  const spinnerFrame = FRAMES[s.frame]
  let main: string | undefined
  if (s.mainTurnStartedAt !== undefined)
    main = `${spinnerFrame} trabalhando… ${formatElapsed(now - s.mainTurnStartedAt)}`
  // A ✅ next to work still running would read as if everything had ended; a failure or interruption stays.
  else if (hasBackgroundWork(s))
    main = [s.outcome?.isSuccess ? undefined : s.outcome?.text, `${spinnerFrame} em segundo plano`]
      .filter(Boolean)
      .join(' · ')
  else main = s.outcome?.text

  return {
    isFailure: s.outcome !== undefined && !s.outcome.isSuccess,
    isBusy: s.mainTurnStartedAt !== undefined || hasBackgroundWork(s),
    status: [
      main,
      formatAgents(s.agents, Math.max(0, s.seenAgentIds.size - s.agents.length), s.failedAgentIds.size),
      formatWorkflows([...s.workflows.values()]),
    ]
      .filter(Boolean)
      .join('  │  '),
    plan: formatPlan(s.windows, now, s.planAlert),
    git: s.git && formatGit(s.git, s.pr),
  }
}

const compact = (parts: (string | undefined)[]): string[] => parts.filter((part) => part) as string[]

/** Under the prompt, one line for each part; where that is not drawn, one status line, which takes no breaks. */
async function showStatus($: EngineInterface, s: State) {
  const { status, isFailure, isBusy, plan, git } = formatStatusParts(s, await $.clock.now())
  const hasLines = (await $.session.surfaces()).some((surface) => surface === 'terminal' || surface === 'desktop')
  $.ui.status(hasLines ? undefined : compact([status, plan, git]).join('  │  ') || undefined)
  const lines: StatusLine[] = []
  lines.push(
    status
      ? { text: `status: ${status}`, color: isFailure ? 'error' : isBusy ? 'claude' : 'success' }
      : { text: 'status: 💤 aguardando', color: 'subtle' },
  )
  if (plan) lines.push({ text: plan, color: plan.startsWith('⚠️') ? 'warning' : 'suggestion' })
  if (git && s.git) lines.push({ text: git, color: 'merged', segments: gitSegments(s.git, s.pr, branchUrlOf(s)) })
  await update($, statusLines, () => lines)
}

/** A failure keeps what was read: it says nothing about the pull request, and a branch without one fails too. */
async function readPr($: EngineInterface, s: State, branch: string) {
  let pr: PullRequest | undefined
  try {
    const { exitCode, stdout } = await $.process.run(['gh', 'pr', 'view', '--json', 'number,state,url'], {
      timeoutMs: PR_TIMEOUT_MS,
    })
    if (exitCode !== 0) return
    pr = parsePr(stdout)
  } catch {
    return
  }
  if (s.prBranch !== branch || (pr?.number === s.pr?.number && pr?.url === s.pr?.url)) return
  s.pr = pr
  await showStatus($, s)
}

/** A failure leaves the branch with no link; it is read again only when the upstream changes. */
async function readRemote($: EngineInterface, upstream: string): Promise<string | undefined> {
  try {
    const name = upstream.split('/')[0]!
    const { exitCode, stdout } = await $.process.run(['git', 'remote', 'get-url', name], { timeoutMs: GIT_TIMEOUT_MS })
    return exitCode === 0 ? remoteWebUrl(stdout.trim()) : undefined
  } catch {
    return undefined
  }
}

/** Outside a repository, or with no git to run, the status line goes without it. */
async function refreshGit($: EngineInterface, s: State, isAnswerEnd = false) {
  const readCount = ++s.gitReadCount
  let git: GitState | undefined
  try {
    // No optional locks: a read in the background must not get in the way of the user's own git commands.
    const { exitCode, stdout } = await $.process.run(
      ['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'],
      { timeoutMs: GIT_TIMEOUT_MS },
    )
    if (exitCode === 0) git = parseGit(stdout)
  } catch {
    // Same as above.
  }
  if (readCount !== s.gitReadCount) return
  if (git?.upstream && git.upstream !== s.remote?.upstream) {
    const webUrl = await readRemote($, git.upstream)
    if (readCount !== s.gitReadCount) return
    s.remote = { upstream: git.upstream, ...(webUrl ? { webUrl } : {}) }
  }
  const hasChanged = git?.head !== s.git?.head || git?.counts !== s.git?.counts || git?.upstream !== s.git?.upstream
  const branch = git?.branch
  const isNewBranch = branch !== s.prBranch
  s.git = git
  if (isNewBranch) {
    s.prBranch = branch
    s.pr = undefined
  }
  if (hasChanged) await showStatus($, s)
  if (branch === undefined) return
  const now = await $.clock.now()
  if (isNewBranch || (isAnswerEnd && now - s.prReadAt >= PR_MIN_INTERVAL_MS)) {
    s.prReadAt = now
    // On a timer, so the network never holds the hook that got here.
    $.clock.after(0, () => readPr($, s, branch))
  }
}

type NoticeOptions = {
  timeoutMs: number
  isAboutBackgroundAgents?: boolean
  notificationDetail?: string
}

export const projectName = (cwd: string): string => cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd

/** `notificationDetail` goes only to the notification (the toast sits beside the answer), with excerpt on. */
async function sendNotice($: EngineInterface, s: State, text: string, options: NoticeOptions) {
  $.ui.toast(text, { timeoutMs: options.timeoutMs })
  if (s.notifyMode === 'never' || (s.notifyMode === 'agents' && !options.isAboutBackgroundAgents)) return
  try {
    s.project ??= projectName(await $.session.cwd())
    const detail = s.shouldIncludeExcerpt ? options.notificationDetail : undefined
    await $.ui.notify(detail ? `${text}: ${detail}` : text, { title: s.project })
  } catch {
    // No notification channel: the toast is enough.
  }
}

/**
 * A workflow still running does not hold this back: its own end comes back as a new answer from Claude, so nothing
 * would send this notice later.
 *
 * @param hasSentEndNotice the agent that just ended already sent a notice of its own failure
 */
async function checkAgentsEnded($: EngineInterface, s: State, agentCountBefore: number, hasSentEndNotice: boolean) {
  if (s.isWaitingForAgents && agentCountBefore > 0 && s.agents.length === 0 && s.mainTurnStartedAt === undefined) {
    s.isWaitingForAgents = false
    const workflowsSuffix = s.workflows.size > 0 ? ` — ${formatRemainingWorkflows(s.workflows.size)}` : ''
    const failedCount = s.failedBackgroundAgentIds.size
    if (failedCount > 0) {
      const problems = `${failedCount} com problema`
      const agentsText = `⚠️ agentes terminaram, ${problems}`
      // A failed or interrupted answer stays: the agents failing too says nothing about it.
      const text = s.outcome && !s.outcome.isSuccess ? `${s.outcome.text} · ${agentsText}` : agentsText
      s.outcome = { text, isSuccess: false }
      // A summary of that one failure alone would repeat the notice just sent.
      if (!(hasSentEndNotice && failedCount === 1))
        await sendNotice($, s, `⚠️ Os agentes em segundo plano terminaram, ${problems}${workflowsSuffix}`, {
          timeoutMs: 10000,
          isAboutBackgroundAgents: true,
        })
    } else {
      // A failed or interrupted answer stays: the agents ending well says nothing about it.
      if (!s.outcome || s.outcome.isSuccess) s.outcome = { text: '✅ tudo pronto', isSuccess: true }
      await sendNotice($, s, `✅ Os agentes em segundo plano terminaram${workflowsSuffix}`, {
        timeoutMs: 8000,
        isAboutBackgroundAgents: true,
      })
    }
  }
}

async function refreshAgents($: EngineInterface, s: State, hasSentEndNotice = false) {
  const agentCountBefore = s.agents.length
  const listed = await $.agent.list()
  // The lag only explains an id the list still shows: one that left and comes back is active again.
  for (const id of s.endedAgentIds) {
    if (!listed.some((a) => a.id === id)) s.endedAgentIds.delete(id)
  }
  // A run ending is not the agent ending: one held on its own background work is `waiting`, which no lag explains.
  s.agents = listed.filter(
    (a) => ACTIVE_STATUSES.has(a.status) && (a.status === 'waiting' || !s.endedAgentIds.has(a.id)),
  )
  for (const a of s.agents) s.seenAgentIds.add(a.id)
  await checkAgentsEnded($, s, agentCountBefore, hasSentEndNotice)
}

/** Agents still running stay in the count; those already ended belong to the progress before. */
const startAgentProgress = (s: State) => {
  s.seenAgentIds = new Set(s.agents.map((a) => a.id))
  s.failedAgentIds = new Set()
  s.failedBackgroundAgentIds = new Set()
}

const stopSpinner = (s: State) => {
  s.spinner?.cancel()
  s.spinner = undefined
}

function startSpinner($: EngineInterface, s: State) {
  if (s.spinner) return
  s.frame = 0
  s.spinner = $.clock.every(FRAME_MS, async () => {
    s.frame = (s.frame + 1) % FRAMES.length
    if (s.frame % FRAMES_PER_AGENT_LIST === 0) await refreshAgents($, s)
    if (s.mainTurnStartedAt === undefined && !hasBackgroundWork(s)) stopSpinner(s)
    await showStatus($, s)
  })
}

export const planAlertLevels = (planAlert: number): number[] => [...new Set([75, planAlert, 100])].sort((a, b) => a - b)

/** Level keys are kind@resetsAt@level, so one prefix matches a kind and a longer one a window. */
const kindKeyPrefix = (kind: string): string => `${kind}@`
const windowKeyPrefix = (window: SessionRateLimit): string => `${kindKeyPrefix(window.kind)}${window.resetsAt ?? ''}@`
const levelKey = (window: SessionRateLimit, level: number): string => `${windowKeyPrefix(window)}${level}`

/** Once per level crossed in each window; several levels crossed at once give one alert. */
async function alertPlanUsage($: EngineInterface, s: State, now: number) {
  for (const window of s.windows) {
    // Usage from before the reset: checkPlanReset may have cleared its keys, so it would alert every level again.
    if (isStale(window, now)) continue
    // Drop keys of an earlier window of this kind: they can no longer match.
    for (const key of s.alertedLevelKeys) {
      if (key.startsWith(kindKeyPrefix(window.kind)) && !key.startsWith(windowKeyPrefix(window)))
        s.alertedLevelKeys.delete(key)
    }
    const crossed = s.alertLevels.filter(
      (level) => window.percentUsed >= level && !s.alertedLevelKeys.has(levelKey(window, level)),
    )
    if (crossed.length === 0) continue
    for (const level of crossed) s.alertedLevelKeys.add(levelKey(window, level))
    const name = windowName(window.kind)
    if (window.percentUsed >= 100) {
      s.windowsAtLimit.set(window.kind, window.resetsAt)
      await sendNotice($, s, `🛑 Você atingiu o limite do plano (${name})`, { timeoutMs: 10000 })
    } else {
      $.ui.toast(`⚠️ Você já usou ${formatPercent(window)} do plano (${name})`, { timeoutMs: 10000 })
    }
  }
}

async function checkPlanReset($: EngineInterface, s: State, now: number) {
  for (const [kind, resetsAt] of s.windowsAtLimit) {
    const window = s.windows.find((w) => w.kind === kind)
    const hasResetTimePassed = resetsAt !== undefined && now >= Date.parse(resetsAt)
    if (!hasResetTimePassed && !(window && window.percentUsed < 100)) continue
    s.windowsAtLimit.delete(kind)
    for (const key of s.alertedLevelKeys) if (key.startsWith(kindKeyPrefix(kind))) s.alertedLevelKeys.delete(key)
    await sendNotice($, s, `✅ Plano liberado de novo (${windowName(kind)})`, { timeoutMs: 10000 })
  }
}

/**
 * A number option arrives validated, with its default filled in, but an empty text passes for a number (Number('') is
 * 0).
 */
const readNumberOption = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

export const register: Register = (on, options) => {
  const minDurationMs = readNumberOption(options.minSeconds, 30) * 1000
  // The manifest has no range, so any number gets this far.
  const planAlert = Math.min(100, Math.max(1, readNumberOption(options.planAlert, 90)))

  // Starts over on each module reload; a turn in progress only loses the spinner.
  const s: State = {
    planAlert,
    alertLevels: planAlertLevels(planAlert),
    // Claude Code only warns about a value outside the options; sendNotice then treats it as `always`.
    notifyMode: options.notify as NotifyMode,
    // Off unless turned on: the notification may show on the lock screen. Not carried over from showExcerpt and
    // trecho: both defaulted to on and every install stored them, so a stored "true" may be a default nobody chose.
    shouldIncludeExcerpt: options.excerpt === true,
    frame: 0,
    agents: [],
    endedAgentIds: new Set(),
    workflows: new Map(),
    failedBackgroundAgentIds: new Set(),
    seenAgentIds: new Set(),
    failedAgentIds: new Set(),
    windows: [],
    prReadAt: 0,
    gitReadCount: 0,
    isWaitingForAgents: false,
    alertedLevelKeys: new Set(),
    windowsAtLimit: new Map(),
  }

  // The engine keeps its own line (the mode, the shortcuts) on the first row, wherever `hint` goes in this tree.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const lines = await read($, statusLines)
    if (lines.length === 0) return next(e)
    const { Box, Link, Text } = $.ui.resolve(e)
    const hint = await next(e)
    return h(
      Box,
      { flexDirection: 'column' },
      lines.map(({ text, color, segments }, i) => {
        // Only the first colon: a branch or an agent's name may have one too.
        const labelEnd = text.indexOf(':') + 1
        return h(
          Text,
          { key: `line-${i}`, color, wrap: 'truncate-end' },
          h(Text, { weight: 'semibold' }, text.slice(0, labelEnd)),
          ...(segments
            ? [
                ' ',
                ...withoutPrInHint(segments, e.props.hint).map((segment) =>
                  typeof segment === 'string' ? segment : h(Link, { href: segment.href }, segment.text),
                ),
              ]
            : [text.slice(labelEnd)]),
        )
      }),
      hint,
    ) as RenderElement
  })

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    s.windows = (await $.session.usage()).rateLimits
    await showStatus($, s)
    // Should the session start again in the same module: one interval only.
    s.refresher?.cancel()
    s.refresher = $.clock.every(REFRESH_MS, async () => {
      const now = await $.clock.now()
      if ([...s.windowsAtLimit.values()].some((resetsAt) => resetsAt !== undefined && now >= Date.parse(resetsAt))) {
        // A window at the limit passed its reset time: s.windows still holds the old usage.
        s.windows = (await $.session.usage()).rateLimits
        await checkPlanReset($, s, now)
        await showStatus($, s)
      } else if (!s.spinner && s.windows.some((window) => window.resetsAt)) {
        await showStatus($, s)
      }
      await refreshGit($, s)
    })
    await refreshGit($, s)
    return r
  })

  // /clear and resume start another conversation, with no session.start: what was tracked was of the one before.
  // s.agents is left to refreshAgents, and a workflow that goes on comes back with the next Stop.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      s.outcome = undefined
      s.workflows = new Map()
      s.isWaitingForAgents = false
      startAgentProgress(s)
      if (s.mainTurnStartedAt === undefined && !hasBackgroundWork(s)) stopSpinner(s)
      await showStatus($, s)
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    s.windows = e.rateLimits
    const now = await $.clock.now()
    await checkPlanReset($, s, now)
    await alertPlanUsage($, s, now)
    await showStatus($, s)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await refreshAgents($, s)
    startSpinner($, s)
    await showStatus($, s)
    return r
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const r = await next(e)
    if (r.result && !r.isError) {
      s.workflows.set(r.result.taskId, r.result.workflowName || 'workflow')
      await showStatus($, s)
    }
    return r
  })

  // What is in flight as the engine counts it, so a workflow whose task notification was missed leaves the status.
  on('classic.Stop', async ($, e, next) => {
    if (e.background_tasks) {
      const workflows = e.background_tasks.filter((task) => task.type === 'workflow')
      s.workflows = new Map(workflows.map((task) => [task.id, task.name || task.description || 'workflow']))
      // It may come after the main turn.complete, which then read the workflows before this.
      if (s.mainTurnStartedAt === undefined) {
        if (hasBackgroundWork(s)) startSpinner($, s)
        await showStatus($, s)
      }
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      s.endedAgentIds.delete(e.agentId)
      s.failedAgentIds.delete(e.agentId)
      await refreshAgents($, s)
      startSpinner($, s)
      return next(e)
    }

    s.mainTurnStartedAt = await $.clock.now()
    s.outcome = undefined
    s.isWaitingForAgents = false
    startAgentProgress(s)
    startSpinner($, s)
    await showStatus($, s)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification') {
      for (const id of s.workflows.keys()) if (e.text.includes(id)) s.workflows.delete(id)
    }
    // The previous outcome stays until the next prompt, a task notification included.
    if (s.mainTurnStartedAt === undefined) {
      s.outcome = undefined
      await showStatus($, s)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agent = s.agents.find((a) => a.id === e.agentId)
      const who = agent ? `O agente “${agentName(agent)}”` : 'Um agente'
      const failureText = AGENT_FAILURE_TEXTS[e.reason]
      const isBackground = s.isWaitingForAgents
      if (failureText) {
        s.seenAgentIds.add(e.agentId)
        s.failedAgentIds.add(e.agentId)
        if (isBackground) s.failedBackgroundAgentIds.add(e.agentId)
      } else {
        // Only here: a run that started again and never reported an end is still a problem.
        s.failedBackgroundAgentIds.delete(e.agentId)
      }
      // An agent error always sends a notice; an interruption or refusal, only in the background.
      const shouldSendEndNotice = failureText !== undefined && (e.reason === 'error' || isBackground)
      if (shouldSendEndNotice) {
        await sendNotice($, s, failureText.replace('{}', who), {
          timeoutMs: 10000,
          isAboutBackgroundAgents: isBackground,
        })
      }
      // The list may lag behind the end: this one no longer counts as active.
      s.endedAgentIds.add(e.agentId)
      await refreshAgents($, s, shouldSendEndNotice)
      const remainingAgents = s.agents.length
      // Held on its own background work, it has not ended and would count itself as remaining.
      const isStillActive = s.agents.some((a) => a.id === e.agentId)
      // The last agent's end gets the final notice of checkAgentsEnded instead.
      if (isBackground && !failureText && !isStillActive && remainingAgents > 0 && e.durationMs >= minDurationMs) {
        await sendNotice($, s, `✅ ${who} terminou — ${formatRemainingAgents(remainingAgents)}`, {
          timeoutMs: 8000,
          isAboutBackgroundAgents: true,
        })
      }
      await showStatus($, s)
      return next(e)
    }

    s.mainTurnStartedAt = undefined
    const duration = formatDuration(e.durationMs)
    await refreshAgents($, s)
    const remainingAgents = s.agents.length
    // Before the notices, which wait on the user's hooks: an agent may end meanwhile. Even after Esc, agents that stay
    // active still send a notice when they end.
    s.isWaitingForAgents = remainingAgents > 0
    const remainingWork = [
      remainingAgents > 0 && formatRemainingAgents(remainingAgents),
      s.workflows.size > 0 && formatRemainingWorkflows(s.workflows.size),
    ]
      .filter(Boolean)
      .join(' e ')
    const remainingSuffix = remainingWork ? ` — ${remainingWork} em segundo plano` : ''

    if (e.reason === 'error') {
      s.outcome = { text: `❌ deu erro após ${duration}`, isSuccess: false }
      await sendNotice($, s, `❌ Claude parou com erro após ${duration}${remainingSuffix}`, { timeoutMs: 10000 })
    } else if (e.reason === 'refusal') {
      s.outcome = { text: `⚠️ recusou após ${duration}`, isSuccess: false }
      await sendNotice($, s, `⚠️ Claude recusou a resposta após ${duration}${remainingSuffix}`, { timeoutMs: 10000 })
    } else if (e.reason === 'aborted') {
      s.outcome = { text: `⏹️ interrompido após ${duration}`, isSuccess: false }
    } else {
      s.outcome = { text: `✅ pronto em ${duration}`, isSuccess: true }
      if (e.durationMs >= minDurationMs) {
        await sendNotice($, s, `✅ Claude terminou em ${duration}${remainingSuffix}`, {
          timeoutMs: 8000,
          notificationDetail: extractExcerpt(e.answer),
        })
      }
    }

    if (!hasBackgroundWork(s)) stopSpinner(s)
    await showStatus($, s)
    const r = await next(e)
    await refreshGit($, s, true)
    return r
  })
}
