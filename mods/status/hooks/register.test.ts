/* global h */
import type { AgentInfo, On, SessionMeasureInput, SessionRateLimit, TurnCompleteInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import {
  branchWebUrl,
  extractExcerpt,
  formatAgents,
  formatDuration,
  formatGit,
  formatPlan,
  formatTimeLeft,
  formatWorkflows,
  gitSegments,
  withoutPrInHint,
  parseGit,
  parsePr,
  planAlertLevels,
  projectName,
  remoteWebUrl,
} from './register'

const turnComplete = (durationMs: number, overrides: Partial<TurnCompleteInput> = {}): TurnCompleteInput =>
  ({
    answer: 'pronto',
    durationMs,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    ...overrides,
  }) as TurnCompleteInput

const agent = (id: string, description: string, status: AgentInfo['status'] = 'running'): AgentInfo => ({
  id,
  description,
  type: 'Explore',
  status,
})

type SetupOptions = {
  cwd?: string
  notify?: () => never
  surfaces?: string[]
}

/** The agent list reads `agents`, which tests change in place. */
const setup = (on: On, { cwd = '/Users/dev/code/laude', notify, surfaces = [] }: SetupOptions = {}) => {
  const toasts: string[] = []
  const toastTimeouts: (number | undefined)[] = []
  const notifications: string[] = []
  const notificationTitles: (string | undefined)[] = []
  const statuses: (string | undefined)[] = []
  const agents: AgentInfo[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    toastTimeouts.push(e.timeoutMs)
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: cwd }) as never)
  on('session.surfaces', () => ({ value: surfaces }) as never)
  on(
    'ui.notify',
    notify ??
      ((_$, e) => {
        notifications.push(e.text)
        notificationTitles.push(e.title)
        return { value: { isSent: true, channel: 'terminal_bell' } } as never
      }),
  )
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [...agents] }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'pronto' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  const clock = mock.clock(on)
  return {
    toasts,
    toastTimeouts,
    notifications,
    notificationTitles,
    statuses,
    agents,
    clock,
    lastStatus: () => statuses.at(-1),
  }
}

const measure = (rateLimits: SessionRateLimit[]): SessionMeasureInput => ({
  context: {} as SessionMeasureInput['context'],
  rateLimits,
  changed: ['rateLimits'],
})

const withUsage = (on: On, rateLimits: SessionRateLimit[]) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { rateLimits } }) as never)
}

const sessionStartInput = { cwd: '/', surface: 'terminal', isInteractive: true } as const

const stubWorkflowLaunch = (on: On, taskId: string, workflowName?: string) =>
  on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched', taskId, workflowName } }) as never)

const taskNotification = (text: string) => ({ text, origin: { kind: 'task-notification' }, wait: false }) as never

const stopHook = (on: On) => on('classic.Stop', () => ({}) as never)
const stopInput = (background_tasks: unknown[]) => ({ stop_hook_active: false, background_tasks }) as never

// It went past the 5 s default on a busy machine.
test('shows the spinner with the elapsed time while working', { timeoutMs: 30_000 }, async ($, on) => {
  const { lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  expect(lastStatus()).toBe('⠋ trabalhando… 0:00')

  await clock.advance(200)
  expect(lastStatus()).toBe('⠙ trabalhando… 0:00')

  await clock.advance(62_000)
  expect(lastStatus()).toMatch(/^. trabalhando… 1:02$/)
})

test(
  'keeps the duration in the status when done and sends a notice for long answers',
  { options: { excerpt: true } },
  async ($, on) => {
    const { toasts, toastTimeouts, notifications, notificationTitles, lastStatus, clock, statuses } = setup(on)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    await $.turn.complete(turnComplete(125_000, { answer: '## Resumo\n\nOs **17** testes passam.' }))
    expect(lastStatus()).toBe('✅ pronto em 2min 05s')
    expect(toasts).toEqual(['✅ Claude terminou em 2min 05s'])
    expect(toastTimeouts).toEqual([8000])
    expect(notifications).toEqual(['✅ Claude terminou em 2min 05s: Resumo'])
    expect(notificationTitles).toEqual(['laude'])

    // The spinner stopped: the clock moving no longer changes the status.
    const countBefore = statuses.length
    await clock.advance(5_000)
    expect(statuses.length).toBe(countBefore)
  },
)

test('titles the notification with the project name on Windows paths too', async ($, on) => {
  const { notificationTitles } = setup(on, { cwd: 'C:\\Users\\dev\\code\\laude' })

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000))

  expect(notificationTitles).toEqual(['laude'])
})

test('keeps the toast when the system notification fails', async ($, on) => {
  const { toasts, lastStatus } = setup(on, {
    notify: () => {
      throw new Error('no channel')
    },
  })

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000))

  expect(toasts).toEqual(['✅ Claude terminou em 1min 00s'])
  expect(lastStatus()).toBe('✅ pronto em 1min 00s')
})

test('quick answers only update the status', async ($, on) => {
  const { toasts, notifications, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(5_000))

  expect(lastStatus()).toBe('✅ pronto em 5s')
  expect(toasts).toEqual([])
  expect(notifications).toEqual([])
})

const quickFailures: [string, number, Partial<TurnCompleteInput>, string, string][] = [
  ['an error', 3_000, { reason: 'error' }, '❌ deu erro após 3s', '❌ Claude parou com erro após 3s'],
  [
    'a refusal',
    4_000,
    { reason: 'refusal', refusal: { category: null, explanation: null } },
    '⚠️ recusou após 4s',
    '⚠️ Claude recusou a resposta após 4s',
  ],
]
for (const [name, durationMs, overrides, status, toast] of quickFailures) {
  test(`sends a notice for ${name} even on a quick answer`, async ($, on) => {
    const { toasts, toastTimeouts, lastStatus } = setup(on)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    await $.turn.complete(turnComplete(durationMs, overrides))

    expect(lastStatus()).toBe(status)
    expect(toasts).toEqual([toast])
    expect(toastTimeouts).toEqual([10000])
  })
}

for (const [reason, text] of [
  ['error', '❌ Claude parou com erro após 3s'],
  ['refusal', '⚠️ Claude recusou a resposta após 3s'],
] as const) {
  test(`the ${reason} notice says how many agents go on in the background`, async ($, on) => {
    const { toasts, agents } = setup(on)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    agents.push(agent('a1', 'A'))
    await $.agent.spawn({ prompt: 'x', description: 'A' } as never)
    await $.turn.complete(turnComplete(3_000, { reason }))

    expect(toasts).toEqual([`${text} — 1 agente segue em segundo plano`])
  })
}

test('the answer at exactly the minimum duration sends a notice', async ($, on) => {
  const { toasts } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(30_000))

  expect(toasts).toEqual(['✅ Claude terminou em 30s'])
})

test('an interrupted answer shows in the status without a notice', async ($, on) => {
  const { toasts, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000, { reason: 'aborted', isAborted: true }))

  expect(lastStatus()).toBe('⏹️ interrompido após 1min 00s')
  expect(toasts).toEqual([])
})

test('shows running agents by name', async ($, on) => {
  const { agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Procurar arquivos'))
  await $.agent.spawn({ prompt: 'x', description: 'Procurar arquivos' } as never)
  expect(lastStatus()).toBe('⠋ trabalhando… 0:00  │  🤖 agente: Procurar arquivos')

  agents.push(agent('a2', 'Rodar testes'), agent('a3', 'Ler docs', 'pending'), agent('a4', 'Velho', 'completed'))
  await clock.advance(1_000)
  expect(lastStatus()).toMatch(/│ {2}🤖 0\/3: Procurar arquivos \+2$/)
})

test('an agent waiting for approval still counts as active', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Planejar', 'waiting'))
  await $.agent.spawn({ prompt: 'x', description: 'Planejar' } as never)

  expect(lastStatus()).toBe('⠋ trabalhando… 0:00  │  🤖 agente: Planejar')
})

test('the elapsed time rounds down to whole seconds', async ($, on) => {
  const { lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_800)

  expect(lastStatus()).toMatch(/^. trabalhando… 0:01$/)
})

test('an agent turn keeps the spinner it found', async ($, on) => {
  const { agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('sub1', 'Explorar'))
  await $.turn.start({ text: '', turnId: 't2', agentId: 'sub1' })
  // A second spinner would start over and advance two frames at a time.
  await clock.advance(200)

  expect(lastStatus()).toMatch(/^⠙ /)
})

test('with no previous outcome, a background agent shows only the background spinner', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  agents.push(agent('a1', 'A'))
  await $.agent.spawn({ prompt: 'x', description: 'A' } as never)

  expect(lastStatus()).toBe('⠋ em segundo plano  │  🤖 agente: A')
})

test('an agent spawned outside a turn starts the spinner', async ($, on) => {
  const { agents, lastStatus, clock } = setup(on)

  agents.push(agent('a1', 'A'))
  await $.agent.spawn({ prompt: 'x', description: 'A' } as never)
  await clock.advance(200)

  expect(lastStatus()).toBe('⠙ em segundo plano  │  🤖 agente: A')
})

test('an agent turn after the answer starts the spinner', async ($, on) => {
  const { agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(5_000))
  agents.push(agent('a1', 'A'))
  await $.turn.start({ text: '', turnId: 't2', agentId: 'a1' })
  await clock.advance(200)

  expect(lastStatus()).toBe('⠙ em segundo plano  │  🤖 agente: A')
})

test('an agent turn does not stop the spinner', async ($, on) => {
  const { toasts, agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(10_000)
  agents.push(agent('sub1', 'Explorar'))
  await $.turn.start({ text: '', turnId: 't2', agentId: 'sub1' })
  agents.length = 0
  await $.turn.complete(turnComplete(60_000, { agentId: 'sub1', turnId: 't2' }))
  await clock.advance(1_000)

  expect(lastStatus()).toMatch(/^. trabalhando… 0:11$/)
  expect(toasts).toEqual([])
})

test('sends a notice when an agent fails', async ($, on) => {
  const { toasts, toastTimeouts, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('sub1', 'Explorar'))
  await $.turn.start({ text: '', turnId: 't2', agentId: 'sub1' })
  await $.turn.complete(turnComplete(5_000, { agentId: 'sub1', turnId: 't2', reason: 'error' }))

  expect(toasts).toEqual(['❌ O agente “Explorar” parou com erro'])
  expect(toastTimeouts).toEqual([10000])
})

test('an agent missing from the list still sends a notice for its error', async ($, on) => {
  const { toasts } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(5_000, { agentId: 'missing', turnId: 't2', reason: 'error' }))

  expect(toasts).toEqual(['❌ Um agente parou com erro'])
})

