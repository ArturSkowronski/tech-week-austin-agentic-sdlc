import { configDefaults, defineConfig } from 'vitest/config';

// The simulation and tool suites. The browser smoke specs under tests/smoke/
// belong to Playwright, and bugs/tests/ belongs to vitest.bugs.config.ts.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/smoke/**'],
    passWithNoTests: true,
  },
});
