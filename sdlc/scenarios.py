"""The factory's oracle (station 3): holdout scenarios the agent does not see.

Two levels, because a holdout wears out with every use:

  working  when they fail, the agent gets the NAME of the scenario (a description of behaviour) in the rework loop
  vault    a decision only: accept or reject. Zero feedback. A failure pulls the andon,
           because every rework "for the vault" would turn it into a training set.

The vault runs only after the working scenarios pass. Otherwise its result would leak together
with the report from the first attempt.

The scenarios are vitest files in scenarios/<id>/. They run against the change, always taken from main
(the line checks scenarios/ out of main first), staged next to the game in system/.oracle/ so that they
resolve vitest and the game from system/.

Usage:
  python3 sdlc/scenarios.py run --work-order "The wizard is startled when the creature climbs on"
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys

from lib import SCENARIOS, STATE, SYSTEM, outputs, scenarios_for, summary_md, write_json

STAGE = SYSTEM / ".oracle"


def _vitest(ids: list[str]) -> dict:
    shutil.rmtree(STAGE, ignore_errors=True)
    STAGE.mkdir(parents=True)
    for name in ("vitest.config.ts", "helpers.ts"):
        shutil.copy(SCENARIOS / name, STAGE / name)
    for scenario in ids:
        shutil.copytree(SCENARIOS / scenario, STAGE / scenario)
    report = STATE / "oracle-report.json"
    report.unlink(missing_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run([str(SYSTEM / "node_modules/.bin/vitest"), "run", "--config", ".oracle/vitest.config.ts",
                        "--reporter=json", f"--outputFile={report}"], cwd=SYSTEM, capture_output=True, text=True, timeout=600)
    finally:
        shutil.rmtree(STAGE, ignore_errors=True)
    return json.loads(report.read_text(encoding="utf-8")) if report.exists() else {"testResults": []}


def _results(scenario: dict, report: dict) -> list[dict]:
    suites = [s for s in report.get("testResults", []) if f"/.oracle/{scenario['id']}/" in s["name"]]
    out = []
    for suite in suites:
        if not suite.get("assertionResults"):
            # It did not load: usually the code lacks the API the work order promises.
            out.append({"set": scenario["id"], "name": f"{scenario['title']}: the scenarios do not load "
                        "(is the API from the work order missing?)", "passed": False})
        for case in suite.get("assertionResults", []):
            out.append({"set": scenario["id"], "name": case["title"], "passed": case["status"] == "passed"})
    return out or [{"set": scenario["id"], "name": f"{scenario['title']}: no result", "passed": False}]


def run(work_order: str) -> dict:
    chosen = scenarios_for(work_order)
    working = [s for s in chosen if not s.get("vault")]
    vault = [s for s in chosen if s.get("vault")]

    report = _vitest([s["id"] for s in working])
    results = [r for s in working for r in _results(s, report)]
    working_ok = all(r["passed"] for r in results)

    vault_state = "none"
    if vault and working_ok:
        report = _vitest([s["id"] for s in vault])
        vault_results = [r for s in vault for r in _results(s, report)]
        vault_state = "passed" if all(r["passed"] for r in vault_results) else "failed"
    elif vault:
        vault_state = "unopened"  # the working scenarios failed, the vault stays shut

    summary = {
        "work_order": work_order,
        "covered": any(not s.get("always") for s in working),
        "working": results,
        "working_failed": sum(not r["passed"] for r in results),
        "vault": vault_state,
        # the only thing the agent may see in a rework
        "feedback": [r["name"] for r in results if not r["passed"]],
    }
    write_json(STATE / "scenarios.json", summary)
    return summary


def markdown(summary: dict) -> str:
    total = len(summary["working"])
    ok = summary["working_failed"] == 0 and summary["vault"] in ("none", "passed")
    lines = [f"### 🎯 Oracle: {'✅' if ok else '❌'} working scenarios {total - summary['working_failed']}/{total}"
             f" · vault: {summary['vault']}", ""]
    if not summary["covered"]:
        lines += ["⚠️ The work order has no scenarios of its own, only the regression ran. Without them the lights stay on.", ""]
    lines += [f"- {'✅' if r['passed'] else '❌'} {r['name']} <sub>({r['set']})</sub>" for r in summary["working"]]
    if summary["vault"] == "failed":
        lines += ["", "🚨 **The vault failed.** We do not tell the agent which scenario or why. Andon: a human is needed."]
    lines += ["", "<sub>A human writes the scenarios and the agent does not see them. In a rework it gets only the names of "
              "the failed working scenarios. The vault gives no feedback at all.</sub>"]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--work-order", required=True)
    args = parser.parse_args()

    summary = run(args.work_order)
    text = markdown(summary)
    print(text)
    summary_md(text)
    vault_failed = summary["vault"] == "failed"
    outputs(covered=str(summary["covered"]).lower(), working_failed=summary["working_failed"],
            vault_failed=str(vault_failed).lower())
    sys.exit(0 if summary["working_failed"] == 0 and not vault_failed else 1)


if __name__ == "__main__":
    main()
