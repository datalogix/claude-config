import type { Register } from 'claude-code'

const WORKTREE_INSTRUCTION = [
  'Worktrees: vale só para a conversa principal, não para subagentes, e só com alguém para responder.',
  'Em um repositório git, antes da primeira alteração de arquivos de uma tarefa, pergunte se deve criar um git worktree',
  'para ela; se a resposta for sim, use a ferramenta EnterWorktree com um nome curto da tarefa (ex.: fix-checkout).',
  'Antes do EnterWorktree, com remoto `origin`, rode `git fetch origin`, pois, por padrão, o worktree parte da branch',
  'padrão do remoto; se falhar, avise que ele pode partir de um commit antigo e siga.',
  'Se a branch atual não for a padrão ou tiver commits não enviados, diga na pergunta que o worktree parte da branch',
  'padrão, sem esses commits.',
  'Não pergunte em tarefas só de leitura, nem se a sessão já estiver em um worktree',
  '(`git rev-parse --path-format=absolute --git-dir --git-common-dir` mostra dois caminhos diferentes).',
  'Se a resposta for não, não pergunte de novo nesta sessão, salvo no caso da próxima frase.',
  'Tarefa nova no meio de outra, com alterações não commitadas dela: pergunte de novo, mesmo após uma recusa;',
  'se a sessão já estiver em um worktree, não crie outro: sugira abrir outro terminal com `claude --worktree <nome>`.',
  'Sem essas alterações, uma recusa continua valendo.',
  'Alterações não commitadas não acompanham o worktree: ao perguntar, se houver alguma, ofereça deixá-las na pasta',
  'atual (recomendado) ou levá-las ao worktree, avisando que levar pode dar conflito com a base dele e desfaz o que',
  'está em stage. Só se levar for a escolha, antes do EnterWorktree rode `git stash push -u -m "worktree-<nome>"` e,',
  "logo em seguida, `git rev-parse 'stash@{0}'`, para guardar o sha da entrada, pois a pilha é compartilhada entre",
  'worktrees; se o `push` falhar, não crie o worktree: pare e avise. Depois do EnterWorktree, rode',
  '`git stash apply <sha>`; se der certo, rode `git stash drop` com o índice que',
  "`git stash list --format='%gd %H'` mostrar para esse sha. Se o EnterWorktree falhar, restaure na pasta atual com o",
  'mesmo `git stash apply <sha>`. Se a restauração falhar por qualquer motivo, pare e avise, pois o stash continua',
  'guardado.',
  'Depois de criar o worktree, avise se `.claude/worktrees/` não estiver ignorado pelo git no checkout principal, onde',
  'a pasta fica: `git -C <raiz> check-ignore -q .claude/worktrees/`, sendo <raiz> a primeira linha `worktree` de',
  '`git worktree list --porcelain`.',
].join(' ')

export const register: Register = (on) => {
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)

    return { sections: [...sections, { id: 'worktree:instruction', text: WORKTREE_INSTRUCTION, scope: 'session' }] }
  })
}
