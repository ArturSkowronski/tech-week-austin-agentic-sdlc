"""Provenance tests on a real repo in a temporary directory, with a real cosign signature (as on the line)."""

import hashlib
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import ledger
import lib
import provenance

CODE = Path("system") / "game" / "sim" / "tick.ts"


def sh(cwd, *args, env=None):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True, env=env)


@unittest.skipUnless(shutil.which("cosign"), "cosign not available")
class ProvenanceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = root = Path(self.tmp.name)
        sh(root, "git", "init", "-q", "-b", "main")
        sh(root, "git", "config", "user.email", "t@t")
        sh(root, "git", "config", "user.name", "t")
        for name in provenance.LINE_FILES:
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text(f"{name}\n")
        (root / CODE).parent.mkdir(parents=True, exist_ok=True)
        (root / CODE).write_text("export const STARTLE = 0;\n")
        sh(root, "git", "add", "-A")
        sh(root, "git", "commit", "-qm", "main")
        env = {**os.environ, "COSIGN_PASSWORD": ""}
        sh(root, "cosign", "generate-key-pair", env=env)
        self.pub = root / "cosign.pub"
        self._patch = (provenance.ROOT, lib.ROOT)
        provenance.ROOT = lib.ROOT = root

    def tearDown(self):
        provenance.ROOT, lib.ROOT = self._patch
        self.tmp.cleanup()

    def factory_change(self, sign=True):
        """What the line does: the agent's commit, a ledger with the line hash and the commit, a signature, a .factory/ commit."""
        root = self.root
        sh(root, "git", "switch", "-q", "-c", "agent/issue-12")
        (root / CODE).write_text("export const STARTLE = 12;\n")
        sh(root, "git", "commit", "-qam", "agent: startle")
        sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True).stdout.strip()
        book = root / ".factory" / "issue-12" / "ledger.jsonl"
        parts = {n: hashlib.sha256((root / n).read_bytes()).hexdigest()[:10] for n in provenance.LINE_FILES}
        ledger.append(book, "line.config", {"hash": "x", "parts": parts})
        ledger.append(book, "git.commit", {"sha": sha, "branch": "agent/issue-12"})
        ledger.append(book, "trace", {"url": "http://localhost:16686/trace/abc"})
        if sign:
            sh(root, "cosign", "sign-blob", "--yes", "--key", "cosign.key", "--tlog-upload=false", "--use-signing-config=false",
               "--bundle", str(book.with_name("ledger.sigstore.json")), str(book), env={**os.environ, "COSIGN_PASSWORD": ""})
        sh(root, "git", "add", ".factory")
        sh(root, "git", "commit", "-qm", "factory: ledger")
        return book

    def run_check(self, branch="agent/issue-12"):
        return provenance.check("main", "HEAD", branch, self.pub)

    def test_factory_change_passes(self):
        self.factory_change()
        ok, lines = self.run_check()
        self.assertTrue(ok, lines)
        self.assertTrue(any("trace of the run" in l for l in lines))
        self.assertTrue(any("✅ line:" in l for l in lines), lines)

    def test_code_changed_after_gates_fails(self):
        self.factory_change()
        (self.root / CODE).write_text("export const STARTLE = 99;\n")
        sh(self.root, "git", "commit", "-qam", "manual fix after the gates")
        ok, lines = self.run_check()
        self.assertFalse(ok)
        self.assertTrue(any("code changed after the commit in the ledger" in l for l in lines), lines)

    def test_edited_ledger_fails_chain_and_signature(self):
        book = self.factory_change()
        book.write_text(book.read_text().replace("agent/issue-12", "agent/other"))
        sh(self.root, "git", "commit", "-qam", "swap the ledger")
        ok, lines = self.run_check()
        self.assertFalse(ok)
        self.assertTrue(any("❌ chain" in l for l in lines), lines)
        self.assertTrue(any("signature does not match" in l for l in lines), lines)

    def test_unsigned_ledger_fails(self):
        self.factory_change(sign=False)
        ok, lines = self.run_check()
        self.assertFalse(ok)
        self.assertTrue(any("no ledger signature" in l for l in lines), lines)

    def test_agent_branch_touching_workflows_fails(self):
        self.factory_change()
        (self.root / ".github" / "workflows").mkdir(parents=True)
        (self.root / ".github" / "workflows" / "factory.yml").write_text("on: push\n")
        sh(self.root, "git", "add", "-A")
        sh(self.root, "git", "commit", "-qm", "turn off the gates")
        ok, lines = self.run_check()
        self.assertFalse(ok)
        self.assertTrue(any("❌ boundaries" in l for l in lines), lines)

    def test_agent_branch_touching_bug_tests_fails(self):
        self.factory_change()
        test = self.root / "system" / "bugs" / "tests" / "hw-001-input-map.test.ts"
        test.parent.mkdir(parents=True)
        test.write_text("it.skip('HW-001')\n")
        sh(self.root, "git", "add", "-A")
        sh(self.root, "git", "commit", "-qm", "skip the paired bug test")
        ok, lines = self.run_check()
        self.assertFalse(ok)
        self.assertTrue(any("❌ boundaries" in l and "system/bugs/tests/" in l for l in lines), lines)

    def test_agent_branch_without_ledger_fails_human_branch_passes(self):
        sh(self.root, "git", "switch", "-q", "-c", "agent/issue-13")
        (self.root / CODE).write_text("export const STARTLE = 1;\n")
        sh(self.root, "git", "commit", "-qam", "no ledger")
        self.assertFalse(self.run_check("agent/issue-13")[0])
        ok, lines = self.run_check("feature/by-hand")
        self.assertTrue(ok)
        self.assertTrue(any("a PR from outside the factory" in l for l in lines))


if __name__ == "__main__":
    unittest.main()
