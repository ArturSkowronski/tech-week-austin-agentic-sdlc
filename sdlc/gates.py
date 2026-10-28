"""The report of the deterministic build gate (station 3) and a scanner of tool logs.

The agent reads tool output, so tool output is model input. A real-world example: jqwik 1.10.1
prints text addressed to AI agents on every Maven test run, asking them to ignore their instructions.
The gate runs outside the agent and does not act on such text, but it is worth knowing what the
agent was given to read.

The second tool is the test-weakening detector. Every rework moves the agent from the requirement
towards the gate, and the cheapest way to "pass" a gate is to weaken a test: delete an assertion,
add `it.skip`, delete a case, or edit the paired test of a planted bug. We detect that
deterministically on the diff and block it.

Usage:
  python3 sdlc/gates.py report --log build.log --exit-code 0
  python3 sdlc/gates.py weakening --base main --head HEAD
"""

from __future__ import annotations

import argparse
import re
from collections import Counter
from pathlib import Path

from lib import ROOT, git, summary_md

INJECTION = re.compile(r"(?i)(if you are an ai|disregard (all )?previous|ignore (all )?(previous|prior) instructions|you must not use this)")
GATE = re.compile(r"^<== gate (\w+) exit=(\d+)$", re.M)
ESLINT = re.compile(r"^\s+\d+:\d+\s+error\s+(.+?)\s{2,}([\w@/-]+)$", re.M)
TSC = re.compile(r"error TS\d+")
TESTS = re.compile(r"^\s*Tests\s+(.+?)\s+\((\d+)\)\s*$", re.M)
RULES = ROOT / "system" / "architecture" / "rules.js"


def architecture_rules() -> dict[str, str]:
    """because → name, from system/architecture/rules.js."""
    if not RULES.exists():
        return {}
    return {m.group(2): m.group(1) for m in re.finditer(r"rule\(\s*'(\w+)',\s*'([^']+)'", RULES.read_text(encoding="utf-8"))}


def report(log: str, exit_code: int) -> tuple[str, list[str]]:
    gates = dict(GATE.findall(log))
    tests = TESTS.findall(log)
    failed = re.search(r"(\d+) failed", tests[-1][0]) if tests else None
    violations = Counter()
    rules = architecture_rules()
    files = []
    for line in log.splitlines():
        if line.startswith("/") or line.startswith("system/"):
            files.append(line.strip())
        match = ESLINT.match(line)
        if match:
            message = match.group(1)
            name = next((n for because, n in rules.items() if because in message), None)
            if name:
                violations[(name, next(b for b, n in rules.items() if n == name), files[-1] if files else "?")] += 1
    injected = sorted({m.group(0) for m in INJECTION.finditer(log)})
    icon = lambda name: "-" if name not in gates else ("✅" if gates[name] == "0" else "❌")
    out = [f"### 🧱 Build: {'✅ green' if exit_code == 0 else '❌ red'}", "",
           "| typecheck | lint + architecture | test | bugs:check |", "|---|---|---|---|",
           f"| {icon('typecheck')} | {icon('lint')} | {icon('test')} | {icon('bugs')} |", ""]
    out.append(f"Tests: {tests[-1][1] if tests else 0}, failed: {failed.group(1) if failed else 0}. "
               f"Type errors: {len(TSC.findall(log))}.")
    seen = set()
    for (name, because, where), times in violations.items():
        if name in seen:
            continue
        seen.add(name)
        places = sorted({w.replace(str(ROOT) + '/', '') for (n, _, w) in violations if n == name})
        out += ["", f"**Architecture rule violated** ({sum(t for (n, _, _), t in violations.items() if n == name)}×): "
                f"`{name}`: {because}", "", *[f"- `{p}`" for p in places[:4]]]
    if gates.get("bugs", "0") != "0":
        problems = [l.strip() for l in log.split("==> gate bugs", 1)[-1].splitlines()
                    if re.match(r"^\s*(HW-\d+|bugs/tests/)", l) and "fails as planted" not in l]
        if problems:
            out += ["", "**Planted-bug pairing broken** (ADR-005):", *[f"- {p}" for p in problems[:4]]]
    if injected:
        out += ["", "⚠️ **The tool log contains text addressed to AI agents** (the agent reads it as input):",
                *[f"- `{i}`" for i in injected],
                "", "The gate runs outside the agent, so the result above does not depend on that text."]
    return "\n".join(out), injected


