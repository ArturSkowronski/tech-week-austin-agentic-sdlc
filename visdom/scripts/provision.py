#!/usr/bin/env python3
"""Provision the Visdom project "Hobby Wizard" from visdom/lessons/*.yaml.

Idempotent. Run after up.sh (it calls this). What it does:
  1. finds the project (Control Plane creates it; the orchestrator backfills it),
  2. stores the project secrets in Control Plane (OPENAI_API_KEY, GITEA_TOKEN),
     read from ~/.config/visdom-local/, never printed,
  3. registers the run image and the outbox sidecar image (digests from the
     local registry) and points the outbox slot at the sidecar,
  4. creates or updates every AgentDefinition (tasks and agents) and publishes it,
  5. creates or updates every FlowTemplate and publishes it, resolving names to
     ids, and turns on webhooks / approval policies the manifests ask for.

Manifests use names, never ids. A changed manifest becomes a new version.

Usage: python3 -I visdom/scripts/provision.py [--only NAME ...] [--dry-run]
"""
import base64
import hashlib
import glob
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KC = "http://keycloak.visdom.localtest.me:18080/realms/visdom-local"
ORCH = os.environ.get("VISDOM_URL", "http://orchestrator.visdom.localtest.me:18080")
CP = "http://control-plane.visdom.localtest.me:18080"
REGISTRY = "http://localhost:5001"
CTX = "kind-visdom-local"
PROJECT_SLUG = "hobby-wizard"
CONF = os.path.expanduser("~/.config/visdom-local")
SECRET_FILES = {"OPENAI_API_KEY": "openai-api-key", "GITEA_TOKEN": "gitea-token"}
# Run pods get requests = limits from the agent's resource_overrides; the
# platform default (500m, 512Mi) OOM-kills Codex next to tsc/vitest. The
# container's default_resources are not used by the flow launcher.
DEFAULT_RESOURCES = {"cpu_millis": 1000, "memory_mib": 1536, "ephemeral_mib": 2048}
RESOURCES = {}
IMAGES = {
    # container name -> (repository, tag, kind)
    "runtime-demo": ("localhost:5001/visdom/runtime-demo", os.environ.get("RUNTIME_TAG", "4"), "runtime"),
    "outbox-sidecar": ("localhost:5001/visdom/outbox-sidecar", "main", "sidecar"),
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def token(client):
    data = urllib.parse.urlencode({"grant_type": "password", "client_id": client, "username": "dev",
                                   "password": "devlocal", "scope": "openid"}).encode()
    for attempt in range(5):  # Keycloak occasionally refuses concurrent password grants
        try:
            with urllib.request.urlopen(f"{KC}/protocol/openid-connect/token", data) as r:
                return json.load(r)["access_token"]
        except urllib.error.HTTPError:
            if attempt == 4:
                raise
            import time
            time.sleep(2 + attempt * 2)


class Api:
    def __init__(self, base, client):
        self.base, self.client, self.tok = base, client, token(client)

    def call(self, method, path, body=None, ok=(200, 201, 202, 204)):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=None if body is None else json.dumps(body).encode())
        req.add_header("Authorization", "Bearer " + self.tok)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            if e.code in ok:
                return json.loads(text) if text else None
            raise SystemExit(f"{method} {path} -> {e.code}: {text[:800]}")

    get = lambda self, p: self.call("GET", p)
    post = lambda self, p, b=None: self.call("POST", p, b if b is not None else {})
    patch = lambda self, p, b: self.call("PATCH", p, b)
    put = lambda self, p, b: self.call("PUT", p, b)


import urllib.parse  # noqa: E402  (used by token())


def registry_digest(repo, tag):
    path = repo.split("/", 1)[1]
    req = urllib.request.Request(f"{REGISTRY}/v2/{path}/manifests/{tag}", method="HEAD")
    req.add_header("Accept", "application/vnd.docker.distribution.manifest.v2+json, "
                              "application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json")
    with urllib.request.urlopen(req) as r:
        return r.headers["Docker-Content-Digest"]


def psql(sql):
    subprocess.run(["kubectl", "--context", CTX, "-n", "visdom", "exec", "postgres-0", "--", "psql", "-U", "visdom",
                    "-d", "orchestrator", "-tAc", sql], check=True, capture_output=True)


