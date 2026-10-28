# Lesson 8: Risk, review and rework (12 min)

😬 **Problem:** when the first try fails, the agent tries again. With every try it gets better at passing the checks and worse at solving the actual problem.

🛠️ **What we do:** plain code scores how risky the change is. When a change fails, the factory sends it back to the agent by itself, with at most two attempts in total. You give the AI reviewer one precise rule to check.

✅ **What you get:** retries are visible and limited. Risky changes get a second look. The AI reviewer gives advice, and the checks make the decision.

## How it works

**Code computes the risk.** `sdlc/risk.py` adds up fixed signals: the critical path, the size of the diff,
missing tests, the module's history, the attempt number. The risk level decides whether the AI reviewer runs
at all (`llm_from_level` in `sdlc/policy.json`) and whether the change waits for a human.

**Every retry pulls the agent away from the requirement and towards the gate.** So the attempt number raises the risk, the
test-weakening detector blocks the change, and after `max_attempts` the line stops (andon). A retry, called a
rework, is the same line again with `attempt+1`, so the whole history sits in one graph in Argo.

**Precision beats recall** (a few sure findings are worth more than catching everything). Review has three layers: regular expressions always run (`DET-*`), the risk decides
the rest, and the AI lenses run only above a threshold. The `reviewer` agent gets rules with pass and fail
criteria and answers in JSON. The factory then keeps only findings above a confidence threshold, caps their
number and removes duplicates. A blocking finding from the AI goes to a human and never triggers a rework. Only the
deterministic gates force a rework.

```
quality ‖ review ─▶ decision ─▶ lights-out | human | rework (the line, attempt+1) | andon
```

## Look around first

1. Set up the lesson: `factory lesson 8`.
2. Run the startle: `make replay O=startle`.
   👀 You should see on the floor: attempt 1 fails on the oracle, and the factory starts attempt 2 by itself (the `rework` node is the whole line again).

   ![The floor: attempt 1 is red on the oracle, then the `rework` node runs the whole line again (prepare, intake, builder…).](images/gif/l08-rework.gif)
   <sub>The floor: attempt 1 is red on the oracle, then the `rework` node runs the whole line again (prepare, intake, builder…).</sub>

3. Fetch the results: `make fetch`.
4. Read what the agent was told: `cat .sdlc/out/startle/attempt-1/feedback.md`.
   👀 You should see: only the names of the failed scenarios, never their code.
5. Read the risk score: `cat .sdlc/out/startle/attempt-2/review-1-risk.md`.
   👀 You should see: risk `critical`, because `game/sim` is the critical path (ADR-011) and it is a rework. Decision: human. The run did not wait (that comes in lesson 9).
6. Open `.sdlc/out/startle/attempt-2/change.patch`.
   👀 You should see: the rework holds only the input. `tick.ts` hands the player step an empty frame (`NO_INPUT`) while he is startled, so gravity, the water and the props go on. The oracle is green.

## ✏️ Exercise: a review rule with criteria (8 min)

1. Run `factory check 8`.
   🔴 You should see: `no proper llm rule (correctness, pass/fail/example_fail, about gravity going on while the wizard is held)`.
2. Open `.sdlc/out/startle/attempt-1/review-2-review.md`.
   👀 You should see: no `DET-*` rule caught attempt 1. It doesn't add a secret, a constant or a TODO. It returns early from the player step, and that looks fine in a diff.
3. Open `sdlc/review-rules.json`.
4. Add a rule with `kind: llm` in the lens `correctness`. Give it `rule`, `pass`, `fail` and `example_fail`.
   - What to say: anything that holds the wizard still holds his input only. The player step still runs, so gravity, the water and the props go on (ADR-011, INC-2026-09-30).
   - `example_fail`: an early `return;` at the top of `stepPlayer`, before gravity.

   Shortcut: the ready block in the [README, lesson 8](../README.md#-lesson-8-risk-review-and-rework).
5. Check the file is still valid JSON: `python3 -m json.tool sdlc/review-rules.json > /dev/null && echo "JSON OK"`.
6. Run `factory check 8`.
   🟢 You should see: `an llm rule in the correctness lens: hold the input, not the physics`.

Stuck? `factory solve 8`.

## 🔑 With a model key

Run the startle again with a real reviewer: `make send && make order O=startle`.

👀 Attempt 1 now fails on two independent layers: the oracle and the review. Each finding has a confidence
level. Below `certain_confidence` it is marked "to verify".

## To discuss

- Change `llm_from_level` to `high`. What do you gain, what do you lose?
- When the vault fails, the line stops and nobody retries. Why does the factory prefer stopping to trying once more?
