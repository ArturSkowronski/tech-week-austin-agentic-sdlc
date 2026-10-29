# Finale: the factory on GitHub (12 min)

😬 **Problem:** so far everything ran inside your own cluster. Real work arrives as a GitHub issue and leaves as a pull request.

🛠️ **What we do:** we connect your fork. An issue becomes a task for the factory. The factory opens a pull request with the fix, its signed log and four automatic checks, and you approve it.

✅ **What you get:** the whole loop on real GitHub, plus proof of where the code came from: edit the agent's branch by hand and one check turns red.

## How it works

The line stays in your cluster. GitHub sits at both ends: an issue is the work order, a PR is the result, and
GitHub Actions run a second set of gates the agent cannot touch. Every PR includes the ledger, the signature and
the trace, so you can check where the code came from before it reaches `main`.

```
issue (label factory   ─▶ factory-pull ─▶ the line in Argo ─▶ PR on your fork ─▶ Actions ─▶ lights-out: merges itself
  or bug + planted)        every 2 min,     intake, agent,       description, card,  gates, oracle,  human: you
   │                       the oldest       gates, decision      ledger, the         review,
   │                       (the factory pulls)                   factory's review    provenance
   └◀── comment: questions (sent back) or andon ◀──┘
                     trace: Jaeger, from the Argo node down to the model and tool calls
```

