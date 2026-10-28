# The same factory in Visdom

The workshop builds a software factory from Linux Foundation parts: kind, kagent,
Argo Workflows, Kyverno, OpenTelemetry with Jaeger, Sigstore cosign. This directory
shows each lesson again in **Visdom**, VirtusLab's AI-native SDLC platform. It runs
in a local kind cluster, on the demo project **Hobby Wizard**: a small browser game
with a planted bug, `VirtusLab/visdom-sandbox-hobby-wizard`. Every run is recorded
in Visdom: the orchestrator keeps the run history and the audit log, and TraceVault
(Visdom AI Tracing) keeps the agent sessions.

Agents run the Codex CLI on OpenAI models (`gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`).
Nothing goes to GitHub. Issues and pull requests live in a local Gitea that
mirrors the game's repository.

## Addresses and login

| What | URL |
|---|---|
| Visdom orchestrator | http://orchestrator.localhost:18080 |
| Control Plane | http://control-plane.localhost:18080 |
| TraceVault (AI Tracing) | http://ai-tracing.localhost:18080 |
| Gitea (Hobby Wizard issues and PRs) | http://git.localhost:18080/visdom/hobby-wizard |
| Keycloak (realm `visdom-local`) | http://keycloak.visdom.localtest.me:18080 |

Log in as **`dev` / `devlocal`**. This is the local realm's development user; the
orchestrator role is `admin`. In the orchestrator, pick the project **Hobby
Wizard** in the left rail. Gitea pages need no login. The Gitea user `visdom` has
its password in `~/.config/visdom-local/gitea-password`.

The browser addresses are `*.localhost` on purpose. The SPAs use PKCE, which
needs `crypto.subtle`, and browsers expose that only in a secure context. Plain
`http://*.visdom.localtest.me` is not a secure context and the UI hangs at
"Signing in…". `http://*.localhost` is a secure context. Chrome resolves it to
127.0.0.1 without any `/etc/hosts` entry.

## What runs where

All of it runs in the kind cluster `visdom-local` (context `kind-visdom-local`).
Ingress listens on host port 18080.

| Namespace | Pods | From |
|---|---|---|
| `visdom` | keycloak, postgres, redis, control-plane, ai-tracing, ai-tracing-web | already there (`visdom-ai-gateway/deploy/local-cluster`) |
| `visdom-orchestrator` | `vp-server` (orchestrator API and UI), `gitea`, one pod per node of every run | `cluster/orchestrator.yaml`, `cluster/gitea.yaml` |
| `ai-gateway` | Visdom AI Gateway (LiteLLM) | already there; these flows do not use it |

The orchestrator stores its data in the `orchestrator` database on the shared
postgres. The run images come from the registry container `kind-registry`, at
`localhost:5001`:

| Image | What it is |
|---|---|
| `visdom/vp-server:main` | vp-server and its SPA, built from `visdom-orchestrator` main (v0.16.1) |
| `visdom/outbox-sidecar:main` | the outbox sidecar of every run pod, same commit |
| `visdom/runtime-demo:4` | the image every agent and task runs in: Codex 0.160.1, Claude Code, the TraceVault CLI 0.28.3, the runtime kit of main, Hobby Wizard's dependencies (`runtime/Dockerfile`) |

## Lessons in Visdom

Manifests are in `lessons/`. They are config-as-code in the shape of VAC
(`AgentDefinition`, `FlowTemplate`), referenced by name. `scripts/provision.py`
creates them in the project and publishes them. A changed manifest becomes a new
version, and a run stays pinned to the version it started with.

