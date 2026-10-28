# Start: from a fork to a working factory

The whole workshop runs in GitHub Codespaces, in the browser. You install nothing. Codespaces is free for GitHub
Free accounts: 120 core-hours and 15 GB a month, that is 30 hours of work on a 4-core machine. When the quota runs
out without a card on file, GitHub blocks further use; it does not send a bill.

1. Fork https://github.com/ArturSkowronski/tech-week-austin-agentic-sdlc to your own account: the finale opens
   issues and PRs on your fork, not in the instructor's repo.
2. On the fork: **Settings → General → Features → Issues** on. The game's **Raise ticket on GitHub** opens an issue there.
3. On the fork: **Code → Codespaces → Create codespace on main**. A 4-core machine, 16 GB.
   The container builds in about 5 minutes and installs kind, argo, cosign, Node 22, pnpm, gh, Claude Code
   and the `factory` tool by itself.
4. In the codespace's terminal: `factory lesson 1`, then `factory start` (about 10 minutes the first time).
5. Optional, with a model key: `factory key` (README, Step 3). Without a key everything works in replay.
6. 🎮 Play the game: **PORTS** tab → **🎮 Hobby Wizard (your repo)** (port 5173). Walk through the bush on the plateau and
   hold →: the wizard walks left. That is the bug the factory fixes in lesson 5.

The floor (Argo), Jaeger and the kagent dashboard are in the **PORTS** tab (2746, 16686, 8082); `factory urls`
prints clickable links. A codespace goes to sleep after 30 minutes of inactivity. After the workshop delete it at
github.com/codespaces.

## Getting around

| Command | What it does |
|---|---|
| `factory lesson N` | the repo on the tag `lesson-NN` (branch `work`, your changes go to `git stash`) and the cluster in the state of that lesson |
| `factory map` | which blocks of the factory work: from the agent in the cluster to the GitHub poller |
| `factory check N` | is the exercise of lesson N done; deterministic, no model |
| `factory solve N` | swaps in the solution (files from lesson N+1), deploys it to the cluster and prints every step |
| `factory autopilot N` | the autopilot prompt; in Claude Code simply `/factory-autopilot N` |
| `factory key` | the model key for the agents in the cluster (paste it after the prompt) |
| `factory reset` | the cluster from scratch, when the state cannot be saved |

You can start from any lesson. `factory lesson 7` puts the repo on lesson 7 with the solutions of 1–6 and
deploys to the cluster exactly what that lesson expects. Exercise 7 waits for you as a TODO.

## Block by block

| Lesson | The block that lights up | Kind of rule |
|---|---|---|
| 1 | an agent as a resource in the cluster; the `intake` agent that only asks | word |
| 2 | the MCP server with five tools; paths the agent cannot write to | wall |
| 3 | context L1–L5; routing by concept ownership | context |
| 4 | intake: no criteria, no work order | gate |
| 5 | the line in Argo: prepare, intake, builder, change | wall |
| 6 | gates: architecture rules, test weakening, secrets, mutation | gate |
| 7 | the oracle the agent cannot read | wall |
| 8 | risk, review with criteria, the rework loop | gate |
| 9 | a human in the line (suspend), the WIP limit, Kyverno on tools | policy |
| 10 | the signed ledger and one trace per work order | trace |
| finale | issue → line → PR → GitHub Actions | integration |

## Autopilot

Every lesson has a prompt for Claude that switches the repo and the cluster by itself, does the exercise, checks
it with `factory check`, and when it does not work out, swaps in the solution and shows the difference. At the end
it says which block lit up. All prompts: [autopilot.md](autopilot.md). The rule the autopilot does not break:
it never approves anything on behalf of a human.

Claude Code is installed in the codespace: `factory login` logs it in (README, Step 1). The model key for the
factory itself (the agents in the cluster) you get in the room: `factory key`. Without it everything works in replay.

## When something does not work

- `factory start` fails on kind: the machine is too small. A 4-core codespace with 16 GB is the minimum.
- Runs hang as Pending: the WIP limit of 3 and one shared disk. Wait, or `argo stop -n factory --all`.
- The cluster's state is odd after jumping back between lessons: `factory reset`.
