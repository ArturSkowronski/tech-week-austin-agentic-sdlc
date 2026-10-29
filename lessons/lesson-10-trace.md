# Lesson 10: The trace and the floor (12 min)

😬 **Problem:** something broke after a change. Which instructions, which model, which tool calls, who approved it? Without a record, you spend a week finding out.

🛠️ **What we do:** every step goes into a log where each line is linked to the one before, and the factory signs the whole log. Jaeger shows every model call and tool call on a timeline.

✅ **What you get:** you can answer "what did the agent do?" in minutes, and prove nobody edited the log afterwards: change one word and the check fails.

## How it works

Every event (intake, prompt, tool call, commit, gate, decision, approval) is a line in the ledger, and each
line carries the hash of the line before it. Change one line and the chain breaks. The line signs the ledger
with the factory's key (Sigstore cosign) and records the **hash of the line's configuration**: the agent may
answer differently each time, but the line around it must be repeatable. kagent sends traces (OpenTelemetry)
of every model and tool call to Jaeger.

| What | Made by | Where to look |
|---|---|---|
| The ledger | `sdlc/ledger.py`, the `ledger` step in the line | `.sdlc/out/<order>/attempt-N/ledger.jsonl` after `make fetch` |
| The signature | `cosign sign-blob` with the key from the Secret `factory-cosign` | `ledger.sigstore.json`, `make ledger-verify` |
| The work order card | `sdlc/factory.py card` | `card.md` in the results |
| The run's trace | Argo + `sdlc/tracing.py` (steps, tools) → kagent (agent, model) → Jaeger | **PORTS** → **Jaeger (traces)**, port 16686 |
| The floor | Argo Workflows UI | **PORTS** → **The floor (Argo Workflows)**, port 2746 |

## Before you start

1. Set up the lesson: `factory lesson 10`. It also installs the factory's signing key (cosign).
2. Run the startle: `make replay O=startle`.
   👀 You should see: attempt 1 fails, attempt 2 waits for a person.
3. In a **second terminal**, find the run name: `argo list -n factory`.
4. Approve it: `make approve W=<run name>`.
5. Fetch the results: `make fetch`.
6. Check the ledger: `make ledger-verify F=.sdlc/out/startle/attempt-2/ledger.jsonl`.
   👀 You should see: `OK: … events, chain head …` and `signature: Verified OK`.

## ✏️ Exercise A: try to fake the log (5 min)

Change one word in the ledger and watch the check catch it. You can edit the file by hand (change
`human.approved` to `human.skipped`, or change the approver's name), or run this:

```bash
L=.sdlc/out/startle/attempt-2/ledger.jsonl
cp $L /tmp/ledger-copy.jsonl                     # keep a copy
sed -i.bak 's/human.approved/human.skipped/' $L  # pretend nobody approved
make ledger-verify F=$L      # 👀 caught: it names the changed line, and the signature no longer matches
cp /tmp/ledger-copy.jsonl $L                     # put the original back
make ledger-verify F=$L      # 👀 OK again
```

👀 After the edit you should see: `line N: content changed after it was written (…)`, and the signature line
no longer says `Verified OK`. The same ledger also records `holdout.peek` (the agent peeked at the oracle) and
`gate.tamper_attempt`.

Put the original back before you finish, then run `factory check 10`. It wants a whole chain and a matching signature.
🟢 You should see: `the ledger's chain is whole` and `the cosign signature matches`.

Stuck? `factory solve 10`.

## ✏️ Exercise B: what did the agent do (5 min)

1. Read the summary card: `cat .sdlc/out/startle/attempt-2/card.md`.
   👀 You should see: time, attempts, the decision, the line's hash, who approved.
2. 🔑 With a model key: the startle above is a replay and calls no model, so its `tools.jsonl` is empty. Run the real
   agent once: `make order O=hw-001` (2 to 10 minutes), then `make fetch`. Open Jaeger (**PORTS** → **Jaeger (traces)**,
   or **Trace in Jaeger** on the run in the floor), service `builder`, the newest trace.
3. 🔑 Count the model and tool calls, and compare them with the lines in `.sdlc/out/hw-001/attempt-1/tools.jsonl`.
   In the finale you get one trace for the whole task (service `factory-line`).

   ![Jaeger: the startle run as one trace (`factory-line`): attempt 1 with the reviewer's model calls and the red oracle, then attempt 2.](images/gif/l10-jaeger-trace.gif)
   <sub>Jaeger: the startle run as one trace (`factory-line`): attempt 1 with the reviewer's model calls and the red oracle, then attempt 2.</sub>

4. Run `factory map`.
   🟢 You should see: all ten blocks of the factory working.

## The floor (instructor, on the projector)

The Argo UI filtered to the namespace `factory` shows every line in the room: where each work order is, what
waits for a human (yellow), what stopped (red), what went through with the lights out.

![The floor: every run in the namespace `factory`, one row each, with its progress and duration.](images/gif/l10-floor.gif)
<sub>The floor: every run in the namespace `factory`, one row each, with its progress and duration.</sub>

## Metrics for Monday

- **Human minutes per accepted change**, counting the work upstream too: specifications, scenarios, andons. Review is only part of it.
- **Escapes**: defects that got through the factory. If you cannot trace a defect back to a change, you have nothing to "earn" more autonomy with.

## To discuss

- An agent may propose a new law (a rule in `system/architecture/rules.js`, a convention), but cannot pass it: such a change touches the gates, so it gets risk `critical` and waits for a human.
- Everything you saw today stands on Linux Foundation projects. What will you set up at work on Monday, and what will you swap for what you already have?
