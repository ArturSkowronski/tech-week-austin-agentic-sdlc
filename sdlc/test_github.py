"""Tests of the factory on GitHub without GitHub: a fake REST/GraphQL API in a thread."""

import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import github


class FakeGitHub(BaseHTTPRequestHandler):
    calls = []
    reject_inline = False
    existing_pr = None
    issues = []
    labels = []

    def _reply(self, code, data):
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _handle(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length)) if length else None
        FakeGitHub.calls.append((method, self.path, body))
        path = self.path
        if path.endswith("/reviews") and FakeGitHub.reject_inline and body.get("comments"):
            return self._reply(422, {"message": "line must be part of the diff"})
        if method == "GET" and "/pulls?state=open" in path:
            return self._reply(200, [FakeGitHub.existing_pr] if FakeGitHub.existing_pr else [])
        if method == "GET" and "/issues?state=open" in path:
            return self._reply(200, FakeGitHub.issues)
        if method == "GET" and path.endswith("/labels"):
            return self._reply(200, [{"name": l} for l in FakeGitHub.labels])
        if method == "GET" and "/issues/" in path:
            return self._reply(200, issue(int(path.rsplit("/", 1)[1]), ["factory"]))
        if method == "GET" and path.endswith("/files?per_page=100"):
            return self._reply(200, [{"filename": "system/game/sim/tick.ts"}])
        if method in ("POST", "PATCH") and "/pulls" in path and not path.endswith("/reviews"):
            return self._reply(201, {"number": 7, "node_id": "PR_7", "html_url": "https://github.com/o/r/pull/7"})
        if path == "/graphql":
            return self._reply(200, {"data": {"enablePullRequestAutoMerge": {"pullRequest": {"number": 7}}}})
        if method == "DELETE":
            return self._reply(404, {"message": "Label does not exist"})
        return self._reply(200, {})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PATCH(self):
        self._handle("PATCH")

    def do_DELETE(self):
        self._handle("DELETE")

    def log_message(self, *args):
        pass


def issue(number, labels, pr=False):
    data = {"number": number, "title": f"Work order {number}", "body": "Criteria:\n- a", "html_url": f"https://x/{number}",
            "labels": [{"name": l} for l in labels]}
    if pr:
        data["pull_request"] = {}
    return data


class GitHubTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), FakeGitHub)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        github.API = f"http://127.0.0.1:{cls.server.server_port}"
        os.environ.update({"GH_TOKEN": "t0k3n", "GH_REPO": "o/r"})
        for key in ("TRACEPARENT", "FACTORY_RUN", "OUTPUTS_DIR"):
            os.environ.pop(key, None)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        FakeGitHub.calls.clear()
        FakeGitHub.reject_inline = False
        FakeGitHub.existing_pr = None
        FakeGitHub.issues = []
        FakeGitHub.labels = []

    def run_main(self, *args):
        old = sys.argv
        sys.argv = ["github.py", *args]
        try:
            github.main()
        finally:
            sys.argv = old

    def test_pick_takes_oldest_untouched_issue_and_skips_prs(self):
        issues = [issue(9, ["factory"]), issue(3, ["factory", "factory:in-progress"]), issue(5, ["factory"], pr=True),
                  issue(6, ["factory"]), issue(2, ["bug"])]
        self.assertEqual(github.pick(issues)["number"], 6)
        self.assertIsNone(github.pick([issue(1, ["factory", "factory:sent-back"])]))

    def test_pick_takes_planted_bugs_from_the_game(self):
        issues = [issue(8, ["factory"]), issue(4, ["bug", "planted"]), issue(1, ["bug", "planted", "factory:pr"])]
        self.assertEqual(github.pick(issues)["number"], 4)

    def test_issue_becomes_work_order(self):
        order = github.order(issue(12, ["factory"]))
        self.assertEqual((order["name"], order["issue"]), ("issue-12", 12))
        self.assertIn("Criteria:", order["body"])

    def test_planted_order_gets_the_game_title_and_labels(self):
        payload = github.issue_payload("hw-001")
        self.assertEqual(payload["title"], "HW-001: Left and right swap while the creature rides")
        self.assertEqual(payload["labels"], ["bug", "planted"])
        self.assertIn("Criteria:", payload["body"])
        self.assertEqual(github.issue_payload("hud-speed")["labels"], ["factory"])

    def test_pr_body_closes_issue_and_links_trace(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "description.md").write_text("The F1 line shows the speed.")
            (out / "card.md").write_text("### 🏭 Work order card")
            body = github.pr_body(out, 12, "lights-out", "issue-12", "http://j/trace/abc", "http://floor/x")
        self.assertTrue(body.startswith("Closes #12."))
        self.assertIn("lights-out", body)
        self.assertIn("The F1 line shows the speed.", body)
        self.assertIn("[trace in Jaeger](http://j/trace/abc)", body)
        self.assertIn(".factory/issue-12/ledger.jsonl", body)

    def test_review_comments_only_for_changed_files(self):
        sarif = {"runs": [{"results": [
            {"ruleId": "DET-004", "level": "error", "message": {"text": "Math.random in the sim"},
             "locations": [{"physicalLocation": {"artifactLocation": {"uri": "a.ts"}, "region": {"startLine": 4}}}]},
            {"ruleId": "LLM", "level": "warning", "message": {"text": "outside the change"},
             "locations": [{"physicalLocation": {"artifactLocation": {"uri": "b.ts"}, "region": {"startLine": 1}}}]}]}]}
        comments = github.review_comments(sarif, {"a.ts"})
        self.assertEqual(len(comments), 1)
        self.assertEqual((comments[0]["path"], comments[0]["line"]), ("a.ts", 4))
        self.assertIn("🚫 **DET-004**", comments[0]["body"])

    def test_review_falls_back_to_summary_when_inline_rejected(self):
        FakeGitHub.reject_inline = True
        sarif = {"runs": [{"results": [{"ruleId": "R", "level": "note", "message": {"text": "x"},
                                        "locations": [{"physicalLocation": {"artifactLocation": {"uri": "a.ts"}, "region": {"startLine": 1}}}]}]}]}
        github.post_review(7, "report", sarif, {"a.ts"})
        reviews = [c for c in FakeGitHub.calls if c[1].endswith("/reviews")]
        self.assertEqual(len(reviews), 2)
        self.assertEqual(reviews[-1][2]["event"], "COMMENT")
        self.assertNotIn("comments", reviews[-1][2])

    def test_publish_lights_out_enables_auto_merge_and_moves_labels(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "review-2-review.md").write_text("### Review")
            state = github.ROOT / ".sdlc"
            state.mkdir(exist_ok=True)
            existed = (state / "order.json").read_text() if (state / "order.json").exists() else None
            (state / "order.json").write_text(json.dumps({"title": "The F1 debug line shows the wizard's speed"}))
            try:
                github.publish(12, out, "lights-out", "issue-12", "", "")
            finally:
                if existed is None:
                    (state / "order.json").unlink()
                else:
                    (state / "order.json").write_text(existed)
        paths = [(m, p) for m, p, _ in FakeGitHub.calls]
        created = next(b for m, p, b in FakeGitHub.calls if m == "POST" and p == "/repos/o/r/pulls")
        self.assertEqual((created["head"], created["base"], created["title"]),
                         ("agent/issue-12", "main", "The F1 debug line shows the wizard's speed"))
        self.assertIn(("POST", "/graphql"), paths)
        self.assertIn(("POST", "/repos/o/r/issues/7/labels"), paths)
        self.assertIn(("DELETE", "/repos/o/r/issues/12/labels/factory%3Ain-progress"), paths)

    def test_publish_updates_existing_pr_instead_of_opening_second(self):
        FakeGitHub.existing_pr = {"number": 7}
        pr = github.open_pr("agent/issue-12", "Startle", "description")
        self.assertEqual(pr["number"], 7)
        self.assertIn(("PATCH", "/repos/o/r/pulls/7"), [(m, p) for m, p, _ in FakeGitHub.calls])

    def test_pull_marks_the_picked_issue_in_progress(self):
        FakeGitHub.issues = [issue(5, ["bug", "planted"]), issue(3, ["factory", "factory:andon"])]
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["OUTPUTS_DIR"] = tmp
            try:
                self.run_main("pull")
            finally:
                os.environ.pop("OUTPUTS_DIR")
            self.assertEqual((Path(tmp) / "issue").read_text(), "5")
        added = [b for m, p, b in FakeGitHub.calls if m == "POST" and p == "/repos/o/r/issues/5/labels"]
        self.assertEqual(added, [{"labels": ["factory:in-progress"]}])

    def test_pull_without_work_orders_outputs_empty_issue(self):
        FakeGitHub.issues = [issue(3, ["factory", "factory:pr"])]
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["OUTPUTS_DIR"] = tmp
            try:
                self.run_main("pull")
            finally:
                os.environ.pop("OUTPUTS_DIR")
            self.assertEqual((Path(tmp) / "issue").read_text(), "")
        self.assertFalse(any(m == "POST" for m, _, _ in FakeGitHub.calls))

    def test_send_back_comments_and_moves_labels(self):
        with tempfile.TemporaryDirectory() as tmp:
            questions = Path(tmp) / "intake.md"
            questions.write_text("- How high is the second jump?")
            self.run_main("send-back", "--issue", "12", "--file", str(questions))
        comment = next(b for m, p, b in FakeGitHub.calls if m == "POST" and p == "/repos/o/r/issues/12/comments")
        self.assertIn("How high is the second jump?", comment["body"])
        self.assertIn("factory:sent-back", comment["body"])
        paths = [(m, p) for m, p, _ in FakeGitHub.calls]
        self.assertIn(("POST", "/repos/o/r/issues/12/labels"), paths)
        self.assertIn(("DELETE", "/repos/o/r/issues/12/labels/factory%3Ain-progress"), paths)

    def test_finish_raises_andon_only_when_still_in_progress(self):
        FakeGitHub.labels = ["factory", "factory:in-progress"]
        self.run_main("finish", "--issue", "12", "--status", "Failed")
        added = [b for m, p, b in FakeGitHub.calls if m == "POST" and p == "/repos/o/r/issues/12/labels"]
        self.assertEqual(added, [{"labels": ["factory:andon"]}])
        FakeGitHub.calls.clear()
        FakeGitHub.labels = ["factory", "factory:pr"]
        self.run_main("finish", "--issue", "12", "--status", "Succeeded")
        self.assertFalse(any(m == "POST" for m, _, _ in FakeGitHub.calls), "a decided work order is left alone")

    def test_token_goes_in_header_not_in_url_and_hooks_are_off(self):
        seen = []
        original = github.subprocess.run
        github.subprocess.run = lambda command: seen.append(command) or type("R", (), {"returncode": 0})()
        try:
            github.git("push", "-q", "{remote}", "agent/issue-12")
        finally:
            github.subprocess.run = original
        command = seen[0]
        self.assertIn("https://github.com/o/r.git", command)
        self.assertFalse(any("t0k3n" in part for part in command), "the token must not appear in the arguments")
        self.assertTrue(any(part.startswith("http.https://github.com/.extraheader=AUTHORIZATION: basic ") for part in command))
        self.assertIn("core.hooksPath=/dev/null", command)

    def test_repo_must_look_like_owner_slash_name(self):
        os.environ["GH_REPO"] = "bad repo"
        try:
            with self.assertRaises(SystemExit):
                github.repo()
        finally:
            os.environ["GH_REPO"] = "o/r"


if __name__ == "__main__":
    unittest.main()
