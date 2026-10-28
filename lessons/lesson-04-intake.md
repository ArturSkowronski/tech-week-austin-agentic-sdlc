# Lesson 4: Work order intake (12 min)

😬 **Problem:** "add a double jump" sounds clear. How high is the second jump? Do you get it back after falling into water? An agent will guess, and you will review its guesses.

🛠️ **What we do:** the factory checks every task before an agent sees it. A task without a clear "done when…" list goes back to its author, together with the agent's questions.

✅ **What you get:** agents only start work that a test can check. The hard thinking happens when the task is written, before any code exists.

## How it works

A task is called a work order. Each one is a file in `orders/`: the first line is the title, and the
`Criteria:` section lists when it is done. A file in the repo goes through review like code. GitHub issues
come in the finale.

The decision to accept is plain code (`sdlc/intake.py`, the function `assess`): regular expressions and
routing. The `intake` agent from lesson 1 only writes the questions. It does not decide.

| Work order | File | What it shows |
|---|---|---|
| Left and right swap while the creature rides | `orders/hw-001.md` | the planted bug HW-001 |
| The wizard is startled when the creature climbs on | `orders/startle.md` | a repeat of the September incident, a second attempt |
| The F1 debug line shows the wizard's speed | `orders/hud-speed.md` | a low-risk change that goes through without a human |
| Double jump | `orders/double-jump.md` | a task without criteria or hidden tests |
| Your work order | `orders/free.md` | what the factory does with your idea |

Intake also sends back work orders that are too big: a title with concepts from two modules is usually two work orders.

## ✏️ Exercise: criteria for the double jump (8 min)

1. Set up the lesson: `factory lesson 4`.
2. Take in the bug report: `make intake O=hw-001`.
   👀 You should see: `Intake: ✅ accepted onto the line`.
3. Take in the double jump: `make intake O=double-jump`.
   👀 You should see: `Intake: ↩️ sent back`. With a model key, the agent's questions follow.

   ![`make intake O=double-jump`: sent back, with the questions the intake agent asked (recorded with a model key).](images/gif/l04-intake-sent-back.gif)
   <sub>`make intake O=double-jump`: sent back, with the questions the intake agent asked (recorded with a model key).</sub>

4. Run `factory check 4`.
   🔴 You should see: `orders/double-jump.md has no Criteria: section`.
5. Open `orders/double-jump.md` and add a `Criteria:` section with at least two points. Answer the agent's
   questions with numbers and states. Adjectives do not count. You can use these:

   ```bash
   cat >> orders/double-jump.md <<'EOF'

   Criteria:
   - in the air the wizard can jump once more; the second jump starts at JUMP_VELOCITY, the same as the first
   - landing, a respawn or the water gives the second jump back; a charge does not
   - a jump off a ledge in coyote time counts as the first jump
   EOF
   ```

6. Run `make intake O=double-jump` again.
   👀 You should see: `accepted onto the line`, plus `⚠️ This work order has no holdout scenarios. The factory will build it, but not without a human.`
7. Run `factory check 4`.
   🟢 You should see: `double-jump has a Criteria section` and `intake: the work order is accepted`.
8. Commit.

Stuck? `factory solve 4`.

Holdout scenarios are hidden tests written by people (lesson 7). The double jump has none, so a human will
have to approve it (lesson 9).

## To discuss

- Who writes acceptance criteria in your team today? Who will write them when agents write the code?
- The agent's questions change from run to run. The decision to accept does not. Where else would you split "the model advises" from "the code decides"?
