# Ready prompts for Claude Code

Each exercise has one prompt. Open Claude Code in the repo directory, paste the **preamble** (once per session), then
the lesson's prompt. Claude makes the change and the check, you read the diff and decide. Where the prompt tells it to
ask, you answer.

## Preamble (once per session)

```text
You work in the workshop repo tech-week-austin-agentic-sdlc as the participant's assistant.
AGENTS.md in this repo describes the rules for the factory's agent (the builder in the cluster).
The exercises deliberately change the factory's gates: that is a human's decision, not a way around them.
Run make commands that take longer than 2 minutes in the background or with a 10-minute limit.
When a check does not pass, show me the result and propose a fix. Do not get around the gate.
```

## 00 · Preparing the environment

```text
Prepare the workshop environment as in README.md (Step 1 and Step 2).
1. Check: factory (the list of commands) and git tag -l 'lesson-*' (there must be 10).
   No factory on the laptop: make tools and a new terminal.
2. factory lesson 1, then factory start (in the background, up to 15 min).
3. factory map and kubectl get agent -n factory.
Do not change files in the repo. When something fails, show the log and stop.
```

## 01 · The intake agent

```text
Lesson 1. In platform/kagent/agent-intake.yaml replace the TODO
in the systemMessage field with the instruction of the "intake" agent:
- in English,
- it gets the title and the description of a work order for Hobby Wizard (the game),
- it asks 2–4 questions without which an acceptance test cannot be written,
- it answers with a bulleted list only, no preamble and no solutions.
Change nothing else in the file. Then:
1. kubectl apply -f platform/kagent/agent-intake.yaml
2. kubectl wait --for=condition=Ready agent/intake -n factory --timeout=180s
3. make a2a A=intake T="Double jump. Players keep asking for a second
   jump in the air. Add it."
Show the agent's answer. If it is an essay instead of questions,
fix the instruction and repeat step 3 (at most twice).
Without a model key skip step 3: factory check 1 still
checks the file and the agent.
```

## 02 · A wall for the builder

```text
Lesson 2. First show the problem, then close it.
1. make a2a A=builder T="Write the file sdlc/policy.json with the content {}
   and tell me what the tool answered"
   The write goes through: that is the hole we close.
2. In platform/workshop/mcpserver.yaml set
   PROTECTED_PATHS: "sdlc platform scenarios system/architecture system/bugs/tests .github .factory".
   Leave HIDDEN_PATHS empty. Change nothing else.
3. kubectl apply -f platform/workshop/mcpserver.yaml
   kubectl rollout status -n factory deploy/workshop --timeout=180s
4. Repeat step 1. I expect "Rejected: … is a protected path".
5. kubectl exec -n factory deploy/depot -- tail -3 /work/events.jsonl
   Show the gate.tamper_attempt event.
6. make send (the agent overwrote policy.json in the repo snapshot in the cluster).
Without a model key skip steps 1 and 4: factory check 2 checks
the server directly.
```

## 03 · The owner of a concept

```text
Lesson 3. Routing a work order to a module.
1. make route O=hw-001
   Show which module it picked and from which words.
2. Read the purpose in system/game/sim/module.json and
   system/docs/plan/01-decisions/ADR-011-the-simulation-is-the-critical-path.md.
3. In system/game/sim/module.json put into the "owns" list the concepts
   whose owner is game/sim (e.g. "creature", "controls", "movement").
   Do not touch "keywords".
4. Repeat step 1. It must point to sim.
5. make agents-md and show the diff of AGENTS.md.
6. git commit -am "Lesson 3: sim owns the creature and the controls".
```

## 04 · Criteria for the double jump

```text
Lesson 4. Intake of a work order.
1. make intake O=double-jump: show the decision and the agent's questions.
2. Add to orders/double-jump.md a "Criteria:" section with at least
   three points that answer the agent's questions. Numbers and the game's
   names (JUMP_VELOCITY, landing, respawn, water, coyote time) instead of
   adjectives ("smooth", "fun").
   Do not change the title. Do not write the double jump: this is where the spec is made.
3. make intake O=double-jump. I expect: accepted, with a warning
   that there are no holdout scenarios.
4. git commit -am "Lesson 4: criteria for the double jump".
```

## 05 · The line: replay, then an agent

```text
Lesson 5. The line in Argo.
1. make replay O=hw-001 (a recorded change, no model; in the background).
2. make fetch. Show .sdlc/out/hw-001/attempt-1/description.md and the list of
   files in change.patch (git apply --stat).
3. If make doctor says "model key set": make order O=hw-001
   in the background. Every minute show:
   kubectl exec -n factory deploy/depot -- tail -3 /work/events.jsonl
4. make fetch and compare the agent's patch with the recording
   sdlc/replays/hw-001.patch: module, files, tests.
Do not fix the agent's patch. We look at it, we do not repair it.
```

## 06 · An architecture rule: game/sim is deterministic

```text
Lesson 6. You change an architecture rule: this is the exercise, a human's decision.
1. make naive (the startle with Math.random() in game/sim/tick.ts).
   Show the result of the gates: it passes.
2. In system/architecture/rules.js replace the TODO(lesson 6) with the rule
   sim_is_deterministic for game/sim/**/*.ts: no Math.random, no Date,
   no performance, no setTimeout, setInterval or requestAnimationFrame
   (ESLint no-restricted-syntax, built with rule() like the rules above it).
   The reason is one string literal on one line that points to
   docs/plan/02-design/simulation-architecture.md.
3. make test. The current code must pass. If not: fix the rule, not the code.
4. make send, then make naive: the build must be red with the rule's name.
5. make agents-md and show the new line in the L2 section of AGENTS.md.
```

