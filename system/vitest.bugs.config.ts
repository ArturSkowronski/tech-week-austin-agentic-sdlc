import { defineConfig } from 'vitest/config';

// The paired tests of the planted bugs, run by `pnpm bugs:check` only
// (docs/plan/02-design/bug-quest.md); never part of `pnpm test`.
export default defineConfig({
  test: {
    include: ['bugs/tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
