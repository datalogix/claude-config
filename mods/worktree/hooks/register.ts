import type { Register } from 'claude-code'

const WORKTREE_INSTRUCTION = [
  'Worktrees: vale só para a conversa principal, não para subagentes, e só com alguém para responder.',
  'Em um repositório git, antes da primeira alteração de arquivos de uma tarefa, pergunte se deve criar um git worktree',
  'para ela; se a resposta for sim, use a ferramenta EnterWorktree com um nome curto da tarefa (ex.: fix-checkout).',
  'Antes do EnterWorktree, com remoto `origin`, rode `git fetch origin`, pois, por padrão, o worktree parte da branch',
  'padrão do remoto; se falhar, avise que ele pode partir de um commit antigo e siga.',
  'Não pergunte em tarefas só de leitura, nem se a sessão já estiver em um worktree',
  '(`git rev-parse --path-format=absolute --git-dir --git-common-dir` mostra dois caminhos diferentes).',
  'Se a resposta for não, não pergunte de novo nesta sessão, salvo no caso de uma tarefa nova no meio de outra.',
  'Tarefa nova no meio de outra, com alterações não commitadas dela: pergunte de novo, mesmo após uma recusa;',
  'se a sessão já estiver em um worktree, não crie outro: sugira abrir outro terminal com `claude --worktree <nome>`.',
  'Sem essas alterações, valem as regras acima.',
  'Alterações não commitadas não acompanham o worktree: ao perguntar, se houver alguma, ofereça deixá-las na pasta',
  'atual (recomendado) ou levá-las ao worktree. Só se levar for a escolha, rode `git stash push -u` antes do',
  'EnterWorktree e `git stash pop` depois; se o `pop` der conflito, pare e avise, pois o stash continua guardado.',
  'Depois de criar o worktree, avise se `.claude/worktrees/` não estiver ignorado pelo git',
  '(`git check-ignore -q .claude/worktrees/`, com a barra final, pois a pasta não existe dentro do worktree).',
].join(' ')

export const register: Register = (on) => {
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)

    return { sections: [...sections, { id: 'worktree:instruction', text: WORKTREE_INSTRUCTION, scope: 'session' }] }
  })
}
