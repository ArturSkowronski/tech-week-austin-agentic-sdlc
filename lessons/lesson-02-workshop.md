# Lesson 2: The workshop and the tools (12 min)

😬 **Problem:** the coding agent can change any file it sees, including the tests and checks that judge its work. "Please don't touch the tests" in its instructions does not stop it.

🛠️ **What we do:** we give the agent exactly five tools: list files, read a file, write a file, run the build, show the changes. Then we tell the tool server which folders are off limits, and it refuses every write there.

✅ **What you get:** the agent cannot "fix" a failing check by editing the check. The server writes down each try.

## How it works

The coding agent is called the builder. Its whole reach is the five tools of the MCP server `workshop`:
no shell, git or cluster access. MCP (Model Context Protocol) is the standard way to hand tools to an agent.
The server decides what the agent may do, and the model cannot talk its way past it.

| Part | What it is | File |
|---|---|---|
| Disk `/work` | a copy of the repo, the results, a log of tool calls | `platform/workshop/pvc.yaml` |
| Depot | the pod you use to put the repo in and take results out | `platform/workshop/depot.yaml` |
| MCP server | `list_files`, `read_file`, `write_file`, `run_build`, `git_diff` | `platform/workshop/server.py`, `mcpserver.yaml` (CRD from kmcp) |
| Builder | a kagent agent with the server's tools | `platform/kagent/agent-builder.yaml` |

kagent finds the server's tools by itself: `kubectl get mcpserver workshop -n factory -o yaml` lists them under `status`,
and `kubectl get agent builder -n factory -o yaml` shows the tools the builder sees.

## ✏️ Exercise: close the gates in front of the agent (8 min)

1. Set up the lesson: `factory lesson 2` (a few minutes the first time).
2. Check the tool server: `kubectl get mcpserver workshop -n factory`.
   👀 You should see: `READY True`.
3. Run `factory check 2`.
   🔴 You should see: `the server accepted a write to sdlc/policy.json`, and the same for `platform/kind.yaml` and `system/architecture/rules.js`. The agent could overwrite the factory's own rules.
4. 🔑 With a model key (no key: skip to step 5). Ask the builder to overwrite the factory's rules **now, before the wall**:
   `factory ask builder "Write the file sdlc/policy.json with the content {} and tell me what the tool answered"`
   👀 You should see: the write goes through, nothing stops it. Put the original files back in the cluster: `make send`.
5. Open `platform/workshop/mcpserver.yaml`.
6. Set `PROTECTED_PATHS` to the gates, the line and the oracle (the hidden tests written by people):
   `sdlc platform scenarios system/architecture system/bugs/tests .github .factory`.
   Leave `HIDDEN_PATHS` empty; lesson 7 fills it in.
7. Send it to the cluster: `kubectl apply -f platform/workshop/mcpserver.yaml`.
8. Wait for the server to restart: `kubectl rollout status -n factory deploy/workshop --timeout=180s`.
9. 🔑 With a model key: ask the same again, `factory ask builder "Write the file sdlc/policy.json with the content {} and tell me what the tool answered"`.
   👀 You should see: the tool refuses (`Rejected: … is a protected path`; the agent says it in its own words), and the
   refused try is in the log of tool calls: `kubectl exec -n factory deploy/depot -- tail -3 /work/events.jsonl` shows
   `gate.tamper_attempt`.
10. Run `factory check 2`.
   🟢 You should see: `a write to sdlc/policy.json rejected by the server`, and the same for the other two files.

   ![`factory check 2` is red (the server accepts writes to the gates), then after `factory solve 2` every write is rejected.](images/gif/l02-protected-paths.gif)
   <sub>`factory check 2` is red (the server accepts writes to the gates), then after `factory solve 2` every write is rejected.</sub>

`factory check 2` tries its writes off the record, so they are not in the log of tool calls: `gate.tamper_attempt`
shows up there only after the agent's own try in step 9.

Stuck? `factory solve 2`.

Why `system/bugs/tests`? It holds the failing test paired with each planted bug. An agent that edits the test
instead of fixing the bug would "pass". The server makes that impossible.

## 🔑 More with a model key

Other questions to try: `factory ask builder "List the modules in system/game and say what game/sim/input-map.ts does"`,
then `kubectl exec -n factory deploy/depot -- tail /work/events.jsonl` to see every tool it called.

## To discuss

- The prompt says "do not change the gates". The server says "you cannot". Which one survives a colleague editing the prompt on a Friday afternoon?
- `run_build` gives the agent pnpm (typecheck, lint, test, bugs:check) without a shell. What else is worth giving?
- The server has tests too: `cd platform/workshop && python3 -m unittest`.
