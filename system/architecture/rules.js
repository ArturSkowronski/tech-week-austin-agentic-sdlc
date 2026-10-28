// The architecture rules of Hobby Wizard: the structural gate of the factory (lesson 6).
//
// Each rule is an ESLint flat-config block with a name and a reason. The reason is the message
// `pnpm lint` prints on a violation, and sdlc/context.py copies it into AGENTS.md, so one rule is
// a gate for the build and context for the agent at the same time. Keep `because` one string
// literal on one line: the context compiler reads it with a regular expression.
//
// eslint.config.js spreads `architecture` into the config. The agent cannot change this
// directory: the workshop MCP server rejects writes under system/architecture/ (lesson 2).

/** One rule: `files` it applies to, and the ESLint rules built from its reason. */
function rule(name, because, files, build) {
  return { name: `architecture/${name}`, files, rules: build(because) };
}

export const architecture = [
  rule(
    'sim_does_not_import_render',
    'game/sim is the pure simulation and never imports the renderer or PixiJS, see docs/plan/02-design/simulation-architecture.md',
    ['game/sim/**/*.ts'],
    (because) => ({
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/render', '**/render/**', 'pixi.js'], message: because }] }],
    }),
  ),
  rule(
    'sim_has_no_browser',
    'game/sim runs in Node, in a test and in a replay: no window, document, localStorage or fetch, see docs/plan/02-design/simulation-architecture.md',
    ['game/sim/**/*.ts'],
    (because) => ({
      'no-restricted-globals': ['error', ...['window', 'document', 'localStorage', 'fetch', 'navigator'].map((name) => ({ name, message: because }))],
    }),
  ),
  rule(
    'game_does_not_log',
    'game/ reports through WorldState.events and the waterfall of logs, not console; a console line is noise a visitor never sees, see AGENTS.md',
    ['game/sim/**/*.ts', 'game/render/**/*.ts'],
    (because) => ({
      'no-restricted-properties': ['error', { object: 'console', message: because }],
    }),
  ),
  rule(
    'sim_is_deterministic',
    'game/sim is deterministic: randomness comes from nextRandom(state) and time from state.tick, never Math.random, Date, performance.now or timers, so a replay stays a replay, see docs/plan/02-design/simulation-architecture.md',
    ['game/sim/**/*.ts'],
    (because) => ({
      'no-restricted-syntax': [
        'error',
        ...[
          "MemberExpression[object.name='Math'][property.name='random']",
          "NewExpression[callee.name='Date']",
          "MemberExpression[object.name='Date']",
          "MemberExpression[object.name='performance']",
          "CallExpression[callee.name=/^(setTimeout|setInterval|requestAnimationFrame)$/]",
        ].map((selector) => ({ selector, message: because })),
      ],
    }),
  ),
];
