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
    expect(sections[0]?.text).toContain('não pergunte de novo nesta sessão, salvo no caso da próxima frase')
    expect(sections[0]?.text).toContain('pergunte de novo, mesmo após uma recusa')
  })

  test('moves uncommitted changes only when that is the choice', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('Só se levar for a escolha, antes do EnterWorktree rode')
    expect(sections[0]?.text).toContain('`git stash push -u -m "worktree-<nome>"`')
  })

  test('warns what taking the changes along can cost', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('levar pode dar conflito com a base dele e desfaz o que está em stage')
  })

  test('restores the entry it stored by sha, since the stash stack is shared across worktrees', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain("`git stash list --format='%H %gs'`")
    expect(sections[0]?.text).not.toContain('stash@{0}')
    expect(sections[0]?.text).toContain('`git stash apply <sha>`')
    expect(sections[0]?.text).toContain("`git stash list --format='%gd %H'`")
    expect(sections[0]?.text).not.toContain('git stash pop')
  })

  test('says what to do when the stash or the worktree fails', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('se o `push` falhar, não crie o worktree')
    expect(sections[0]?.text).toContain('Se o EnterWorktree falhar, restaure na pasta atual')
    expect(sections[0]?.text).toContain('Se a restauração falhar por qualquer motivo, pare e avise')
  })

  test('says that the worktree starts without the local commits', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('o worktree parte da branch padrão, sem esses commits')
  })

  test('fetches the remote before creating the worktree', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('Antes do EnterWorktree, com remoto `origin`, rode `git fetch origin`')
  })

  test('checks the ignore rule in the main checkout, where the folder is', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('`git -C <raiz> check-ignore -q .claude/worktrees/`')
    expect(sections[0]?.text).toContain('`git worktree list --porcelain`')
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
    expect(sections[0]?.text).toContain('Sem essas alterações, uma recusa continua valendo.')
  })

  test('offers, after EnterWorktree, only the setup steps that apply, as a Pendências list', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('Logo depois de um EnterWorktree bem-sucedido, veja o que falta')
    expect(sections[0]?.text).toContain('em `## Pendências` com um item `- [ ] (recomendo)` por ação')
    expect(sections[0]?.text).toContain('só os passos que se aplicam, nesta ordem')
    expect(sections[0]?.text).toContain('Se nada se aplicar, não ofereça.')
  })

  test('installs dependencies only when they are missing, from the lockfile', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('`composer install`, se houver `composer.json` e não houver `vendor/`')
    expect(sections[0]?.text).toContain('`npm ci` para package-lock.json')
    expect(sections[0]?.text).toContain('`pnpm install --frozen-lockfile`')
    expect(sections[0]?.text).toContain('`yarn install --frozen-lockfile`')
    expect(sections[0]?.text).toContain('`--immutable` no Yarn 2+')
    expect(sections[0]?.text).toContain('`bun install --frozen-lockfile`')
    expect(sections[0]?.text).toContain('se houver lockfile e não houver `node_modules/`')
  })

  test('copies .env from the main checkout and checks APP_KEY without printing either', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('copiar o `.env` da <raiz> com `cp`, sem nunca mostrar o conteúdo')
    expect(sections[0]?.text).toContain('`.worktreeinclude` que já o copiou faz o passo não se aplicar')
    expect(sections[0]?.text).toContain('`php artisan key:generate`, se houver `artisan`')
    expect(sections[0]?.text).toContain("`grep -q '^APP_KEY=$' .env`")
  })

  test('runs only the checked steps and does not retry a failure in a loop', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }) as never)
    const { sections } = await $.prompt.compose(input)
    expect(sections[0]?.text).toContain('Nunca rode sem o usuário marcar; rode os marcados nessa ordem')
    expect(sections[0]?.text).toContain('sem tentar de novo em loop')
  })
})