| # | Workshop | In Visdom | Manifest | Status |
|---|---|---|---|---|
| 1 | kagent `Agent` CRD | `AgentDefinition` `hw-guide`: versioned, image pinned by digest, driver codex, model `gpt-5.4-mini`, secret allow-list | `00-library.yaml`, `01-agent.yaml` (`l01-first-agent`) | **ran** |
| 2 | MCP server `workshop` + Kyverno allow-list | the executor gets only `OPENAI_API_KEY`; the Gitea token sits on two deterministic tasks; no MCP servers; an egress allow-list as a governance policy | `02-tools.yaml` | configured. The secret boundary is real in every run. The egress list is recorded and audited, but not enforced here (no run NetworkPolicies on this kind cluster) |
| 3 | `context.py` → AGENTS.md L1–L5 | Task `hw-context` compiles L1–L5 deterministically; every agent gets it as an input | `03-kontekst.yaml` (`l03-context`) | **ran** |
| 4 | agent `intake` asks questions | `hw-intake` asks through Human Input (`vp-ask`, the internal API of `ask_user`) when the issue has no checkable expectation | `04-intake.yaml` (`l04-intake`) | **ran**: issue #2 → a question → an answer → a spec |
| 5 | Argo WorkflowTemplate `factory` | `FlowTemplate` `l05-line`: checkout → issue → context → intake → executor (Codex, `gpt-5.4`) → branch in Gitea | `05-line.yaml` | **ran**: HW-001 fixed in about 90 s |
| 6 | DAG `quality` | `parallel` → four Task gates (`typecheck`, `lint`, `test`, `bugs:check`) → `join` → `decision` | `06-gates.yaml` (`l06-gates`) | **ran**: green on main and on the fix branch |
| 7 | holdout scenarios (the oracle) | Task `hw-holdout` runs main's paired bug tests against the branch and answers only pass or fail | `07-oracle.yaml` (`l07-oracle`) | **ran**: main is red on the oracle only, the fix is green |
| 8 | `risk.py` + LLM review lenses | Task `hw-risk` (deterministic level) + `hw-review` (Codex `gpt-5.5`, a different model from the executor's) | `08-review.yaml` (`l08-review`) | **ran**: the review escalated a real defect, see below |
| 9 | `human`/`wait` suspend + `policy.json` | `decision` (lights-out only for low/medium risk with an approving review) → `approval` node, role `admin`, plus an approval policy on the flow | `09-policy.yaml` (`l09-approval`) | **ran**: one run rejected with a reason, the finale approved |
| 10 | ledger + cosign + Jaeger | the orchestrator's hash-chained, sealed audit log; TraceVault sessions per agent node, grouped by flow run; TraceVault's signed chain (Compliance → Verify) | `10-trace.yaml` (nothing to provision) | **recorded** for every run above |
| final | issue → PR on GitHub | label an issue `planted` in Gitea → webhook → `hw-issue-to-pr`: the whole line, with `l07-oracle` as a sub-flow, human approval, a PR in Gitea | `11-final.yaml` | **ran** twice: Gitea label → webhook → PR #3; run by hand with the final manifests → PR #4 |

The L8 finding is a good story for the room. The first L5 run committed a
`node_modules` symlink. The checkout task creates it, and `.gitignore` says
`node_modules/`, which does not match a symlink. The tests and the gates were
green. The review lens (`gpt-5.5`) flagged the symlink as blocking, the L9 line
sent the change to a person, and the person rejected it. The checkout task now
excludes the symlink, and the finale PR touches only the 3 files it should.

### Running a lesson

```bash
cd visdom
python3 -I scripts/run-flow.py l01-first-agent question="How does keyboard input become movement?"
python3 -I scripts/run-flow.py l03-context ref=main
python3 -I scripts/run-flow.py l04-intake issue=2          # waits: answer in Human Input
python3 -I scripts/run-flow.py l05-line issue=1            # prints the branch it pushed
python3 -I scripts/run-flow.py l06-gates ref=main          # or ref=<branch from l05>
python3 -I scripts/run-flow.py l07-oracle ref=main         # red on the oracle by design
python3 -I scripts/run-flow.py l08-review ref=<branch> spec="<spec from l05>"
python3 -I scripts/run-flow.py l09-approval ref=<branch> spec="<spec from l05>"   # waits in Approvals
```

You can also start a flow in the UI: Build → Flows → Run. `run-flow.py --follow
<run id>` follows a run that is already going.

The finale, live: open the issue in Gitea, remove the `planted` label and add it
again. The issue can also be a new one that has the label from the start. The
webhook starts `hw-issue-to-pr`. It stops at Approvals. Approve it, and the PR
link comes back in the run's outputs and as a comment on the issue. A run takes
about 4 minutes before the approval.

## Bring it up

### Once, cold (images)

```bash
visdom/scripts/build-images.sh        # vp-server, outbox sidecar, runtime-demo; offline-friendly
```

This builds from `~/Projects/visdom-orchestrator-main` in a detached worktree,
`~/visdom-demo-build/orchestrator`, and commits nothing there. The Rust code is
compiled in `rust:1.98-slim-trixie` against the host's cargo registry, so no
crates are downloaded. The script's header lists what it needs locally.

### From stopped (laptop restarted, Docker restarted)

```bash
visdom/scripts/up.sh
```

`up.sh` is idempotent. It does the following:

1. Starts the kind node and the registry containers.
2. Scales the unrelated `outboard` prototype to 0.
3. Patches the Keycloak realm with the `*.localhost` redirect URIs.
4. Adds the `*.localhost` hosts to the Control Plane and AI Tracing ingresses, and sets their suite links.
5. Creates the `orchestrator` database.
6. Generates the orchestrator's keys and the TraceVault ingest key into Kubernetes Secrets. Nothing is written to the repo.
7. Applies `cluster/*.yaml`.
8. Seeds Gitea (`scripts/gitea-seed.sh`).
9. Provisions the project (`scripts/provision.py`).

After a Docker restart, Control Plane and AI Tracing crash-loop for a minute or
two until Keycloak is up. That is expected; they recover by themselves.

Secrets it reads, never prints and never writes to the repo:
`~/.config/visdom-local/openai-api-key` (stored as the Control Plane project
secret `OPENAI_API_KEY`) and the Gitea token it creates itself.

### Stop

```bash
docker stop visdom-local-control-plane      # the whole cluster; data stays in the node's volume
```

Leave `kind-registry` running. Other kind clusters use it too.

### Reset (fresh run history, same images)

```bash
visdom/scripts/reset.sh      # deletes namespace visdom-orchestrator and the orchestrator database
visdom/scripts/up.sh         # recreates everything, seeds Gitea again, provisions again
```

A reset keeps Keycloak, Control Plane (project and secrets) and TraceVault.
TraceVault keeps the sessions of earlier runs.

## Files

| Path | What |
|---|---|
| `cluster/orchestrator.yaml` | vp-server in kind: namespace, RBAC, workspace PVC, config, Deployment, Ingress |
| `cluster/gitea.yaml` | the local Git forge |
| `lessons/*.yaml` | Tasks, Agents and Flows per lesson |
| `runtime/` | the run image: Dockerfile, the pnpm shim, the codex wrapper (see known bugs) |
| `scripts/up.sh`, `scripts/reset.sh` | bring up, reset |
| `scripts/build-images.sh` | the three images |
| `scripts/provision.py` | project, secrets, containers, agents, flows, webhook, policies |
| `scripts/gitea-seed.sh` | Gitea user, repo mirror, label, issues #1 and #2 |
| `scripts/run-flow.py` | start a flow by name and follow it |
| `scripts/screenshots.mjs` | headless Playwright screenshots for the slides (1600x1000, emails and tokens scrubbed) |

## Known bugs and workarounds

These are findings from bringing this up, written as notes for the product
teams. No issues were filed.

1. **Codex sessions never reach TraceVault (orchestrator runtime kit).** The
   entrypoint runs `tracevault init --global --agent codex`, which writes
   `$HOME/.codex/hooks.json`. It then starts codex with `CODEX_HOME=/work/.codex`,
   where no hooks exist. On top of that, codex 0.160 skips hooks in `codex exec`
   until hook trust is granted interactively. The CLI prints this, and suggests
   `--dangerously-bypass-hook-trust`. Result: zero sessions, and the run is green.
   Workaround in `runtime/codex-wrapper.sh`: copy the hooks into `$CODEX_HOME` and
   pass the flag to `codex exec`.
2. **Run pods get 500m / 512Mi unless the agent sets `resource_overrides`.** The
   container's `default_resources` are stored, but the flow launcher reads only
   `agent.resource_overrides` (`cpu_millis`, `memory_mib`, `ephemeral_mib`).
   Codex plus `tsc` was OOM-killed at 512Mi, and the node failed with no error
   text in the UI. `provision.py` sets 1 CPU / 1.5Gi on every block, and 2 / 2Gi
   on the executor and the review.
3. **The outbox sidecar cannot be registered through the API.**
   `POST /api/v1/containers` has no `kind`, and `PUT /system_settings/outbox`
   accepts only `kind=sidecar`. `from-registry` takes `kind` but needs GAR.
   `provision.py` sets the kind with one SQL update.
4. **`VP_RUNTIME_MODELS` must be JSON.** A comma-separated list crash-loops
   vp-server with `VP_RUNTIME_MODELS is not valid JSON`. Neither the chart
   values nor the env var name hint at the format.
5. **`@input.<name>` followed by a period is not substituted.** `.` is legal in
   port names, so `@input.context.` looks up the port `context.` and is left
   verbatim. The model then sees the raw token. The lesson prompts avoid a
   trailing period.
6. **TraceVault rejects `http://` git URLs** (`unsupported transport`). A
   checkout from the local Gitea cannot be registered. The checkout task names
   the codebase with an `origin` remote pointing at the GitHub URL, which is never
   fetched, and works through the `gitea` remote.
7. **Cost is $0.00 everywhere for these runs.** TraceVault has no prices for
   `gpt-5.4*` / `gpt-5.5`, and the orchestrator's node popover shows tokens `0 / 0`
   for Codex nodes. The token counts in TraceVault are real.
8. **Sessions of cancelled runs stay "active" in TraceVault.** The pod dies
   before codex's Stop hook runs.
9. **SPAs on non-secure http origins hang at "Signing in…".** This is why the
   demo uses `*.localhost`.
10. **The AI Gateway route is not wired.** Per-run gateway keys need the
    console's `/api/v1/service` API, which the local gateway build does not have.
    The OpenAI model would also have to be added to LiteLLM, and a NetworkPolicy
    would have to admit `visdom-orchestrator` to the gateway pods.
    `VP_AI_GATEWAY_URL` is set, but no agent has "Use AI Gateway" on.
11. **Codex in this image has no Python and no `apply_patch`.** The executor
    falls back to `perl` and heredocs. That works, but costs turns.