| Part | Where |
|---|---|
| Issue → run | `platform/github/pull.yaml` (CronWorkflow `factory-pull`), `sdlc/github.py pull` |
| Run → PR | the `github` step in `platform/line/factory.yaml`, `sdlc/github.py pr` |
| Gates on GitHub | `.github/workflows/factory.yml`: `gates`, `oracle`, `review`, `provenance` |
| Provenance (where the code came from) | `sdlc/provenance.py`: the ledger's chain, the cosign signature, the commit in the ledger = the PR's code, the agent's boundaries |
| Trace | Argo (the run's trace) → `sdlc/tracing.py` (steps, tools) → kagent (agent, model) → Jaeger |

## Before the finale

Do this at home, together with [SETUP.md](../SETUP.md):

1. Your codespace is on your fork, so `origin` is already the fork (`git remote -v`).
2. Log `gh` in, in the codespace's terminal: `env -u GITHUB_TOKEN gh auth login -h github.com -s repo,workflow`. The codespace's own token cannot change
   repo settings, and `make github` would end with `HTTP 403 Resource not accessible by integration`. The
   [README finale](../README.md#-finale-the-factory-on-github) walks through `gh`'s questions. After **Authorize github**
   GitHub may ask for your password or 2FA again (**Confirm access**): confirm it.
3. Let `git push` use that login: `env -u GITHUB_TOKEN gh auth setup-git`. Without it a push from the codespace can hang.
4. The newest scripts: `git pull origin main` (branch `work` tracks nothing, so a plain `git pull` fails).
   If VS Code offers **Rebuild Now** for the dev container, ignore it.

## ✏️ Exercise 1: from issue to PR

1. Set up the finale: `factory lesson final`.
2. Check the remote: `git remote -v`.
   👀 You should see: `origin` is YOUR fork, not `VirtusLab/…`.
3. Check the login: `env -u GITHUB_TOKEN gh auth status`.
   👀 You should see: `Logged in`, with the scopes `repo` and `workflow`. `(GITHUB_TOKEN)` and `Token: ghu_…` mean the login did not work.
4. Connect the fork: `make github`. It turns on issues and Actions in the fork, creates the labels, protects
   `main` with four checks, uploads your cluster's cosign key to `main`, and creates the Secret
   `factory-github` and the poller `factory-pull` in the cluster.
   👀 You should see: what it set. If Actions could not be turned on: on the fork, the **Actions** tab → **I understand my workflows, go ahead and enable them**.
5. Raise the planted bug: `make issue O=hw-001`.
   👀 You should see: issue #N "HW-001: Left and right swap while the creature rides", with the labels `bug` and `planted`. Open it on GitHub.
6. Let the factory pick it up now, without waiting for the 2-minute poll: `make pull AGENT=replay`.
   🔑 With a model key: `make pull`.
7. Watch the run: `argo list -n factory`.
   👀 You should see: `factory-issue-N-…` Running, then Succeeded (a few minutes). The issue gets the label `factory:in-progress`.
8. Find the PR: `gh pr list`.
   👀 You should see: a pull request from the branch `agent/issue-N`.
9. Watch the checks: `gh pr checks <PR number> --watch`.
   👀 You should see: four checks turn green: `gates`, `oracle`, `review`, `provenance`. A fifth, `agentic-review`, is the
   review's findings uploaded as code scanning (SARIF).
10. Open the PR: `gh pr view <PR number> --web`. Look at:
    - the agent's description and the work order card with a link to the trace;
    - the factory's review as a PR review, with findings on lines of code;
    - the commit `factory: the ledger of work order issue-<n> …`, which adds `.factory/issue-<n>/` with the ledger and the signature;
    - the label `factory:human`. HW-001 changes `game/sim`, the critical path (ADR-010, ADR-011), so the PR waits for a human: no auto-merge. `Closes #<n>` closes the issue when someone merges it. Here the human approves on GitHub, not with `make approve`: on GitHub the line ends with the PR.
    - the `review` check says "LLM lenses: skipped": GitHub Actions has no agent, so it runs the deterministic rules. A red `review` step on the floor means a blocking finding sent to a person, not a crash.
11. Click the trace link.
    👀 You should see: one trace with the Argo run, the factory's steps (`attempt 1 · builder`), under them the agent (`invoke_agent`, `generate_content`, `execute_tool`) and the workshop tools (`workshop · write_file …`). The agent's refused attempts (✋) are red.
12. Run `factory check final`.
    🟢 You should see: `Secret factory-github in the cluster`, `poller factory-pull` and `the factory opened a PR on <your fork>`.

`make issue` uses the same title and labels as the game's "Raise ticket on GitHub" button (ADR-006), and it
also adds the `Criteria:` list from `orders/hw-001.md`. An issue raised straight from the game has no such list,
so the factory sends it back with questions (lesson 4).

`factory solve final` does not do this for you: it opens an issue and a PR on your fork. It prints the steps.

## ✏️ Exercise 2: provenance (6 min)

Before you approve the PR, add a "quick fix" by hand on the agent's branch. The `provenance` check notices
that the code is no longer the code the factory checked and signed.

```bash
git stash -u                 # put local files aside (your cluster's key would block switching branches)
git fetch origin && git switch agent/issue-<N>   # go to the agent's branch
echo "// quick fix" >> system/game/render/hud.ts
git commit -am "quick fix" && git push            # push a change nobody checked
sleep 30                     # give GitHub a moment to start the checks
gh pr checks <PR number> --watch   # 🔴 provenance: "code changed after the commit in the ledger"
git revert --no-edit HEAD && git push            # undo the quick fix
sleep 30
gh pr checks <PR number> --watch   # 🟢 provenance is green again
git switch work && git stash pop                 # back to where you were
```

👀 The job summary of the red `provenance` check says `code changed after the commit in the ledger: system/game/render/hud.ts`.
The code in the PR is no longer the code that passed the gates in the cluster. After the revert, review the PR as the human.

## 🎮 Play the PR

```bash
factory play agent/issue-<N>   # the game from the agent's branch, port 5174
```

👀 Compare it with the game on port 5173: the same bush, and the bug from the issue is gone.

![A fix of HW-001 (the lesson 5 patch): no creature in the bush, and holding → walks right.](images/gif/play-hw-001-fixed.gif)
<sub>A fix of HW-001 (the lesson 5 patch): no creature in the bush, and holding → walks right.</sub>

## A second round, if you have time

- `make issue O=hud-speed`, then `make pull AGENT=replay`. Low risk and covered by scenarios: the PR gets `factory:lights-out` and merges by itself once the checks are green.
- `make issue O=free`: intake sends the work order back, with the agent's questions in a comment under the issue. Write your own title and a `Criteria:` section in the issue, remove the label `factory:sent-back`, and the line takes it again.

## To discuss

- Actions take the gates and tools from `main`, never from the PR. An agent can propose a new rule in `system/architecture/rules.js`, but it applies only after a human merges it (lesson 10, enforced by GitHub).
- Only the `step-github` steps see the GitHub token, and only the ledger step sees the cosign key. The step that builds and tests the agent's code has no secret at all. Check it:
  `kubectl get workflowtemplate factory -n factory -o yaml | grep -B3 secretKeyRef`.
- A cluster in a codespace cannot receive a webhook from the internet, so the factory asks GitHub every two minutes. At work you swap that for a webhook or a GitHub App. The factory still pulls one work order at a time.

## Known limitations

- Jaeger all-in-one keeps traces in memory: a pod restart deletes them. The trace link in the PR works only in your codespace (a private port).
- One work order from GitHub at a time (the shared `/work` disk). A manual `make order` running alongside breaks the run.
- Without a network the finale does not work. Plan B: `make order O=… AGENT=replay` and the result from `make fetch`.
