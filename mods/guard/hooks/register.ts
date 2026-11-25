import type { Register } from 'claude-code'
import { checkCommand } from './guard'

export const register: Register = (on) => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const reason = checkCommand(e.command)
    return reason === undefined ? next(e) : { deny: reason }
  }).catch(($, e, next) =>
    // A guard that fails would let the command run: refuse it instead, unless it already ran.
    next.called
      ? next(e)
      : {
          deny: 'guard: falhou ao analisar o comando e o bloqueou. O usuário pode rodá-lo ele mesmo com `!` no prompt.',
        },
  )
}