test('an interrupted or refusing background agent does not say it ended', async ($, on) => {
  const { notifications, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'), agent('a3', 'Docs'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(40_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'aborted', isAborted: true }))
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't3', reason: 'refusal' }))

  expect(notifications).toEqual([
    '✅ Claude terminou em 40s — 3 agentes seguem em segundo plano',
    '⏹️ O agente “Revisar” foi interrompido',
    '⚠️ O agente “Testar” recusou a tarefa',
  ])
})

test('when the last background agent fails, the end does not say all is well', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))

  // Its own notice already says it: no second one for the background agents' end.
  expect(notifications).toEqual(['❌ O agente “Revisar” parou com erro'])
  expect(lastStatus()).toBe('⚠️ agentes terminaram, 1 com problema')
})

test('the failure count starts over with the next answer', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))

  agents.push(agent('a2', 'Testar'))
  await $.turn.start({ text: 'oi', turnId: 't3' })
  await $.agent.spawn({ prompt: 'x', description: 'Testar' } as never)
  await $.turn.complete(turnComplete(5_000, { turnId: 't3' }))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't4' }))
  expect(lastStatus()).toBe('✅ tudo pronto')
})

test("the background agents' end notice counts an earlier failure", async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't3' }))

  expect(lastStatus()).toBe('⚠️ agentes terminaram, 1 com problema')
  expect(notifications).toEqual([
    '❌ O agente “Revisar” parou com erro',
    '⚠️ Os agentes em segundo plano terminaram, 1 com problema',
  ])
})

test("the background agents' end notice sums failures even when the last one sent its own", async ($, on) => {
  const { notifications, toastTimeouts, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't3', reason: 'error' }))

  expect(notifications).toEqual([
    '❌ O agente “Revisar” parou com erro',
    '❌ O agente “Testar” parou com erro',
    '⚠️ Os agentes em segundo plano terminaram, 2 com problema',
  ])
  expect(toastTimeouts).toEqual([10000, 10000, 10000])
})

test('a background agent that fails, starts again and ends well has no problem in the final notice', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  await $.turn.start({ text: '', turnId: 't3', agentId: 'a1' })
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't3' }))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't4' }))

  expect(notifications).toEqual(['❌ O agente “Revisar” parou com erro', '✅ Os agentes em segundo plano terminaram'])
  expect(lastStatus()).toBe('✅ tudo pronto')
})

test('a background agent that fails and starts again counts until a run of it ends well', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  await $.turn.start({ text: '', turnId: 't3', agentId: 'a1' })
  // It leaves the list with no end of its own.
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't4' }))

  expect(notifications.at(-1)).toBe('⚠️ Os agentes em segundo plano terminaram, 1 com problema')
  expect(lastStatus()).toBe('⚠️ agentes terminaram, 1 com problema')
})

test('a background agent that fails twice counts once in the final notice', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  await $.turn.start({ text: '', turnId: 't3', agentId: 'a1' })
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't3', reason: 'error' }))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't4' }))

  expect(notifications).toEqual([
    '❌ O agente “Revisar” parou com erro',
    '❌ O agente “Revisar” parou com erro',
    '⚠️ Os agentes em segundo plano terminaram, 1 com problema',
  ])
  expect(lastStatus()).toBe('⚠️ agentes terminaram, 1 com problema')
})

test('an agent whose second failure is the last end sends no summary of that one failure', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  await $.turn.start({ text: '', turnId: 't3', agentId: 'a1' })
  agents.splice(1, 1)
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't4' }))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't3', reason: 'error' }))

  expect(notifications).toEqual(['❌ O agente “Revisar” parou com erro', '❌ O agente “Revisar” parou com erro'])
  expect(lastStatus()).toBe('⚠️ agentes terminaram, 1 com problema')
})

test('only says everything is done when the background agents end', async ($, on) => {
  const { toasts, toastTimeouts, agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar código'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar código' } as never)
  await $.turn.complete(turnComplete(40_000))

  expect(toasts).toEqual(['✅ Claude terminou em 40s — 1 agente segue em segundo plano'])
  expect(lastStatus()).toBe('⠋ em segundo plano  │  🤖 agente: Revisar código')

  await $.turn.start({ text: '', turnId: 't2', agentId: 'bg' })
  await clock.advance(200)
  expect(lastStatus()).toMatch(/^. em segundo plano/)

  agents.length = 0
  await $.turn.complete(turnComplete(30_000, { agentId: 'bg', turnId: 't2' }))
  expect(lastStatus()).toBe('✅ tudo pronto')
  expect(toasts.at(-1)).toBe('✅ Os agentes em segundo plano terminaram')
  expect(toastTimeouts).toEqual([8000, 8000])
})

test('sends a notice for each background agent that ends and for the end of them all', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar código'), agent('a2', 'Rodar testes'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar código' } as never)
  await $.turn.complete(turnComplete(40_000))

  // The list does not reflect the end of either yet.
  await $.turn.complete(turnComplete(35_000, { agentId: 'a1', turnId: 't2' }))
  expect(notifications.at(-1)).toBe('✅ O agente “Revisar código” terminou — 1 agente segue')

  await $.turn.complete(turnComplete(10_000, { agentId: 'a2', turnId: 't3' }))
  expect(lastStatus()).toBe('✅ tudo pronto')
  expect(notifications).toEqual([
    '✅ Claude terminou em 40s — 2 agentes seguem em segundo plano',
    '✅ O agente “Revisar código” terminou — 1 agente segue',
    '✅ Os agentes em segundo plano terminaram',
  ])
})

test('a background agent at exactly the minimum duration sends a notice', async ($, on) => {
  const { notifications, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'A'), agent('a2', 'B'))
  await $.agent.spawn({ prompt: 'x', description: 'A' } as never)
  await $.turn.complete(turnComplete(5_000))
  await $.turn.complete(turnComplete(30_000, { agentId: 'a1', turnId: 't2' }))

  expect(notifications).toEqual(['✅ O agente “A” terminou — 1 agente segue'])
})

test('a quick background agent sends no notice of its own', async ($, on) => {
  const { toasts, notifications, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Ler docs'), agent('a2', 'Rodar testes'))
  await $.agent.spawn({ prompt: 'x', description: 'Ler docs' } as never)
  await $.turn.complete(turnComplete(40_000))
  await $.turn.complete(turnComplete(5_000, { agentId: 'a1', turnId: 't2' }))

  expect(toasts).toEqual(['✅ Claude terminou em 40s — 2 agentes seguem em segundo plano'])
  expect(notifications).toEqual(['✅ Claude terminou em 40s — 2 agentes seguem em segundo plano'])

  await $.turn.complete(turnComplete(5_000, { agentId: 'a2', turnId: 't3' }))
  expect(notifications.at(-1)).toBe('✅ Os agentes em segundo plano terminaram')
})

test('the agent list emptying alone ends the background wait', async ($, on) => {
  const { notifications, agents, lastStatus, clock, statuses } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  // No turn.complete of the agent: the spinner's own read of the list sees it gone.
  agents.length = 0
  await clock.advance(1_000)

  expect(lastStatus()).toBe('✅ tudo pronto')
  expect(notifications).toEqual(['✅ Os agentes em segundo plano terminaram'])

  // With nothing left, the spinner stopped too.
  const countBefore = statuses.length
  await clock.advance(5_000)
  expect(statuses.length).toBe(countBefore)
})

test('an agent that starts again after ending shows up again', async ($, on) => {
  const { agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Explorar'))
  await $.turn.start({ text: '', turnId: 't2', agentId: 'a1' })
  // The list still shows it after the end.
  await $.turn.complete(turnComplete(5_000, { agentId: 'a1', turnId: 't2' }))
  expect(lastStatus()).toBe('⠋ trabalhando… 0:00')

  await $.turn.start({ text: '', turnId: 't3', agentId: 'a1' })
  await clock.advance(200)
  expect(lastStatus()).toMatch(/│ {2}🤖 agente: Explorar$/)
})

test('an agent that failed and starts again no longer counts as failed', async ($, on) => {
  const { agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Explorar'), agent('a2', 'Revisar'))
  await $.turn.start({ text: '', turnId: 't2', agentId: 'a1' })
  await $.turn.start({ text: '', turnId: 't3', agentId: 'a2' })
  await $.turn.complete(turnComplete(5_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  await clock.advance(200)
  expect(lastStatus()).toMatch(/│ {2}🤖 1\/2 ⚠️1: Revisar$/)

  await $.turn.start({ text: '', turnId: 't4', agentId: 'a1' })
  await clock.advance(200)
  expect(lastStatus()).toMatch(/│ {2}🤖 0\/2: Explorar \+1$/)
})

test('an agent that leaves the list after ending shows up if the list brings it back', async ($, on) => {
  const { agents, lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Explorar'))
  await $.turn.start({ text: '', turnId: 't2', agentId: 'a1' })
  await $.turn.complete(turnComplete(5_000, { agentId: 'a1', turnId: 't2' }))
  expect(lastStatus()).toBe('⠋ trabalhando… 0:00')

  // Another agent's start reads the list again.
  agents.length = 0
  await $.turn.start({ text: '', turnId: 't3', agentId: 'a2' })
  agents.push(agent('a1', 'Explorar'))
  await $.turn.start({ text: '', turnId: 't4', agentId: 'a2' })
  await clock.advance(200)
  expect(lastStatus()).toMatch(/│ {2}🤖 agente: Explorar$/)
})

test('an agent that fails without ever showing on the list counts in the progress', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a2', 'B'))
  await $.agent.spawn({ prompt: 'x', description: 'B' } as never)
  await $.turn.complete(turnComplete(1_000, { agentId: 'missing', turnId: 't2', reason: 'error' }))

  expect(lastStatus()).toMatch(/🤖 1\/2 ⚠️1: B$/)
})

test('the end of the agents after a task notification cleared the outcome says all is done', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))
  await $.prompt.submit(taskNotification('<task-id>outro</task-id>'))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't2' }))

  expect(lastStatus()).toBe('✅ tudo pronto')
})

test('a failed answer stays in the status after the background agents end well', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(3_000, { reason: 'error' }))

  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't2' }))

  expect(lastStatus()).toBe('❌ deu erro após 3s')
})