def items(x):
    if isinstance(x, list):
        return x
    for k in ("items", "data", "agents", "flows", "containers", "projects", "secrets"):
        if isinstance(x, dict) and isinstance(x.get(k), list):
            return x[k]
    return []


# ---------------------------------------------------------------- project, secrets, images

def find_project(orch):
    for p in items(orch.get("/api/v1/projects")):
        if p.get("slug") == PROJECT_SLUG:
            return p
    orch.post("/api/v1/sync/control-plane/projects")
    for p in items(orch.get("/api/v1/projects")):
        if p.get("slug") == PROJECT_SLUG:
            return p
    raise SystemExit(f"project {PROJECT_SLUG} not found (create it in Control Plane first)")


def ensure_secrets(cp, orch, project):
    cp_proj = next(p for p in items(cp.get("/api/v1/projects")) if p.get("slug") == PROJECT_SLUG)
    existing = {s["name"]: s for s in items(cp.get(f"/api/v1/secrets?scope_type=project&scope_id={cp_proj['id']}"))}
    for name, fname in SECRET_FILES.items():
        path = os.path.join(CONF, fname)
        if not os.path.exists(path):
            log(f"  secret {name}: {path} missing, skipped")
            continue
        value = open(path).read().strip()
        if name in existing:  # keep it equal to the local file (the value is never read back)
            cp.put(f"/api/v1/secrets/{existing[name]['id']}/value",
                   {"value_b64": base64.b64encode(value.encode()).decode()})
            continue
        cp.post("/api/v1/secrets", {"scope_type": "project", "scope_id": cp_proj["id"], "name": name,
                                    "value_b64": base64.b64encode(value.encode()).decode()})
        log(f"  secret {name}: stored in Control Plane")
    listed = items(orch.get(f"/api/v1/secrets?scope_type=project&scope_id={project['id']}"))
    return {s["name"]: s["id"] for s in listed}


def ensure_containers(orch, project):
    ids = {}
    have = items(orch.get(f"/api/v1/containers?project_id={project['id']}"))
    for name, (repo, tag, kind) in IMAGES.items():
        digest = registry_digest(repo, tag)
        res = RESOURCES.get(name, {})
        same = [c for c in have if c.get("name") == name and c.get("image_digest") == digest
                and (c.get("default_resources") or {}) == res]
        if same:
            ids[name] = same[0]["id"]
            continue
        versions = [c.get("version", 0) for c in have if c.get("name") == name]
        scope = {"scope": "workspace"} if kind == "sidecar" else {"scope": "project", "project_id": project["id"]}
        c = orch.post("/api/v1/containers", {
            "name": name, "version": max(versions, default=0) + 1, "image_repository": repo,
            "image_digest": digest, "image_tag_hint": tag, "default_resources": res,
            "description": {"runtime-demo": "Codex 0.160.1 + Claude Code + TraceVault CLI + Hobby Wizard node_modules",
                            "outbox-sidecar": "vp-outbox-sidecar from visdom-orchestrator main"}[name],
            **scope})
        ids[name] = c["id"]
        log(f"  container {name} v{c.get('version')}: {digest[:19]}…")
        if kind == "sidecar":
            # The create API has no `kind`; the outbox slot only takes a sidecar.
            psql(f"UPDATE containers SET kind='sidecar' WHERE id='{c['id']}'")
    orch.put("/api/v1/system_settings/outbox", {"container_id": ids["outbox-sidecar"]})
    return ids


# ---------------------------------------------------------------- manifests

def load_manifests(only):
    docs = []
    for f in sorted(glob.glob(os.path.join(ROOT, "lessons", "*.yaml"))):
        for d in yaml.safe_load_all(open(f)):
            if d and (not only or d.get("name") in only):
                d["_file"] = os.path.relpath(f, ROOT)
                docs.append(d)
    return docs


def latest_by_name(rows):
    out = {}
    for r in rows:
        if r.get("status") == "archived":
            continue
        cur = out.get(r["name"])
        if cur is None or r.get("version", 0) > cur.get("version", 0):
            out[r["name"]] = r
    return out


AGENT_FIELDS = ("description", "mode", "container_id", "driver", "driver_config", "llm_model", "system_prompt",
                "script", "inputs", "outputs", "secret_allow_list", "deadline_seconds", "agent_doc_md",
                "use_tracevault", "tags", "env_static", "hitl_timeout_seconds", "hitl_timeout_policy",
                "resource_overrides", "backoff_limit", "mcps", "skills")


