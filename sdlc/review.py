"""Risk-driven review (lesson 8).

Layers:
  L1 deterministic  regexes from review-rules.json, always, zero cost, immune to prompt injection
  L2 risk           the result of sdlc/risk.py decides whether to ask a model at all
  L3 LLM lenses     correctness / security / tests, only from the policy.json threshold; the `reviewer` agent in kagent over A2A

Doctrine: precision over recall. Above ~15% noise people switch the tool off, so:
a cap on findings, a confidence threshold, deduplication and exactly one comment per PR.

Usage:
  python3 sdlc/review.py --base main --head HEAD --risk .sdlc/risk.json \
      --out-md .sdlc/review.md --out-sarif .sdlc/review.sarif [--fail-on-blocking]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import a2a
import llm
from lib import ROOT, SDLC, git, load_json, policy, summary_md, write_json

ORDER = ["low", "medium", "high", "critical"]
SEVERITY_ORDER = {"blocking": 0, "recommendation": 1, "suggestion": 2}
SARIF_LEVEL = {"blocking": "error", "recommendation": "warning", "suggestion": "note"}


def added_lines(base: str, head: str) -> list[tuple[str, int, str]]:
    """(file, line number in the new version, text) for every added line."""
    result, current, line_no = [], None, 0
    for line in git("diff", "-U0", f"{base}...{head}", "--", ".", ":!.factory").splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@"):
            line_no = int(re.search(r"\+(\d+)", line).group(1))
        elif line.startswith("+") and current:
            result.append((current, line_no, line[1:]))
            line_no += 1
    return result


def deterministic(rules: list[dict], lines) -> list[dict]:
    findings = []
    for rule in (r for r in rules if r["kind"] == "regex"):
        for path, no, text in lines:
            if not any(path.startswith(p) for p in rule["paths"]):
                continue
            if re.search(rule["pattern"], text) and not (rule.get("unless") and re.search(rule["unless"], text)):
                findings.append({"rule": rule["id"], "file": path, "line": no, "severity": rule["severity"],
                                 "title": rule["message"], "why": f"`{text.strip()[:120]}`", "suggestion": "",
                                 "confidence": 1.0, "source": "deterministic"})
    return findings


LENS_PROMPT = """Lens: "{lens}". You are assessing one change in a TypeScript browser game: a deterministic
simulation in game/sim (the only writer of WorldState) and a PixiJS renderer in game/render that only reads it.

Rules of this lens (each has pass and fail criteria):
{rules}

Organization context (fragment of AGENTS.md):
{context}