for (const [reason, answerText] of [
  ['error', '❌ deu erro após 3s'],
  ['refusal', '⚠️ recusou após 3s'],
  ['aborted', '⏹️ interrompido após 3s'],
] as const) {
  test(`an answer that ended with ${reason} stays in the status after a background agent fails`, async ($, on) => {
    const { agents, lastStatus } = setup(on)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    agents.push(agent('bg', 'Revisar'))
    await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
    await $.turn.complete(turnComplete(3_000, { reason }))

    agents.length = 0
    await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't2', reason: 'error' }))

    expect(lastStatus()).toBe(`${answerText} · ⚠️ agentes terminaram, 1 com problema`)
  })
}

const workflowNameCases: [string, string | undefined, string, Record<string, string>, string][] = [
  [
    'a Workflow reply or a Stop task with an empty name shows what stands in for it',
    '',
    'workflow',
    { name: '', description: 'revisar' },
    'revisar',
  ],
  [
    'a workflow without a name shows what stands in for it',
    undefined,
    'workflow',
    { description: 'uma descrição bem longa de um workflow sem nome' },
    'uma descrição bem longa de um…',
  ],
  ['Stop names a workflow with neither name nor description', 'revisao', 'revisao', {}, 'workflow'],
]
for (const [title, workflowName, nameBefore, task, nameAfter] of workflowNameCases) {
  test(title, async ($, on) => {
    const { lastStatus } = setup(on)
    stopHook(on)
    stubWorkflowLaunch(on, 'w1', workflowName)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
    await $.turn.complete(turnComplete(5_000))
    expect(lastStatus()).toBe(`⠋ em segundo plano  │  🔀 workflow: ${nameBefore}`)

    await $.classic.Stop(stopInput([{ id: 'w1', type: 'workflow', status: 'running', ...task }]))
    expect(lastStatus()).toBe(`⠋ em segundo plano  │  🔀 workflow: ${nameAfter}`)
  })
}

test('a failed answer stays in the status next to the background agents', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(3_000, { reason: 'error' }))

  expect(lastStatus()).toBe('❌ deu erro após 3s · ⠋ em segundo plano  │  🤖 agente: Revisar')
})

for (const [title, durationMs] of [
  ['an agent that ended a run and is held on its own work does not read as ended', 1_000],
  ['a long run of an agent still held on its own work does not say it ended', 40_000],
] as const) {
  test(title, async ($, on) => {
    const { notifications, agents, lastStatus } = setup(on)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    agents.push(agent('bg', 'Revisar'))
    await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
    await $.turn.complete(turnComplete(5_000))

    agents[0] = agent('bg', 'Revisar', 'waiting')
    await $.turn.complete(turnComplete(durationMs, { agentId: 'bg', turnId: 't2' }))

    expect(lastStatus()).toBe('⠋ em segundo plano  │  🤖 agente: Revisar')
    expect(notifications).toEqual([])
  })
}

test('an idle agent does not count as running', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar', 'idle'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(5_000))

  expect(lastStatus()).toBe('✅ pronto em 5s')
})

test('an agent that ends while the notice of the answer goes out still gets the final notice', async ($, on) => {
  let reachNotify = () => {}
  const notifyReached = new Promise<void>((resolve) => (reachNotify = resolve))
  let releaseNotify = () => {}
  const notifyReleased = new Promise<void>((resolve) => (releaseNotify = resolve))
  let notifyCount = 0
  const { toasts, agents } = setup(on, {
    notify: (async () => {
      if (++notifyCount === 1) {
        reachNotify()
        await notifyReleased
      }
      return { value: { isSent: true, channel: 'terminal_bell' } }
    }) as never,
  })

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  const answerEnd = $.turn.complete(turnComplete(40_000))
  await notifyReached

  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't2' }))
  releaseNotify()
  await answerEnd

  expect(toasts).toEqual([
    '✅ Claude terminou em 40s — 1 agente segue em segundo plano',
    '✅ Os agentes em segundo plano terminaram',
  ])
})

test('a workflow still running does not read as ended', async ($, on) => {
  const { toasts, lastStatus, clock } = setup(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(40_000))

  expect(toasts).toEqual(['✅ Claude terminou em 40s — 1 workflow segue em segundo plano'])
  expect(lastStatus()).toBe('⠋ em segundo plano  │  🔀 workflow: revisao')
  await clock.advance(200)
  expect(lastStatus()).toBe('⠙ em segundo plano  │  🔀 workflow: revisao')
})

test('the task notification of a workflow takes it off the status', async ($, on) => {
  const { lastStatus, clock, statuses } = setup(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.prompt.submit(taskNotification('<task-id>outro</task-id>'))
  expect(lastStatus()).toMatch(/🔀 workflow: revisao$/)

  await $.prompt.submit(taskNotification('<task-id>w1</task-id>'))
  expect(lastStatus()).toBeUndefined()

  // With nothing left, the spinner stopped too.
  await clock.advance(200)
  const countBefore = statuses.length
  await clock.advance(5_000)
  expect(statuses.length).toBe(countBefore)
})

test('the last agent sends its final notice even with a workflow still running', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(40_000))
  expect(notifications).toEqual(['✅ Claude terminou em 40s — 1 agente segue e 1 workflow segue em segundo plano'])

  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't2' }))
  expect(lastStatus()).toBe('⠋ em segundo plano  │  🔀 workflow: revisao')
  expect(notifications.at(-1)).toBe('✅ Os agentes em segundo plano terminaram — 1 workflow segue')
})

test('a failed answer and a failed agent stay next to a workflow still running', async ($, on) => {
  const { agents, lastStatus } = setup(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(3_000, { reason: 'error' }))

  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't2', reason: 'error' }))

  expect(lastStatus()).toBe(
    '❌ deu erro após 3s · ⚠️ agentes terminaram, 1 com problema · ⠋ em segundo plano  │  🔀 workflow: revisao',
  )
})

test('a failed agent stays in the final notice and the status with a workflow still running', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't3' }))

  expect(notifications.at(-1)).toBe('⚠️ Os agentes em segundo plano terminaram, 1 com problema — 1 workflow segue')
  expect(lastStatus()).toBe('⚠️ agentes terminaram, 1 com problema · ⠋ em segundo plano  │  🔀 workflow: revisao')

  // The workflow's end sends no second notice about the agents.
  await $.prompt.submit(taskNotification('<task-id>w1</task-id>'))
  expect(notifications).toHaveLength(2)
})

test('Stop after the turn ends says which workflows are in flight', async ($, on) => {
  const { lastStatus } = setup(on)
  stopHook(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(5_000))
  expect(lastStatus()).toBe('✅ pronto em 5s')

  await $.classic.Stop(
    stopInput([
      { id: 'w2', type: 'workflow', status: 'running', description: 'desc', name: 'deploy' },
      { id: 's1', type: 'shell', status: 'running', description: 'npm test' },
    ]),
  )
  expect(lastStatus()).toBe('⠋ em segundo plano  │  🔀 workflow: deploy')

  await $.classic.Stop(stopInput([]))
  expect(lastStatus()).toBe('✅ pronto em 5s')
})

test('Stop after the turn ends starts the spinner of the workflows in flight', async ($, on) => {
  const { lastStatus, clock } = setup(on)
  stopHook(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(5_000))
  await $.classic.Stop(stopInput([{ id: 'w1', type: 'workflow', status: 'running', name: 'deploy' }]))
  expect(lastStatus()).toBe('⠋ em segundo plano  │  🔀 workflow: deploy')

  await clock.advance(200)
  expect(lastStatus()).toBe('⠙ em segundo plano  │  🔀 workflow: deploy')
})

test('Stop before the turn ends counts in the notice of the answer, in the plural too', async ($, on) => {
  const { toasts } = setup(on)
  stopHook(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.classic.Stop(
    stopInput([
      { id: 'w1', type: 'workflow', status: 'running', description: 'a', name: 'revisao' },
      { id: 'w2', type: 'workflow', status: 'running', description: 'b', name: 'deploy' },
    ]),
  )
  await $.turn.complete(turnComplete(40_000))
  expect(toasts).toEqual(['✅ Claude terminou em 40s — 2 workflows seguem em segundo plano'])
})

test('Stop with a workflow gone leaves the wait for the agents alone', async ($, on) => {
  const { notifications, agents } = setup(on)
  stopHook(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(5_000))
  await $.classic.Stop(stopInput([]))

  agents.length = 0
  await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't2' }))
  expect(notifications).toEqual(['✅ Os agentes em segundo plano terminaram'])
})

test('Stop without background tasks leaves the workflows alone', async ($, on) => {
  const { lastStatus } = setup(on)
  stopHook(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(5_000))
  await $.classic.Stop({ stop_hook_active: false } as never)

  expect(lastStatus()).toBe('⠋ em segundo plano  │  🔀 workflow: revisao')
})

test('a prompt of the user that names a workflow keeps it on the status', async ($, on) => {
  const { lastStatus } = setup(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(5_000))

  await $.prompt.submit({ text: 'o que é w1?', wait: false } as never)
  expect(lastStatus()).toMatch(/🔀 workflow: revisao$/)
})

test('a Workflow call that failed does not count as running', async ($, on) => {
  const { lastStatus } = setup(on)
  on('tool.call', { tool: 'Workflow' }, () => ({ result: { taskId: 'w1' }, isError: true }) as never)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.turn.complete(turnComplete(5_000))

  expect(lastStatus()).toBe('✅ pronto em 5s')
})

test('the task notification of a workflow during a turn takes it off the status', async ($, on) => {
  const { lastStatus } = setup(on)
  stubWorkflowLaunch(on, 'w1', 'revisao')

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  await $.prompt.submit(taskNotification('<task-id>w1</task-id>'))
  await $.turn.complete(turnComplete(5_000))

  expect(lastStatus()).toBe('✅ pronto em 5s')
})

test('agents during the answer send no notice when they end', async ($, on) => {
  const { notifications, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Explorar'), agent('a2', 'Ler docs'))
  await $.agent.spawn({ prompt: 'x', description: 'Explorar' } as never)
  await $.turn.complete(turnComplete(40_000, { agentId: 'a1', turnId: 't2' }))

  expect(notifications).toEqual([])
})

test('an interrupted or refusing agent during the answer sends no notice', async ($, on) => {
  const { toasts, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'A'), agent('a2', 'B'))
  await $.agent.spawn({ prompt: 'x', description: 'A' } as never)
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'aborted', isAborted: true }))
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't3', reason: 'refusal' }))

  expect(toasts).toEqual([])
})

