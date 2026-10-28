"""The builder driver. The agent is replaceable, the platform stays.

  AGENT=kagent   (default) the `builder` agent in kagent, over A2A; it works on /work/repo with MCP tools
  AGENT=replay   no network and no model: applies a recorded patch that matches the work order, the routing
                 and the attempt (REPLAY_VARIANT=naive picks the human's Friday change of lesson 6)

ATTEMPT=2 with .sdlc/feedback.md is the rework loop: the agent gets the report from quality control
(without the content of the holdout scenarios, only their names).

The agent gets no token to the cluster or to git. The gates (system/architecture, system/bugs/tests, sdlc, platform)
and the oracle (scenarios) are protected in the workshop server, not in the prompt.

Usage:
  python3 sdlc/agent.py prompt --title T --body B        # .sdlc/prompt.md
  python3 sdlc/agent.py run                              # runs the agent on .sdlc/prompt.md
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import a2a
from lib import ROOT, SDLC, STATE, load_json, tokens

PROTECTED = ["system/architecture/", "system/bugs/tests/", "sdlc/", "platform/", "scenarios/", ".github/", ".factory/"]
ATTEMPT = int(os.environ.get("ATTEMPT", "1"))
TIMEOUT = int(os.environ.get("AGENT_TIMEOUT", "1500"))
BASE = os.environ.get("BASE_BRANCH", "main")


def build_prompt(title: str, body: str) -> str:
    route = load_json(STATE / "route.json")
    docs = [d["path"] for d in route["adrs"] + route["incidents"]]
    attached = "\n\n".join(f"--- {p} ---\n{(ROOT / p).read_text(encoding='utf-8')}" for p in docs)
    feedback_file = STATE / "feedback.md"
    rework = ""
    if ATTEMPT > 1 and feedback_file.exists():
        rework = f"""
## This is a rework (attempt {ATTEMPT})

Your previous change did not pass the factory's quality control. The report is below. Do not weaken
tests and do not bypass gates: the test-weakening detector blocks such changes. Fix the code so that
it meets the requirement from the work order. Your previous changes are still in the repository.

{feedback_file.read_text(encoding="utf-8")}
"""
    return f"""Work order: {title}

{body}

## Where you work

Routing pointed to module `{route['module']}` ({route['path']}), because {route['reason']}.
Blast radius: {', '.join(route['blast_radius']) or 'only this module'}.
Critical path within reach: {', '.join(route['critical_in_radius']) or 'no'}.

## Context you must take into account

{attached or '(no related decisions or incidents)'}

## Rules

1. Read AGENTS.md in the repository root and system/AGENTS.md (read_file).
2. Change code in `{route['path']}`. Change other modules only when the change cannot work otherwise, and say why.
3. Add tests for every behavior change, in system/tests/. The test must check the requirement from the work order.
4. Run run_build and fix everything that is red. Do not finish with a red build.
5. Do not touch {', '.join(PROTECTED)}. The server rejects such writes.
6. At the end, write 3-5 sentences describing the change to the file `.sdlc/pr-body.md` (write_file) and reply with the same description.
{rework}"""


# ---------------------------------------------------------------- drivers

def run_kagent(prompt: str, events: Path) -> int:
    """The builder in kagent. The workshop server writes tool events to EVENTS_FILE; we add the answer."""
    try:
        answer = a2a.send(os.environ.get("AGENT_NAME", "builder"), prompt, timeout=TIMEOUT)
    except Exception as err:
        events.write_text(json.dumps({"type": "agent.error", "error": str(err)}, ensure_ascii=False) + "\n")
        print(f"builder: {err}", file=sys.stderr)
        return 1
    events.write_text(json.dumps({"type": "agent.answer", "text": answer[:4000]}, ensure_ascii=False) + "\n")
    print(answer)
    body = STATE / "pr-body.md"
    if not body.exists():
        body.write_text(answer.strip() + "\n", encoding="utf-8")
    return 0


def run_replay(prompt: str, events: Path) -> int:
    """The fallback for bad Wi-Fi: a recorded patch instead of a model.

    The patch is picked by the words of the work order title AND by the module from the routing.
    So even without a model you can see that better context gives a better change.
    """
    module = load_json(STATE / "route.json")["module"]
    variant = os.environ.get("REPLAY_VARIANT", "")
    # Match on the title, not the whole prompt: the prompt carries decisions and the rework report,
    # which mention words of other work orders.
    order = STATE / "order.json"
    words = set(tokens(load_json(order)["title"] if order.exists() else prompt.splitlines()[0]))
    for replay in load_json(SDLC / "replays" / "index.json")["replays"]:
        same_attempt = replay.get("attempt", 1) == min(ATTEMPT, 2)
        if (set(tokens(" ".join(replay["match"]))) & words and same_attempt and replay["module"] == module
                and replay.get("variant", "") == variant):
            patch = SDLC / "replays" / replay["patch"]
            events.write_text(json.dumps({"type": "replay", "patch": replay["patch"], "note": replay["note"]}, ensure_ascii=False) + "\n")
            (STATE / "pr-body.md").write_text(replay["note"] + "\n\n_(replay mode: a recorded change, no model)_\n", encoding="utf-8")
            print(f"replay: {replay['patch']} (attempt {ATTEMPT})")
            if ATTEMPT > 1:
                # A recorded rework is a full change against main, so we start from a clean main:
                # remove everything that differs from main (also files added in attempt 1) and restore main.
                changed = subprocess.run(["git", "diff", "--name-only", BASE, "--", "system"], cwd=ROOT,
                                         capture_output=True, text=True).stdout.split()
                for f in changed:
                    (ROOT / f).unlink(missing_ok=True)
                subprocess.run(["git", "checkout", BASE, "--", "system"], cwd=ROOT)
                subprocess.run(["git", "clean", "-fdq", "-e", "node_modules", "system"], cwd=ROOT)
            return subprocess.run(["git", "apply", "--whitespace=nowarn", str(patch)], cwd=ROOT).returncode
    print(f"replay: no recording for this work order, module {module} and attempt {ATTEMPT}"
          + (f" (variant {variant})" if variant else ""), file=sys.stderr)
    return 1


DRIVERS = {"kagent": run_kagent, "replay": run_replay}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prompt")
    p.add_argument("--title", required=True)
    p.add_argument("--body", default="")
    sub.add_parser("run")
    args = parser.parse_args()

    if args.cmd == "prompt":
        prompt = build_prompt(args.title, args.body)
        STATE.mkdir(exist_ok=True)
        (STATE / "prompt.md").write_text(prompt, encoding="utf-8")
        print(prompt)
    else:
        agent = os.environ.get("AGENT", "kagent")
        prompt = (STATE / "prompt.md").read_text(encoding="utf-8")
        code = DRIVERS[agent](prompt, STATE / "agent-events.jsonl")
        print(f"agent {agent} finished with code {code}")
        sys.exit(code)


if __name__ == "__main__":
    main()
