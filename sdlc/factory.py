"""The production line (stations 4-5): the line configuration, the rework report, the work order card.

  line-config   a hash of everything that decides how the line behaves (policy, rules, context,
                oracle, agent, model). The worker is nondeterministic, the line must not be:
                a drop in first-pass yield is attributed to a specific configuration change.
  feedback      the report for the agent in the rework loop. From the oracle only the NAMES of failed
                working scenarios. The vault gives no information.
  card          the work order card in the PR: attempt, decision, time waiting for a human, cost, configuration.
                A hidden JSON in a comment is machine-readable.

Usage:
  python3 sdlc/factory.py line-config
  python3 sdlc/factory.py feedback
  python3 sdlc/factory.py card --attempt 1 --decision lights-out [--lead-min 7] [--human-wait-min 3]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

import tracing
from lib import ROOT, STATE, outputs, load_json, summary_md, write_json

LINE_FILES = ["sdlc/policy.json", "sdlc/review-rules.json", "AGENTS.md", "scenarios/index.json",
              "system/architecture/rules.js"]


def line_config() -> dict:
    parts = {}
    for name in LINE_FILES:
        path = ROOT / name
        parts[name] = hashlib.sha256(path.read_bytes()).hexdigest()[:10] if path.exists() else "none"
    parts["agent"] = os.environ.get("AGENT", "kagent")
    parts["model"] = os.environ.get("LLM_MODEL", "-")
    parts["review_model"] = os.environ.get("LLM_REVIEW_MODEL", os.environ.get("LLM_MODEL", "-"))
    digest = hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:12]
    return {"hash": digest, "parts": parts}


def _read(name: str) -> str:
    """Gate reports: first in .sdlc, then in the run's output directory ($OUT)."""
    for folder in (STATE, Path(os.environ.get("OUT", ""))):
        path = folder / name
        if str(folder) and path.exists():
            return path.read_text(encoding="utf-8")
    return ""


def feedback() -> str:
    """What the agent gets in a rework. Narrow on purpose: every bit of information about the oracle is a leak."""
    sections = []
    build = _read("quality-1-build.md")
    if "❌" in build:
        rules = re.findall(r"\*\*Architecture rule violated\*\* \(\d+×\): (.+)", build)
        red = re.findall(r"\| (✅|❌|-) \| (✅|❌|-) \| (✅|❌|-) \| (✅|❌|-) \|", build)
        gates = [name for name, mark in zip(("typecheck", "lint", "test", "bugs:check"), red[0] if red else []) if mark == "❌"]
        pairing = [l for l in build.splitlines() if l.startswith("- ") and ("HW-" in l or "bugs/tests/" in l)]
        sections.append("The build gate is red" + (f" ({', '.join(gates)})" if gates else "") + ":\n"
                        + "\n".join(f"- {r}" for r in rules + pairing or ["run run_build and read the log"]))
    weak = _read("quality-2-weakening.md")
    if "❌" in weak:
        sections.append("The test-weakening detector blocked the change:\n" + "\n".join(l for l in weak.splitlines() if l.startswith("- ")))
    mutation = _read("quality-4-mutation.md")
    if "❌" in mutation:
        survivors = [l for l in mutation.splitlines() if l.startswith("| `")]
        sections.append("Mutation testing below the threshold. Surviving mutants:\n" + "\n".join(survivors[:6]))
    scen = STATE / "scenarios.json"
    if scen.exists():
        names = load_json(scen).get("feedback", [])
        if names:
            sections.append("Does not meet the requirements (acceptance scenarios you cannot see):\n"
                            + "\n".join(f"- {n}" for n in names))
    review = _read("review.md")
    blocking = re.search(r"### 🚫 Blocking\n\n(.*?)(\n### |\n<sub>)", review, re.S)
    if blocking:
        items = [l for l in blocking.group(1).splitlines() if l.startswith("- ")]
        sections.append("Review, blocking findings:\n" + "\n".join(items))
    return "\n\n".join(sections) or "Quality control did not pass, without details (e.g. the vault or the infrastructure)."