test('an agent of the answer before that ends during a new one sends no notice', async ($, on) => {
  const { notifications, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'A'), agent('a2', 'B'))
  await $.agent.spawn({ prompt: 'x', description: 'A' } as never)
  await $.turn.complete(turnComplete(5_000))
  await $.turn.start({ text: 'mais', turnId: 't2' })
  await $.turn.complete(turnComplete(40_000, { agentId: 'a1', turnId: 't3' }))

  expect(notifications).toEqual([])
})

test('shows the plan usage and a toast once near the limit', async ($, on) => {
  const { toasts, toastTimeouts, lastStatus, clock } = setup(on)
  const now = clock.now()
  const at = (ms: number) => new Date(now + ms).toISOString()

  await $.session.measure(
    measure([
      { kind: 'five_hour', percentUsed: 34, resetsAt: at(3_600_000) },
      { kind: 'seven_day', percentUsed: 12 },
    ]),
  )
  expect(lastStatus()).toBe('plano: 5h 34% (renova em 1h00) · semana 12%')
  expect(toasts).toEqual([])

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 91.5, resetsAt: at(80 * 60_000) }]))
  expect(lastStatus()).toBe('⚠️ plano: 5h 91% (renova em 1h20)')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 93, resetsAt: at(80 * 60_000) }]))
  expect(toasts).toEqual(['⚠️ Você já usou 91% do plano (5h)'])
  expect(toastTimeouts).toEqual([10000])
})

test('a usage just under a level shows below it, without its alert', async ($, on) => {
  const { toasts, notifications, lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 74.5 }]))
  expect(lastStatus()).toBe('plano: 5h 74%')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 89.6 }]))
  expect(lastStatus()).toBe('plano: 5h 89%')
  expect(toasts).toEqual(['⚠️ Você já usou 89% do plano (5h)'])
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 99.5 }]))
  expect(lastStatus()).toBe('⚠️ plano: 5h 99%')
  expect(toasts).toEqual(['⚠️ Você já usou 89% do plano (5h)', '⚠️ Você já usou 99% do plano (5h)'])
  expect(notifications).toEqual([])
})

test('a plan window at exactly its reset time is gone', async ($, on) => {
  const { statuses, clock } = setup(on)

  await $.session.measure(
    measure([{ kind: 'five_hour', percentUsed: 40, resetsAt: new Date(clock.now()).toISOString() }]),
  )

  expect(statuses).toEqual([undefined])
})

test('the time until reset counts down on its own', async ($, on) => {
  const { lastStatus, clock } = setup(on)
  withUsage(on, [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(clock.now() + 3_600_000).toISOString() }])

  await $.session.start(sessionStartInput)
  expect(lastStatus()).toBe('plano: 5h 20% (renova em 1h00)')

  await clock.advance(60_000)
  expect(lastStatus()).toBe('plano: 5h 20% (renova em 59min)')
})

test('a session started again keeps a single refresh interval', async ($, on) => {
  const { statuses, clock } = setup(on)
  withUsage(on, [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(clock.now() + 3_600_000).toISOString() }])

  await $.session.start(sessionStartInput)
  await $.session.start(sessionStartInput)
  const countBefore = statuses.length

  await clock.advance(60_000)
  expect(statuses.length - countBefore).toBe(1)
})

test('the refresh leaves the status to a running spinner', { timeoutMs: 30_000 }, async ($, on) => {
  const { statuses, clock } = setup(on)
  withUsage(on, [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(clock.now() + 3_600_000).toISOString() }])

  await $.session.start(sessionStartInput)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  const countBefore = statuses.length

  // One write per frame, none from the refresh.
  await clock.advance(60_000)
  expect(statuses.length - countBefore).toBe(60_000 / 200)
})

test('the refresh writes nothing when no window has a reset time', async ($, on) => {
  const { statuses, clock } = setup(on)
  withUsage(on, [{ kind: 'seven_day', percentUsed: 20 }])

  await $.session.start(sessionStartInput)
  const countBefore = statuses.length

  await clock.advance(60_000)
  expect(statuses.length).toBe(countBefore)
})

test('the next prompt clears the previous outcome and keeps the plan', async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 10 }]))
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(5_000))
  expect(lastStatus()).toBe('✅ pronto em 5s  │  plano: 5h 10%')

  await $.prompt.submit({ text: 'de novo' } as never)
  expect(lastStatus()).toBe('plano: 5h 10%')
})

const sessionEndInput = (reason: string) => ({ reason, sessionId: 's1', resume: {} }) as never

for (const reason of ['clear', 'resume']) {
  test(`a session ended by ${reason} drops the previous outcome and keeps the plan`, async ($, on) => {
    const { lastStatus } = setup(on)
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)

    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 10 }]))
    await $.turn.start({ text: 'oi', turnId: 't1' })
    await $.turn.complete(turnComplete(5_000))
    expect(lastStatus()).toBe('✅ pronto em 5s  │  plano: 5h 10%')

    await $.session.end(sessionEndInput(reason))
    expect(lastStatus()).toBe('plano: 5h 10%')
  })

  test(`a session ended by ${reason} drops the workflows of the previous one`, async ($, on) => {
    const { lastStatus } = setup(on)
    stopHook(on)
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    await $.turn.complete(turnComplete(5_000))
    await $.classic.Stop(stopInput([{ id: 'w1', type: 'workflow', status: 'running', name: 'deploy' }]))
    expect(lastStatus()).toBe('⠋ em segundo plano  │  🔀 workflow: deploy')

    await $.session.end(sessionEndInput(reason))
    expect(lastStatus()).toBeUndefined()
  })

  test(`a session ended by ${reason} sends no end notice for the agents of the previous one`, async ($, on) => {
    const { notifications, toasts, agents } = setup(on)
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    agents.push(agent('a1', 'Revisar'))
    await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
    await $.turn.complete(turnComplete(5_000))
    const noticesBefore = notifications.length + toasts.length

    await $.session.end(sessionEndInput(reason))
    agents.length = 0
    await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2' }))

    expect(notifications.length + toasts.length).toBe(noticesBefore)
  })

  test(`a session ended by ${reason} starts the progress of the agents over`, async ($, on) => {
    const { agents, lastStatus } = setup(on)
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'), agent('a3', 'Docs'))
    await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
    await $.turn.complete(turnComplete(1_000))
    agents.splice(0, 1)
    await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
    expect(lastStatus()).toMatch(/🤖 1\/3 ⚠️1: Testar \+1$/)

    await $.session.end(sessionEndInput(reason))
    expect(lastStatus()).toMatch(/🤖 0\/2: Testar \+1$/)
  })
}

test('the progress counts the agents that ended, and the next turn starts it over', async ($, on) => {
  const { lastStatus, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Revisar'), agent('a2', 'Testar'), agent('a3', 'Docs'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar' } as never)
  await $.turn.complete(turnComplete(1_000))
  expect(lastStatus()).toMatch(/🤖 0\/3: Revisar \+2$/)

  agents.splice(0, 1)
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2' }))
  expect(lastStatus()).toMatch(/🤖 1\/3: Testar \+1$/)

  agents.splice(0, 1)
  await $.turn.complete(turnComplete(1_000, { agentId: 'a2', turnId: 't3', reason: 'error' }))
  expect(lastStatus()).toMatch(/🤖 2\/3 ⚠️1: Docs$/)

  await $.turn.start({ text: 'mais', turnId: 't4' })
  expect(lastStatus()).toMatch(/🤖 agente: Docs$/)
})

test('a new turn starts the spinner from its first frame', async ($, on) => {
  const { lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(200)
  await $.turn.complete(turnComplete(5_000))
  await $.turn.start({ text: 'oi', turnId: 't2' })

  expect(lastStatus()).toMatch(/^⠋ /)
})

test('a session that ends for good leaves the status alone', async ($, on) => {
  const { statuses } = setup(on)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(5_000))
  const countBefore = statuses.length

  await $.session.end(sessionEndInput('prompt_input_exit'))
  expect(statuses.length).toBe(countBefore)
})

test('a prompt sent during a turn leaves the status alone', async ($, on) => {
  const { statuses, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  const countBefore = statuses.length
  await $.prompt.submit({ text: 'e mais isto' } as never)

  expect(statuses.length).toBe(countBefore)
  expect(lastStatus()).toBe('⠋ trabalhando… 0:00')
})

test('clears the status when there is nothing to show', async ($, on) => {
  const { statuses } = setup(on)

  await $.prompt.submit({ text: 'oi' } as never)
  expect(statuses).toEqual([undefined])
})

test('notify "agents" only sends the background notices', { options: { notify: 'agents' } }, async ($, on) => {
  const { toasts, notifications, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar código'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar código' } as never)
  await $.turn.complete(turnComplete(40_000))
  agents.length = 0
  await $.turn.complete(turnComplete(30_000, { agentId: 'bg', turnId: 't2' }))

  expect(toasts).toEqual([
    '✅ Claude terminou em 40s — 1 agente segue em segundo plano',
    '✅ Os agentes em segundo plano terminaram',
  ])
  expect(notifications).toEqual(['✅ Os agentes em segundo plano terminaram'])
})

test('notify "agents" sends a background agent failure', { options: { notify: 'agents' } }, async ($, on) => {
  const { toasts, notifications, agents } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Explorar'), agent('bg', 'Revisar'))
  await $.agent.spawn({ prompt: 'x', description: 'Explorar' } as never)
  // During the answer: toast only.
  await $.turn.complete(turnComplete(1_000, { agentId: 'a1', turnId: 't2', reason: 'error' }))
  await $.turn.complete(turnComplete(5_000))
  // In the background: also a notification.
  await $.turn.complete(turnComplete(1_000, { agentId: 'bg', turnId: 't3', reason: 'error' }))

  expect(toasts).toEqual(['❌ O agente “Explorar” parou com erro', '❌ O agente “Revisar” parou com erro'])
  expect(notifications).toEqual(['❌ O agente “Revisar” parou com erro'])
})

test('notify "agents" leaves the plan limit to the toast', { options: { notify: 'agents' } }, async ($, on) => {
  const { toasts, notifications } = setup(on)

  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 100 }]))

  expect(toasts).toEqual(['🛑 Você atingiu o limite do plano (semana)'])
  expect(notifications).toEqual([])
})

test('a notify outside its options counts as always', { options: { notify: 'x' } }, async ($, on) => {
  const { notifications } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000))

  expect(notifications).toEqual(['✅ Claude terminou em 1min 00s'])
})

test('notify "never" leaves only the toast', { options: { notify: 'never' } }, async ($, on) => {
  const { toasts, notifications } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000))

  expect(toasts).toEqual(['✅ Claude terminou em 1min 00s'])
  expect(notifications).toEqual([])
})

