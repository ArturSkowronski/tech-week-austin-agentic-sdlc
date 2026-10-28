"""The factory on GitHub (finale): an issue is the work order, a PR is the result. Standard library only.

GitHub stands on both ends of the line, and the line stays in Argo:

  issue labelled `factory` or `planted`  → the CronWorkflow `factory-pull` takes the oldest (the factory pulls, it does not push).
                                           `planted` is the label the game's "Raise ticket on GitHub" button sets (ADR-006).
  intake rejects                         → a comment with questions under the issue, label factory:sent-back
  lights-out | human                     → a PR with the description, the card, the ledger and the factory's first review;
                                           lights-out turns on auto-merge
  andon or a line failure                → a comment under the issue, label factory:andon

The token (GH_TOKEN) and the repo (GH_REPO=owner/name) are seen only by the steps that talk to GitHub. The steps
that build the agent's code have neither the token nor the cosign key. Git gets the token in a header, never in a URL.

Every participant works on their own fork: GH_REPO is the fork, PRs go to the fork's main.

Usage:
  python3 sdlc/github.py fork                                      # prepare the fork: issues, actions, auto-merge,
                                                                   # labels, main protection, the cosign key on main
  python3 sdlc/github.py labels                                    # create the factory's labels in the repo
  python3 sdlc/github.py issue hw-001                              # an issue from the work order orders/hw-001.md
  python3 sdlc/github.py issue hw-001 --dry-run                    # print what would be created, touch nothing
  python3 sdlc/github.py pull                                      # take the oldest issue onto the line
  python3 sdlc/github.py order --issue 12                          # JSON {name, title, body, issue, url}
  python3 sdlc/github.py git fetch -q {remote} main                # git with the token in a header
  python3 sdlc/github.py send-back --issue 12 --file intake.md
  python3 sdlc/github.py andon --issue 12 --file andon.md
  python3 sdlc/github.py pr --issue 12 --out /work/out/issue-12/attempt-2 --decision lights-out
  python3 sdlc/github.py finish --issue 12 --status Failed         # onExit: the issue does not stay "in progress"
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import orders
import tracing
from lib import ROOT, outputs

API = os.environ.get("GITHUB_API", "https://api.github.com")
LABELS = {
    "factory": ("0e8a16", "A work order for the factory: the line takes it by itself"),
    "planted": ("5319e7", "A planted bug raised from the game (ADR-006): the factory takes it like a work order"),
    "bug": ("d73a4a", "Something is not working"),
    "factory:in-progress": ("fbca04", "The line is working on this work order"),
    "factory:sent-back": ("d93f0b", "Intake sent the work order back with questions"),
    "factory:andon": ("b60205", "The line stopped, a human decides"),
    "factory:pr": ("1d76db", "The work order has a PR from the factory"),
    "factory:lights-out": ("5319e7", "A PR without a human: merge after the GitHub gates are green"),
    "factory:human": ("fbca04", "The PR waits for a human's review (risk or a blocking review)"),
}
TAKES = {"factory", "planted"}
# Job names from .github/workflows/factory.yml: required checks on main, auto-merge waits for them.
CHECKS = ["gates", "oracle", "review", "provenance"]
COSIGN_PUB = "platform/line/cosign/cosign.pub"
BUSY = {"factory:in-progress", "factory:sent-back", "factory:andon", "factory:pr"}
REVIEW_MARKER = "<!-- factory-review -->"


def repo() -> str:
    value = os.environ.get("GH_REPO", "")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", value):
        sys.exit("GH_REPO must look like owner/repo (make github)")
    return value


def call(method: str, path: str, data: dict | None = None, *, ok_missing: bool = False):
    url = path if path.startswith("http") else f"{API}{path}"
    request = urllib.request.Request(url, method=method, data=json.dumps(data).encode() if data is not None else None,
                                     headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}",
                                              "Accept": "application/vnd.github+json",
                                              "X-GitHub-Api-Version": "2022-11-28",
                                              "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
    except urllib.error.HTTPError as err:
        if ok_missing and err.code == 404:
            return None
        body = err.read()[:300]
        if err.code == 403 and b"not accessible by integration" in body:
            raise SystemExit("GitHub refused (403): this is the codespace token, which cannot change repo settings.\n"
                             "Log in with your own account: env -u GITHUB_TOKEN gh auth login -h github.com -s repo,workflow\n"
                             "Then again: make github") from err
        raise RuntimeError(f"GitHub {method} {path}: HTTP {err.code} {body!r}") from err
    return json.loads(body) if body else None


def graphql(query: str, variables: dict) -> dict:
    result = call("POST", f"{API}/graphql", {"query": query, "variables": variables})
    if result.get("errors"):
        raise RuntimeError("; ".join(e.get("message", "?") for e in result["errors"]))
    return result["data"]


# ---------------------------------------------------------------- issue → work order

def ensure_labels() -> list[str]:
    existing = {l["name"] for l in call("GET", f"/repos/{repo()}/labels?per_page=100")}
    created = []
    for name, (color, description) in LABELS.items():
        if name not in existing:
            call("POST", f"/repos/{repo()}/labels", {"name": name, "color": color, "description": description})
            created.append(name)
    return created


def pick(issues: list[dict]) -> dict | None:
    """The oldest open issue labelled `factory` or `planted` the line has not touched yet. PRs are issues too: skip them."""
    for issue in sorted(issues, key=lambda i: i["number"]):
        labels = {l["name"] for l in issue.get("labels", [])}
        if "pull_request" not in issue and labels & TAKES and not labels & BUSY:
            return issue
    return None


def label(issue: int, add: list[str] = (), remove: list[str] = ()) -> None:
    if add:
        call("POST", f"/repos/{repo()}/issues/{issue}/labels", {"labels": list(add)})
    for name in remove:
        call("DELETE", f"/repos/{repo()}/issues/{issue}/labels/{urllib.request.quote(name)}", ok_missing=True)


def comment(issue: int, body: str) -> None:
    call("POST", f"/repos/{repo()}/issues/{issue}/comments", {"body": body})


def order(issue: dict) -> dict:
    """An issue as a work order: the title is the title, the body carries the criteria. Intake checks it like a file."""
    return {"name": f"issue-{issue['number']}", "title": issue["title"].strip(), "body": (issue.get("body") or "").strip(),
            "issue": issue["number"], "url": issue["html_url"]}


def issue_payload(name: str) -> dict:
    """The issue for a work order. A planted bug (orders/hw-NNN.md) gets the game's title and labels (ADR-006)."""
    local = orders.load(name)
    planted = re.fullmatch(r"hw-(\d+)", local["name"])
    if planted:
        return {"title": f"HW-{planted.group(1)}: {local['title']}", "body": local["body"], "labels": ["bug", "planted"]}
    return {"title": local["title"], "body": local["body"], "labels": ["factory"]}


