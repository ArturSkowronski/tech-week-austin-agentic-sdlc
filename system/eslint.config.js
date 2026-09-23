import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'public/assets/', 'test-results/', 'playwright-report/'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The sim/render split: game/sim/ is pure and knows nothing about drawing,
    // so a replay stays a replay (docs/plan/02-design/simulation-architecture.md).
    files: ['game/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render', '**/render/**', 'pixi.js'],
              message:
                'game/sim/ is the pure simulation: it never imports the renderer (docs/plan/02-design/simulation-architecture.md).',
            },
          ],
        },
      ],
    },
  },
);
