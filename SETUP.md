# Setup before the workshop (about 15 minutes)

The whole workshop runs in GitHub Codespaces on your fork, in the browser. You install
nothing. Do it at home or in the office, not on conference Wi-Fi.

## You need

- a GitHub account (the free plan is enough: 120 core-hours a month, 30 hours on a 4-core machine),
- a browser logged in to GitHub.

A language model is not needed. You get a key in the room; until then the line works in replay mode
(recorded changes instead of a model).

## Steps

1. Fork https://github.com/ArturSkowronski/tech-week-austin-agentic-sdlc to your account.
2. On the fork: **Settings → General → Features**, tick **Issues** (the game's "Raise ticket on GitHub" opens an issue there).
3. On the fork: **Code → Codespaces → Create codespace on main** (a 4-core machine, 16 GB). The build takes about 5 minutes
   and installs everything: kind, kubectl, helm, argo, cosign, Node 22, pnpm, gh, Claude Code and `factory`.
4. In the codespace's terminal: `factory lesson 1`, then `factory start` (5 to 10 minutes the first time, it pulls images).
5. At the end `factory start` prints `make doctor`. Everything should be green.

Step by step with screenshots: README.md, Step 1.

## What `factory start` does

- creates the kind cluster `factory` in the codespace, with the UI ports forwarded by Codespaces (2746 Argo, 8082 kagent,
  16686 Jaeger; the **PORTS** tab),
- installs Argo Workflows (the line), kagent 0.10.1 (the agents), Kyverno (the policy) and Jaeger (the traces),
- creates the ModelConfig `factory-model` and the agent `probe`.

After the workshop delete the codespace at https://github.com/codespaces.

## If something does not work

- `factory: command not found`: the codespace has not finished building. Wait, then open a new terminal.
- `factory start` says too little memory: the codespace must be the 4-core machine. Create it again.
- `factory start` fails on a timeout: run it again; then `factory reset`.
- `ghcr.io … 403: denied` for kagent: `docker logout ghcr.io`, then `factory start`.
- The `kagent-controller` pods restart a few times at startup: they wait for Postgres, that is normal.
- A red `make doctor`: reply to the setup email with the output.
