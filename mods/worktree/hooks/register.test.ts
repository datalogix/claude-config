import type { PromptComposeInput } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

describe('the worktree instruction', () => {
  const input: PromptComposeInput = {
    model: 'm',
    promptModel: 'm',
    surfaces: ['terminal'],
    tools: [],
    outputStyle: null,
    traits: [],
  }

  test('adds the instruction to the system prompt, after the sections already there', async ($, on) => {
    on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'x', scope: 'session' }] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections.map((s) => s.id)).toEqual(['base', 'worktree:instruction'])
    expect(sections[1]).toMatchObject({ scope: 'session' })
    expect(sections[1]?.text).toContain('pergunte se deve criar um git worktree')
    expect(sections[1]?.text).toContain('use a ferramenta EnterWorktree')
  })

  test('asks again for a new task in the middle of another, even after a refusal', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('não pergunte de novo nesta sessão, salvo no caso de uma tarefa nova')
    expect(sections[0]?.text).toContain('pergunte de novo, mesmo após uma recusa')
  })

  test('moves uncommitted changes only when that is the choice', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('Só se levar for a escolha, rode `git stash push -u`')
  })

  test('fetches the remote before creating the worktree', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('Antes do EnterWorktree, com remoto `origin`, rode `git fetch origin`')
  })

  test('checks the ignore rule with the trailing slash, since the folder does not exist in the worktree', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('`git check-ignore -q .claude/worktrees/`')
  })

  test('compares absolute git dirs, which also match in a subfolder of the main checkout', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('`git rev-parse --path-format=absolute --git-dir --git-common-dir`')
  })

  test('suggests another terminal only for a new task with uncommitted changes of another', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('Tarefa nova no meio de outra, com alterações não commitadas dela')
    expect(sections[0]?.text).toContain('Sem essas alterações, valem as regras acima.')
  })
})
