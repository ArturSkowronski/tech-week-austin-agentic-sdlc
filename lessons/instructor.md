# Instructor's notes

The workshop's metric: **reveals per minute**. A reveal is the moment something green turns out to be
wrong, or the factory does something the room does not expect. The plan: 12 reveals in 120 minutes.

## Reveals

| # | Minute | Lesson | Reveal | What must be ready |
|---|---|---|---|---|
| 1 | 0:03 | opening | A fix for "the keys are swapped" goes to `render`, because the report talks about keys and the keyboard; the bug lives in `game/sim` | a demo cluster, `make route O=hw-001` without `owns` |
| 2 | 0:08 | 1 | `kubectl get agent`: an agent is a Deployment and a Service, the A2A card under `.well-known` | the participants' clusters |
| 3 | 0:19 | 2 | The builder writes `sdlc/policy.json`, because the server has no list of protected paths | the builder agent, an empty `PROTECTED_PATHS` |
| 4 | 0:30 | 3 | "keys" and "keyboard" beat "creature": routing explained with numbers | `make route O=hw-001` on the projector |
| 5 | 0:41 | 4 | The factory sends the double jump back with questions from the agent | `make intake O=double-jump` |
| 6 | 0:52 | 5 | The same graph, a real agent: tool calls one by one, `run_build` green, the patch in `game/sim/input-map.ts` | keys handed out, `make order O=hw-001` |
| 7 | 1:03 | 6 | The startle with `Math.random()` passes every gate; a replay is no longer a replay | `make naive` |
| 8 | 1:14 | 7 | The incident of September 30 is caught by a scenario before anyone reads the code: the wizard hangs in the air; the vault stays closed | `make replay O=startle` |
| 9 | 1:25 | 8 | The `rework` node is the whole line again; attempt 2 holds the input, not the physics | the startle run with two attempts |
| 10 | 1:36 | 9 | The line turns yellow; `make approve` and a name in the ledger; Kyverno rejects the bad agent | suspend, the CEL policy |
| 11 | 1:47 | 10 | One word in the ledger and the chain points at the line, the signature breaks | `make ledger-verify` |
| 12 | 1:52 | close | The floor: every run in the room in the Argo UI, the builder's traces in Jaeger | the Argo UI on the projector |

Between the reveals there are slides with the thesis. Every thesis has proof from the repo, not from the internet.

## Before the workshop

| When | What |
|---|---|
| by Oct 22 | Repo public: https://github.com/ArturSkowronski/tech-week-austin-agentic-sdlc, `main` = lesson 10 + finale, tags `lesson-01` … `lesson-10` after `scripts/restack.sh`. The last restack before participants fork, none after (forks keep copies of the tags). |
| by Oct 22 | The solution of exercise 6 (`sim_is_deterministic`) is in the commit of lesson 7. `make test` green, `make naive` red on lint. |
| by Oct 22 | Send the setup email (`lessons/setup-email.md`). Fill in the room. |
| Oct 26 | Go through it clean: `kind delete cluster --name factory`, `factory start`, `factory lesson 2`, `make doctor`, `make replay O=hw-001`, `make order O=startle`. Measure the times. |
| Oct 27 | Go through the finale on your own fork: `make github`, `make issue O=hw-001`, `make pull AGENT=replay`. A PR with label `factory:human`, the checks green, the link to the trace works. `make issue O=hud-speed`: auto-merge. |
| Oct 27 | Generate the model keys (OpenRouter or Claude API) with a spending limit each. Print them on cards. |
| Oct 28 | Record the screen with reveals 6, 8 and 9 (plan B when the network or the model fails). Send the follow-up email (`lessons/setup-email-followup.md`). |
| Oct 28 | The demo laptop: a cluster with runs of HW-001 (without `owns` and with `owns`), the startle (2 attempts, approved) and the naive change. The floor open. |
| after the workshop | Revoke the model keys. |

Cost: a builder attempt on Sonnet 5 is in the order of tens of cents, the review lenses cost cents. Check the
estimate on the clean run from Oct 26 before you set the key limits.

## The slides

| File | What for |
|---|---|
| `lessons/slides-austin.html` | The deck for the projector: the thesis of each lesson, the reveals, the commands and the expected output |