test('crossing several plan levels at once shows a toast only for the highest, the limit also a notification', async ($, on) => {
  const { toasts, toastTimeouts, notifications } = setup(on)

  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 76 }]))
  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 80 }]))
  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 100 }]))

  expect(toasts).toEqual(['⚠️ Você já usou 76% do plano (semana)', '🛑 Você atingiu o limite do plano (semana)'])
  expect(toastTimeouts).toEqual([10000, 10000])
  expect(notifications).toEqual(['🛑 Você atingiu o limite do plano (semana)'])
})

test(
  'a configured plan alert highlights and shows a toast at that level',
  { options: { planAlert: 80 } },
  async ($, on) => {
    const { toasts, lastStatus } = setup(on)

    await $.session.measure(measure([{ kind: 'spend_limit', percentUsed: 79 }]))
    expect(lastStatus()).toBe('plano: gasto 79%')
    await $.session.measure(measure([{ kind: 'spend_limit', percentUsed: 81 }]))
    expect(lastStatus()).toBe('⚠️ plano: gasto 81%')

    expect(toasts).toEqual(['⚠️ Você já usou 79% do plano (gasto)', '⚠️ Você já usou 81% do plano (gasto)'])
  },
)

test('a plan alert below 1 is treated as 1', { options: { planAlert: 0 } }, async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 0.4 }]))
  expect(lastStatus()).toBe('plano: 5h 0%')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 1 }]))
  expect(lastStatus()).toBe('⚠️ plano: 5h 1%')
})

test('a plan alert above 100 is treated as 100', { options: { planAlert: 150 } }, async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 99 }]))
  expect(lastStatus()).toBe('plano: 5h 99%')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 100 }]))
  expect(lastStatus()).toBe('⚠️ plano: 5h 100%')
})

test('an empty plan alert takes the default', { options: { planAlert: '' } }, async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 89 }]))
  expect(lastStatus()).toBe('plano: 5h 89%')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 90 }]))
  expect(lastStatus()).toBe('⚠️ plano: 5h 90%')
})

test('by default the answer stays out of the notification', async ($, on) => {
  const { notifications } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000, { answer: 'segredo' }))

  expect(notifications).toEqual(['✅ Claude terminou em 1min 00s'])
})

test('a long answer with no text still sends a notice', async ($, on) => {
  const { toasts } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000, { answer: undefined }))

  expect(toasts).toEqual(['✅ Claude terminou em 1min 00s'])
})

test('an answer with no line to show leaves the notification as is', { options: { excerpt: true } }, async ($, on) => {
  const { notifications } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000, { answer: '```\ncode\n```' }))

  expect(notifications).toEqual(['✅ Claude terminou em 1min 00s'])
})

test(
  'the notice of an error leaves the answer out of the notification',
  { options: { excerpt: true } },
  async ($, on) => {
    const { notifications } = setup(on)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    await $.turn.complete(turnComplete(3_000, { reason: 'error', answer: 'segredo' }))

    expect(notifications).toEqual(['❌ Claude parou com erro após 3s'])
  },
)

test('the earlier showExcerpt option is not read', { options: { showExcerpt: true } }, async ($, on) => {
  const { notifications } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(60_000, { answer: 'segredo' }))

  expect(notifications).toEqual(['✅ Claude terminou em 1min 00s'])
})

test('sends a notice when the plan resets after the limit', async ($, on) => {
  const { notifications, toastTimeouts, lastStatus, clock } = setup(on)
  const now = clock.now()
  const resetsAt = new Date(now + 90_000).toISOString()
  withUsage(on, [{ kind: 'five_hour', percentUsed: 3, resetsAt: new Date(now + 5 * 3_600_000).toISOString() }])

  await $.session.start(sessionStartInput)
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 100, resetsAt }]))
  expect(notifications).toEqual(['🛑 Você atingiu o limite do plano (5h)'])

  await clock.advance(60_000)
  expect(notifications).toHaveLength(1)

  await clock.advance(60_000)
  expect(notifications.at(-1)).toBe('✅ Plano liberado de novo (5h)')
  expect(toastTimeouts).toEqual([10000, 10000])
  expect(lastStatus()).toBe('plano: 5h 3% (renova em 4h58)')

  await clock.advance(60_000)
  expect(notifications).toHaveLength(2)
})

test('a reading from before the reset is neither shown nor sends a notice again', async ($, on) => {
  const { notifications, lastStatus, clock } = setup(on)
  const now = clock.now()
  // No API response since the limit: claude still reports the old window.
  const oldWindow = { kind: 'five_hour', percentUsed: 100, resetsAt: new Date(now + 90_000).toISOString() }
  withUsage(on, [oldWindow])

  await $.session.start(sessionStartInput)
  await $.session.measure(measure([oldWindow]))
  await clock.advance(120_000)
  expect(notifications).toEqual(['🛑 Você atingiu o limite do plano (5h)', '✅ Plano liberado de novo (5h)'])
  expect(lastStatus()).toBeUndefined()

  await $.session.measure({ ...measure([oldWindow]), changed: ['context'] })
  await clock.advance(60_000)
  expect(notifications).toHaveLength(2)
  expect(lastStatus()).toBeUndefined()
})

test('dropping usage also counts as a reset', async ($, on) => {
  const { notifications } = setup(on)

  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 100 }]))
  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 2 }]))
  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 100 }]))

  expect(notifications).toEqual([
    '🛑 Você atingiu o limite do plano (semana)',
    '✅ Plano liberado de novo (semana)',
    '🛑 Você atingiu o limite do plano (semana)',
  ])
})

test('a window over the alert highlights the plan next to one below it', async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(
    measure([
      { kind: 'five_hour', percentUsed: 95 },
      { kind: 'seven_day', percentUsed: 10 },
    ]),
  )

  expect(lastStatus()).toBe('⚠️ plano: 5h 95% · semana 10%')
})

test('a window below the limit does not read as the reset of another at it', async ($, on) => {
  const { notifications } = setup(on)
  const both = measure([
    { kind: 'seven_day', percentUsed: 80 },
    { kind: 'five_hour', percentUsed: 100 },
  ])

  await $.session.measure(both)
  await $.session.measure(both)

  expect(notifications).toEqual(['🛑 Você atingiu o limite do plano (5h)'])
})

test('the reset of a window leaves the alerts of another alone', async ($, on) => {
  const { toasts } = setup(on)

  await $.session.measure(
    measure([
      { kind: 'seven_day', percentUsed: 80 },
      { kind: 'five_hour', percentUsed: 100 },
    ]),
  )
  await $.session.measure(
    measure([
      { kind: 'seven_day', percentUsed: 80 },
      { kind: 'five_hour', percentUsed: 2 },
    ]),
  )

  expect(toasts).toEqual([
    '⚠️ Você já usou 80% do plano (semana)',
    '🛑 Você atingiu o limite do plano (5h)',
    '✅ Plano liberado de novo (5h)',
  ])
})

test('sends a notice when the plan resets during a turn', { timeoutMs: 30_000 }, async ($, on) => {
  const { notifications, clock } = setup(on)
  const now = clock.now()
  withUsage(on, [{ kind: 'five_hour', percentUsed: 3, resetsAt: new Date(now + 5 * 3_600_000).toISOString() }])

  await $.session.start(sessionStartInput)
  await $.session.measure(
    measure([{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(now + 30_000).toISOString() }]),
  )
  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(60_000)

  expect(notifications.at(-1)).toBe('✅ Plano liberado de novo (5h)')
})

test('a new window at the limit sends the notice of the reset before its own', async ($, on) => {
  const { notifications, clock } = setup(on)
  const now = clock.now()

  await $.session.measure(
    measure([{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(now + 1_000).toISOString() }]),
  )
  await clock.advance(2_000)
  await $.session.measure(
    measure([{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(now + 5 * 3_600_000).toISOString() }]),
  )

  expect(notifications).toEqual([
    '🛑 Você atingiu o limite do plano (5h)',
    '✅ Plano liberado de novo (5h)',
    '🛑 Você atingiu o limite do plano (5h)',
  ])
})

test('a new plan window shows a toast again at the same levels', async ($, on) => {
  const { toasts } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 80, resetsAt: '2030-01-01T00:00:00Z' }]))
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 80, resetsAt: '2030-01-01T05:00:00Z' }]))

  expect(toasts).toEqual(['⚠️ Você já usou 80% do plano (5h)', '⚠️ Você já usou 80% do plano (5h)'])
})

test('after Esc it still sends a notice when the background agents end', async ($, on) => {
  const { notifications, agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('bg', 'Revisar código'))
  await $.agent.spawn({ prompt: 'x', description: 'Revisar código' } as never)
  await $.turn.complete(turnComplete(10_000, { reason: 'aborted', isAborted: true }))
  expect(notifications).toEqual([])

  agents.length = 0
  await $.turn.complete(turnComplete(30_000, { agentId: 'bg', turnId: 't2' }))
  expect(lastStatus()).toBe('⏹️ interrompido após 10s')
  expect(notifications).toEqual(['✅ Os agentes em segundo plano terminaram'])
})

test('respects the configured minimum duration', { options: { minSeconds: 5 } }, async ($, on) => {
  const { toasts } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(6_000))

  expect(toasts).toEqual(['✅ Claude terminou em 6s'])
})

test('a minimum duration of 0 sends a notice for a quick answer', { options: { minSeconds: 0 } }, async ($, on) => {
  const { toasts } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(1_000))

  expect(toasts).toEqual(['✅ Claude terminou em 1s'])
})

test('an empty minimum duration takes the default', { options: { minSeconds: '' } }, async ($, on) => {
  const { toasts } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await $.turn.complete(turnComplete(29_000))
  await $.turn.start({ text: 'oi', turnId: 't2' })
  await $.turn.complete(turnComplete(30_000, { turnId: 't2' }))

  expect(toasts).toEqual(['✅ Claude terminou em 30s'])
})

describe('formatDuration', () => {
  for (const [ms, text] of [
    [45_000, '45s'],
    [59_600, '1min 00s'],
    [60_000, '1min 00s'],
    [125_400, '2min 05s'],
  ] as const) {
    test(`${ms} ms is ${text}`, () => expect(formatDuration(ms)).toBe(text))
  }
})

describe('formatTimeLeft', () => {
  for (const [ms, text] of [
    [10_000, '1min'],
    [30_000, '1min'],
    [80 * 60_000, '1h20'],
    [24 * 3_600_000, '1d 0h'],
    [50 * 3_600_000, '2d 2h'],
  ] as const) {
    test(`${ms} ms is ${text}`, () => expect(formatTimeLeft(ms)).toBe(text))
  }
})

