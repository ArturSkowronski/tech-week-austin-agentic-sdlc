"""Trace tests without Jaeger: a fake OTLP/HTTP receiver in a thread."""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import tracing

ENV = {"TRACEPARENT": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "FACTORY_RUN": "factory-startle-x1",
       "FACTORY_NODE": "factory-startle-x1[5].rework[4].quality.build", "ORDER": "startle", "ATTEMPT": "2"}


class FakeCollector(BaseHTTPRequestHandler):
    seen = []

    def do_POST(self):
        FakeCollector.seen.append((self.path, json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *args):
        pass


class TracingTest(unittest.TestCase):
    def test_step_name_is_readable(self):
        self.assertEqual(tracing.step_name(ENV["FACTORY_NODE"], ENV["FACTORY_RUN"], "2"), "attempt 2 · quality.build")
        self.assertEqual(tracing.step_name("factory-startle-x1[2].builder[0].run", "factory-startle-x1"), "attempt 1 · builder")

    def test_steps_hang_under_one_root_per_run(self):
        step = tracing.Step(ENV)
        other = tracing.Step({**ENV, "FACTORY_NODE": "factory-startle-x1[0].prepare[0].run"})
        self.assertEqual(tracing.step_span(step, 0, 1, 0)["parentSpanId"], tracing.step_span(other, 0, 1, 0)["parentSpanId"])
        root = tracing.root_span(step, 0, 10, "Failed")
        self.assertEqual(root["spanId"], step.root_id)
        self.assertEqual((root["parentSpanId"], root["name"], root["status"]["code"]), ("", "order startle", 2))

    def test_traceparent_keeps_trace_and_points_to_step_span(self):
        step = tracing.Step(ENV)
        tp = tracing.parse_traceparent(step.traceparent())
        self.assertEqual(tp[0], "4bf92f3577b34da6a3ce929d0e0e4736")
        self.assertEqual(tp[1], step.span_id)
        self.assertEqual(step.span_id, tracing.Step(ENV).span_id, "the trap and A2A must point at the same span")

    def test_without_traceparent_nothing_is_propagated(self):
        self.assertEqual(tracing.Step({}).traceparent(), "")
        self.assertIsNone(tracing.parse_traceparent("garbage"))

    def test_rejected_tool_calls_are_errors(self):
        step = tracing.Step(ENV)
        events = [{"ts": "2026-10-29T10:00:00Z", "type": "tool.call", "data": {"tool": "run_build", "exit_code": 0, "seconds": 12.5}},
                  {"ts": "2026-10-29T10:00:13Z", "type": "holdout.peek",
                   "data": {"tool": "read_file", "path": "scenarios/startle/startle.test.ts"}}]
        build, peek = tracing.tool_spans(step, events)
        self.assertEqual(build["parentSpanId"], step.span_id)
        self.assertEqual(int(build["endTimeUnixNano"]) - int(build["startTimeUnixNano"]), 12_500_000_000)
        self.assertEqual(build["status"]["code"], 1)
        self.assertEqual(peek["status"]["code"], 2)
        self.assertIn("scenarios/startle/startle.test.ts", peek["name"])

    def test_export_posts_otlp_json(self):
        server = HTTPServer(("127.0.0.1", 0), FakeCollector)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        old = tracing.ENDPOINT
        tracing.ENDPOINT = f"http://127.0.0.1:{server.server_port}"
        try:
            step = tracing.Step(ENV)
            self.assertTrue(tracing.export([tracing.step_span(step, 1_000, 2_000_000_000, 1)]))
        finally:
            tracing.ENDPOINT = old
            server.shutdown()
        path, body = FakeCollector.seen[-1]
        self.assertEqual(path, "/v1/traces")
        sent = body["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
        self.assertEqual(sent["parentSpanId"], tracing.Step(ENV).root_id)
        self.assertEqual(sent["traceId"], "4bf92f3577b34da6a3ce929d0e0e4736")
        self.assertEqual(sent["status"]["code"], 2)

    def test_export_never_raises(self):
        old = tracing.ENDPOINT
        tracing.ENDPOINT = "http://127.0.0.1:9"
        try:
            self.assertFalse(tracing.export([tracing.step_span(tracing.Step(ENV), 0, 1, 0)]))
        finally:
            tracing.ENDPOINT = old


if __name__ == "__main__":
    unittest.main()
