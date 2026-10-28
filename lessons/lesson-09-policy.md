# Lesson 9: Lights, WIP and policy (12 min)

😬 **Problem:** either a person reviews every change and becomes the bottleneck, or nobody does and a bad change reaches `main`.

🛠️ **What we do:** we write the rule into a file in the repo: small, well-tested changes go through on their own, and risky ones stop and wait for a person. A second rule blocks any agent that asks for tools it should not have.

✅ **What you get:** people look only where it matters. The rule itself is reviewed like code, and an agent cannot give itself more power.

## How it works

A human is one step in the line with a clear role, and only some changes reach that step. Which ones is decided
by a versioned file, `sdlc/policy.json`. A change goes through with the lights out (no human) only when its risk
is low or medium and hidden scenarios also cover it.

The factory also pulls work instead of pushing it. The WIP limit (how many runs at once) follows how fast the
people at the end of the line can approve, whatever the number of agents.

| What | Where | Project |
|---|---|---|
| Which changes wait for a human | `sdlc/policy.json` → `autonomy` | a file in the repo |
| The wait itself | the `human` step in the line: `suspend` + `make approve` | Argo Workflows |
| WIP limit | `platform/line/wip.yaml`, a semaphore on the run | Argo Workflows |
| What tools an agent may have | `platform/kyverno/agent-tools.yaml` | Kyverno `ValidatingPolicy` (CEL) |

## Before you start

1. Set up the lesson: `factory lesson 9`.
2. Run `factory check 9`.
   🔴 You should see: `A: the deployed line has no wait step (suspend, output who) in the human template: make line` and `B: Kyverno lets the bad agent through (kubectl apply -f platform/kyverno/agent-tools.yaml)`.

## ✏️ Exercise A: the line stops for a human (5 min)

1. Open `platform/line/factory.yaml` and find the template `human`.
2. Replace the TODO step with a `wait` step, followed by the step that records the approval. `wait` is a
   template with `suspend` (pause the run) and an output parameter `who` with `valueFrom.supplied`.
   Shortcut: the ready block in the [README, lesson 9](../README.md#-lesson-9-lights-wip-and-policy).
3. Check the file: `argo lint --offline platform/line/factory.yaml`.
   👀 You should see: `no linting errors found`.
4. Send the new line to the cluster: `make line`.
5. Run the startle: `make replay O=startle`.
   👀 You should see: attempt 2 stops and turns yellow on the floor. The command keeps waiting.

   ![The floor: attempt 2 reaches `human` and the `wait` node turns yellow; its details say Suspend, Running.](images/gif/l09-human-node.gif)
   <sub>The floor: attempt 2 reaches `human` and the `wait` node turns yellow; its details say Suspend, Running.</sub>

6. In a **second terminal**, find the run name: `argo list -n factory` (status `Running`).
7. Approve it: `make approve W=<run name>`. Add `WHO=<name>` to record a name other than `git config user.name`.
   👀 You should see: `Approved by: <your name>`. Your name goes into the trace as `human.approved`. You will see it again in lesson 10.

## ✏️ Exercise B: the builder has only the workshop tools (5 min)

1. Try a bad agent, one with extra tools: `kubectl apply --dry-run=server -f platform/kyverno/test/bad-agent.yaml`.
   👀 You should see: the cluster accepts it. That is the hole.
2. Open `platform/kyverno/agent-tools.yaml`.
3. Replace `expression: "true"` with a CEL expression (the policy language Kyverno uses): for an agent with the
   label `factory.dev/role=builder`, every tool has `type == 'McpServer'` and `mcpServer.name == 'workshop'`.
   Shortcut: the ready block under Exercise B in the [README, lesson 9](../README.md#-lesson-9-lights-wip-and-policy).
4. Turn the rule on: `kubectl apply -f platform/kyverno/agent-tools.yaml`.
5. Repeat step 1.
   👀 You should see: refused, with `The builder has only the tools of the workshop server`.
6. Check the real builder still passes: `kubectl apply --dry-run=server -f platform/kagent/agent-builder.yaml`.
7. Run `factory check 9`.
   🟢 You should see: `A: the human step waits (suspend with the output who) and is deployed`, `B: Kyverno rejects the bad agent` and `B: the real builder still passes`.

Stuck? `factory solve 9`.

## Instructor demo: the factory pulls

The WIP limit is 3 (`platform/line/wip.yaml`). A fourth work order hangs as `Pending` with a message about the
semaphore, and starts by itself when a slot frees up, such as after your `make approve`.

## To discuss

- The agent has no token to the cluster: the `builder` step calls it over A2A, and the agent sees only the workshop. The Kyverno policy keeps it so after a Friday "I'll just give it kubectl as well".
- Who decides "a person must look here" in your company today? In which file is that written?
