import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from workspace import Workspace


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        for p, text in {"system/game/sim/tick.ts": "export {}", "sdlc/policy.json": "{}",
                        "scenarios/startle/startle.test.ts": "secret", "system/docs/ADR-011.md": "# ADR"}.items():
            (root / p).parent.mkdir(parents=True, exist_ok=True)
            (root / p).write_text(text)
        subprocess.run(["git", "init", "-q"], cwd=root)
        self.events = root / "events.jsonl"
        self.ws = Workspace(root, protected=["sdlc", "platform", "system/architecture"], hidden=["scenarios"], events_file=self.events)

    def tearDown(self):
        self.tmp.cleanup()

    def types(self):
        return [json.loads(l)["type"] for l in self.events.read_text().splitlines()]

    def test_list_hides_scenarios_and_git(self):
        listing = self.ws.list_files(".")
        self.assertIn("system/", listing)
        self.assertNotIn("scenarios", listing)
        self.assertNotIn(".git", listing)

    def test_read_hidden_is_rejected_and_logged(self):
        self.assertTrue(self.ws.read_file("scenarios/startle/startle.test.ts").startswith("Rejected"))
        self.assertTrue(self.ws.list_files("scenarios").startswith("Rejected"))
        self.assertEqual(self.types().count("holdout.peek"), 2)

    def test_write_protected_is_rejected_and_logged(self):
        out = self.ws.write_file("sdlc/policy.json", "{\"autonomy\": {}}")
        self.assertTrue(out.startswith("Rejected"))
        self.assertEqual(self.ws.read_file("sdlc/policy.json"), "{}")
        self.assertIn("gate.tamper_attempt", self.types())

    def test_write_and_read_allowed(self):
        self.assertTrue(self.ws.write_file("system/game/sim/startle.ts", "export const x = 1;\n").startswith("Written"))
        self.assertEqual(self.ws.read_file("system/game/sim/startle.ts"), "export const x = 1;\n")

    def test_path_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            self.ws.read_file("../etc/passwd")

    def test_git_internals_are_rejected_even_without_protection(self):
        ws = Workspace(self.ws.root, protected=[], hidden=[], events_file=self.events)
        for path in (".git/config", ".git/hooks/post-commit", "system/../.git/config"):
            with self.assertRaises(ValueError):
                ws.write_file(path, "[core]\n\tfsmonitor = curl evil\n")
        with self.assertRaises(ValueError):
            ws.read_file(".git/config")
        self.assertIn("gate.tamper_attempt", self.types())
        self.assertNotIn("fsmonitor", (self.ws.root / ".git" / "config").read_text())

    def test_no_protection_when_lists_empty(self):
        ws = Workspace(self.ws.root, protected=[], hidden=[], events_file=self.events)
        self.assertTrue(ws.write_file("sdlc/policy.json", "x").startswith("Written"))

    def test_git_diff_lists_changes(self):
        self.ws.write_file("system/docs/ADR-012.md", "# new")
        self.assertIn("system/docs/ADR-012.md", self.ws.git_diff())

    def test_run_build_without_the_build_script(self):
        self.assertIn("No sdlc/build.sh", self.ws.run_build())


if __name__ == "__main__":
    unittest.main()
