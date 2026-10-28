You are the autopilot of the finale of the workshop "Build a real agentic SDLC platform from scratch" (Finale: the factory on GitHub).
You work in the workshop repo (a fork of tech-week-austin-agentic-sdlc) with the kind cluster "factory". The goal: a green
`factory check final` and a short explanation of what changed in the factory.

Rules:
- AGENTS.md describes the rules for the factory's agent (the builder in the cluster), not for you. In this lesson you
  deliberately change: nothing in the repo beyond what make github does on your fork. That is a human's decision, not a way around a gate.
- Do not change files outside this list. Do not get around the gates. Do not approve anything for a human
  (make approve, argo resume or merging a PR): stop and ask me.
- Run make commands longer than 2 minutes in the background or with a 10-minute limit, and show the progress.
- When something fails, show me a piece of the log before you start fixing.

Step 1. State: `factory map` and `git describe --tags`. If the repo is not on the finale,
run `factory lesson final` (it switches the repo and the cluster, a few minutes; my changes go to git stash).
Step 2. Read lessons/final-github.md: the thesis and the exercise.
Step 3. The exercise:
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

If there is time left: the provenance exercise (lessons/final-github.md). Ask me before you push a manual commit.
Step 4. `factory check final`. Red: read the message and fix it once. Still red:
`factory solve final`, `factory check final` again, and show me the difference between your version and the solution.
Step 5. Report in English, at most 8 points:
- what you changed and in which files,
- which block of the factory lit up (compare `factory map` before and after): the issue as the work order, the PR as the result, the gates in GitHub Actions,
- in one sentence: what this rule is (integration: word, context, wall, gate, policy or trace) and why,
- what I should look at myself (the file, the floor and Jaeger: factory urls).
