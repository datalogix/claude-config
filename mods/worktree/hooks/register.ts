import type { Register } from 'claude-code'

const WORKTREE_INSTRUCTION = [
  'Worktrees: vale só para a conversa principal, não para subagentes, e só com alguém para responder.',
  'Em um repositório git, antes da primeira alteração de arquivos de uma tarefa, pergunte se deve criar um git worktree',
  'para ela; se a resposta for sim, use a ferramenta EnterWorktree com um nome curto da tarefa (ex.: fix-checkout).',
  'Não pergunte em tarefas só de leitura, nem se a sessão já estiver em um worktree',
  '(`git rev-parse --git-dir` diferente de `git rev-parse --git-common-dir`).',
  'Se a resposta for não, não pergunte de novo nesta sessão, salvo no caso de uma tarefa nova no meio de outra.',
  'Tarefa nova no meio de outra: se houver alterações não commitadas de outra tarefa, pergunte de novo, mesmo após uma',
  'recusa. Se a sessão já estiver em um worktree, não crie outro: sugira abrir outro terminal com',
  '`claude --worktree <nome>`.',
  'Alterações não commitadas não acompanham o worktree: ao perguntar, se houver alguma, ofereça deixá-las na pasta',
  'atual (recomendado) ou levá-las ao worktree. Só se levar for a escolha, rode `git stash push -u` antes do',
  'EnterWorktree e `git stash pop` depois; se o `pop` der conflito, pare e avise, pois o stash continua guardado.',
  'Depois de criar o worktree, avise se `.claude/worktrees/` não estiver no `.gitignore`',
  '(`git check-ignore -q .claude/worktrees`).',
].join(' ')

export const register: Register = (on) => {
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)

    return { sections: [...sections, { id: 'worktree:instruction', text: WORKTREE_INSTRUCTION, scope: 'session' }] }
  })
}