def prepare_fork() -> list[str]:
    """A fork has issues and Actions off by default. We turn on what the factory needs and say what we could not."""
    notes = []
    call("PATCH", f"/repos/{repo()}", {"has_issues": True, "allow_auto_merge": True, "allow_merge_commit": True,
                                      "delete_branch_on_merge": True})
    notes.append("issues, auto-merge and merge commits on")
    try:
        call("PUT", f"/repos/{repo()}/actions/permissions", {"enabled": True, "allowed_actions": "all"})
        notes.append("GitHub Actions on")
    except RuntimeError as err:
        notes.append(f"⚠️ Actions: turn them on by hand in the fork's Actions tab ({err})")
    created = ensure_labels()
    notes.append(f"labels: {', '.join(created) or 'already there'}")
    notes.append(sync_cosign_pub())  # before protecting main: the only write to main outside PRs
    try:
        call("PUT", f"/repos/{repo()}/branches/main/protection", {
            "required_status_checks": {"strict": False, "contexts": CHECKS}, "enforce_admins": False,
            "required_pull_request_reviews": None, "restrictions": None})
        notes.append(f"main protected: merge only after green {', '.join(CHECKS)}")
    except RuntimeError as err:
        notes.append(f"⚠️ protecting main failed ({err}); without it auto-merge does not wait for the gates")
    return notes


def sync_cosign_pub() -> str:
    """The `provenance` job checks the signature with the key from the fork's main. The key was made in your cluster."""
    local = ROOT / COSIGN_PUB
    if not local.exists():
        return "⚠️ no local cosign key: make cosign-keys, then make github"
    remote = call("GET", f"/repos/{repo()}/contents/{COSIGN_PUB}?ref=main", ok_missing=True)
    content = local.read_bytes()
    if remote and base64.b64decode(remote["content"]) == content:
        return "the cosign key on the fork's main = your cluster's key"
    call("PUT", f"/repos/{repo()}/contents/{COSIGN_PUB}", {
        "message": "factory: the ledger's public key from my cluster", "branch": "main",
        "content": base64.b64encode(content).decode(), **({"sha": remote["sha"]} if remote else {})})
    return "your cluster's cosign key uploaded to the fork's main (a commit through the API, this file only)"


# ---------------------------------------------------------------- git with the token