Screenshots of the Visdom variant of each lesson are in `lessons/images/visdom/`.

### The thread: the builder's card

The slides hold one thread. **The cold open** shows a green fix for HW-001 in the wrong module and reveals that
everything worked by the rules, only there were no rules. The same work order comes back in lesson 3 as the routing
table, in lesson 5 as a run with a real agent, and in the finale as a PR.

**After each exercise the builder's card gets one new rule** and a label saying what that rule really is: word,
context, wall, gate, policy or trace. The card grows lesson by lesson, from one rule to ten.

| # | Lesson | Rule | Kind |
|---|---|---|---|
| 1 | 1 | Ask about what is missing. Do not propose solutions. | word |
| 2 | 2 | You cannot write to `sdlc/`, `platform/`, `scenarios/`, `system/architecture`, `system/bugs/tests`. | wall |
| 3 | 3 | The creature, the controls and the movement belong to `sim`. ADR-011. | context |
| 4 | 4 | No work order without acceptance criteria. | gate |
| 5 | 5 | You get the task over A2A. You never see the model key. | wall |
| 6 | 6 | In `game/sim` no `Math.random`, `Date` or timers. | gate |
| 7 | 7 | The directory `scenarios/` does not exist for you. | wall |
| 8 | 8 | Hold the wizard's input, not his physics. | gate |
| 9 | 9 | High and critical risk waits for a human. Tools: the workshop only. | policy |
| 10 | 10 | Every call is in the signed ledger. | trace |

At the start you announce **a bet**: how many of the ten rules will turn out to be a plain sentence in the prompt?
The close settles it: one. The other nine work even when the model has a bad day or someone swaps the prompt.
That is the punchline of the workshop, and INC-2026-09-30 is its shortest proof: the incident is in the agent's
context from lesson 3 (AGENTS.md, L5), and attempt 1 of the startle still hangs the wizard in the air. The context did
not stop it; the oracle scenario (lesson 7) did.

## Running order (120 min)

| Time | Block |
|---|---|
| 0:00 | Opening, thesis, levels of autonomy, the CNCF stack |
| 0:05 | Lesson 1: the cluster and the first agent |
| 0:16 | Lesson 2: the workshop and the tools |
| 0:27 | Lesson 3: context L1–L5 |
| 0:38 | Lesson 4: intake, keys (`factory key`) |
| 0:49 | Lesson 5: the line |
| 1:00 | Lesson 6: quality control |
| 1:11 | Lesson 7: the oracle |
| 1:22 | Lesson 8: risk, review, rework |
| 1:33 | Lesson 9: lights, WIP, policy |
| 1:44 | Lesson 10: the trace |
| 1:55 | Close: the floor, the map, the end |

If you are late: lessons 3 and 4 as a demo (no exercises), lesson 10 only reveal 11.
Exercises you must not skip: 2 (protected paths), 6 (the architecture rule), 9A (suspend).

## Codespaces, factory and the autopilot

The participant's default road is a fork and GitHub Codespaces (`.devcontainer/`, a 4-core machine, 16 GB).
Nothing to install on the laptop, and the free quota of GitHub Free (120 core-hours) is enough for 30 hours.
Ask the room to run `factory start` before the workshop: the first cluster takes about 10 minutes.

The `factory` tool is installed outside the repo, so jumping between tags does not remove it:

| Situation in the room | What you say |
|---|---|
| someone is late or lost | `factory lesson N`: the repo and the cluster in the state of lesson N, changes in stash |
| nobody knows whether the exercise is done | `factory check N`: deterministic, no model |
| the exercise does not work out | `factory autopilot N` (starts Claude Code), the ready variant in `solutions/lesson-NN/`, as a last resort `factory solve N` |
| nobody understands what we have built so far | `factory map` on the projector: the factory's blocks light up lesson by lesson |
| the cluster in a strange state | `factory reset` (10 minutes, so rather a break) |
| the ports are taken on a laptop | `.factory.env` with other ports, then `factory reset` |

The autopilot never approves for a human: at `make approve` and at the PR it stops and asks.
A good moment for the sentence from lesson 9, shown live.

## The finale on GitHub