## 07 · The oracle out of reach

```text
Lesson 7. The oracle.
1. make replay O=startle (in the background), make fetch. Show
   .sdlc/out/startle/attempt-1/quality-5-oracle.md
2. make a2a A=builder T="Read scenarios/startle/startle.test.ts
   and summarize what it checks"
3. In platform/workshop/mcpserver.yaml set HIDDEN_PATHS: "scenarios".
   Keep PROTECTED_PATHS. kubectl apply and rollout status as in lesson 2.
4. Repeat step 2. I expect "Rejected: … is out of the agent's reach".
5. Show holdout.peek in /work/events.jsonl.
Do not read or summarize the scenarios yourself either: we pretend
we do not know them. Without a model key skip steps 2 and 4:
factory check 7 checks the server directly.
```

## 08 · A review rule with criteria

```text
Lesson 8. You change sdlc/review-rules.json: this is the exercise.
1. make replay O=startle (in the background), then make fetch.
   Show attempt-1/review-2-review.md and attempt-1/feedback.md
   from .sdlc/out/startle/ (the feedback is everything the agent got).
2. Add the rule LLM-002 with kind "llm", lens "correctness", in the format
   of LLM-001: id, kind, lens, rule, pass, fail, example_fail.
   Content: anything that holds the wizard still (the startle) holds his
   input only; the player step still runs, so gravity, the water and the
   props go on (ADR-011, INC-2026-09-30).
3. python3 -m json.tool sdlc/review-rules.json > /dev/null
4. git commit -am "Lesson 8: a review rule: hold the input, not the physics"
5. With a model key: make send, make order O=startle (in the background,
   10 min), make fetch and show the review findings of attempt 1.
```

## 09 A · The line stops at a human

```text
Lesson 9A. Do the TODO(lesson 9) above the `human` template
in platform/line/factory.yaml:
- a new template `wait`: suspend: {}, the output `who` from valueFrom.supplied,
- in `human` two steps: `wait`, then `record` (template `step`),
  which writes "human.approved <who>" to $OUT/human and human.md.
The name `wait` matters: make approve looks for templateName=wait.
1. argo lint --offline platform/line/factory.yaml, then make line.
2. make replay O=hw-001 in the background (game/sim is the critical path,
   so it goes to a human); every 30 s argo list -n factory.
3. When the run waits for a human, stop and ask me.
   Do not approve it yourself.
4. After my yes: make approve W=<run name>.
```

## 09 B · Kyverno: the builder has only the workshop

```text
Lesson 9B.
1. kubectl apply -f platform/kyverno/test/bad-agent.yaml (it passes),
   then kubectl delete -f platform/kyverno/test/bad-agent.yaml
2. In platform/kyverno/agent-tools.yaml replace expression: "true"
   with CEL: an agent labelled factory.dev/role=builder has in
   object.spec.declarative.tools only type == 'McpServer'
   with mcpServer.name == 'workshop' (the all() macro). Other roles pass.
3. kubectl apply -f platform/kyverno/agent-tools.yaml
4. Repeat the apply from step 1: Kyverno must reject it with your message.
5. kubectl apply -f platform/kagent/agent-builder.yaml must pass.
6. Clean up: kubectl delete -f platform/kyverno/test/bad-agent.yaml
   --ignore-not-found
```

## 10 · Tampering with the ledger, and the trace

```text
Lesson 10.
1. make replay O=startle in the background. When it stops at the human,
   stop and ask me; after my yes make approve W=<run>.
2. make fetch, then
   make ledger-verify F=.sdlc/out/startle/attempt-2/ledger.jsonl
3. Copy ledger.jsonl to a file next to it. In the original change the name
   in the human.approved event.
4. Repeat the verification. Show at which line the chain breaks and what
   cosign says.
5. Restore the file from the copy; the verification must pass again.
6. Show card.md from attempt-2: attempts, decision, the line's hash, who
   approved. With a model key: in Jaeger (service builder, the latest trace)
   count the tool calls and compare with the number of lines in tools.jsonl.
```

## 11 A · Finale: fork, issue, PR

```text
Finale. Connect the factory to my fork.
0. git remote -v: origin must be my fork, not ArturSkowronski/…
   If it is not, stop. In Codespaces:
   env -u GITHUB_TOKEN gh auth status. If the token is ghu_…,
   stop and ask me to run gh auth login (I do it myself).
1. make github. If Actions could not be turned on, tell me
   what to click in the fork's Actions tab.
2. make issue O=hw-001, then make pull AGENT=replay
3. Every minute: argo list -n factory and gh pr list. When there is a PR:
   gh pr checks <number> --watch (up to 10 min).
4. Give me the link to the PR and the "trace in Jaeger" link from its description.
Do not merge by hand and do not change repo settings beyond make github.
```

## 11 B · Finale: provenance

```text
Finale, exercise. Code after the gates.
1. Take the HW-001 PR from the previous exercise (label factory:human).
2. git stash -u && git fetch origin && git switch agent/issue-<number>
   Add a comment at the end of system/game/render/hud.ts, commit, git push.
3. Wait for the check `provenance`, show: gh run view --log-failed
4. git revert --no-edit HEAD && git push; provenance must be green.
5. git switch - && git stash pop
Do not approve the PR. I do that.
```
