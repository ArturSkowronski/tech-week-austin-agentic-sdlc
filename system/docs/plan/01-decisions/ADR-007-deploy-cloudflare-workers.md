---
title: "ADR-007: Static site on Cloudflare Workers, deployed by GitHub Actions with wrangler"
date: 2026-09-08
status: accepted
kind: decision
---

# ADR-007: Static site on Cloudflare Workers, deployed by GitHub Actions with wrangler

## Decision

- The built `dist/` is served as Cloudflare Workers static assets with single-page-application not-found handling.
- GitHub Actions builds on every push and pull request, runs the gates, and deploys with wrangler: `wrangler deploy` from `main`, `wrangler versions upload --preview-alias <branch>` from any other branch, so every branch gets a preview URL. The workflow comments the URL on the PR.
- The deploy job needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets and is skipped until they exist. No secrets live in the repository.
- Previews are public and not gated.

## Why

Every fix branch needs a playable URL, which is the payoff of the whole loop. Cloudflare Pages still works but new projects are pointed at Workers. Cloudflare's git-connected build was not used because installing its GitHub app needs an organisation owner.
