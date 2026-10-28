"""The context layer (station 1).

Instead of making the agent "discover" the repo on every issue, we compile the knowledge once,
deterministically, from five levels:

  L1 system        module catalog, dependencies, blast radius   (module.json, TypeScript imports)
  L2 code          conventions and architecture rules           (system/AGENTS.md, system/architecture/rules.js)
  L3 organization  actual owners, not only nominal ones         (git log, CODEOWNERS)
  L4 decisions     architecture decisions                       (system/docs/plan/01-decisions)
  L5 operations    incidents                                    (ops/incidents)

Usage:
  python3 sdlc/context.py index                 # .sdlc/index.json
  python3 sdlc/context.py agents-md             # AGENTS.md for the agent
  python3 sdlc/context.py route --title T --body B [--out-md file]
"""

from __future__ import annotations

import argparse
import re
from collections import Counter
from pathlib import Path

from lib import ROOT, STATE, git, outputs, modules, split_name, summary_md, stem, tokens, write_json

DECISIONS = "system/docs/plan/01-decisions"
INCIDENTS = "ops/incidents"
RULES = ROOT / "system" / "architecture" / "rules.js"
CONVENTIONS = ROOT / "system" / "AGENTS.md"


# ---------------------------------------------------------------- L3: organization

def codeowners() -> dict[str, str]:
    owners = {}
    path = ROOT / "CODEOWNERS"
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            pattern, *who = line.split()
            owners[pattern.strip("/")] = " ".join(who)
    return owners


def is_agent(name: str) -> bool:
    return "[bot]" in name


def real_owners(module_path: str, limit: int = 300) -> list[dict]:
    """Who actually changes this module's code (module.json does not count), agents included.
    The same commit always gives the same result."""
    try:
        authors = git("log", f"-{limit}", "--no-merges", "--format=%an", "--", module_path, f":!{module_path}/module.json").split("\n")
    except RuntimeError:
        return []
    counts = Counter(a for a in authors if a)
    total = sum(counts.values()) or 1
    return [{"name": name, "commits": n, "share": round(n / total, 2), "agent": is_agent(name)}
            for name, n in counts.most_common(3)]


def churn(module_path: str, days: int = 30) -> int:
    try:
        return len([l for l in git("log", f"--since={days}.days", "--format=%h", "--", module_path, f":!{module_path}/module.json").splitlines() if l])
    except RuntimeError:
        return 0


def owners_text(owners: list[dict]) -> str:
    return ", ".join(f"{o['name']} ({int(o['share'] * 100)}%{', agent' if o.get('agent') else ''})" for o in owners) or "no history"


# ---------------------------------------------------------------- L4/L5: decisions and operations

def documents(folder: str) -> list[dict]:
    """Decision records and incidents. The modules they apply to: `modules: [a, b]` in the front matter
    or a `- Modules: a, b` line. Superseded decisions are left out."""
    docs = []
    for path in sorted((ROOT / folder).glob("*.md")):
        text = path.read_text(encoding="utf-8")
        if re.search(r"(?m)^status:\s*superseded", text):
            continue
        heading = re.search(r"(?m)^# (.+)$", text)
        title = heading.group(1).strip() if heading else path.stem
        listed = re.search(r"(?m)^modules:\s*\[(.*?)\]", text) or re.search(r"(?mi)^- Modules:\s*(.+)$", text)
        docs.append({
            "path": str(path.relative_to(ROOT)),
            "title": title,
            "modules": [m.strip() for m in listed.group(1).split(",") if m.strip()] if listed else [],
        })
    return docs


# ---------------------------------------------------------------- L2: code

def architecture_rules() -> list[dict]:
    """Rules from system/architecture/rules.js: rule('name', 'because', ...)."""
    if not RULES.exists():
        return []
    text = RULES.read_text(encoding="utf-8")
    return [{"name": m.group(1), "because": m.group(2)}
            for m in re.finditer(r"rule\(\s*'(\w+)',\s*'([^']+)'", text)]


def conventions() -> list[str]:
    """The numbered rules of system/AGENTS.md, one line each."""
    if not CONVENTIONS.exists():
        return []
    text = CONVENTIONS.read_text(encoding="utf-8")
    section = re.search(r"(?ms)^## Rules\n(.*?)(^## |\Z)", text)
    return [re.sub(r"^\d+\.\s*", "", l).strip() for l in (section.group(1) if section else "").splitlines()
            if re.match(r"^\d+\.\s", l)]


