# Lesson 5: The line (12 min)

😬 **Problem:** calling an agent once is easy. Seeing what it did, running it again the same way, pausing it for a human, or swapping it for another agent is hard.

🛠️ **What we do:** we run the agent through a pipeline with clear steps: prepare, check the task, write the fix, save the change. You watch it fix the planted bug HW-001, step by step, in a web dashboard.

✅ **What you get:** a process you can see and repeat. The agent is one step in it, and the result is a patch you can open and read.

## How it works

The pipeline is called the line. It runs in Argo Workflows, which draws the steps as a graph, keeps their logs
and can pause a run for a human (lesson 9). Every step is a container with the same image and the same disk;
only the script differs.

```
prepare ─▶ intake ─▶ builder ─▶ change
  branch     routing    A2A to       commit on branch agent/<order>,
  of the     + criteria the builder  patch and description in /work/out
  order
```

| Part | File |
|---|---|
| The line's template | `platform/line/factory.yaml` (WorkflowTemplate `factory`) |
| The steps' account | `platform/line/rbac.yaml` |
| The agent driver | `sdlc/agent.py`: builds a prompt from the L1-L5 context, then calls the agent over A2A or applies a recorded patch |
| Recordings | `sdlc/replays/`: a recorded patch per work order, module and attempt number |

The agent is replaceable: `kagent` (a real model) or `replay` (a recorded patch that works without a model). Only the
`builder` step talks to the agent, over A2A through the kagent controller. The model key stays in the agent's pod.

## ✏️ Exercise: send HW-001 through the line (8 min)

In this lesson you write nothing. You send bug HW-001 down the line, watch every step on the floor, and read the
patch that comes out. Without a model key the `builder` step applies a recorded fix (`replay`): the line is the
same, only the agent is swapped for a recording.

**A. Set up and look at the line**

1. Set up the lesson: `factory lesson 5`.
2. See the line in the cluster: `kubectl get workflowtemplate -n factory`.
   👀 You should see: one template, `factory`. This one file is the whole pipeline.
3. Run `factory check 5`.
   🔴 You should see: `no successful run of HW-001: make replay O=hw-001`. Nothing has gone down the line yet.

**B. Open the floor before you start the run**

4. In the **PORTS** tab, open **The floor (Argo Workflows)** (port 2746) in a new browser tab, or click the first link
   of `factory urls`. Keep the tab open: the run appears there as soon as you start it.

**C. Send HW-001 down the line**

5. In the terminal: `make replay O=hw-001`. It takes 1 to 2 minutes and the terminal waits until the end.
   👀 In the browser: the run `factory-hw-001-…` appears and its steps turn green one by one:
   prepare → intake → builder → change. Click a step to read its log.
   👀 In the terminal, at the end: `Result: Succeeded`.

   ![The floor (Argo): the HW-001 run with every step green. Click a step to open its details.](images/gif/l05-argo-hw001.gif)
   <sub>The floor (Argo): the HW-001 run with every step green. Click a step to open its details.</sub>

**D. Read what came out**

6. The results are in the cluster. Copy them to your repo: `make fetch` (into `.sdlc/out/`).
7. What the agent says it did: `cat .sdlc/out/hw-001/attempt-1/description.md`.
8. Which files the fix touches, without applying it: `git apply --stat .sdlc/out/hw-001/attempt-1/change.patch`.
   👀 You should see: `system/game/sim/input-map.ts`, a new test in `system/tests/sim/`, and `system/bugs/manifest.json`
   (the HW-001 entry is removed).
9. Run `factory check 5`.
   🟢 You should see: `HW-001 went through the line` and `patch fetched: .sdlc/out/hw-001/attempt-1/change.patch`.

Stuck? `factory solve 5` does steps 5 to 9 for you and prints each one.

You do not apply the patch to your repo: the next lessons check the agent's change before anyone accepts it.

## 🎮 Play the fix

The game from your repo already runs on port 5173 and still has the bug. The fix gets its own copy on port 5174.
`factory play fix` keeps running until Ctrl+C, so start it in a **second terminal** (**+** in the Terminal panel):

```bash
factory play fix   # your repo + the factory's patch from make fetch, port 5174
```

In **PORTS** open **🎮 Hobby Wizard (the fix)** (port 5174) and walk through the bush on the plateau. 👀 Right is
right, and the creature is gone. Then open **🎮 Hobby Wizard (your repo)** (port 5173): the same bush, the bug is still there.

![Your repo (port 5173): the creature rides the hat, and holding → walks the wizard left.](images/gif/play-hw-001-bug.gif)
<sub>Your repo (port 5173): the creature rides the hat, and holding → walks the wizard left.</sub>

![The fix (port 5174): no creature in the bush, and holding → walks right.](images/gif/play-hw-001-fixed.gif)
<sub>The fix (port 5174): no creature in the bush, and holding → walks right.</sub>

## 🔑 With a model key

The same line with a real agent instead of the recording. Without a key, skip this part.

1. Check that the key works: `factory doctor` (the line `the model answers`). No key yet: `factory key`.
2. Terminal 1: `make order O=hw-001` (2 to 5 minutes).
3. Terminal 2, every tool the agent calls, live: `kubectl exec -n factory deploy/depot -- tail -f /work/events.jsonl`
   (Ctrl+C stops it).
4. On the floor, open the `builder` step of the new run and read its log.
5. `make fetch`, then compare the agent's patch with the recording: `git apply --stat .sdlc/out/hw-001/attempt-1/change.patch`.
6. Traces: in **PORTS** open **Jaeger (traces)** (port 16686), pick the service `builder`, **Find Traces**: one trace
   with every model call and tool call.

   ![Jaeger: one trace for HW-001, the line's steps and under `builder` every model call and tool call.](images/gif/l05-jaeger-trace.gif)
   <sub>Jaeger: one trace for HW-001, the line's steps and under `builder` every model call and tool call.</sub>

**Try it: the context changes the result.** Take away what lesson 3 gave `sim` and send the same bug again:

```bash
python3 - <<'PY'
import json; from pathlib import Path
p = Path("system/game/sim/module.json"); m = json.loads(p.read_text()); m["owns"] = []
p.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
PY
make route O=hw-001                                    # 👀 now it goes to `render`, as before lesson 3
make order O=hw-001                                    # 👀 the agent works in system/game/render, without sim's decisions and incident
git checkout -- system/game/sim/module.json            # put lesson 3 back
```

Replay has no recording for `render`, so this part needs a key. The prompt stayed the same; only the context changed.

## To discuss

- What does the floor show that the agent's logs do not? And the other way round?
- Where in this graph would you put a human today? Write it down. Lesson 9 comes back to it.
- The change has not passed any check yet. The agent's own green build is no gate (lesson 6).
