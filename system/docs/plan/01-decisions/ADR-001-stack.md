---
title: "ADR-001: TypeScript, Vite, PixiJS for rendering, a hand-written simulation"
date: 2026-09-08
status: accepted
kind: decision
supersedes: "game-concept.md section 10, 'stack undecided'"
---

# ADR-001: TypeScript, Vite, PixiJS for rendering, a hand-written simulation

## Decision

| Layer | Choice |
|---|---|
| Language | TypeScript, strict, with `exactOptionalPropertyTypes` |
| Build and package manager | Vite 8, pnpm 11, Node 22 or newer |
| Rendering | PixiJS 8, rendering only; it never mutates the world |
| Simulation | hand-written, framework-free: a pure `tick(state, input)` at a fixed 60 Hz over JSON-serialisable state |
| Tests | Vitest 5 for the simulation and the tools; Playwright for a browser smoke test |
| Lint | ESLint flat config with typescript-eslint; `tsc --noEmit` |
| Tools | tsx for build-time scripts; sharp for raster work |

TypeScript is pinned to 6.x while typescript-eslint does not support 7.

## Why

Every planted bug is proven by an input replay that runs in Node in milliseconds, so the simulation must be a plain module we own. Type errors are the cheapest failed build an agent can get. PixiJS gives batching, tinting, additive blending and render textures for free and is widely known, so agents make few mistakes with it.

## Considered

- **Phaser 3.** Bundles physics, scenes and rendering into one lifecycle; Arcade physics is frame-rate dependent by default and cannot run headless in Vitest. Rejected: the test story is the demo.
- **Plain Canvas 2D.** Zero dependencies and it would work. PixiJS earns its place with cheap parallax layers, particles for the wand and render textures for the pixel-density model the prototype is settling.
- **Preact for an in-game panel.** Deferred with the panel itself; the Season 1 UI is drawn in Pixi.