TEST_FILE = re.compile(r"^system/(tests|bugs/tests)/.+\.test\.ts$")
GATE_CONFIG = ("system/eslint.config.js", "system/tsconfig.json", "system/vitest.config.ts", "system/vitest.bugs.config.ts",
               "system/package.json", "system/tools/bugs/")
ASSERTION = re.compile(r"\bexpect\(|\bassert\.")
CASE = re.compile(r"^\s*(it|test)(\.each\(.*\))?\(\s*['\"`]")
WEAKENED = [
    ("skipped test", re.compile(r"\b(it|test|describe)\.(skip|todo)\b|\b(xit|xdescribe|xtest)\(")),
    ("focused test (the rest stop running)", re.compile(r"\b(it|test|describe)\.only\b")),
    ("swallowed exception in a test", re.compile(r"catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}")),
]


def weakening(base: str, head: str) -> list[dict]:
    found = []
    removed, added = Counter(), Counter()
    removed_cases, added_cases = Counter(), Counter()
    current = None
    for line in git("diff", "-U0", f"{base}...{head}", "--", "system/tests", "system/bugs/tests").splitlines():
        if line.startswith("--- ") or line.startswith("+++ "):
            if line.startswith("+++ b/"):
                current = line[6:]
            continue
        if not current or not line[:1] in "+-":
            continue
        text = line[1:]
        sign = line[0]
        if ASSERTION.search(text):
            (removed if sign == "-" else added)[current] += 1
        if CASE.search(text):
            (removed_cases if sign == "-" else added_cases)[current] += 1
        if sign == "+":
            for label, pattern in WEAKENED:
                if pattern.search(text):
                    found.append({"what": label, "file": current, "line": text.strip()[:100]})
    for path, n in removed.items():
        if n > added[path]:
            found.append({"what": f"assertions removed ({n - added[path]} more removed than added)", "file": path, "line": ""})
    for path, n in removed_cases.items():
        if n > added_cases[path]:
            found.append({"what": "test case removed", "file": path, "line": ""})
    for status, path in (l.split("\t", 1) for l in git("diff", "--name-status", f"{base}...{head}", "--", "system").splitlines() if "\t" in l):
        if status.startswith("D") and TEST_FILE.match(path):
            found.append({"what": "test file deleted", "file": path, "line": ""})
        if path.startswith("system/bugs/tests/") and not status.startswith("D"):
            found.append({"what": "paired test of a planted bug edited (AGENTS.md rule 4)", "file": path, "line": ""})
        if path.startswith(GATE_CONFIG):
            found.append({"what": "gate configuration changed", "file": path, "line": ""})
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("report")
    r.add_argument("--log", required=True)
    r.add_argument("--exit-code", type=int, required=True)
    w = sub.add_parser("weakening")
    w.add_argument("--base", required=True)
    w.add_argument("--head", default="HEAD")
    args = parser.parse_args()
    if args.cmd == "report":
        text, _ = report(Path(args.log).read_text(encoding="utf-8", errors="replace"), args.exit_code)
        print(text)
        summary_md(text)
        return
    found = weakening(args.base, args.head)
    if not found:
        text = "### 🪤 Test weakening: ✅ none"
    else:
        text = "\n".join(["### 🪤 Test weakening: ❌ the agent \"passes\" the gate instead of meeting the requirement", "",
                          *[f"- {f['what']}: `{f['file']}` {('`' + f['line'] + '`') if f['line'] else ''}" for f in found]])
    print(text)
    summary_md(text)
    raise SystemExit(1 if found else 0)


if __name__ == "__main__":
    main()