def git(*args: str) -> int:
    """git with the token in an HTTP header (like actions/checkout). `{remote}` in the arguments is the repo on GitHub."""
    auth = base64.b64encode(f"x-access-token:{os.environ['GH_TOKEN']}".encode()).decode()
    remote = f"https://github.com/{repo()}.git"
    command = ["git", "-c", f"http.https://github.com/.extraheader=AUTHORIZATION: basic {auth}",
               "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
               *[a.replace("{remote}", remote) for a in args]]
    return subprocess.run(command).returncode


# ---------------------------------------------------------------- result → PR

def _read(folder: Path, name: str) -> str:
    path = folder / name
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


def pr_body(out: Path, issue: int, decision: str, name: str, trace_url: str, run_url: str) -> str:
    """The PR description: why (the issue), what (the agent's description), how it passed (the card), where the trace is."""
    closes = f"Closes #{issue}" if decision in ("lights-out", "human", "waiting") else f"Work order #{issue}"
    who = ("🌑 **lights-out**: merges by itself once the GitHub gates are green." if decision == "lights-out" else
           "👤 **Waiting for a human**: risk or a blocking review. Approve or reject in this PR (ADR-010, ADR-011).")
    links = [f"[trace in Jaeger]({trace_url})" if trace_url else "", f"[run on the floor]({run_url})" if run_url else "",
             f"ledger: `.factory/{name}/ledger.jsonl` (cosign signature next to it, checked by the `provenance` job)"]
    return "\n\n".join(p for p in [
        f"{closes}. {who}",
        _read(out, "description.md"),
        _read(out, "card.md"),
        " · ".join(l for l in links if l),
        "<sub>The factory opened this PR. The `builder` agent wrote the code; the gates are in the cluster and in GitHub Actions.</sub>",
    ] if p)


def review_comments(sarif: dict, changed: set[str]) -> list[dict]:
    """Findings from SARIF as line comments, only in the changed files (GitHub rejects the rest)."""
    comments = []
    for run in sarif.get("runs", []):
        for result in run.get("results", []):
            for location in result.get("locations", [])[:1]:
                physical = location.get("physicalLocation", {})
                path = physical.get("artifactLocation", {}).get("uri", "")
                line = physical.get("region", {}).get("startLine")
                if path in changed and line:
                    level = {"error": "🚫", "warning": "⚠️"}.get(result.get("level"), "💡")
                    comments.append({"path": path, "line": line, "side": "RIGHT",
                                     "body": f"{level} **{result.get('ruleId', '')}** {result['message']['text']}"})
    return comments[:20]


def post_review(number: int, review_md: str, sarif: dict, changed: set[str]) -> None:
    """The factory's first review as a PR review (COMMENT, not APPROVE: the gates and a human decide)."""
    body = f"{REVIEW_MARKER}\n{review_md or 'Factory review: no report.'}"
    comments = review_comments(sarif, changed)
    try:
        call("POST", f"/repos/{repo()}/pulls/{number}/reviews", {"event": "COMMENT", "body": body, "comments": comments})
    except RuntimeError as err:
        if not comments:
            raise
        print(f"line comments rejected ({err}), sending the summary only", file=sys.stderr)
        call("POST", f"/repos/{repo()}/pulls/{number}/reviews", {"event": "COMMENT", "body": body})


def open_pr(branch: str, title: str, body: str, draft: bool = False) -> dict:
    owner = repo().split("/")[0]
    existing = call("GET", f"/repos/{repo()}/pulls?state=open&head={owner}:{urllib.request.quote(branch)}")
    if existing:
        return call("PATCH", f"/repos/{repo()}/pulls/{existing[0]['number']}", {"title": title, "body": body})
    return call("POST", f"/repos/{repo()}/pulls", {"title": title, "head": branch, "base": "main", "body": body, "draft": draft})


def auto_merge(pr: dict) -> str:
    try:
        graphql("mutation($id: ID!) { enablePullRequestAutoMerge(input: {pullRequestId: $id, mergeMethod: MERGE}) "
                "{ pullRequest { number } } }", {"id": pr["node_id"]})
        return "auto-merge on: merges after the required gates are green"
    except RuntimeError as err:
        return f"auto-merge not available ({err}). Turn on \"Allow auto-merge\" and protect main with required checks"


