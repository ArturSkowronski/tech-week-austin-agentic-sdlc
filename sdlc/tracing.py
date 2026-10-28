"""The trace of a run in OpenTelemetry: one trace per work order, from the Argo node down to the model call.

Argo Workflows (4.x, with OTEL_EXPORTER_OTLP_ENDPOINT on the controller) opens a trace for the run
and injects TRACEPARENT into the step container. We take only the trace id from it: Argo 4.1 does not
export the span it points to. This module adds what Argo does not know:

  root          "order <name>" from the start to the end of the run, sent in onExit (also after a failure)
  step span     a readable name ("attempt 2 · quality.build"), the order, the exit code; a child of the root
  traceparent   the context for A2A: the kagent agent nests its spans (invoke_agent, generate_content,
                execute_tool) under the step that called it
  tools         events of the workshop server (/work/events.jsonl) as child spans of the `builder` step,
                rejected attempts (gate.tamper_attempt, holdout.peek) marked as errors

Export is OTLP/HTTP JSON to Jaeger, best effort: a missing Jaeger never stops the line.
Span ids are deterministic (a hash of the node), so the trap in a step and A2A in the middle of the step
point at the same span without passing state between processes.

Usage (in a line step; the template sets TRACEPARENT, FACTORY_RUN and FACTORY_NODE):
  python3 sdlc/tracing.py traceparent                    # context for A2A: 00-<trace>-<step span>-01
  python3 sdlc/tracing.py step --start NS --exit 0       # the step span
  python3 sdlc/tracing.py tools --events F               # workshop tool spans under the step
  python3 sdlc/tracing.py root --start 2026-10-29T10:00:00Z --status Succeeded   # onExit
  python3 sdlc/tracing.py url                            # link to the trace in Jaeger
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENDPOINT = os.environ.get("FACTORY_OTLP_HTTP", "http://jaeger.factory.svc:4318")
UI = os.environ.get("FACTORY_JAEGER_UI", "http://localhost:16686")
SERVICE = "factory-line"


def parse_traceparent(value: str | None) -> tuple[str, str] | None:
    match = re.fullmatch(r"00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}", (value or "").strip())
    return (match.group(1), match.group(2)) if match else None


def span_id(*parts: str) -> str:
    return hashlib.sha256("/".join(parts).encode()).hexdigest()[:16]


def step_name(node: str, run: str, attempt: str = "1") -> str:
    """factory-startle-x[5].rework[3].quality.build → "attempt 2 · quality.build"."""
    rest = node[len(run):] if node.startswith(run) else node
    parts = [re.sub(r"\[\d+\]", "", p) for p in rest.strip(".[]0123456789").split(".")]
    parts = [p for p in parts if p and p not in ("run", "rework")]
    return f"attempt {attempt} · {'.'.join(parts) or node}"


class Step:
    """The context of the current step, from env. Without TRACEPARENT (e.g. locally) nothing is exported."""

    def __init__(self, env=os.environ):
        self.parent = parse_traceparent(env.get("TRACEPARENT"))
        self.run = env.get("FACTORY_RUN", "local")
        self.node = env.get("FACTORY_NODE") or env.get("ARGO_NODE_ID", "step")
        self.attrs = {"factory.run": self.run, "factory.order": env.get("ORDER", ""),
                      "factory.attempt": env.get("ATTEMPT", "1"), "factory.agent": env.get("AGENT", ""),
                      "argo.node": self.node}

    @property
    def trace_id(self) -> str | None:
        return self.parent[0] if self.parent else None

    @property
    def span_id(self) -> str:
        return span_id(self.run, self.node)

    @property
    def root_id(self) -> str:
        return span_id(self.run, "order")

    def traceparent(self) -> str:
        return f"00-{self.trace_id}-{self.span_id}-01" if self.parent else ""


def _attr(key: str, value) -> dict:
    if isinstance(value, bool):
        return {"key": key, "value": {"boolValue": value}}
    if isinstance(value, int):
        return {"key": key, "value": {"intValue": str(value)}}
    return {"key": key, "value": {"stringValue": str(value)}}


def span(trace: str, sid: str, parent: str, name: str, start_ns: int, end_ns: int, attrs: dict, error: bool = False) -> dict:
    return {"traceId": trace, "spanId": sid, "parentSpanId": parent, "name": name, "kind": 1,
            "startTimeUnixNano": str(start_ns), "endTimeUnixNano": str(max(end_ns, start_ns + 1_000_000)),
            "attributes": [_attr(k, v) for k, v in attrs.items() if v not in (None, "")],
            "status": {"code": 2 if error else 1}}


def payload(spans: list[dict]) -> dict:
    return {"resourceSpans": [{"resource": {"attributes": [_attr("service.name", SERVICE)]},
                               "scopeSpans": [{"scope": {"name": "factory"}, "spans": spans}]}]}


def export(spans: list[dict]) -> bool:
    if not spans:
        return True
    request = urllib.request.Request(ENDPOINT.rstrip("/") + "/v1/traces", data=json.dumps(payload(spans)).encode(),
                                     headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(request, timeout=3).read()
        return True
    except Exception as err:  # the trace never stops the line
        print(f"trace: export to {ENDPOINT} failed ({err})", file=sys.stderr)
        return False


def step_span(step: Step, start_ns: int, end_ns: int, exit_code: int) -> dict:
    return span(step.trace_id, step.span_id, step.root_id, step_name(step.node, step.run, step.attrs["factory.attempt"]),
                start_ns, end_ns, {**step.attrs, "exit_code": exit_code}, error=exit_code != 0)


def root_span(step: Step, start_ns: int, end_ns: int, status: str) -> dict:
    return span(step.trace_id, step.root_id, "", f"order {step.attrs['factory.order']}", start_ns, end_ns,
                {"factory.run": step.run, "factory.order": step.attrs["factory.order"], "argo.status": status},
                error=status not in ("Succeeded", ""))


def _ns(ts: str) -> int:
    return int(datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() * 1e9)


def tool_spans(step: Step, events: list[dict]) -> list[dict]:
    """Workshop server events as spans. Rejected attempts are errors: they show red in the trace."""
    spans = []
    for n, event in enumerate(events):
        data = event.get("data", {})
        start = _ns(event["ts"])
        seconds = data.get("seconds") or 0
        rejected = event["type"] in ("gate.tamper_attempt", "holdout.peek")
        tool = data.get("tool", event["type"])
        target = data.get("path") or data.get("module") or ""
        name = f"workshop · {tool}" + (f" {target}" if target else "") + (" ✋" if rejected else "")
        attrs = {"factory.event": event["type"], "mcp.tool": tool, **{f"workshop.{k}": v for k, v in data.items()}}
        spans.append(span(step.trace_id, span_id(step.run, step.node, "tool", str(n)), step.span_id, name,
                          start, start + int(seconds * 1e9), attrs, error=rejected or data.get("exit_code", 0) != 0))
    return spans


def url(trace: str | None) -> str:
    return f"{UI}/trace/{trace}" if trace else ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("traceparent")
    sub.add_parser("url")
    k = sub.add_parser("step")
    k.add_argument("--start", type=int, required=True, help="start of the step in nanoseconds (date +%%s%%N)")
    k.add_argument("--exit", type=int, default=0)
    n = sub.add_parser("tools")
    n.add_argument("--events", required=True)
    r = sub.add_parser("root")
    r.add_argument("--start", required=True, help="{{workflow.creationTimestamp}} (RFC 3339)")
    r.add_argument("--status", default="")
    args = parser.parse_args()

    step = Step()
    if args.cmd == "traceparent":
        print(step.traceparent())
    elif args.cmd == "url":
        print(url(step.trace_id))
    elif not step.parent:
        return
    elif args.cmd == "step":
        export([step_span(step, args.start, time.time_ns(), args.exit)])
    elif args.cmd == "root":
        start = int(datetime.fromisoformat(args.start.replace("Z", "+00:00")).timestamp() * 1e9)
        export([root_span(step, start, time.time_ns(), args.status)])
        print(f"trace: {url(step.trace_id)}")
    elif args.cmd == "tools":
        path = Path(args.events)
        lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
        events = []
        for line in lines:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        spans = tool_spans(step, events)
        export(spans)
        print(f"trace: {len(spans)} workshop tool calls")


if __name__ == "__main__":
    main()
