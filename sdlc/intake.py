"""Intake (lesson 4): the factory does not accept a work order without a specification.

In a software factory people write the specifications and agents write the rest. So the first gate
stands before the agent: the work order needs acceptance criteria. Without them the factory sends it
back with questions instead of guessing. The check is deterministic. The `intake` agent (kagent, over A2A)
only words the questions; it does not decide whether the order is accepted.

Usage:
  python3 sdlc/intake.py --title T --body B [--out-md file]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import a2a
from lib import STATE, covered_by_scenarios, load_json, outputs, stem, summary_md, tokens, write_json

CRITERIA = re.compile(r"(?im)^\s*(#+\s*)?(criteria|acceptance criteria|given|scenario)\b")
CHECKLIST = re.compile(r"(?m)^\s*[-*]\s+(\[[ x]\]\s+)?\S")
PLACEHOLDER = re.compile(r"(?i)\[your work order\]|change the title")


def assess(title: str, body: str) -> dict:
    problems = []
    if PLACEHOLDER.search(f"{title}\n{body}"):
        problems.append("the work order is still the template: change the title and the description to your own idea")
    if not CRITERIA.search(body):
        problems.append("no section with acceptance criteria (e.g. \"Criteria:\")")
    elif len(CHECKLIST.findall(body)) < 2:
        problems.append("the criteria have fewer than two points")
    if len(body.split()) < 12:
        problems.append("the description has fewer than 12 words")
    route_file = STATE / "route.json"
    if route_file.exists():
        route = load_json(route_file)
        # Yield drops with the size of the order: a title naming concepts of two owning modules is usually two orders.
        # The title counts, not the body: the body may mention the HUD while the change is about the creature.
        named = set(tokens(title))
        owners = [c for c in route["candidates"] if named & {stem(w) for w in c["owned"]}]
        if len(owners) > 1:
            problems.append("the work order touches concepts of several modules (" + ", ".join(c["module"] for c in owners)
                            + "): split it into smaller ones")
        elif not route["confident"]:
            problems.append("routing cannot tell which module this belongs to: make it more precise or split it")
    return {"accepted": not problems, "problems": problems, "has_scenarios": covered_by_scenarios(title)}


def questions(title: str, body: str) -> str:
    try:
        return a2a.send("intake", f"Title: {title}\n\nDescription:\n{body}", timeout=120).strip()
    except Exception as err:  # the questions are a courtesy, not a gate
        print(f"intake: the intake agent did not answer ({err})", file=sys.stderr)
    return ("1. What input and what result do you expect in the typical case (with numbers: ticks, tiles, speeds)?\n"
            "2. What should happen at the boundary and in the edge cases (in the air, in water, while charging)?\n"
            "3. What must stay exactly as it is today?")


def markdown(result: dict, asked: str) -> str:
    if result["accepted"]:
        note = "" if result["has_scenarios"] else (
            "\n\n⚠️ This work order has no holdout scenarios. The factory will build it, but not without a human.")
        return "### 📥 Intake: ✅ accepted onto the line" + note
    return "\n".join([
        "### 📥 Intake: ↩️ sent back",
        "",
        "The factory does not guess requirements. What is missing:",
        *[f"- {p}" for p in result["problems"]],
        "",
        "Questions that make the criteria writable:",
        "",
        asked,
        "",
        "Fill in the work order file (a **Criteria:** section with a list of points) and send it down the line again.",
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", default="")
    parser.add_argument("--out-md")
    args = parser.parse_args()

    result = assess(args.title, args.body)
    text = markdown(result, "" if result["accepted"] else questions(args.title, args.body))
    write_json(STATE / "intake.json", result)
    if args.out_md:
        Path(args.out_md).write_text(text, encoding="utf-8")
    print(text)
    summary_md(text)
    outputs(accepted=str(result["accepted"]).lower(), has_scenarios=str(result["has_scenarios"]).lower())


if __name__ == "__main__":
    main()