def publish(issue: int, out: Path, decision: str, name: str, trace_url: str, run_url: str) -> dict:
    title = json.loads((ROOT / ".sdlc" / "order.json").read_text(encoding="utf-8"))["title"]
    branch = f"agent/{name}"
    body = pr_body(out, issue, decision, name, trace_url, run_url)
    pr = open_pr(branch, title, body)
    changed = {f["filename"] for f in call("GET", f"/repos/{repo()}/pulls/{pr['number']}/files?per_page=100")}
    sarif_path = out / "review.sarif"
    post_review(pr["number"], _read(out, "review-1-risk.md") + "\n\n" + _read(out, "review-2-review.md"),
                json.loads(sarif_path.read_text(encoding="utf-8")) if sarif_path.exists() else {}, changed)
    decided = "factory:lights-out" if decision == "lights-out" else "factory:human"
    label(pr["number"], add=[decided])
    label(issue, add=["factory:pr"], remove=["factory:in-progress"])
    merge = auto_merge(pr) if decision == "lights-out" else "merge after a human's review"
    comment(issue, f"🏭 The factory opened {pr['html_url']} ({decision}). {merge}.")
    print(f"PR: {pr['html_url']} ({decision}). {merge}")
    return pr


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fork")
    sub.add_parser("labels")
    sub.add_parser("pull")
    i = sub.add_parser("issue")
    i.add_argument("name")
    i.add_argument("--dry-run", action="store_true")
    z = sub.add_parser("order")
    z.add_argument("--issue", type=int, required=True)
    g = sub.add_parser("git")
    g.add_argument("args", nargs=argparse.REMAINDER)
    for name in ("send-back", "andon"):
        s = sub.add_parser(name)
        s.add_argument("--issue", type=int, required=True)
        s.add_argument("--file", required=True)
    p = sub.add_parser("pr")
    p.add_argument("--issue", type=int, required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--decision", required=True)
    k = sub.add_parser("finish")
    k.add_argument("--issue", type=int, required=True)
    k.add_argument("--status", required=True)
    args = parser.parse_args()

    trace_url = tracing.url(tracing.Step().trace_id)
    run = os.environ.get("FACTORY_RUN", "")
    run_url = f"{os.environ.get('FACTORY_FLOOR', 'http://localhost:2746')}/workflows/factory/{run}" if run else ""

    if args.cmd == "issue" and args.dry_run:
        print(json.dumps(issue_payload(args.name), ensure_ascii=False, indent=2))
    elif args.cmd == "fork":
        print("\n".join(f"  {n}" for n in prepare_fork()))
    elif args.cmd == "labels":
        print("labels:", ", ".join(ensure_labels()) or "all there already")
    elif args.cmd == "issue":
        created = call("POST", f"/repos/{repo()}/issues", issue_payload(args.name))
        print(f"issue #{created['number']}: {created['html_url']}")
    elif args.cmd == "pull":
        issue = pick(call("GET", f"/repos/{repo()}/issues?state=open&per_page=100"))
        if not issue:
            print("no new work orders labelled factory or planted")
            outputs(issue="")
            return
        label(issue["number"], add=["factory:in-progress"])
        print(f"taking #{issue['number']}: {issue['title']}")
        outputs(issue=str(issue["number"]))
    elif args.cmd == "order":
        print(json.dumps(order(call("GET", f"/repos/{repo()}/issues/{args.issue}")), ensure_ascii=False, indent=2))
    elif args.cmd == "git":
        sys.exit(git(*args.args))
    elif args.cmd == "send-back":
        comment(args.issue, "↩️ The factory did not accept this work order. Complete the description and remove the label "
                "`factory:sent-back`, and the line takes it again.\n\n" + Path(args.file).read_text(encoding="utf-8"))
        label(args.issue, add=["factory:sent-back"], remove=["factory:in-progress"])
    elif args.cmd == "andon":
        link = f"\n\n[Trace of the run]({trace_url}) · [the floor]({run_url})" if trace_url else ""
        comment(args.issue, "🚨 **Andon**: the line stopped, the factory does not guess any further.\n\n"
                + Path(args.file).read_text(encoding="utf-8") + link)
        label(args.issue, add=["factory:andon"], remove=["factory:in-progress"])
    elif args.cmd == "pr":
        publish(args.issue, Path(args.out), args.decision, f"issue-{args.issue}", trace_url, run_url)
    elif args.cmd == "finish":
        labels = {l["name"] for l in call("GET", f"/repos/{repo()}/issues/{args.issue}/labels")}
        if "factory:in-progress" in labels:
            comment(args.issue, f"🚨 The line ended in state `{args.status}` without a factory decision. "
                    f"See [the run]({run_url})" + (f" and [the trace]({trace_url})." if trace_url else "."))
            label(args.issue, add=["factory:andon"], remove=["factory:in-progress"])


if __name__ == "__main__":
    main()
