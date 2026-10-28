// @ts-check
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // tests/skills.test.js imports mods/topics/hooks/parse.ts, whose tsconfig extends types that only exist after
  // "claude plugin test" generates them (not in git), so don't load tsconfigs to strip the types.
  oxc: /** @type {import('vite').OxcOptions} */ (/** @type {unknown} */ ({ tsconfig: false })),
  // Mod tests import 'claude-code/testing' and run only with "claude plugin test".
  test: { dir: 'tests' },
})
