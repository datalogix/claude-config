import type { AgentInfo, EngineInterface, Register, SessionRateLimit, TurnCompleteReason } from 'claude-code'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 200
/** Keeps "renova em" current when nothing else redraws the status. */
const REFRESH_MS = 60_000
const FRAMES_PER_AGENT_LIST = 5

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

const formatClock = (ms: number): string => {
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

const AGENT_NAME_MAX = 30

const agentName = (a: AgentInfo): string => a.description || a.name || a.type

/** Short, so the plan is not pushed out of the status line; notices use the full name. */
const shortAgentName = (a: AgentInfo): string => {
  const name = agentName(a)
  return name.length > AGENT_NAME_MAX ? `${name.slice(0, AGENT_NAME_MAX - 1).trimEnd()}…` : name
}

const EXCERPT_MAX = 80

// A fence of backticks cannot have a backtick in its info string (CommonMark). mods/topics/hooks/parse.ts keeps a
// copy of this regex and of createCodeBlockTracker's closing rule (same character, at least as long, nothing after),
// since each mod installs on its own: change both.
const FENCE = /^\s*(`{3,}(?!.*`)|~{3,})/

/** Called with each line in order: true for a fence or a line inside a code block. */
const createCodeBlockTracker = () => {
  let openFence = ''
  return (line: string): boolean => {
    const fence = FENCE.exec(line)?.[1]
    if (fence && !openFence) {
      openFence = fence
      return true
    }
    if (
      fence &&
      fence[0] === openFence[0] &&
      fence.length >= openFence.length &&
      !line.trim().slice(fence.length).trim()
    ) {
      openFence = ''
      return true
    }
    return openFence !== ''
  }
}