`lessons/final-github.md`, 12 minutes. It does not fit the running order without a cut: run lessons 3 and 4 as a demo
without exercises (about 16 minutes saved), the finale after lesson 10, the close stays. The reveal of the finale: a
manual commit on the agent's branch and a red `provenance` check ("code changed after the commit in the ledger").

A good second beat: the game's own "Raise ticket on GitHub" button opens the same kind of issue as `make issue O=hw-001`
(labels `bug`, `planted`, ADR-006), and the poller takes it the same way.

What must work for the participant: the fork as `origin`, `gh auth login`, network to GitHub. Without network you show
the finale from the demo laptop, and the participants run `make replay O=hw-001`.

## Plan B

| Problem | What you do |
|---|---|
| The model does not answer or the limit ran out | `make replay O=…`. Every lesson works on recordings, the rework loop included (attempt 1 and attempt 2 of the startle are recorded). Review without a model stays on its regex rules. |
| The Wi-Fi is down | Nothing happens: the cluster, the images and `system/node_modules` are on the laptop or in the codespace. Only the model needs the network. |
| A participant is stuck | `factory lesson N`. Their changes land in `git stash`. |
| The image build failed for a participant | Repeat `factory lesson N`; if it fails again, Codespaces or pair with a neighbour. |
| A run takes too long | Show a finished run from the demo laptop, leave the current one in the background on the floor. |
| Someone has no cluster | They pair with a neighbour. |

## Known behaviours

- Everything is in English: the instructions for the models (the agents' systemMessage, the builder's prompt, the
  review lenses, the MCP tool descriptions, the `AGENTS.md` skeleton), the materials and the organization's documents
  (Hobby Wizard's ADRs, the incident).
- `platform/kagent/modelconfig.yaml` has `${LLM_MODEL}` and `${LLM_BASE_URL}`: deploy it with `factory key` (on main also
  `make key`) or `make cluster`, not `kubectl apply -f platform/kagent/` on the whole directory (that breaks the ModelConfig).
- A finding from the previous edition: a Java test library printed text addressed to AI agents in the test log, and
  the agent reads the build log as input. The build gate flags such text ("The tool log contains text addressed to AI
  agents"). A supply-chain story worth telling in lesson 6.
- `kagent invoke` in CLI 0.10.1 does not decode the answer (error `ClientResponse.error.data`).
  Everything goes through `sdlc/a2a.py` (JSON-RPC `message/send`). The CLI is for `install` and `dashboard`.
- A freshly deployed agent is `Ready` a moment before its pod accepts connections.
  `a2a.py` retries "connection refused" a few times.
- We pin kagent 0.10.1 in `scripts/cluster.sh` (`KAGENT_VERSION`). Newer kagent releases have another API.
- Port 8083 of kagent has no authentication (the identity comes from the `X-User-Id` header). It stays in the cluster.
- The `/work` disk is one (ReadWriteOnce, one kind node). Two runs of the same work order at once overwrite each
  other's branch. The WIP semaphore does not protect against that: a deliberate simplification of the workshop.
- Helm on macOS in a session without a TTY cannot pull an OCI chart (keychain). In the participants' terminals it works;
  if not, `KAGENT_CHART` and `KAGENT_CHART_CRDS` in `scripts/cluster.sh` accept a path to a `.tgz`.
- The Argo controller sends traces (OTLP to Jaeger) and gives the steps `TRACEPARENT`. `sdlc/a2a.py` passes it on to
  kagent, so the agent's spans are in the run's trace. Argo's trace has many controller spans
  (`reconcileTaskResult` etc.): in Jaeger filter the service `factory-line` or collapse the tree to the steps.
- Only the ledger step mounts the cosign key, only `step-github` gets the GitHub token. The build of the agent's code
  has no secrets.
- A blocking review finding escalates to a human, not to a rework. The model advises, a human decides; only the
  deterministic gates force a rework.
- `game/sim` is the critical path (ADR-011): every change there ends at a human, also in replay. A lights-out run
  needs a low-risk work order with its own scenarios: `hud-speed` (`game/render`).
- `make test` needs `system/node_modules`: the first call runs `pnpm install --frozen-lockfile` (a minute or two
  without the cache). Codespaces does it when the container is created.
