"""The MCP server "workshop": all the builder agent sees of the world. Streamable HTTP on :3000/mcp.

In the cluster: the MCPServer CRD (kmcp) with the factory-workshop image; kagent discovers the tools by itself.
Locally: WORK_DIR=. python3 server.py
"""

from __future__ import annotations

import os

from mcp.server.fastmcp import FastMCP

from workspace import Workspace

ws = Workspace.from_env()
mcp = FastMCP("workshop", host="0.0.0.0", port=int(os.environ.get("PORT", "3000")), stateless_http=True)


@mcp.tool()
def list_files(path: str = ".") -> str:
    """List files and directories in the repository (path relative to the repo root)."""
    return ws.list_files(path)


@mcp.tool()
def read_file(path: str) -> str:
    """Contents of a file from the repository."""
    return ws.read_file(path)


@mcp.tool()
def write_file(path: str, content: str) -> str:
    """Write the whole file (overwrites). Protected paths are rejected."""
    return ws.write_file(path, content)


@mcp.tool()
def run_build() -> str:
    """Run the gate in system/: typecheck, lint with the architecture rules, the test suite and bugs:check. Returns the exit code and the tail of the log."""
    return ws.run_build()


@mcp.tool()
def git_diff() -> str:
    """Changed files and the diff against the last commit."""
    return ws.git_diff()


if __name__ == "__main__":
    print(f"workshop: {ws.root}, protected={ws.protected}, hidden={ws.hidden}")
    mcp.run(transport="streamable-http")