def file_names(module_path: str) -> list[str]:
    return sorted({p.stem for p in (ROOT / module_path).rglob("*.ts")
                   if "node_modules" not in p.parts and not p.name.endswith(".test.ts")})


# ---------------------------------------------------------------- index

def build_index() -> dict:
    catalog = modules()
    nominal = codeowners()
    adrs, incidents = documents(DECISIONS), documents(INCIDENTS)
    for module in catalog:
        module["dependents"] = [m["name"] for m in catalog if module["name"] in m["depends_on"]]
        module["owners_nominal"] = nominal.get(module["path"], module.get("owners", "?"))
        module["owners_real"] = real_owners(module["path"])
        module["churn_30d"] = churn(module["path"])
        module["files"] = file_names(module["path"])
        module["adrs"] = [d for d in adrs if module["name"] in d["modules"]]
        module["incidents"] = [d for d in incidents if module["name"] in d["modules"]]
    index = {
        "commit": _head(),
        "modules": catalog,
        "rules": architecture_rules(),
        "conventions": conventions(),
    }
    write_json(STATE / "index.json", index)
    return index


def _head() -> str:
    try:
        return git("rev-parse", "--short", "HEAD").strip()
    except RuntimeError:
        return "no-commit"


def blast_radius(name: str, catalog: list[dict]) -> list[str]:
    """Modules a change can reach: transitively through reverse dependencies."""
    by_name = {m["name"]: m for m in catalog}
    seen, todo = set(), [name]
    while todo:
        for dependent in by_name[todo.pop()]["dependents"]:
            if dependent not in seen and by_name[dependent]["kind"] != "tests":
                seen.add(dependent)
                todo.append(dependent)
    return sorted(seen)


# ---------------------------------------------------------------- routing

def route(title: str, body: str, index: dict) -> dict:
    """Which module the change belongs to.

    Two rules, both explainable on one slide:
    1. Ownership of a concept beats word frequency. A visitor's report full of "keys" and "keyboard"
       goes to the owner of the concept "creature", although the renderer handles the keyboard.
    2. Without ownership we count hits: keywords x3, the module's purpose x1, file names x1.
    """
    words = Counter(tokens(f"{title}\n{body}"))
    scored = []
    for module in index["modules"]:
        owned = {stem(w): w for w in module.get("owns", [])}
        weights = Counter()
        for w in module.get("keywords", []):
            weights[stem(w)] = max(weights[stem(w)], 3)
        for w in tokens(module.get("purpose", "")):
            weights[w] = max(weights[w], 1)
        for name in module.get("files", []):
            for w in split_name(name):
                weights[stem(w)] = max(weights[stem(w)], 1)
        hits = {w: n * weights[w] for w, n in words.items() if weights.get(w)}
        owned_hits = sorted(owned[w] for w in words if w in owned)
        scored.append({
            "module": module["name"],
            "owned": owned_hits,
            "score": sum(hits.values()),
            "hits": dict(sorted(hits.items(), key=lambda kv: -kv[1])),
        })
    scored.sort(key=lambda s: (len(s["owned"]) > 0, s["score"]), reverse=True)
    best, runner_up = scored[0], (scored[1] if len(scored) > 1 else None)
    module = next(m for m in index["modules"] if m["name"] == best["module"])
    reason = (f"the module owns the concept: {', '.join(best['owned'])}" if best["owned"]
              else "it has the most hits in keywords and file names")
    confident = bool(best["owned"]) or not runner_up or best["score"] >= 1.5 * max(runner_up["score"], 1)
    radius = blast_radius(module["name"], index["modules"])
    critical = [m["name"] for m in index["modules"] if m.get("critical") and (m["name"] == module["name"] or m["name"] in radius)]
    return {
        "module": module["name"],
        "path": module["path"],
        "reason": reason,
        "confident": confident,
        "blast_radius": radius,
        "critical_in_radius": critical,
        "owners_nominal": module["owners_nominal"],
        "owners_real": module["owners_real"],
        "adrs": module["adrs"],
        "incidents": module["incidents"],
        "candidates": scored,
    }


