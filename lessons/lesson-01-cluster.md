# Lesson 1: The cluster and the first agent (12 min)

😬 **Problem:** an AI agent is often a script someone runs by hand. Nobody knows which version runs, who changed its instructions last week, or what it may do.

🛠️ **What we do:** we start the agent in Kubernetes from a short config file, the same way you start a web service. Then you write its first instructions.

✅ **What you get:** an agent with a version, an owner and limits, that other parts of the factory can call. A change to its instructions shows up in Git.

## How it works

You write an `Agent` manifest (a YAML file). The kagent controller (the program that watches these files)
turns it into a Deployment, a Service and an A2A endpoint. A2A (Agent2Agent) is the protocol agents use to
call each other. You deploy an agent with the same tools you use for any service.

Every agent publishes an agent card at `/.well-known/agent-card.json`: what it can do and where to call it.
In the cluster the `probe` agent answers at `http://kagent-controller.kagent.svc:8083/api/a2a/factory/probe/`.

The factory stands on open-source projects from the Linux Foundation:

| Layer | Project | Foundation |
|---|---|---|
| Cluster | kind, Kubernetes | CNCF |
| Agents | kagent 0.10.1 | CNCF Sandbox |
| Agent protocols | MCP, A2A | Agentic AI Foundation (LF) |
| The line | Argo Workflows | CNCF Graduated |
| Policy | Kyverno | CNCF Incubating |
| Traces | OpenTelemetry, Jaeger | CNCF |
| Signature | Sigstore cosign | OpenSSF Graduated |

## 🎮 First, play the game (2 min)

Open the **PORTS** tab and click the link of **🎮 Hobby Wizard (your repo)**, port 5173.
Arrows walk, Z jumps. Walk through the bush on the plateau and hold →.
👀 You should see: the creature jumps on your hat and the wizard walks **left**. That is bug HW-001. In lesson 5 an
agent fixes it, and you will play the fix.

![Your repo (port 5173): the creature rides the hat, and holding → walks the wizard left.](images/gif/play-hw-001-bug.gif)

## Look around first

You already ran `factory lesson 1` and `factory start` ([README, Step 2](../README.md#step-2-the-cluster-and-lesson-1)).

1. Open the kagent dashboard: the **PORTS** tab → **kagent dashboard** (port 8082), or the link from `factory urls`.

   ![The kagent dashboard: `builder`, `intake` and `probe` are resources in the cluster, each with its model and state.](images/gif/l01-kagent-agents.gif)
   <sub>The kagent dashboard: `builder`, `intake` and `probe` are resources in the cluster, each with its model and state.</sub>

2. List the agents: `kubectl get agent -n factory`.
   👀 You should see: `probe … True`.
3. See what the controller made of the agent: `kubectl get deploy,svc -n factory -l kagent=probe`.
   👀 You should see: a Deployment and a Service, the same as for any web service.
4. Read the agent card: `python3 sdlc/a2a.py --agent probe --card`.
5. 🔑 Ask the agent over A2A: `factory ask probe "Introduce yourself"`.

## ✏️ Exercise: the `intake` agent (8 min)

The factory does not accept a task without acceptance criteria (a "done when…" list). When criteria are
missing, a separate agent, `intake`, asks the author questions. It has no tools, only an instruction.

1. Run `factory check 1`.
   🔴 You should see: `platform/kagent/agent-intake.yaml: the systemMessage still says TODO`.
2. Open `platform/kagent/agent-intake.yaml`.
3. Replace the `TODO` under `systemMessage` with your instruction. Tell the agent:
   - it gets the title and description of a task for Hobby Wizard, a browser platformer with a deterministic simulation (same input, same result);
   - it asks two to four questions without which nobody can write an acceptance test;
   - it answers with a bulleted list and starts with the first question.

   Shortcut: paste the ready block from the [README, lesson 1](../README.md#-lesson-1-the-cluster-and-the-first-agent).
4. Send the agent to the cluster: `kubectl apply -f platform/kagent/agent-intake.yaml`.
5. Wait until it is up: `kubectl wait --for=condition=Ready agent/intake -n factory --timeout=180s`.
6. Run `factory check 1`.
   🟢 You should see: `the intake agent's instruction is written`, `the cluster has the instruction from platform/kagent/agent-intake.yaml`
   and `the intake agent is deployed and Ready`. Without step 4 the check stays red: the cluster still has the old instruction.

   ![`factory check 1` is red, `factory solve 1` writes and deploys the instruction, and the check turns green.](images/gif/l01-check-red-green.gif)
   <sub>`factory check 1` is red, `factory solve 1` writes and deploys the instruction, and the check turns green.</sub>

Stuck? `factory solve 1`.

## 🔑 With a model key

Ask the agent about a vague task:

```bash
factory ask intake "Double jump. Players keep asking for a second jump in the air. Add it."
```

👀 A good instruction gives questions about numbers and edge cases: how fast the second jump starts, what
gives it back (landing, a respawn, the water), whether a jump off a ledge in coyote time counts as the first.
A bad instruction gives an essay. With a key, `factory check 1` also wants a list of 2 to 6 questions.

No key yet? `factory key`. Without one the agent comes up but does not answer; lesson 5 has a replay mode for that.

**When does the factory use this agent?** `kubectl apply` puts it to work at once, but only with a model key
(Step 3). Without a key it is up and Ready and never answers.

| When | Who asks it | What you see |
|---|---|---|
| Lesson 1, right after `kubectl apply` | you: `factory ask intake "…"` | its questions in the terminal |
| Lesson 4, `make intake O=double-jump` | the intake check, when it sends a work order back | its questions under "sent back" (without a key: three fixed questions) |
| Lesson 5 on, every run of the line | the line's `intake` step, the same way | the questions in the run's `intake.md` |
| Finale | the line, for an issue without `Criteria:` | its questions as a comment under the issue |

From lesson 2 on, `factory lesson N` deploys the instructor's version of this file (yours goes to `git stash`), so the
agent you wrote answers only in lesson 1.

## To discuss

- An agent's manifest goes through the same review as code. Who approves a prompt change in your company today?
- Port 8083 has no login: the identity is the `X-User-Id` header. In production a gateway (agentgateway, also LF) stands in front of the agents.