describe('formatAgents', () => {
  test('counts the agents already ended', () => {
    expect(formatAgents([agent('a', 'A'), agent('b', 'B')], 3)).toBe('🤖 3/5: A +1')
    expect(formatAgents([agent('a', 'A')], 1)).toBe('🤖 1/2: A')
  })

  test('marks the agents that failed', () => {
    expect(formatAgents([agent('a', 'A'), agent('b', 'B')], 3, 1)).toBe('🤖 3/5 ⚠️1: A +1')
  })

  const named = (name: string) => ({ id: 'n', name, type: 'Explore', status: 'running' }) as AgentInfo
  const cases: [string, AgentInfo[], string | undefined][] = [
    ['no agents', [], undefined],
    [
      'a long name, cut',
      [agent('a', 'Revisar todo o código do módulo de pagamentos')],
      '🤖 agente: Revisar todo o código do módu…',
    ],
    ['a name of exactly 30 characters', [agent('a', 'a'.repeat(30))], `🤖 agente: ${'a'.repeat(30)}`],
    ['two agents', [agent('a', 'A'), agent('b', 'B')], '🤖 0/2: A +1'],
    ['three agents', [agent('a', 'A'), agent('b', 'B'), agent('c', 'C')], '🤖 0/3: A +2'],
    ['the name without a description', [named('nome')], '🤖 agente: nome'],
    ['the name with an empty description', [{ ...named('nome'), description: '' }], '🤖 agente: nome'],
    ['the type without a name', [{ id: 't', type: 'Explore', status: 'running' } as AgentInfo], '🤖 agente: Explore'],
  ]
  for (const [name, agents, text] of cases) test(name, () => expect(formatAgents(agents)).toBe(text))
})

describe('formatWorkflows', () => {
  const cases: [string, string[], string | undefined][] = [
    ['no workflows', [], undefined],
    ['one workflow', ['revisao'], '🔀 workflow: revisao'],
    ['two workflows', ['revisao', 'deploy'], '🔀 2 workflows'],
    ['a long name, cut', ['x'.repeat(40)], `🔀 workflow: ${'x'.repeat(29)}…`],
  ]
  for (const [name, names, text] of cases) test(name, () => expect(formatWorkflows(names)).toBe(text))
})

describe('extractExcerpt', () => {
  test('a line of openers takes no quadratic time', () => {
    const start = Date.now()
    extractExcerpt(' ['.repeat(100_000))
    extractExcerpt(' [a'.repeat(100_000))
    expect(Date.now() - start).toBeLessThan(1_000)
  })

  for (const [answer, text] of [
    ['\n- Feito: `x` **ok**', 'Feito: x ok'],
    ['Renomeei `my_var` para _snake_case_ e __init__', 'Renomeei my_var para snake_case e init'],
    ['a'.repeat(100), `${'a'.repeat(79)}…`],
    ['a'.repeat(80), 'a'.repeat(80)],
    ['', undefined],
    ['```bash\nnpm test\n```\nPronto.', 'Pronto.'],
    ['~~~\ncode\n~~~\n\nFeito', 'Feito'],
    ['  ```\n  code\n  ```\nFeito', 'Feito'],
    ['````md\n```\nexemplo\n```\n````\nFeito', 'Feito'],
    ['```\ncode\n``` js\n```\nFeito', 'Feito'],
    ['~~~\n```\n~~~\nFeito', 'Feito'],
    ['```a`b\nFeito', 'ab'],
    ['2 * 3 = 6', '2 * 3 = 6'],
    ['Veja [o README](https://x/README.md).', 'Veja o README.'],
    ['- [x] Feito', 'Feito'],
    ['- [X] Feito', 'Feito'],
    ['- [ ] Fazer', 'Fazer'],
    ['Use *isso* e `aquilo`', 'Use isso e aquilo'],
    ['---\nTexto', 'Texto'],
    ['* * *\nTexto', 'Texto'],
    ['  ---\nTexto', 'Texto'],
    ['| a | b |\n|---|---|\n| 1 | 2 |\nFeito', 'Feito'],
    ['  | a | b |\nFeito', 'Feito'],
    ['+ Feito', 'Feito'],
    ['1) Feito', 'Feito'],
    ['1. Feito', 'Feito'],
    ['> - Feito', 'Feito'],
    ['- 2024. foi o ano da migração', '2024. foi o ano da migração'],
    ['# 3) Resultado', '3) Resultado'],
    ['O campo está_ativo foi removido', 'O campo está_ativo foi removido'],
    ['![logo](a.png) Feito', 'logo Feito'],
    ['<!-- nota -->\nFeito', 'Feito'],
    ['<!-- a --> <!-- b -->\nFeito', 'Feito'],
    ['<!-- a --> Feito <!-- b -->\nOutro', '<!-- a --> Feito <!-- b -->'],
    [`${'a'.repeat(78)}😀 e mais texto`, `${'a'.repeat(78)}😀…`],
    ['- ```js\n  code\n  ```\nFeito', 'Feito'],
    ['1. ```bash\n   code\n   ```\nFeito', 'Feito'],
    ['2) ~~~\n   code\n   ~~~\nFeito', 'Feito'],
    ['```\n- ```\ncode\n```\nFeito', 'Feito'],
    ['> ```js\n> code\n> ```\nFeito', 'Feito'],
    ['> - ```\n>   code\n>   ```\nFeito', 'Feito'],
    ['```\n> ```\nsegredo = 1\n```\nFeito', 'Feito'],
    ['> ```\n> code\n\nFeito', 'Feito'],
    ['- ~~~riscado~~~ texto\nFeito', 'Feito'],
    ['- ```js\n  code\n\nFeito', 'Feito'],
    ['  ```\n  code\n```\nFeito', 'Feito'],
    ['  ```bash\ncurl -H "Bearer segredo"\n  ```\nFeito', 'Feito'],
    ['  ```\ncode\n```\nFeito', 'Feito'],
    ['- \n  ```\n  code\nFeito', 'Feito'],
    ['> ---\nFeito', 'Feito'],
    ['> ***\nFeito', 'Feito'],
    ['> * * *\nFeito', 'Feito'],
    ['> | a | b |\nFeito', 'Feito'],
    ['> <!-- nota -->\nFeito', 'Feito'],
    ['- | a |\nFeito', 'Feito'],
    ['**\nFeito', 'Feito'],
    ['#\nFeito', 'Feito'],
    ['-\nFeito', 'Feito'],
    ['1.\nFeito', 'Feito'],
    ['- [ ]\nFeito', 'Feito'],
    ['===\nFeito', 'Feito'],
    ['✅\nFeito', 'Feito'],
    ['***negrito*** feito', 'negrito feito'],
    ['[x](http://a_b_c) feito', 'x feito'],
    ['\\*a\\* feito', '*a* feito'],
    ['~~riscado~~ feito', 'riscado feito'],
    ['`**x**` e __init__.py', '**x** e __init__.py'],
  ] as const) {
    test(`${JSON.stringify(answer)} is ${JSON.stringify(text)}`, () => expect(extractExcerpt(answer)).toBe(text))
  }
})

describe('planAlertLevels', () => {
  for (const [planAlert, levels] of [
    [90, [75, 90, 100]],
    [75, [75, 100]],
    [50, [50, 75, 100]],
  ] as const) {
    test(`${planAlert} gives ${levels.join(', ')}`, () => expect(planAlertLevels(planAlert)).toEqual([...levels]))
  }
})

test('a plan with no windows shows nothing', () => {
  expect(formatPlan([], 0, 90)).toBeUndefined()
})

test('a plan window of an unknown kind shows the kind', () => {
  expect(formatPlan([{ kind: 'opus', percentUsed: 10 } as SessionRateLimit], 0, 90)).toBe('plano: opus 10%')
})

test('the project is the last folder of the path', () => {
  expect(projectName('/Users/dev/code/laude/')).toBe('laude')
})

test('a path with no folder is its own project', () => {
  expect(projectName('/')).toBe('/')
})

const gitStatus = (head: string, { ab = '', files = [] as string[] } = {}): string =>
  ['# branch.oid 216ceb753e8158ed5b539c5ff8b866d34bf08b6b', `# branch.head ${head}`, ab, ...files, '']
    .filter((line, i, lines) => line || i === lines.length - 1)
    .join('\n')

const formatPorcelain = (porcelain: string, number?: number) =>
  formatGit(parseGit(porcelain)!, number === undefined ? undefined : { number })

describe('formatGit', () => {
  test('shows only the branch on a clean tree', () => {
    expect(formatPorcelain(gitStatus('main', { ab: '# branch.ab +0 -0' }))).toBe('git: main')
  })

  test('counts every kind of changed file', () => {
    const files = [
      '1 .M N... 100644 100644 100644 a b bin/cli.js',
      '2 R. N... 100644 100644 100644 a b R100 new.js\told.js',
      'u UU N... 100644 100644 100644 100644 a b c conflict.js',
      '? notes.md',
    ]
    expect(formatPorcelain(gitStatus('main', { files }))).toBe('git: main · ●4')
  })

  test('shows the commits ahead of and behind the upstream', () => {
    expect(formatPorcelain(gitStatus('main', { ab: '# branch.ab +1 -2' }))).toBe('git: main · ↑1 ↓2')
    expect(formatPorcelain(gitStatus('main', { ab: '# branch.ab +1 -0' }))).toBe('git: main · ↑1')
    expect(formatPorcelain(gitStatus('main', { ab: '# branch.ab +0 -2' }))).toBe('git: main · ↓2')
  })

  test('shows the pull request between the branch and the counts', () => {
    expect(formatPorcelain(gitStatus('main', { ab: '# branch.ab +1 -0' }), 5)).toBe('git: main · PR #5 · ↑1')
  })

  test('shows the short commit when detached', () => {
    expect(formatPorcelain(gitStatus('(detached)'))).toBe('git: 216ceb7')
    expect(parseGit(gitStatus('(detached)'))!.branch).toBeUndefined()
  })

  test('shortens a long branch name', () => {
    expect(formatPorcelain(gitStatus('feature/a-very-long-branch-name-that-goes-on'))).toBe(
      'git: feature/a-very-long-branch-na…',
    )
  })

  test('reads nothing from an output with no branch', () => {
    expect(parseGit('')).toBeUndefined()
  })
})

