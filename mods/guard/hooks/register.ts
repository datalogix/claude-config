import type { Register } from 'claude-code'
import { checkCommand, protectedPush, pushesOf } from './guard'

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

  // A push to main or master asks the user, even in bypassPermissions; a push of another branch keeps the verdict.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const command = (e.input as { command?: unknown }).command
    if (verdict.decision === 'deny' || typeof command !== 'string' || pushesOf(command).length === 0) return verdict
    const branchOf = async (dir: string | undefined) => {
      const argv = ['git', ...(dir === undefined ? [] : ['-C', dir]), 'branch', '--show-current']
      const ran = await $.process.run(argv, { cwd: await $.session.cwd(), timeoutMs: 5000 })
      return ran.exitCode === 0 ? ran.stdout.trim() || undefined : undefined
    }
    const reason = await protectedPush(command, branchOf)
    return reason === undefined ? verdict : { decision: 'ask' as const, reason: `guard: ${reason}` }
  }).catch(() => ({ decision: 'ask' as const, reason: 'guard: falhou ao conferir o destino do git push' }))
}
