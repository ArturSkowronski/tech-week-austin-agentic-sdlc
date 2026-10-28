import js from '@eslint/js';
import tseslint from 'typescript-eslint';

import { architecture } from './architecture/rules.js';

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'public/assets/', 'test-results/', 'playwright-report/', '.oracle/'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // The sim/render split and the other structural rules live in architecture/rules.js, each with
  // the reason it exists (docs/plan/02-design/simulation-architecture.md). The factory treats that
  // directory as a gate: an agent cannot edit it.
  ...architecture,
);
