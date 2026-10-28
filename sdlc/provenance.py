"""Provenance of a change (GitHub Actions, finale): is the code in the PR exactly what went through the factory.

The job runs outside the cluster and out of the agent's reach. It takes its tools and the public key from main,
never from the PR branch. It checks:

  boundaries  an agent/* branch does not touch the gates, the line, the oracle or the workflows (.github/)
  ledger      .factory/<order>/ledger.jsonl: the hash chain is whole
  signature   cosign verify-blob with the factory key from main (platform/line/cosign/cosign.pub)
  commit      the commit in the ledger (git.commit) is an ancestor of HEAD, and after it only .factory/ changes:
              the code that passed the gates in the cluster is the code that reaches main
  line        the line configuration hash in the ledger against main (a warning: main may have moved)

A human's PR (a branch outside agent/*) without a ledger passes with a note: it is not a factory change.

Usage:
  python3 sdlc/provenance.py --base origin/main --head HEAD --branch agent/issue-12 [--pub cosign.pub]
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path

import ledger
from factory import LINE_FILES
from lib import ROOT, git, summary_md

GATES = (".github/", "sdlc/", "platform/", "scenarios/", "system/architecture/", "system/bugs/tests/")


def changed(base: str, head: str) -> list[str]:
    return [p for p in git("diff", "--name-only", f"{base}...{head}").splitlines() if p]


def boundary(files: list[str], branch: str) -> list[str]:
    if not branch.startswith("agent/"):
        return []
    return [f for f in files if f.startswith(GATES)]


def ledgers(files: list[str]) -> list[str]:
    return sorted(f for f in files if f.startswith(".factory/") and f.endswith("/ledger.jsonl"))


def commit_matches(sha: str, head: str) -> tuple[bool, str]:
    """The commit in the ledger must be an ancestor of HEAD, and after it only .factory/ may be added."""
    if subprocess.run(["git", "merge-base", "--is-ancestor", sha, head], cwd=ROOT).returncode != 0:
        return False, f"commit {sha[:10]} from the ledger is not in the PR history: the code changed after the factory"
    after = [p for p in git("diff", "--name-only", sha, head).splitlines() if p]
    foreign = [p for p in after if not p.startswith(".factory/")]
    if foreign:
        return False, f"code changed after the commit in the ledger: {', '.join(foreign[:5])}"
    return True, f"PR code = commit {sha[:10]}, which passed the factory's gates"


def line_drift(records: list[dict], base: str) -> list[str]:
    config = next((r["data"] for r in records if r["type"] == "line.config"), None)
    if not config:
        return ["the ledger has no line configuration hash"]
    drift = []
    for name in LINE_FILES:
        try:
            now = hashlib.sha256(subprocess.run(["git", "show", f"{base}:{name}"], cwd=ROOT, capture_output=True,
                                                check=True).stdout).hexdigest()[:10]
        except subprocess.CalledProcessError:
            now = "none"
        if config.get("parts", {}).get(name) not in (None, now):
            drift.append(name)
    return drift


def signature(path: Path, pub: Path) -> tuple[bool, str]:
    bundle = path.with_name("ledger.sigstore.json")
    if not bundle.exists():
        return False, "no ledger signature (ledger.sigstore.json)"
    try:
        proc = subprocess.run(["cosign", "verify-blob", "--key", str(pub), "--bundle", str(bundle), "--insecure-ignore-tlog",
                               str(path)], capture_output=True, text=True)
    except FileNotFoundError:
        return False, "no cosign in this environment"
    return proc.returncode == 0, "signed with the factory key: OK" if proc.returncode == 0 else f"signature does not match: {proc.stderr.strip()[-200:]}"


def check(base: str, head: str, branch: str, pub: Path) -> tuple[bool, list[str]]:
    files = changed(base, head)
    lines, ok = [], True

    crossed = boundary(files, branch)
    if crossed:
        ok = False
        lines.append(f"❌ boundaries: the agent branch changes gates or workflows: {', '.join(crossed[:8])}")
    elif branch.startswith("agent/"):
        lines.append("✅ boundaries: no changes to the gates, the line, the oracle or .github/")

    found = ledgers(files)
    if not found:
        if branch.startswith("agent/"):
            return False, lines + ["❌ ledger: an agent change without the factory ledger (.factory/<order>/ledger.jsonl)"]
        return ok, lines + ["ℹ️ a PR from outside the factory: no ledger, a human's review checks provenance"]

    for name in found:
        path = ROOT / name
        records = ledger.read(path)
        chain_ok, chain = ledger.verify(path)
        sig_ok, sig = signature(path, pub)
        commit = next((r["data"] for r in reversed(records) if r["type"] == "git.commit"), None)
        code_ok, code = commit_matches(commit["sha"], head) if commit else (False, "the ledger has no git.commit event")
        ok = ok and chain_ok and sig_ok and code_ok
        lines += [f"**{name}**", f"{'✅' if chain_ok else '❌'} chain: {chain}", f"{'✅' if sig_ok else '❌'} {sig}",
                  f"{'✅' if code_ok else '❌'} {code}"]
        drift = line_drift(records, base)
        lines.append("✅ line: the configuration in the ledger = main" if not drift else
                     f"⚠️ line: main moved since the run ({', '.join(drift)}); the run used another version of the gates")
        trace = next((r["data"].get("url") for r in records if r["type"] == "trace"), "")
        if trace:
            lines.append(f"🔭 trace of the run: {trace}")
    return ok, lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--pub", default=str(ROOT / "platform" / "line" / "cosign" / "cosign.pub"))
    args = parser.parse_args()
    ok, lines = check(args.base, args.head, args.branch, Path(args.pub))
    report = f"### 🔏 Provenance: {'✅' if ok else '❌'}\n\n" + "\n".join(f"- {l}" if not l.startswith("**") else f"\n{l}" for l in lines)
    print(report)
    summary_md(report)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
