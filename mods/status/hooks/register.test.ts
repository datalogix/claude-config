import type { AgentInfo, On, SessionMeasureInput, SessionRateLimit, TurnCompleteInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import {
  extractExcerpt,
  formatAgents,
  formatDuration,
  formatPlan,
  formatTimeLeft,
  formatWorkflows,
  planAlertLevels,
  projectName,
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
}

/** The agent list reads `agents`, which tests change in place. */
const setup = (on: On, { cwd = '/Users/dev/code/laude', notify }: SetupOptions = {}) => {
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
  expect(lastStatus()).toBe('⠋ Claude está trabalhando… 0:00')

  await clock.advance(200)
  expect(lastStatus()).toBe('⠙ Claude está trabalhando… 0:00')

  await clock.advance(62_000)
  expect(lastStatus()).toMatch(/^. Claude está trabalhando… 1:02$/)
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
  expect(lastStatus()).toBe('⠋ Claude está trabalhando… 0:00  │  🤖 agente: Procurar arquivos')

  agents.push(agent('a2', 'Rodar testes'), agent('a3', 'Ler docs', 'pending'), agent('a4', 'Velho', 'completed'))
  await clock.advance(1_000)
  expect(lastStatus()).toMatch(/│ {2}🤖 0\/3: Procurar arquivos \+2$/)
})

test('an agent waiting for approval still counts as active', async ($, on) => {
  const { agents, lastStatus } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  agents.push(agent('a1', 'Planejar', 'waiting'))
  await $.agent.spawn({ prompt: 'x', description: 'Planejar' } as never)

  expect(lastStatus()).toBe('⠋ Claude está trabalhando… 0:00  │  🤖 agente: Planejar')
})

test('the elapsed time rounds down to whole seconds', async ($, on) => {
  const { lastStatus, clock } = setup(on)

  await $.turn.start({ text: 'oi', turnId: 't1' })
  await clock.advance(1_800)

  expect(lastStatus()).toMatch(/^. Claude está trabalhando… 0:01$/)
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

  expect(lastStatus()).toMatch(/^. Claude está trabalhando… 0:11$/)
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
  expect(lastStatus()).toBe('⠋ Claude está trabalhando… 0:00')

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
  expect(lastStatus()).toBe('⠋ Claude está trabalhando… 0:00')

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
  expect(lastStatus()).toBe('📊 plano: 5h 34% (renova em 1h00) · semana 12%')
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
  expect(lastStatus()).toBe('📊 plano: 5h 74%')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 89.6 }]))
  expect(lastStatus()).toBe('📊 plano: 5h 89%')
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
  expect(lastStatus()).toBe('📊 plano: 5h 20% (renova em 1h00)')

  await clock.advance(60_000)
  expect(lastStatus()).toBe('📊 plano: 5h 20% (renova em 59min)')
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
  expect(lastStatus()).toBe('✅ pronto em 5s  │  📊 plano: 5h 10%')

  await $.prompt.submit({ text: 'de novo' } as never)
  expect(lastStatus()).toBe('📊 plano: 5h 10%')
})

const sessionEndInput = (reason: string) => ({ reason, sessionId: 's1', resume: {} }) as never

for (const reason of ['clear', 'resume']) {
  test(`a session ended by ${reason} drops the previous outcome and keeps the plan`, async ($, on) => {
    const { lastStatus } = setup(on)
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)

    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 10 }]))
    await $.turn.start({ text: 'oi', turnId: 't1' })
    await $.turn.complete(turnComplete(5_000))
    expect(lastStatus()).toBe('✅ pronto em 5s  │  📊 plano: 5h 10%')

    await $.session.end(sessionEndInput(reason))
    expect(lastStatus()).toBe('📊 plano: 5h 10%')
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
  expect(lastStatus()).toBe('⠋ Claude está trabalhando… 0:00')
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
    expect(lastStatus()).toBe('📊 plano: gasto 79%')
    await $.session.measure(measure([{ kind: 'spend_limit', percentUsed: 81 }]))
    expect(lastStatus()).toBe('⚠️ plano: gasto 81%')

    expect(toasts).toEqual(['⚠️ Você já usou 79% do plano (gasto)', '⚠️ Você já usou 81% do plano (gasto)'])
  },
)

test('a plan alert below 1 is treated as 1', { options: { planAlert: 0 } }, async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 0.4 }]))
  expect(lastStatus()).toBe('📊 plano: 5h 0%')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 1 }]))
  expect(lastStatus()).toBe('⚠️ plano: 5h 1%')
})

test('a plan alert above 100 is treated as 100', { options: { planAlert: 150 } }, async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 99 }]))
  expect(lastStatus()).toBe('📊 plano: 5h 99%')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 100 }]))
  expect(lastStatus()).toBe('⚠️ plano: 5h 100%')
})

test('an empty plan alert takes the default', { options: { planAlert: '' } }, async ($, on) => {
  const { lastStatus } = setup(on)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 89 }]))
  expect(lastStatus()).toBe('📊 plano: 5h 89%')
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
  expect(lastStatus()).toBe('📊 plano: 5h 3% (renova em 4h58)')

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
    ['```a`b\nFeito', '`a`b'],
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
  expect(formatPlan([{ kind: 'opus', percentUsed: 10 } as SessionRateLimit], 0, 90)).toBe('📊 plano: opus 10%')
})

test('the project is the last folder of the path', () => {
  expect(projectName('/Users/dev/code/laude/')).toBe('laude')
})

test('a path with no folder is its own project', () => {
  expect(projectName('/')).toBe('/')
})
