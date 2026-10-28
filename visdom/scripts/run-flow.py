#!/usr/bin/env python3
"""Start a Hobby Wizard flow by name and follow it until it ends or waits for a person.

  python3 -I visdom/scripts/run-flow.py l01-first-agent question="How does input become movement?"
  python3 -I visdom/scripts/run-flow.py --follow <flow_run_id>

Prints node states as they change and the run's outputs at the end. A run that
waits on an approval or a question is left waiting: answer it in the UI
(Approvals / Human Input) and follow it again with --follow.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from provision import ORCH, Api, find_project, items  # noqa: E402


def follow(orch, run_id, quiet_after=None):
    seen = {}
    while True:
        run = orch.get(f"/api/v1/flow_runs/{run_id}")
        for n in items(orch.get(f"/api/v1/flow_runs/{run_id}/node_runs")):
            key = n.get("node_id")
            st = n.get("status")
            if seen.get(key) != st:
                seen[key] = st
                print(f"  {time.strftime('%H:%M:%S')} {key:<14} {st}", flush=True)
        status = run.get("status")
        if status in ("Succeeded", "Failed", "Cancelled", "Terminated", "TimedOut"):
            print(f"run {run_id}: {status}")
            print(json.dumps(run.get("outputs") or {}, indent=2)[:4000])
            return status
        if any(s in ("WaitingApproval", "AwaitingApproval", "WaitingInput", "AwaitingInput") for s in seen.values()):
            if quiet_after is None:
                print(f"run {run_id} waits for a person: {ORCH.replace('visdom.localtest.me', 'localhost')}"
                      f"/orchestrator/operate/flow-runs/{run_id}")
                quiet_after = time.time()
        time.sleep(5)


def main():
    orch = Api(ORCH, "visdom-orchestrator")
    if sys.argv[1] == "--follow":
        return follow(orch, sys.argv[2])
    name, kv = sys.argv[1], dict(a.split("=", 1) for a in sys.argv[2:])
    project = find_project(orch)
    flows = [f for f in items(orch.get(f"/api/v1/flows?project_id={project['id']}")) if f["name"] == name]
    if not flows:
        raise SystemExit(f"no flow {name}")
    r = orch.post(f"/api/v1/flows/{flows[0]['id']}/trigger", {"inputs": kv})
    run_id = r["flow_run_id"]
    print(f"started {name} v{flows[0].get('version')}: run {run_id}")
    follow(orch, run_id)


if __name__ == "__main__":
    main()
