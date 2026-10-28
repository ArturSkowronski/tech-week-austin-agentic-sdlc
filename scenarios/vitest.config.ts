// Copied by sdlc/scenarios.py next to the staged scenarios in system/.oracle/, so the scenarios
// resolve vitest and the game from system/. Never part of `pnpm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['.oracle/**/*.test.ts'],
    passWithNoTests: false,
  },
});