def agent_body(m, project, containers, secrets):
    rt = m.get("runtime", {})
    body = {
        "project_id": project["id"], "name": m["name"], "description": m.get("description", "").strip(),
        "mode": m.get("mode", "agent"), "container_id": containers[rt.get("container", "runtime-demo")],
        "inputs": [{"name": p} if isinstance(p, str) else p for p in m.get("ports", {}).get("inputs", [])],
        "outputs": [{"name": p} if isinstance(p, str) else p for p in m.get("ports", {}).get("outputs", [])],
        "secret_allow_list": [secrets[s] for s in m.get("secrets", []) if s in secrets],
        "use_tracevault": m.get("use_tracevault", m.get("mode", "agent") == "agent"),
        "tags": m.get("tags", []), "backoff_limit": m.get("backoff_limit", 0),
        "deadline_seconds": m.get("deadline_seconds", 1800), "env_static": m.get("env", {}),
    }
    body["resource_overrides"] = {**DEFAULT_RESOURCES, **m.get("resources", {})}
    missing = [s for s in m.get("secrets", []) if s not in secrets]
    if missing:
        log(f"  WARNING {m['name']}: secrets not in the project: {missing}")
    if body["mode"] == "agent":
        body.update({"driver": rt.get("driver", "codex"), "llm_model": rt.get("llm_model", "gpt-5.4-mini"),
                     "driver_config": rt.get("driver_config", {}),
                     "system_prompt": m.get("system_prompt", "").strip(),
                     "agent_doc_md": m.get("agent_doc_md", "").strip() or None})
        if "hitl_timeout_seconds" in m:
            body["hitl_timeout_seconds"] = m["hitl_timeout_seconds"]
    else:
        body["script"] = m["script"]
    return body


def same(existing, body):
    for k, v in body.items():
        if k in ("project_id", "name", "version"):
            continue
        ev = existing.get(k)
        if k in ("inputs", "outputs"):
            ev = [{"name": p.get("name")} | {kk: vv for kk, vv in p.items() if kk != "name"} for p in (ev or [])]
        if (ev or None) != (v or None) and not (ev in ([], {}, None, "") and v in ([], {}, None, "")):
            return False
    return True


def ensure_agents(orch, project, docs, containers, secrets, dry):
    rows = items(orch.get(f"/api/v1/agents?project_id={project['id']}&all_versions=true"))
    have = latest_by_name(rows)
    out = {}
    for m in [d for d in docs if d["kind"] == "AgentDefinition"]:
        body = agent_body(m, project, containers, secrets)
        cur = have.get(m["name"])
        if cur and same(cur, body):
            if cur.get("status") == "draft" and not dry:
                orch.post(f"/api/v1/agents/{cur['id']}/publish")
                cur = orch.get(f"/api/v1/agents/{cur['id']}")
            out[m["name"]] = cur
            continue
        if dry:
            log(f"  would {'update' if cur else 'create'} {m['mode'] if 'mode' in m else 'agent'} {m['name']}")
            continue
        a = orch.post("/api/v1/agents", body)
        if a.get("status") == "draft":
            orch.post(f"/api/v1/agents/{a['id']}/publish")
            a = orch.get(f"/api/v1/agents/{a['id']}")
        log(f"  {'updated' if cur else 'created'} {body['mode']} {m['name']} v{a.get('version')} ({a.get('status')})")
        out[m["name"]] = a
        if m.get("egress"):
            orch.put(f"/api/v1/egress/agents/{a['id']}", m["egress"])
    return out


REF = re.compile(r"\$\{([A-Za-z0-9_-]+)\.([A-Za-z0-9_.-]+)\}")


