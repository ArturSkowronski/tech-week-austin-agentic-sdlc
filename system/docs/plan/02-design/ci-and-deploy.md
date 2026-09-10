---
title: CI, gates and deploy
date: 2026-09-10
status: accepted
kind: design
---

# CI, gates and deploy

## Scripts

| Script | Does |
|---|---|
| `pnpm dev` | Vite dev server at http://localhost:5173 with the trace endpoints |
| `pnpm trace` | dev server opened on the trace tool |
| `pnpm assets` | rebuilds `public/assets` from `assets/`; the only way art enters `public/` |
| `pnpm assets:report` | prints what the kit would build and why |
| `pnpm test` | Vitest, the simulation and tool suites under `tests/`, excluding `tests/smoke/` and `bugs/tests/` |
| `pnpm test:browser` | Playwright, the browser suite under `tests/smoke/`, against the built `dist/`; passes with no spec files |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm bugs:check` | the two-way planted-bug check |
| `pnpm build` | assets then `vite build` into `dist/` |

## Gates

Before a PR and in CI, all four must pass by exit code, never by grepping output:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm bugs:check
```

The build then fails on any asset output nothing consumes and on any file in `public/assets` that did not come from the kit. CI also runs `pnpm test:browser` after the build; it is required for merge like the gates, but it needs a browser, so it is not in the local four.

## Workflow

`.github/workflows/ci.yml`, on push to `main`, `stable`, `seed` and on every pull request:

1. `build` job on Ubuntu, Node 22, pnpm from `packageManager`, `pnpm install --frozen-lockfile`, the four gates, `pnpm build`, `pnpm exec playwright install --with-deps chromium`, `pnpm test:browser`, upload `dist` as an artifact.
2. `deploy` job, needs `build`, runs for pushes and for PRs from the same repository: downloads `dist`, and if `CLOUDFLARE_API_TOKEN` is set runs `wrangler deploy` on `main` or `wrangler versions upload --preview-alias <branch>` elsewhere, then comments the preview URL on the PR. The alias is the branch name lower-cased, non-alphanumerics to dashes, cut to 40 characters.

`wrangler.jsonc`: name `hobby-wizard`, assets directory `./dist`, single-page-application not-found handling, preview URLs on.

## Configuration

`.env.example`:

```
# GitHub repository that receives tickets raised from the game, as owner/name.
VITE_GITHUB_REPO=<owner>/<repo>
```

Repository secrets a human adds: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Nothing else is secret.

## Toolchain pins

pnpm 11, Node 22 or newer, Vite 8, Vitest 5, TypeScript 6.x, ESLint 10 with typescript-eslint 8, PixiJS 8, sharp, tsx. `pnpm-workspace.yaml` allows build scripts for esbuild and sharp. Local and CI run the same pinned toolchain with a frozen lockfile.
