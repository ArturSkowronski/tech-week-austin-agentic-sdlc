"""A2A client tests without a cluster: a fake JSON-RPC server in a thread."""

import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import a2a
import tracing


class FakeKagent(BaseHTTPRequestHandler):
    seen = []
    traceparents = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeKagent.seen.append((self.path, self.headers.get("X-User-Id"), body))
        FakeKagent.traceparents.append(self.headers.get("traceparent"))
        text = body["params"]["message"]["parts"][0]["text"]
        if text == "error":
            result = {"jsonrpc": "2.0", "id": body["id"], "error": {"code": -32603, "message": "the model fell over"}}
        elif text == "no artifact":
            result = {"jsonrpc": "2.0", "id": body["id"], "result": {"kind": "task", "artifacts": [], "history": [
                {"role": "user", "parts": [{"kind": "text", "text": text}]},
                {"role": "agent", "parts": [{"kind": "text", "text": "from the history"}]}]}}
        else:
            result = {"jsonrpc": "2.0", "id": body["id"], "result": {"kind": "task", "status": {"state": "completed"},
                      "artifacts": [{"parts": [{"kind": "text", "text": f"echo: {text}"}]}]}}
        payload = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


class A2ATest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), FakeKagent)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        os.environ["KAGENT_URL"] = f"http://127.0.0.1:{cls.server.server_port}"
        os.environ["A2A_USER"] = "test@workshop"
        os.environ.pop("KAGENT_NS", None)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_send_returns_artifact_text_and_uses_agent_path(self):
        self.assertEqual(a2a.send("probe", "hello"), "echo: hello")
        path, user, body = FakeKagent.seen[-1]
        self.assertEqual(path, "/api/a2a/factory/probe/")
        self.assertEqual(user, "test@workshop")
        self.assertEqual(body["method"], "message/send")

    def test_trace_context_goes_to_kagent_as_step_span(self):
        os.environ.update({"TRACEPARENT": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
                           "FACTORY_RUN": "factory-startle-x1", "FACTORY_NODE": "factory-startle-x1[2].builder[0].run"})
        try:
            a2a.send("builder", "hello")
        finally:
            for key in ("TRACEPARENT", "FACTORY_RUN", "FACTORY_NODE"):
                os.environ.pop(key)
        trace, parent = tracing.parse_traceparent(FakeKagent.traceparents[-1])
        self.assertEqual(trace, "4bf92f3577b34da6a3ce929d0e0e4736")
        self.assertNotEqual(parent, "00f067aa0ba902b7", "the agent's parent is the step span, not the Argo node")
        a2a.send("probe", "hello")
        self.assertIsNone(FakeKagent.traceparents[-1], "locally, without TRACEPARENT, no header is sent")

    def test_falls_back_to_last_agent_message(self):
        self.assertEqual(a2a.send("probe", "no artifact"), "from the history")

    def test_input_required_returns_the_agents_questions(self):
        # The intake agent asks instead of answering: kagent ends the task in input-required
        # and puts the questions in status.message, not in artifacts or history.
        result = {"kind": "task", "artifacts": [], "history": [],
                  "status": {"state": "input-required", "message": {"role": "agent", "parts": [
                      {"kind": "text", "text": "- How high is the second jump?\n- Does water give it back?"}]}}}
        self.assertEqual(a2a.extract_text(result), "- How high is the second jump?\n- Does water give it back?")

    def test_error_is_raised(self):
        with self.assertRaises(RuntimeError):
            a2a.send("probe", "error")

    def test_extract_text_without_text_raises(self):
        with self.assertRaises(RuntimeError):
            a2a.extract_text({"kind": "task", "status": {"state": "failed"}})


if __name__ == "__main__":
    unittest.main()