const THEMATIC_BREAK = /^\s*([-*_]\s*){3,}$/
const TABLE_ROW = /^\s*\|/
const HTML_COMMENT = /^\s*<!--.*-->\s*$/

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
  if (!line) return undefined
  return line.length > EXCERPT_MAX ? `${line.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : line
}

/** `{}` is replaced by who it was. */
const AGENT_END_TEXTS: Partial<Record<TurnCompleteReason, string>> = {
  error: '❌ {} parou com erro',
  aborted: '⏹️ {} foi interrompido',
  refusal: '⚠️ {} recusou a tarefa',
}

const formatRemainingAgents = (count: number): string => (count === 1 ? '1 agente segue' : `${count} agentes seguem`)

export const formatAgents = (agents: AgentInfo[]): string | undefined => {
  if (agents.length === 0) return undefined
  if (agents.length === 1) return `🤖 agente: ${shortAgentName(agents[0]!)}`
  const names = agents.slice(0, 2).map(shortAgentName).join(', ')
  const rest = agents.length > 2 ? ` +${agents.length - 2}` : ''
  return `🤖 ${agents.length} agentes: ${names}${rest}`
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
  const icon = current.some((window) => window.percentUsed >= planAlert) ? '⚠️' : '📊'
  return `${icon} plano: ${parts.join(' · ')}`
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
  finishedAgentIds: Set<string> // already ended, even if the list still shows them
  failedAgentCount: number // since the main turn started
  windows: SessionRateLimit[]
  outcome?: string // how the last answer, or the background agents after it, ended
  isWaitingForAgents: boolean // answered with agents still running
  alertedLevelKeys: Set<string>
  windowsAtLimit: Map<string, string | undefined> // kind at 100% → resetsAt
}

const formatStatus = (s: State, now: number): string | undefined => {
  const spinnerFrame = FRAMES[s.frame]
  let main: string | undefined
  if (s.mainTurnStartedAt !== undefined)
    main = `${spinnerFrame} Claude está trabalhando… ${formatClock(now - s.mainTurnStartedAt)}`
  else if (s.agents.length > 0) main = [s.outcome, `${spinnerFrame} em segundo plano`].filter(Boolean).join(' · ')
  else main = s.outcome

  const text = [main, formatAgents(s.agents), formatPlan(s.windows, now, s.planAlert)].filter(Boolean).join('  │  ')
  return text || undefined
}

async function showStatus($: EngineInterface, s: State) {
  $.ui.status(formatStatus(s, await $.clock.now()))
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

/** @param hasNotifiedEnd the agent that just ended already sent a notice of its own failure */
async function checkAgentsDone($: EngineInterface, s: State, agentCountBefore: number, hasNotifiedEnd: boolean) {
  if (s.isWaitingForAgents && agentCountBefore > 0 && s.agents.length === 0 && s.mainTurnStartedAt === undefined) {
    s.isWaitingForAgents = false
    if (s.failedAgentCount > 0) {
      const problems = `${s.failedAgentCount} com problema`
      s.outcome = `⚠️ agentes terminaram, ${problems}`
      // A summary of that one failure alone would repeat the notice just sent.
      if (!(hasNotifiedEnd && s.failedAgentCount === 1))
        await sendNotice($, s, `⚠️ Os agentes em segundo plano terminaram, ${problems}`, {
          timeoutMs: 10000,
          isAboutBackgroundAgents: true,
        })
    } else {
      s.outcome = '✅ tudo pronto'
      await sendNotice($, s, '✅ Os agentes em segundo plano terminaram', {
        timeoutMs: 8000,
        isAboutBackgroundAgents: true,
      })
    }
  }
}

async function refreshAgents($: EngineInterface, s: State, hasNotifiedEnd = false) {
  const agentCountBefore = s.agents.length
  const listed = await $.agent.list()
  // An id the list no longer shows cannot come back as active.
  for (const id of s.finishedAgentIds) {
    if (!listed.some((a) => a.id === id)) s.finishedAgentIds.delete(id)
  }
  s.agents = listed.filter((a) => ACTIVE_STATUSES.has(a.status) && !s.finishedAgentIds.has(a.id))
  await checkAgentsDone($, s, agentCountBefore, hasNotifiedEnd)
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
    if (s.mainTurnStartedAt === undefined && s.agents.length === 0) stopSpinner(s)
    await showStatus($, s)
  })
}

export const planAlertLevels = (planAlert: number): number[] =>
  [...new Set([75, planAlert, 100])].filter((level) => level > 0 && level <= 100).sort((a, b) => a - b)

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

/** Options arrive validated with defaults filled in, but an empty text passes for a number (Number('') is 0). */
const readNumberOption = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

export const register: Register = (on, options) => {
  const minDurationMs = readNumberOption(options.minSeconds, 30) * 1000
  // The manifest has no range, so any number gets this far.
  const planAlert = Math.min(100, Math.max(1, readNumberOption(options.planAlert, 90)))

  // Starts over on each module reload; a turn in progress only loses the spinner.
  const s: State = {
    planAlert,
    alertLevels: planAlertLevels(planAlert),
    notifyMode: options.notify as NotifyMode,
    // Off unless turned on: the notification may show on the lock screen. Not carried over from showExcerpt and
    // trecho: both defaulted to on and every install stored them, so a stored "true" may be a default nobody chose.
    shouldIncludeExcerpt: options.excerpt === true,
    frame: 0,
    agents: [],
    finishedAgentIds: new Set(),
    failedAgentCount: 0,
    windows: [],
    isWaitingForAgents: false,
    alertedLevelKeys: new Set(),
    windowsAtLimit: new Map(),
  }

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // /clear and resume start another conversation: the last outcome was of the one before.
    s.outcome = undefined
    s.windows = (await $.session.usage()).rateLimits
    await showStatus($, s)
    // /clear and resume start the session again in the same module: one interval only.
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
    })
    return r
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

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      s.finishedAgentIds.delete(e.agentId)
      await refreshAgents($, s)
      startSpinner($, s)
      return next(e)
    }

    s.mainTurnStartedAt = await $.clock.now()
    s.outcome = undefined
    s.isWaitingForAgents = false
    s.failedAgentCount = 0
    startSpinner($, s)
    await showStatus($, s)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // The previous outcome stays until the next prompt.
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
      const endText = AGENT_END_TEXTS[e.reason]
      const isBackground = s.isWaitingForAgents
      if (endText && isBackground) s.failedAgentCount++
      // An agent error always sends a notice; an interruption or refusal, only in the background.
      const hasNotifiedEnd = Boolean(endText && (e.reason === 'error' || isBackground))
      if (hasNotifiedEnd) {
        await sendNotice($, s, endText!.replace('{}', who), { timeoutMs: 10000, isAboutBackgroundAgents: isBackground })
      }
      // The list may lag behind the end: this one no longer counts as active.
      s.finishedAgentIds.add(e.agentId)
      await refreshAgents($, s, hasNotifiedEnd)
      const remaining = s.agents.length
      // The last agent's end is the "tudo pronto" notice instead.
      if (isBackground && !endText && remaining > 0 && e.durationMs >= minDurationMs) {
        await sendNotice($, s, `✅ ${who} terminou — ${formatRemainingAgents(remaining)}`, {
          timeoutMs: 8000,
          isAboutBackgroundAgents: true,
        })
      }
      await showStatus($, s)
      return next(e)
    }

    s.mainTurnStartedAt = undefined
    const duration = formatDuration(e.durationMs)
    const isAborted = e.reason === 'aborted'
    await refreshAgents($, s)
    const remaining = s.agents.length
    const remainingSuffix = remaining > 0 ? ` — ${formatRemainingAgents(remaining)} em segundo plano` : ''

    if (e.reason === 'error') {
      s.outcome = `❌ deu erro após ${duration}`
      await sendNotice($, s, `❌ Claude parou com erro após ${duration}${remainingSuffix}`, { timeoutMs: 10000 })
    } else if (e.reason === 'refusal') {
      s.outcome = `⚠️ recusou após ${duration}`
      await sendNotice($, s, `⚠️ Claude recusou a resposta após ${duration}${remainingSuffix}`, { timeoutMs: 10000 })
    } else if (isAborted) {
      s.outcome = `⏹️ interrompido após ${duration}`
    } else {
      s.outcome = `✅ pronto em ${duration}`
      if (e.durationMs >= minDurationMs) {
        await sendNotice($, s, `✅ Claude terminou em ${duration}${remainingSuffix}`, {
          timeoutMs: 8000,
          notificationDetail: extractExcerpt(e.answer),
        })
      }
    }

    // Even after Esc, agents that stay active still send a notice when they end.
    s.isWaitingForAgents = remaining > 0
    if (remaining === 0) stopSpinner(s)
    await showStatus($, s)
    return next(e)
  })
}
