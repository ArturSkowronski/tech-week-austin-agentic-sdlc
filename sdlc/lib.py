"""Shared pieces of the factory. Standard library only: runs in every line container without pip install."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYSTEM = ROOT / "system"
SCENARIOS = ROOT / "scenarios"
SDLC = ROOT / "sdlc"
STATE = ROOT / ".sdlc"


def load_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def policy() -> dict:
    return load_json(SDLC / "policy.json")


def setting(key: str, default: str = "") -> str:
    """A value from the environment, or the default."""
    return os.environ.get(key) or default


def git(*args: str) -> str:
    out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {out.stderr.strip()}")
    return out.stdout


# ---------------------------------------------------------------- L1: modules and the import graph

IMPORT = re.compile(r"""(?:from|import)\s*['"](\.{1,2}/[^'"]+)['"]""")


def _descriptors() -> list[Path]:
    found = []
    for pattern in ("*/module.json", "*/*/module.json"):
        found += [p for p in SYSTEM.glob(pattern) if "node_modules" not in p.parts]
    return sorted(found)


def modules() -> list[dict]:
    """The module catalog (L1): system/**/module.json, dependencies from the TypeScript import graph."""
    found = []
    for descriptor in _descriptors():
        module = load_json(descriptor)
        module["path"] = str(descriptor.parent.relative_to(ROOT))
        found.append(module)
    for module in found:
        module["depends_on"] = sorted(_imports(module, found))
    return found


def _imports(module: dict, catalog: list[dict]) -> set[str]:
    base = ROOT / module["path"]
    used = set()
    for source in base.rglob("*.ts"):
        if "node_modules" in source.parts:
            continue
        for target in IMPORT.findall(source.read_text(encoding="utf-8", errors="replace")):
            resolved = os.path.normpath(source.parent / target)
            rel = os.path.relpath(resolved, ROOT)
            owner = module_for_path(rel, catalog)
            if owner and owner["name"] != module["name"]:
                used.add(owner["name"])
    return used


def module_for_path(path: str, catalog: list[dict]) -> dict | None:
    """The module that holds the path: the longest module path that is a prefix of it."""
    best = None
    for module in catalog:
        if path == module["path"] or path.startswith(module["path"] + "/"):
            if best is None or len(module["path"]) > len(best["path"]):
                best = module
    return best


# A very simple stemmer: the first five letters. "startled", "startle" and "starts" land on the same
# stem. Good enough for a workshop, and fully deterministic: the same text always gives the same result.
def stem(word: str) -> str:
    return word.lower()[:5]


STOPWORDS = {"the", "and", "for", "with", "while", "when", "that", "this", "from", "into", "onto", "are", "was",
             "not", "his", "him", "its", "has", "have", "does", "then", "than", "but", "out", "off", "all", "any",
             "one", "two", "should", "would", "will", "can", "there", "their", "them", "they", "what", "who"}


def tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z]+", text.lower())
    return [stem(w) for w in words if len(w) >= 3 and w not in STOPWORDS]


def split_name(name: str) -> list[str]:
    """`input-map` → input, map; `chargeHit` → charge, hit."""
    return re.findall(r"[A-Z]?[a-z]+", name)


def outputs(**values) -> None:
    """Outputs of a line step. In Argo Workflows each key is a file in $OUTPUTS_DIR (outputs.parameters.valueFrom.path).
    Locally they go to stderr."""
    target = os.environ.get("OUTPUTS_DIR")
    if target:
        Path(target).mkdir(parents=True, exist_ok=True)
        for key, value in values.items():
            (Path(target) / key).write_text(str(value), encoding="utf-8")
    else:
        print("\n".join(f"::output:: {k}={v}" for k, v in values.items()), file=sys.stderr)


def summary_md(markdown: str) -> None:
    """A step report in markdown. Goes to $SUMMARY_FILE (a fragment of the work order card)."""
    target = os.environ.get("SUMMARY_FILE")
    if target:
        with open(target, "a", encoding="utf-8") as fh:
            fh.write(markdown + "\n")


def scenarios_for(work_order: str) -> list[dict]:
    """The holdout scenarios that apply to a work order: always the regression, plus the ones matching its title."""
    index = SCENARIOS / "index.json"
    if not index.exists():
        return []
    words = set(tokens(work_order))
    chosen = []
    for scenario in load_json(index)["scenarios"]:
        if scenario.get("always") or words & set(tokens(" ".join(scenario.get("match", [])))):
            chosen.append(scenario)
    return chosen


def covered_by_scenarios(work_order: str) -> bool:
    """Does the work order have scenarios of its own (besides the regression)? Without them the lights stay on."""
    return any(not s.get("always") for s in scenarios_for(work_order))