def route_markdown(result: dict) -> str:
    lines = [
        "### 🧭 Routing",
        "",
        f"**The change goes to `{result['module']}`**, because {result['reason']}."
        + ("" if result["confident"] else " ⚠️ Not sure: two modules score alike, check before merge."),
        "",
        "| | |",
        "|---|---|",
        f"| Nominal owner (CODEOWNERS) | {result['owners_nominal']} |",
        f"| Actual owner (git log) | {owners_text(result['owners_real'])} |",
        f"| Blast radius | {', '.join(result['blast_radius']) or 'this module only'} |",
        f"| Critical path within reach | {', '.join(result['critical_in_radius']) or 'no'} |",
    ]
    context = [f"- 📐 [{d['title']}]({d['path']})" for d in result["adrs"]]
    context += [f"- 🔥 [{d['title']}]({d['path']})" for d in result["incidents"]]
    if context:
        lines += ["", "**Context the agent gets:**", *context]
    lines += ["", "<details><summary>Candidate scores</summary>", "", "| module | owns | score | hits |", "|---|---|---|---|"]
    for c in result["candidates"]:
        hits = ", ".join(f"{w}×{n}" for w, n in list(c["hits"].items())[:5])
        lines.append(f"| {c['module']} | {', '.join(c['owned']) or '-'} | {c['score']} | {hits} |")
    lines += ["", "</details>"]
    return "\n".join(lines)


# ---------------------------------------------------------------- AGENTS.md

def agents_md(index: dict) -> str:
    out = [
        "# AGENTS.md",
        "",
        "<!-- Generated by sdlc/context.py. Do not edit by hand: "
        "change the sources (module.json, system/docs, ops/, git history) and rebuild with make agents-md. -->",
        "",
        "Context for coding agents working in this repository. The game is in `system/`; its own rules are in `system/AGENTS.md`.",
        "",
        "## L1 System",
        "",
        "| module | kind | purpose | depends on | used by | critical |",
        "|---|---|---|---|---|---|",
    ]
    for m in index["modules"]:
        out.append(f"| `{m['path']}` | {m['kind']} | {m['purpose']} | {', '.join(m['depends_on']) or '-'} "
                   f"| {', '.join(m['dependents']) or '-'} | {'**yes**' if m.get('critical') else 'no'} |")
    out += ["", "## L2 Code", "", "Architecture rules (`system/architecture/rules.js`; they break the build and cannot be bypassed in a change):", ""]
    out += [f"- `{r['name']}`: {r['because']}" for r in index["rules"]]
    out += ["", "Conventions (`system/AGENTS.md`):", ""]
    out += [f"- {line}" for line in index["conventions"]]
    out += ["", "## L3 Organization", ""]
    for m in index["modules"]:
        out.append(f"- `{m['name']}`: nominal owner {m['owners_nominal']}, actual {owners_text(m['owners_real'])}; "
                   f"changes in 30 days: {m['churn_30d']}")
    out += ["", "## L4 Decisions", ""]
    seen = set()
    for m in index["modules"]:
        for d in m["adrs"]:
            if d["path"] not in seen:
                seen.add(d["path"])
                out.append(f"- [{d['title']}]({d['path']}), applies to: {', '.join(d['modules'])}")
    out += ["", "## L5 Operations", ""]
    seen = set()
    for m in index["modules"]:
        for d in m["incidents"]:
            if d["path"] not in seen:
                seen.add(d["path"])
                out.append(f"- [{d['title']}]({d['path']}), applies to: {', '.join(d['modules'])}")
    out += ["", "## How to work", "",
            "1. Change only the module named in the task. If another one must be touched, say why in the description.",
            "2. Read the decisions and incidents linked in the task before you start.",
            "3. Add a test for every behavior change; every change to `game/sim/` ships a replay test in `system/tests/sim/`.",
            "4. Run the gate with `run_build` (`pnpm typecheck && pnpm lint && pnpm test && pnpm bugs:check` in `system/`) and fix everything that is red.",
            "5. Do not change `system/architecture/`, `system/bugs/tests/`, `sdlc/` or `scenarios/` to make the build pass.", ""]
    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("index")
    sub.add_parser("agents-md")
    r = sub.add_parser("route")
    r.add_argument("--title", required=True)
    r.add_argument("--body", default="")
    r.add_argument("--out-md")
    args = parser.parse_args()

    if args.cmd == "index":
        index = build_index()
        print(f"Index: {len(index['modules'])} modules, {len(index['rules'])} rules -> .sdlc/index.json")
    elif args.cmd == "agents-md":
        (ROOT / "AGENTS.md").write_text(agents_md(build_index()), encoding="utf-8")
        print("AGENTS.md rebuilt")
    elif args.cmd == "route":
        result = route(args.title, args.body, build_index())
        write_json(STATE / "route.json", result)
        markdown = route_markdown(result)
        if args.out_md:
            Path(args.out_md).write_text(markdown, encoding="utf-8")
        print(markdown)
        summary_md(markdown)
        outputs(module=result["module"], path=result["path"], critical=str(bool(result["critical_in_radius"])).lower())


if __name__ == "__main__":
    main()