def flow_definition(m, agents, flows):
    nodes, edges = [], []

    def edge(frm, port, to, to_port="__control__"):
        e = {"from": frm, "port": port, "to": to, "to_port": to_port}
        if e not in edges:
            edges.append(e)

    for n in m["nodes"]:
        n = dict(n)
        nid, kind = n.pop("id"), n.pop("kind")
        after = n.pop("after", [])
        spec = {"id": nid, "kind": kind}
        if "description" in n:
            spec["description"] = n.pop("description")
        if kind == "agent":
            a = agents[n.pop("agent")]
            spec["agent"] = {"id": a["id"], "version": a["version"]}
            spec["on_failure"] = n.pop("on_failure", "fail")
            outs = n.pop("outputs", [])
            spec["outputs"] = [{"name": o} if isinstance(o, str) else o for o in outs]
        if kind == "sub-flow":
            f = flows[n.pop("flow")]
            spec["flow"] = {"id": f["id"], "version": f["version"]}
            spec["on_failure"] = n.pop("on_failure", "fail")
            spec["outputs"] = n.pop("outputs", [])
        if kind in ("agent", "sub-flow", "output"):
            binds = n.pop("inputs", {})
            spec["inputs"] = {}
            for port, src in binds.items():
                optional = False
                if isinstance(src, dict):
                    optional, src = src.get("optional", False), src["from"]
                spec["inputs"][port] = {"from": src, "optional": optional}
                for frm, fport in REF.findall(src):
                    edge(frm, fport, nid, port)
        if kind in ("decision",):
            spec["predicate_inputs"] = n.pop("predicate_inputs", {})
            for port, src in spec["predicate_inputs"].items():
                for frm, fport in REF.findall(src):
                    edge(frm, fport, nid)  # predicates read values; the edge only sequences
        if kind == "approval":
            spec["context_inputs"] = n.pop("context_inputs", {})
            for port, src in spec["context_inputs"].items():
                for frm, fport in REF.findall(src):
                    edge(frm, fport, nid)
        spec.update(n)  # the rest goes verbatim (branches, approver_role, title, condition, cron_expression, …)
        for a in after:
            frm, _, port = a.partition(".")
            edge(frm, port or "__control__", nid)
        nodes.append(spec)
    for e in m.get("edges", []):
        edge(e["from"], e.get("port", "__control__"), e["to"], e.get("to_port", "__control__"))
    return {"schema_version": 1, "inputs": [{"name": i} if isinstance(i, str) else i for i in m.get("inputs", [])],
            "outputs": [{"name": o} if isinstance(o, str) else o for o in m.get("outputs", [])] or
                       [{"name": k} for n in nodes if n["kind"] == "output" for k in n.get("inputs", {})],
            "nodes": nodes, "edges": edges, "max_parallel_instances": m.get("max_parallel_instances", 3)}


GITEA = "http://git.visdom.localtest.me:18080/api/v1/repos/visdom/hobby-wizard"


