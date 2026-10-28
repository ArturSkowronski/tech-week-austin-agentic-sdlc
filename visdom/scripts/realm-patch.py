#!/usr/bin/env python3
"""Add the browser hosts of the demo to the visdom-local realm (stdin -> stdout).

Browsers give `crypto.subtle` (needed for PKCE) only to secure contexts. Plain
http://*.visdom.localtest.me is not one, http://*.localhost is. So the SPAs are
opened on *.localhost:18080 and their Keycloak clients must accept those
redirect URIs. Idempotent.
"""
import json
import sys

HOSTS = {
    "visdom-orchestrator": ["http://orchestrator.localhost:18080"],
    "visdom-orchestrator-mcp": ["http://orchestrator.localhost:18080"],
    "visdom-control-plane": ["http://control-plane.localhost:18080"],
    "visdom-ai-tracing": ["http://ai-tracing.localhost:18080"],
}

realm = json.load(sys.stdin)
for client in realm.get("clients", []):
    origins = HOSTS.get(client.get("clientId"))
    if not origins:
        continue
    redirects = client.setdefault("redirectUris", [])
    web = client.setdefault("webOrigins", [])
    for origin in origins:
        if origin + "/*" not in redirects:
            redirects.append(origin + "/*")
        if "*" not in web and origin not in web:
            web.append(origin)
    attrs = client.setdefault("attributes", {})
    attrs["post.logout.redirect.uris"] = "+"
json.dump(realm, sys.stdout, indent=2)
