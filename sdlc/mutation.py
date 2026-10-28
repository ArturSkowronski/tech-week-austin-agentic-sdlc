"""Mutation testing on the lines a change touched (station 3).

A green build only proves the model agrees with itself. This gate plants small faults in the changed
production lines (a boundary moved, a condition flipped, an operator swapped) and runs the related tests
for each. A mutant the tests do not notice "survives". It measures the tests, not the code.

It is the idea of StrykerJS (or PIT for Java) cut down to what a workshop line needs: only changed lines of
changed files under system/game and system/tools, at most MAX_MUTANTS, `vitest related` per mutant. No extra
dependencies, the same answer for the same diff.

Usage:
  python3 sdlc/mutation.py --base main --head HEAD [--threshold 50]
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict

from lib import ROOT, SYSTEM, git, outputs, summary_md

MAX_MUTANTS = 16
SOURCE = re.compile(r"^system/(game|tools)/.+(?<!\.test)\.ts$")
OPERATORS = [
    ("boundary < to <=", re.compile(r"(?<=\s)<(?=\s)"), "<="),
    ("boundary <= to <", re.compile(r"(?<=\s)<=(?=\s)"), "<"),
    ("boundary > to >=", re.compile(r"(?<=\s)>(?=\s)"), ">="),
    ("boundary >= to >", re.compile(r"(?<=\s)>=(?=\s)"), ">"),
    ("condition negated (=== to !==)", re.compile(r"==="), "!=="),
    ("condition negated (!== to ===)", re.compile(r"!=="), "==="),
    ("&& to ||", re.compile(r"(?<=\s)&&(?=\s)"), "||"),
    ("|| to &&", re.compile(r"(?<=\s)\|\|(?=\s)"), "&&"),
    ("arithmetic + to -", re.compile(r"(?<=\s)\+(?=\s)"), "-"),
    ("arithmetic - to +", re.compile(r"(?<=\s)-(?=\s)"), "+"),
    ("true to false", re.compile(r"\btrue\b"), "false"),
    ("false to true", re.compile(r"\bfalse\b"), "true"),
    ("+= to -=", re.compile(r"\+="), "-="),
    ("ternary branches swapped", re.compile(r"\?\s*([^:?]+?)\s*:\s*([^;,)]+)"), None),
]


def changed_lines(base: str, head: str) -> dict[str, list[int]]:
    files = [p for p in git("diff", "--name-only", "--diff-filter=AM", f"{base}...{head}").splitlines() if SOURCE.match(p)]
    lines = defaultdict(list)
    for path in files:
        current = 0
        for line in git("diff", "-U0", f"{base}...{head}", "--", path).splitlines():
            if line.startswith("@@"):
                current = int(re.search(r"\+(\d+)", line).group(1))
            elif line.startswith("+") and not line.startswith("+++"):
                lines[path].append(current)
                current += 1
    return dict(lines)


def mutants(path: str, numbers: list[int]) -> list[dict]:
    text = (ROOT / path).read_text(encoding="utf-8").split("\n")
    found = []
    for number in numbers:
        source = text[number - 1]
        code = source.split("//")[0]
        if not code.strip() or code.lstrip().startswith(("*", "/*", "import", "export *")):
            continue
        for label, pattern, replacement in OPERATORS:
            match = pattern.search(code)
            if not match:
                continue
            if replacement is None:
                mutated = code[:match.start()] + f"? {match.group(2)} : {match.group(1)}" + code[match.end():]
            else:
                mutated = code[:match.start()] + replacement + code[match.end():]
            found.append({"file": path, "line": number, "what": label, "source": mutated + source[len(code):]})
    return found


def run_tests(path: str) -> int:
    proc = subprocess.run([str(SYSTEM / "node_modules/.bin/vitest"), "related", str(ROOT / path), "--run",
                           "--passWithNoTests=false", "--bail=1"], cwd=SYSTEM, capture_output=True, text=True, timeout=180)
    return proc.returncode


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--threshold", type=int, default=50)
    args = parser.parse_args()

    targets = changed_lines(args.base, args.head)
    candidates = [m for path, numbers in targets.items() for m in mutants(path, numbers)]
    if not candidates:
        text = "### 🧬 Mutation\n\nNo changed production lines to mutate."
        print(text)
        summary_md(text)
        outputs(score="n/a")
        return
    # Spread the budget over the files and lines: every other candidate first, then the rest.
    chosen = (candidates[::2] + candidates[1::2])[:MAX_MUTANTS]
    killed, survivors = 0, []
    for mutant in chosen:
        target = ROOT / mutant["file"]
        original = target.read_text(encoding="utf-8")
        lines = original.split("\n")
        lines[mutant["line"] - 1] = mutant["source"]
        target.write_text("\n".join(lines), encoding="utf-8")
        try:
            code = run_tests(mutant["file"])
        except subprocess.TimeoutExpired:
            code = 124
        finally:
            target.write_text(original, encoding="utf-8")
        if code != 0:
            killed += 1
        else:
            survivors.append(mutant)
        print(f"{'killed ' if code else 'SURVIVED'} {mutant['file']}:{mutant['line']} {mutant['what']}", file=sys.stderr)
    total = len(chosen)
    score = round(100 * killed / total)
    ok = score >= args.threshold
    lines = [f"### 🧬 Mutation: {'✅' if ok else '❌'} {score}% killed (threshold {args.threshold}%)", "",
             f"Files: {', '.join(f.replace('system/', '') for f in targets)}. Mutants: {total}"
             + (f" (of {len(candidates)})" if len(candidates) > total else "") + f", killed: {killed}."]
    if survivors:
        lines += ["", "Survived (the tests do not notice):", "", "| file | line | mutation |", "|---|---|---|"]
        lines += [f"| `{s['file'].split('/')[-1]}` | {s['line']} | {s['what']} |" for s in survivors[:10]]
    text = "\n".join(lines)
    print(text)
    summary_md(text)
    outputs(score=score)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