def ensure_gitea_hook(visdom_url, spec):
    """Point a Gitea webhook at the flow's Visdom webhook, over the cluster-internal address."""
    path = urllib.parse.urlparse(visdom_url).path
    target = "http://vp-server.visdom-orchestrator.svc:8080" + path
    tok_path = os.path.join(CONF, "gitea-token")
    if not os.path.exists(tok_path):
        log("  gitea webhook: no token, skipped")
        return
    headers = {"Authorization": "token " + open(tok_path).read().strip(), "Content-Type": "application/json"}

    def call(method, url, body=None):
        req = urllib.request.Request(url, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None

    events = spec.get("gitea_events", ["issues", "issue_label"]) if isinstance(spec, dict) else ["issues", "issue_label"]
    for h in call("GET", f"{GITEA}/hooks") or []:
        if h.get("config", {}).get("url", "").startswith("http://vp-server.visdom-orchestrator.svc"):
            if h["config"]["url"] == target:  # Gitea expands `issues` into several event names
                return
            call("DELETE", f"{GITEA}/hooks/{h['id']}")
    call("POST", f"{GITEA}/hooks", {"type": "gitea", "active": True, "events": events,
                                    "config": {"url": target, "content_type": "json"}})
    log(f"  gitea webhook -> Visdom flow webhook ({', '.join(events)})")


def ensure_flows(orch, project, docs, agents, dry):
    rows = items(orch.get(f"/api/v1/flows?project_id={project['id']}&all_versions=true"))
    have = latest_by_name(rows)
    out = {}
    for m in [d for d in docs if d["kind"] == "FlowTemplate"]:
        definition = flow_definition(m, agents, {**have, **out})
        digest = "src-" + hashlib.sha256(json.dumps([definition, m.get("description", "")],
                                                    sort_keys=True).encode()).hexdigest()[:12]
        tags = list(m.get("tags", [])) + [digest]
        cur = have.get(m["name"])
        if cur and digest in (cur.get("tags") or []):
            if cur.get("status") == "draft" and not dry:
                orch.post(f"/api/v1/flows/{cur['id']}/publish")
                cur = orch.get(f"/api/v1/flows/{cur['id']}")
            out[m["name"]] = cur
        elif dry:
            log(f"  would {'update' if cur else 'create'} flow {m['name']}")
            print(json.dumps(definition, indent=1))
            continue
        else:
            v = orch.post("/api/v1/flows/validate", {"project_id": project["id"], "definition": definition})
            if v and not v.get("valid", True):
                raise SystemExit(f"flow {m['name']} invalid: {json.dumps(v)[:1500]}")
            f = orch.post("/api/v1/flows", {"project_id": project["id"], "name": m["name"],
                                            "description": m.get("description", "").strip(), "definition": definition,
                                            "tags": tags})
            if f.get("status") == "draft":
                orch.post(f"/api/v1/flows/{f['id']}/publish")
                f = orch.get(f"/api/v1/flows/{f['id']}")
            log(f"  {'updated' if cur else 'created'} flow {m['name']} v{f.get('version')} ({f.get('status')})")
            out[m["name"]] = f
        f = out[m["name"]]
        if m.get("webhook"):
            wh = orch.get(f"/api/v1/flows/{f['id']}/webhook") or {}
            if not wh.get("enabled"):
                wh = orch.post(f"/api/v1/flows/{f['id']}/webhook/enable")
            out[m["name"]]["_webhook"] = wh
            if not dry and wh.get("url"):
                ensure_gitea_hook(wh["url"], m["webhook"])
        if m.get("approval_policy"):
            cur = orch.call("GET", f"/api/v1/policies/approval/flows/{f['lineage_id']}", ok=(200, 404)) or {}
            if cur.get("rules") != m["approval_policy"]:
                orch.put(f"/api/v1/policies/approval/flows/{f['lineage_id']}", {"rules": m["approval_policy"]})
    return out


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    only = [a for a in args if not a.startswith("--")]
    orch = Api(ORCH, "visdom-orchestrator")
    cp = Api(CP, "visdom-control-plane")
    project = find_project(orch)
    log(f"project {project['name']} ({project['id']})")
    secrets = ensure_secrets(cp, orch, project)
    containers = ensure_containers(orch, project)
    docs = load_manifests(only)
    if only:  # references outside the selection still resolve to what is deployed
        docs = load_manifests([]) if not dry else docs
    agents = ensure_agents(orch, project, docs, containers, secrets, dry)
    for e in [d for d in docs if d["kind"] == "EgressPolicy"]:
        if not dry and e["agent"] in agents:
            aid = agents[e['agent']]['lineage_id'] or agents[e['agent']]['id']
            cur = orch.call("GET", f"/api/v1/egress/agents/{aid}", ok=(200, 404)) or {}
            if sorted(cur.get("allow_hosts", [])) == sorted(e.get("allow_hosts", [])) and \
               sorted(cur.get("deny_hosts", [])) == sorted(e.get("deny_hosts", [])):
                continue
            orch.put(f"/api/v1/egress/agents/{agents[e['agent']]['lineage_id'] or agents[e['agent']]['id']}",
                     {"allow_hosts": e.get("allow_hosts", []), "deny_hosts": e.get("deny_hosts", [])})
            log(f"  egress policy for {e['agent']}: allow {e.get('allow_hosts')}")
    flows = ensure_flows(orch, project, docs, agents, dry)
    state = {"project_id": project["id"], "agents": {k: v["id"] for k, v in agents.items()},
             "flows": {k: {"id": v["id"], "version": v.get("version"), "lineage_id": v.get("lineage_id")}
                       for k, v in flows.items()}}
    for k, v in flows.items():
        if v.get("_webhook"):
            state["flows"][k]["webhook_url"] = v["_webhook"].get("url")
    os.makedirs(CONF, exist_ok=True)
    with open(os.path.join(CONF, "visdom-demo-state.json"), "w") as fh:
        json.dump(state, fh, indent=2)
    log(f"done: {len(agents)} agents/tasks, {len(flows)} flows (ids in {CONF}/visdom-demo-state.json)")


if __name__ == "__main__":
    main()