describe('remoteWebUrl', () => {
  test('reads the forms a remote comes in', () => {
    for (const remote of [
      'git@github.com:datalogix/claude-config.git',
      'github.com:datalogix/claude-config',
      'https://github.com/datalogix/claude-config.git',
      'https://github.com/datalogix/claude-config/',
      'ssh://git@github.com:22/datalogix/claude-config.git',
    ])
      expect(remoteWebUrl(remote)).toBe('https://github.com/datalogix/claude-config')
  })

  test('leaves out a token in the URL', () => {
    expect(remoteWebUrl('https://x-access-token:secret@github.com/o/r.git')).toBe('https://github.com/o/r')
  })

  test('has no address for a local path or an ssh alias', () => {
    expect(remoteWebUrl('/srv/git/r.git')).toBeUndefined()
    expect(remoteWebUrl('../r.git')).toBeUndefined()
    expect(remoteWebUrl('github-work:o/r.git')).toBeUndefined()
  })

  test('keeps the scheme and port of an http(s) remote, even on a host with no dot', () => {
    expect(remoteWebUrl('https://git.example.com:8443/o/r.git')).toBe('https://git.example.com:8443/o/r')
    expect(remoteWebUrl('http://git.example.com/o/r')).toBe('http://git.example.com/o/r')
    expect(remoteWebUrl('http://gitea:3000/o/r.git')).toBe('http://gitea:3000/o/r')
    expect(remoteWebUrl('https://x:secret@git.example.com:8443/o/r.git')).toBe('https://git.example.com:8443/o/r')
  })

  test('gives no link for what is not a host and port, so a password with a raw / or @ stays out', () => {
    expect(remoteWebUrl('https://user:p/ss@host.example.com/x')).toBeUndefined()
    expect(remoteWebUrl('https://user:12/ss@host.example.com/x')).toBeUndefined()
    expect(remoteWebUrl('https://a@b@host.example.com/x')).toBeUndefined()
    expect(remoteWebUrl('https://user:pa%2Fss@host.example.com/x')).toBe('https://host.example.com/x')
  })

  test('leaves out the port of an ssh remote, which is not the site', () => {
    expect(remoteWebUrl('ssh://git@git.example.com:2222/o/r.git')).toBe('https://git.example.com/o/r')
  })
})

describe('branchWebUrl', () => {
  test('drops the remote from the upstream and keeps the slashes of the branch', () => {
    expect(branchWebUrl('https://github.com/o/r', 'origin/feat/a#b')).toBe('https://github.com/o/r/tree/feat/a%23b')
  })
})

describe('gitSegments', () => {
  const git = { head: 'main', branch: 'main', counts: '●1' }

  test('links the branch and the pull request when they have an address', () => {
    expect(gitSegments(git, { number: 5, url: 'https://pr' }, 'https://branch')).toEqual([
      { text: 'main', href: 'https://branch' },
      ' · ',
      { text: 'PR #5', href: 'https://pr' },
      ' · ',
      '●1',
    ])
  })

  test('draws them as plain text otherwise', () => {
    expect(gitSegments(git, { number: 5 })).toEqual(['main', ' · ', 'PR #5', ' · ', '●1'])
  })
})

describe('withoutPrInHint', () => {
  const segments = ['main', ' · ', { text: 'PR #6', href: 'https://pr' }, ' · ', '●1']

  test("leaves out the pull request the engine's line shows, with its separator", () => {
    expect(withoutPrInHint(segments, '(shift+tab to cycle) · PR #6')).toEqual(['main', ' · ', '●1'])
  })

  test('keeps it when the line shows none, or another one', () => {
    expect(withoutPrInHint(segments, '(shift+tab to cycle)')).toEqual(segments)
    expect(withoutPrInHint(segments, '(shift+tab to cycle) · PR #61')).toEqual(segments)
    expect(withoutPrInHint(segments, '(shift+tab to cycle) · PR #5')).toEqual(segments)
  })

  test('has nothing to leave out with no pull request', () => {
    expect(withoutPrInHint(['main'], 'PR #6')).toEqual(['main'])
  })
})

describe('parseGit upstream', () => {
  const porcelain = (lines: string[]) => ['# branch.oid a', '# branch.head main', ...lines].join('\n')

  test('keeps an upstream still on the remote', () => {
    const output = porcelain(['# branch.upstream origin/main', '# branch.ab +0 -0'])
    expect(parseGit(output)?.upstream).toBe('origin/main')
  })

  test('drops one gone from the remote, which git reports with no counts', () => {
    expect(parseGit(porcelain(['# branch.upstream origin/main']))?.upstream).toBeUndefined()
  })

  test('has none on a branch not pushed', () => {
    expect(parseGit(porcelain([]))?.upstream).toBeUndefined()
  })
})

describe('parsePr', () => {
  test('reads an open pull request', () => {
    expect(parsePr('{"number":5,"state":"OPEN","url":"https://github.com/o/r/pull/5"}')).toEqual({
      number: 5,
      url: 'https://github.com/o/r/pull/5',
    })
  })

  test('leaves out a closed or merged one', () => {
    expect(parsePr('{"number":5,"state":"CLOSED"}')).toBeUndefined()
    expect(parsePr('{"number":5,"state":"MERGED"}')).toBeUndefined()
  })
})

describe('the git state in the status line', () => {
  const GIT_STATUS = ['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch']
  const GH_PR_VIEW = ['gh', 'pr', 'view', '--json', 'number,state,url']
  const reply = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '' })
  const noPr = reply('', 1)

  type Replies = { git: () => unknown; gh?: () => unknown }

  /** Each call is kept in `calls`, by its executable. */
  const withProcess = (on: On, replies: Replies, rateLimits: SessionRateLimit[] = []) => {
    const calls: string[][] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({ value: { rateLimits } }) as never)
    on('process.run', (async (_$: unknown, e: { argv: string[] }) => {
      calls.push(e.argv)
      const answer = e.argv[0] === 'git' ? replies.git : (replies.gh ?? (() => noPr))
      return { value: await answer() }
    }) as never)
    return calls
  }

  test('shows it after the plan', async ($, on) => {
    const { lastStatus } = setup(on)
    withProcess(on, { git: () => reply(gitStatus('main')) }, [
      { kind: 'five_hour', percentUsed: 10 } as SessionRateLimit,
    ])

    await $.session.start(sessionStartInput)

    expect(lastStatus()).toBe('plano: 5h 10%  │  git: main')
  })

  test('reads it again when an answer ends', async ($, on) => {
    const { lastStatus } = setup(on)
    let stdout = gitStatus('main')
    withProcess(on, { git: () => reply(stdout) })
    await $.session.start(sessionStartInput)

    await $.turn.start({ text: 'oi', turnId: 't1' })
    stdout = gitStatus('main', { files: ['? notes.md'] })
    await $.turn.complete(turnComplete(1_000))

    expect(lastStatus()).toBe('✅ pronto em 1s  │  git: main · ●1')
  })

  test('reads it again every minute', async ($, on) => {
    const { lastStatus, clock } = setup(on)
    let stdout = gitStatus('main')
    withProcess(on, { git: () => reply(stdout) })
    await $.session.start(sessionStartInput)

    stdout = gitStatus('other')
    await clock.advance(60_000)

    expect(lastStatus()).toBe('git: other')
  })

  test('leaves the status line outside a repository', async ($, on) => {
    const { lastStatus, clock } = setup(on)
    let gitReply = reply(gitStatus('main'))
    withProcess(on, { git: () => gitReply })
    await $.session.start(sessionStartInput)
    expect(lastStatus()).toBe('git: main')

    gitReply = reply('', 128)
    await clock.advance(60_000)

    expect(lastStatus()).toBeUndefined()
  })

  test('goes without it when git cannot start', async ($, on) => {
    const { lastStatus } = setup(on)
    withProcess(on, {
      git: () => {
        throw new Error('git not found')
      },
    })

    await $.session.start(sessionStartInput)

    expect(lastStatus()).toBeUndefined()
  })

  test('a slow read does not overwrite a newer one', async ($, on) => {
    const { lastStatus } = setup(on)
    let releaseSlow = () => {}
    const slow = new Promise<void>((resolve) => (releaseSlow = resolve))
    let markSlowStarted = () => {}
    const slowStarted = new Promise<void>((resolve) => (markSlowStarted = resolve))
    const replies = [
      async () => {
        markSlowStarted()
        await slow
        return reply(gitStatus('old'))
      },
      async () => reply(gitStatus('new')),
    ]
    withProcess(on, { git: () => replies.shift()!() })

    const first = $.session.start(sessionStartInput)
    await slowStarted
    await $.session.start(sessionStartInput)
    releaseSlow()
    await first

    expect(lastStatus()).toBe('git: new')
  })

  test('a slow read of the remote does not overwrite a newer read', async ($, on) => {
    const { lastStatus } = setup(on)
    let release = () => {}
    const slow = new Promise<void>((resolve) => (release = resolve))
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => (markStarted = resolve))
    const statuses = [
      reply(gitStatus('old', { ab: '# branch.upstream origin/old\n# branch.ab +0 -0' })),
      reply(gitStatus('new')),
    ]
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({ value: { rateLimits: [] } }) as never)
    on('process.run', (async (_$: unknown, e: { argv: string[] }) => {
      if (e.argv[0] === 'gh') return { value: noPr }
      if (e.argv[1] === 'remote') {
        markStarted()
        await slow
        return { value: reply('git@github.com:o/r.git\n') }
      }
      return { value: statuses.shift()! }
    }) as never)

    const first = $.session.start(sessionStartInput)
    await started
    await $.session.start(sessionStartInput)
    release()
    await first

    expect(lastStatus()).toBe('git: new')
  })

  test('asks git for the status without optional locks', async ($, on) => {
    setup(on)
    const calls = withProcess(on, { git: () => reply(gitStatus('main')) })

    await $.session.start(sessionStartInput)

    expect(calls).toEqual([GIT_STATUS])
  })

  describe('the pull request', () => {
    const openPr = (number: number) => reply(JSON.stringify({ number, state: 'OPEN', url: `https://pr/${number}` }))
    const prCalls = (calls: string[][]) => calls.filter((argv) => argv[0] === 'gh')

    test('shows it next to the branch without holding the session start', async ($, on) => {
      const { lastStatus, clock } = setup(on)
      const calls = withProcess(on, { git: () => reply(gitStatus('main')), gh: () => openPr(5) })

      await $.session.start(sessionStartInput)
      expect(lastStatus()).toBe('git: main')
      await clock.advance(0)

      expect(lastStatus()).toBe('git: main · PR #5')
      expect(prCalls(calls)).toEqual([GH_PR_VIEW])
    })

    test('does not read it again on each minute', async ($, on) => {
      const { clock } = setup(on)
      const calls = withProcess(on, { git: () => reply(gitStatus('main')), gh: () => openPr(5) })
      await $.session.start(sessionStartInput)

      await clock.advance(11 * 60_000)

      expect(prCalls(calls)).toHaveLength(1)
    })

    test('reads it again when an answer ends, at most every 5 minutes', async ($, on) => {
      const { lastStatus, clock } = setup(on)
      let number = 5
      const calls = withProcess(on, { git: () => reply(gitStatus('main')), gh: () => openPr(number) })
      await $.session.start(sessionStartInput)
      await clock.advance(0)

      number = 6
      await $.turn.start({ text: 'oi', turnId: 't1' })
      await $.turn.complete(turnComplete(1_000))
      await clock.advance(0)
      expect(prCalls(calls)).toHaveLength(1)

      await clock.advance(5 * 60_000)
      await $.turn.start({ text: 'oi', turnId: 't2' })
      await $.turn.complete(turnComplete(1_000, { turnId: 't2' }))
      await clock.advance(0)

      expect(prCalls(calls)).toHaveLength(2)
      expect(lastStatus()).toBe('✅ pronto em 1s  │  git: main · PR #6')
    })

    test('a new branch drops it at once and reads it again', async ($, on) => {
      const { lastStatus, statuses, clock } = setup(on)
      let branch = 'main'
      const calls = withProcess(on, {
        git: () => reply(gitStatus(branch)),
        gh: () => (branch === 'main' ? openPr(5) : noPr),
      })
      await $.session.start(sessionStartInput)
      await clock.advance(0)
      expect(lastStatus()).toBe('git: main · PR #5')

      branch = 'other'
      await clock.advance(60_000)

      expect(statuses).toContain('git: other')
      expect(lastStatus()).toBe('git: other')
      expect(prCalls(calls)).toHaveLength(2)
    })

    test('a read for a branch left meanwhile is dropped', async ($, on) => {
      const { lastStatus, clock } = setup(on)
      let branch = 'main'
      let releaseSlow = () => {}
      const slow = new Promise<void>((resolve) => (releaseSlow = resolve))
      withProcess(on, {
        git: () => reply(gitStatus(branch)),
        gh: async () => {
          if (branch === 'other') return noPr
          await slow
          return openPr(5)
        },
      })
      await $.session.start(sessionStartInput)
      await clock.advance(0)

      branch = 'other'
      await clock.advance(60_000)
      releaseSlow()
      await clock.advance(0)

      expect(lastStatus()).toBe('git: other')
    })

    test('keeps it when gh fails and goes without it when gh cannot start', async ($, on) => {
      const { lastStatus, clock } = setup(on)
      let gh: () => unknown = () => openPr(5)
      withProcess(on, { git: () => reply(gitStatus('main')), gh: () => gh() })
      await $.session.start(sessionStartInput)
      await clock.advance(0)

      gh = () => {
        throw new Error('gh not found')
      }
      await clock.advance(5 * 60_000)
      await $.turn.start({ text: 'oi', turnId: 't1' })
      await $.turn.complete(turnComplete(1_000))
      await clock.advance(0)

      expect(lastStatus()).toBe('✅ pronto em 1s  │  git: main · PR #5')
    })

    test('a detached head does not ask for it', async ($, on) => {
      const { clock } = setup(on)
      const calls = withProcess(on, { git: () => reply(gitStatus('(detached)')) })

      await $.session.start(sessionStartInput)
      await clock.advance(0)

      expect(prCalls(calls)).toEqual([])
    })
  })
})