Reply exclusively with JSON:
{{"findings": [{{"file": "path", "line": 1, "severity": "blocking|recommendation|suggestion",
  "rule": "rule id or LENS", "title": "short", "why": "evidence from the code",
  "suggestion": "a ready fix or an empty string", "confidence": 0.0}}]}}"""


def lens_review(lens: str, rules: list[dict], diff: str, files: dict[str, str], context: str) -> list[dict]:
    lens_rules = [r for r in rules if r["kind"] == "llm" and r["lens"] == lens]
    rules_text = "\n".join(f"- {r['id']}: {r['rule']}\n  pass: {r['pass']}\n  fail: {r['fail']}\n  example of a fail: {r.get('example_fail', '')}"
                           for r in lens_rules) or "- (no rules, assess generally within this lens)"
    user = "DIFF:\n" + diff[:30000] + "\n\nFULL FILES AFTER THE CHANGE:\n" + "\n\n".join(
        f"=== {p} ===\n{t[:8000]}" for p, t in files.items())
    raw = a2a.send("reviewer", LENS_PROMPT.format(lens=lens, rules=rules_text, context=context[:6000]) + "\n\n" + user, timeout=300)
    try:
        found = llm.extract_json(raw).get("findings", [])
    except (ValueError, AttributeError):
        print(f"[{lens}] the model returned no JSON, skipping the lens", file=sys.stderr)
        return []
    for f in found:
        f["source"] = f"LLM: {lens}"
        f.setdefault("rule", lens.upper())
        f.setdefault("suggestion", "")
        f["confidence"] = float(f.get("confidence", 0))
        f["severity"] = f.get("severity") if f.get("severity") in SEVERITY_ORDER else "suggestion"
    return found


def curate(findings: list[dict], cfg: dict) -> tuple[list[dict], dict]:
    stats = {"raw": len(findings), "low_confidence": 0, "duplicates": 0, "over_cap": 0}
    kept, seen = [], set()
    for f in sorted(findings, key=lambda f: (SEVERITY_ORDER[f["severity"]], -f["confidence"])):
        key = (f.get("file"), f.get("line"), f.get("rule"))
        if f["confidence"] < cfg["min_confidence"]:
            stats["low_confidence"] += 1
        elif key in seen:
            stats["duplicates"] += 1
        elif len(kept) >= cfg["max_findings"] and f["severity"] != "blocking":
            stats["over_cap"] += 1
        else:
            seen.add(key)
            kept.append(f)
    return kept, stats


def render(findings, stats, risk, cfg, llm_used: str) -> str:
    certain = cfg["certain_confidence"]
    icon = {"low": "🟢", "medium": "🟡", "high": "🟠", "critical": "🔴"}[risk["level"]]
    out = ["<!-- agentic-review -->", f"## {icon} Review: risk **{risk['level']}** ({risk['score']} pts)", ""]
    if risk["signals"]:
        out.append("Signals: " + ", ".join(f"{s['name']} (+{s['points']})" for s in risk["signals"]))
        out.append("")
    sections = [("blocking", "🚫 Blocking"), ("recommendation", "💡 Recommendations"), ("suggestion", "✏️ Suggestions")]
    for severity, header in sections:
        items = [f for f in findings if f["severity"] == severity]
        if not items:
            continue
        out += [f"### {header}", ""]
        for f in items:
            tag = "" if f["confidence"] >= certain else " _(to verify)_"
            where = f"`{f.get('file')}:{f.get('line')}`" if f.get("file") else ""
            out.append(f"- **{f['title']}**{tag} {where} · {f['rule']} · {f['source']} · confidence {f['confidence']:.2f}")
            if f.get("why"):
                out.append(f"  {f['why']}")
            if f.get("suggestion"):
                out.append(f"  ```suggestion\n  {f['suggestion']}\n  ```")
        out.append("")
    if not findings:
        out += ["No findings above the confidence threshold.", ""]
    reviewers = ", ".join(f"{r['name']} ({r['module']})" for r in risk.get("suggested_reviewers", [])) or "no history"
    out += [
        f"<sub>LLM lenses: {llm_used}. Findings: {len(findings)} shown of {stats['raw']}; dropped: "
        f"{stats['low_confidence']} below the confidence threshold, {stats['duplicates']} duplicates, {stats['over_cap']} over the cap. "
        f"Suggested reviewer (git log, people only): {reviewers}.</sub>",
    ]
    return "\n".join(out)


def sarif(findings, rules) -> dict:
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "agentic-review", "informationUri": "https://github.com/",
                                "rules": [{"id": r["id"], "shortDescription": {"text": r.get("message") or r.get("rule")}} for r in rules]}},
            "results": [{
                "ruleId": f["rule"],
                "level": SARIF_LEVEL[f["severity"]],
                "message": {"text": f"{f['title']} {f.get('why', '')}".strip()},
                "locations": [{"physicalLocation": {"artifactLocation": {"uri": f["file"]},
                                                     "region": {"startLine": max(int(f.get("line") or 1), 1)}}}],
                "properties": {"confidence": f["confidence"], "source": f["source"]},
            } for f in findings if f.get("file")],
        }],
    }


def a2a_available() -> bool:
    try:
        a2a.card("reviewer")
        return True
    except Exception as err:
        print(f"review: the reviewer agent is not available ({err}), deterministic layer only", file=sys.stderr)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--risk", default=str(ROOT / ".sdlc" / "risk.json"))
    parser.add_argument("--out-md", default=str(ROOT / ".sdlc" / "review.md"))
    parser.add_argument("--out-sarif", default=str(ROOT / ".sdlc" / "review.sarif"))
    parser.add_argument("--fail-on-blocking", action="store_true")
    args = parser.parse_args()

    cfg = policy()["review"]
    rules = load_json(SDLC / "review-rules.json")["rules"]
    risk = load_json(Path(args.risk))
    findings = deterministic(rules, added_lines(args.base, args.head))

    wants_llm = ORDER.index(risk["level"]) >= ORDER.index(cfg["llm_from_level"])
    if wants_llm and a2a_available():
        diff = git("diff", f"{args.base}...{args.head}", "--", "system/", ":!system/bugs/manifest.json")
        files = {f["path"]: (ROOT / f["path"]).read_text(encoding="utf-8")
                 for f in risk["files"] if f["path"].endswith(".ts") and (ROOT / f["path"]).exists()}
        context = (ROOT / "AGENTS.md").read_text(encoding="utf-8") if (ROOT / "AGENTS.md").exists() else ""
        for lens in cfg["lenses"]:
            try:
                findings += lens_review(lens, rules, diff, files, context)
            except Exception as err:  # one lens must not bring the review down
                print(f"[{lens}] {err}", file=sys.stderr)
        llm_used = ", ".join(cfg["lenses"])
    elif wants_llm:
        llm_used = "skipped (the reviewer agent is not available)"
    else:
        llm_used = f"skipped (risk {risk['level']} below the threshold {cfg['llm_from_level']})"

    kept, stats = curate(findings, cfg)
    report = render(kept, stats, risk, cfg, llm_used)
    Path(args.out_md).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out_md).write_text(report, encoding="utf-8")
    write_json(Path(args.out_sarif), sarif(kept, rules))
    print(report)
    summary_md(report)
    if args.fail_on_blocking and any(f["severity"] == "blocking" for f in kept):
        sys.exit(1)


if __name__ == "__main__":
    main()
