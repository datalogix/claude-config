// @ts-check
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Mod tests import 'claude-code/testing' and run only with "claude plugin test".
  test: { dir: 'tests' },
})