describe('the lines under the prompt', () => {
  type Ui = {
    findAll: (query: {
      type: string
    }) => Promise<{ key?: string; text?: string; props?: { color?: string; weight?: string } }[]>
    unmount: () => Promise<void>
  }
  const mountHint = ($: unknown, surface: string) =>
    ($ as { ui: { mount: (args: unknown) => Promise<Ui> } }).ui.mount({
      plugin: 'status',
      component: 'PromptHint',
      requestId: 'hint',
      surface,
      props: { isDraft: false, isWorking: false, hint: 'auto mode on' },
    })

  /** The engine's own line, which the test stands for. */
  const withLines = (
    on: On,
    percentUsed = 10,
    { status = gitStatus('main'), gh = { exitCode: 1, stdout: '', stderr: '' } } = {},
  ) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on(
      'session.usage',
      () => ({ value: { rateLimits: [{ kind: 'five_hour', percentUsed } as SessionRateLimit] } }) as never,
    )
    on('process.run', (async (_$: unknown, e: { argv: string[] }) => ({
      value:
        e.argv[0] !== 'git'
          ? gh
          : e.argv[1] === 'remote'
            ? { exitCode: 0, stdout: 'git@github.com:o/r.git\n', stderr: '' }
            : { exitCode: 0, stdout: status, stderr: '' },
    })) as never)
    on('ui.render', ((engine: { ui: { resolve: (e: unknown) => { Text: never } } }, e: unknown) => {
      const { Text } = engine.ui.resolve(e)
      return h(Text, { key: 'hint' }, 'auto mode on')
    }) as never)
  }
  const fullLines = async (ui: Ui) =>
    (await ui.findAll({ type: 'Text' })).filter((line) => line.props?.weight !== 'semibold')
  const texts = async (ui: Ui) => (await fullLines(ui)).map((line) => line.text)

  for (const surface of ['terminal', 'desktop']) {
    test(`draws each part on its own line next to the engine's, in the ${surface}`, async ($, on) => {
      const { statuses } = setup(on, { surfaces: [surface] })
      withLines(on)
      await $.session.start(sessionStartInput)
      await $.turn.start({ text: 'oi', turnId: 't1' })
      await $.turn.complete(turnComplete(1_000))

      const ui = await mountHint($, surface)
      expect(await texts(ui)).toEqual(['status: ✅ pronto em 1s', 'plano: 5h 10%', 'git: main', 'auto mode on'])
      expect(statuses.at(-1)).toBeUndefined()
      await ui.unmount()
    })
  }

  test('says it is waiting before anything happens, and leaves out the other lines with nothing to show', async ($, on) => {
    setup(on, { surfaces: ['terminal'] })
    withLines(on)
    await $.session.start(sessionStartInput)

    const ui = await mountHint($, 'terminal')
    expect(await texts(ui)).toEqual(['status: 💤 aguardando', 'plano: 5h 10%', 'git: main', 'auto mode on'])
    expect((await fullLines(ui))[0]?.props?.color).toBe('subtle')
    await ui.unmount()
  })

  test('draws the label in bold, up to the first colon', async ($, on) => {
    setup(on, { surfaces: ['terminal'] })
    withLines(on)
    await $.session.start(sessionStartInput)

    const ui = await mountHint($, 'terminal')
    const labels = (await ui.findAll({ type: 'Text' })).filter((line) => line.props?.weight === 'semibold')
    expect(labels.map((label) => label.text)).toEqual(['status:', 'plano:', 'git:'])
    await ui.unmount()
  })

  test('stops the label at the first colon when the text has another one', async ($, on) => {
    setup(on, { surfaces: ['terminal'] })
    withLines(on)
    await $.session.start(sessionStartInput)
    await $.turn.start({ text: 'oi', turnId: 't1' })

    const ui = await mountHint($, 'terminal')
    const labels = (await ui.findAll({ type: 'Text' })).filter((line) => line.props?.weight === 'semibold')
    expect(labels[0]?.text).toBe('status:')
    await ui.unmount()
  })

  test('links the branch on the remote and the pull request', async ($, on) => {
    const { clock } = setup(on, { surfaces: ['terminal'] })
    withLines(on, 10, {
      status: [
        '# branch.oid a',
        '# branch.head feat/x',
        '# branch.upstream origin/feat/x',
        '# branch.ab +0 -0',
        '',
      ].join('\n'),
      gh: { exitCode: 0, stdout: '{"number":5,"state":"OPEN","url":"https://github.com/o/r/pull/5"}', stderr: '' },
    })
    await $.session.start(sessionStartInput)
    await clock.advance(0)

    const ui = await mountHint($, 'terminal')
    const links = await (
      ui as unknown as { findAll: (q: { type: string }) => Promise<{ props?: { href?: string } }[]> }
    ).findAll({ type: 'Link' })
    expect(links.map((link) => link.props?.href)).toEqual([
      'https://github.com/o/r/tree/feat/x',
      'https://github.com/o/r/pull/5',
    ])
    await ui.unmount()
  })

  test('a branch not pushed has no link', async ($, on) => {
    setup(on, { surfaces: ['terminal'] })
    withLines(on)
    await $.session.start(sessionStartInput)

    const ui = await mountHint($, 'terminal')
    const links = await (ui as unknown as { findAll: (q: { type: string }) => Promise<unknown[]> }).findAll({
      type: 'Link',
    })
    expect(links).toEqual([])
    await ui.unmount()
  })

  test('colors each line by what it says', async ($, on) => {
    setup(on, { surfaces: ['terminal'] })
    withLines(on)
    await $.session.start(sessionStartInput)
    await $.turn.start({ text: 'oi', turnId: 't1' })

    const colors = async () => {
      const ui = await mountHint($, 'terminal')
      const result = (await fullLines(ui)).map((line) => line.props?.color)
      await ui.unmount()
      return result
    }
    expect(await colors()).toEqual(['claude', 'suggestion', 'merged', undefined])

    await $.turn.complete(turnComplete(1_000))
    expect((await colors())[0]).toBe('success')

    await $.turn.start({ text: 'oi', turnId: 't2' })
    await $.turn.complete(turnComplete(1_000, { turnId: 't2', reason: 'error' }))
    expect((await colors())[0]).toBe('error')
  })

  test('the plan turns yellow from the alert on', async ($, on) => {
    setup(on, { surfaces: ['terminal'] })
    withLines(on, 95)
    await $.session.start(sessionStartInput)

    const ui = await mountHint($, 'terminal')
    expect((await fullLines(ui))[1]?.props?.color).toBe('warning')
    await ui.unmount()
  })

  test('falls back to one status line where the lines are not drawn', async ($, on) => {
    const { lastStatus } = setup(on, { surfaces: ['vscode'] })
    withLines(on)

    await $.session.start(sessionStartInput)

    expect(lastStatus()).toBe('plano: 5h 10%  │  git: main')
  })
})