def agent_cost() -> dict:
    """A cost estimate from the agent's event log. The format differs between agents, so we search generically."""
    cost, tokens_in, tokens_out, final_cost = 0.0, 0, 0, None

    def walk(node):
        nonlocal cost, tokens_in, tokens_out, final_cost
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ("total_cost_usd",) and isinstance(value, (int, float)):
                    final_cost = max(final_cost or 0, float(value))
                elif key == "cost" and isinstance(value, (int, float)):
                    cost += float(value)
                elif key in ("input_tokens", "input") and isinstance(value, int):
                    tokens_in += value
                elif key in ("output_tokens", "output") and isinstance(value, int):
                    tokens_out += value
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    events = STATE / "agent-events.jsonl"
    if events.exists():
        for line in events.read_text(encoding="utf-8").splitlines():
            try:
                walk(json.loads(line))
            except json.JSONDecodeError:
                continue
    return {"usd": round(final_cost if final_cost is not None else cost, 4), "tokens_in": tokens_in, "tokens_out": tokens_out}


DECISIONS = {
    "lights-out": "🌑 accepted without a human (lights-out)",
    "human": "👤 accepted by a human",
    "waiting": "👤 waiting for a human",
    "rework": "🔁 sent back for rework",
    "andon": "🚨 andon: the line stopped, a human is needed",
    "rejected": "↩️ sent back at intake",
}


def card(attempt: int, decision: str, lead_min: float | None, human_wait_min: float | None) -> str:
    config = line_config()
    cost = agent_cost()
    trace = tracing.url(tracing.Step().trace_id)
    risk = load_json(STATE / "risk.json") if (STATE / "risk.json").exists() else {}
    data = {
        "attempt": attempt,
        "decision": decision,
        "first_pass": attempt == 1 and decision in ("lights-out", "human"),
        "risk": risk.get("level"),
        "lead_min": lead_min,
        "human_wait_min": human_wait_min,
        "cost_usd": cost["usd"],
        "tokens": cost["tokens_in"] + cost["tokens_out"],
        "config": config["hash"],
        "trace": trace,
    }
    write_json(STATE / "card.json", data)
    fmt = lambda v, unit: "-" if v is None else f"{v:.0f} {unit}"
    lines = [
        "### 🏭 Work order card",
        "",
        "| | |",
        "|---|---|",
        f"| Decision | {DECISIONS.get(decision, decision)} |",
        f"| Attempt | {attempt}{' (first pass)' if data['first_pass'] else ''} |",
        f"| Risk | {risk.get('level', '-')} |",
        f"| Lead time | {fmt(lead_min, 'min')} |",
        f"| Waiting for a human | {fmt(human_wait_min, 'min')} |",
        f"| Agent cost (estimate) | {cost['usd']:.2f} USD, {data['tokens']:,} tokens |",
        f"| Line configuration | `{config['hash']}` |",
        *([f"| Trace | [Jaeger]({trace}) |"] if trace else []),
        "",
        f"<!-- factory-card {json.dumps(data, ensure_ascii=False)} -->",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("line-config")
    sub.add_parser("feedback")
    c = sub.add_parser("card")
    c.add_argument("--attempt", type=int, default=1)
    c.add_argument("--decision", required=True)
    c.add_argument("--lead-min", type=float)
    c.add_argument("--human-wait-min", type=float)
    args = parser.parse_args()

    if args.cmd == "line-config":
        config = line_config()
        write_json(STATE / "line-config.json", config)
        print(json.dumps(config, ensure_ascii=False))
        outputs(hash=config["hash"])
    elif args.cmd == "feedback":
        text = feedback()
        (STATE / "feedback.md").write_text(text, encoding="utf-8")
        print(text)
    else:
        text = card(args.attempt, args.decision, args.lead_min, args.human_wait_min)
        (STATE / "card.md").write_text(text, encoding="utf-8")
        print(text)
        summary_md(text)


if __name__ == "__main__":
    main()
