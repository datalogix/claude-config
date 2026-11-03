// @ts-check
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // tests/skills.test.js imports mods/topics/hooks/parse.ts, whose tsconfig extends types that only exist after
  // Claude Code loads the mod (not in git), so don't load tsconfigs to strip the types.
  // The cast: tsconfig is left out of OxcOptions, though Vite passes it through to the transform.
  oxc: /** @type {import('vite').OxcOptions} */ ({ tsconfig: false }),
  // The mods' own tests import 'claude-code/testing' and run only with "claude plugin test".
  // The installer tests spawn the real CLI and a shell for each claude call, which can take seconds on a busy machine.
  test: { dir: 'tests', testTimeout: 30_000 },
})
