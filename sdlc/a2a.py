"""A2A (Agent2Agent, Linux Foundation) client for kagent agents. Standard library only.

kagent exposes every agent at /api/a2a/<namespace>/<agent>/ (JSON-RPC, A2A 0.3).
We call `message/send` and return the text of the last artifact or of the agent's last message.

Environment:
  KAGENT_URL     default http://localhost:<KAGENT_API_PORT, 8083> (make port-forward if the port mapping fails),
                 in the cluster http://kagent-controller.kagent.svc:8083
  KAGENT_NS      default factory (the namespace of the factory's agents; the kagent platform lives in kagent)
  A2A_USER       the X-User-Id header (kagent does not authenticate, but records who asked)
  TRACEPARENT    in a line step: the W3C context from Argo. We send the step span (sdlc/tracing.py), so the
                 agent's spans land in the same trace as the run

Usage:
  python3 sdlc/a2a.py --agent probe --task "Introduce yourself"
  python3 sdlc/a2a.py --agent builder --file .sdlc/prompt.md
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

import tracing
from lib import setting


def base_url() -> str:
    return setting("KAGENT_URL", f"http://localhost:{setting('KAGENT_API_PORT', '8083')}").rstrip("/")


def agent_url(agent: str, namespace: str | None = None) -> str:
    ns = namespace or os.environ.get("KAGENT_NS", "factory")
    return f"{base_url()}/api/a2a/{ns}/{agent}/"  # the trailing slash is required


def card(agent: str, namespace: str | None = None, timeout: int = 10) -> dict:
    with urllib.request.urlopen(agent_url(agent, namespace) + ".well-known/agent-card.json", timeout=timeout) as r:
        return json.loads(r.read())


def send(agent: str, text: str, *, namespace: str | None = None, session: str | None = None,
         timeout: int = 600, retries: int = 4) -> str:
    """One question, one answer. `session` (contextId) continues a conversation.

    A freshly deployed agent is sometimes `Ready` a moment before its pod accepts connections,
    so a "connection refused" from the controller is retried a few times."""
    for attempt in range(retries):
        try:
            return _send_once(agent, text, namespace, session, timeout)
        except RuntimeError as err:
            if "connection refused" not in str(err) or attempt == retries - 1:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def _send_once(agent: str, text: str, namespace: str | None, session: str | None, timeout: int) -> str:
    message = {"kind": "message", "role": "user", "messageId": str(uuid.uuid4()),
               "parts": [{"kind": "text", "text": text}]}
    if session:
        message["contextId"] = session
    body = {"jsonrpc": "2.0", "id": str(uuid.uuid4()), "method": "message/send", "params": {"message": message}}
    headers = {"Content-Type": "application/json", "X-User-Id": os.environ.get("A2A_USER", "factory@workshop")}
    traceparent = tracing.Step().traceparent()
    if traceparent:
        headers["traceparent"] = traceparent
    request = urllib.request.Request(agent_url(agent, namespace), data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as err:
        raise RuntimeError(f"A2A HTTP {err.code} for agent {agent}: {err.read()[:300]!r}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"A2A: no connection to {base_url()} ({err.reason}). Try: make port-forward") from err
    if "error" in payload:
        raise RuntimeError(f"A2A error from agent {agent}: {payload['error']}")
    return extract_text(payload["result"])


def extract_text(result: dict) -> str:
    """An A2A task: the artifacts first, then the agent's last message in the history."""
    if result.get("kind") == "message":
        return _parts(result.get("parts", []))
    artifacts = result.get("artifacts") or []
    texts = [_parts(a.get("parts", [])) for a in artifacts]
    texts = [t for t in texts if t]
    if texts:
        return "\n".join(texts)
    for message in reversed(result.get("history") or []):
        if message.get("role") == "agent":
            text = _parts(message.get("parts", []))
            if text:
                return text
    state = (result.get("status") or {}).get("state", "?")
    raise RuntimeError(f"A2A: the agent returned no text (task state: {state})")


def _parts(parts: list[dict]) -> str:
    return "\n".join(p.get("text", "") for p in parts if p.get("kind") == "text").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--agent", required=True)
    parser.add_argument("--task")
    parser.add_argument("--file", help="a file with the task")
    parser.add_argument("--session")
    parser.add_argument("--card", action="store_true", help="only show the agent card")
    args = parser.parse_args()
    if args.card:
        print(json.dumps(card(args.agent), ensure_ascii=False, indent=2))
        return
    text = open(args.file, encoding="utf-8").read() if args.file else args.task
    if not text:
        parser.error("give --task or --file")
    print(send(args.agent, text, session=args.session))


if __name__ == "__main__":
    main()
