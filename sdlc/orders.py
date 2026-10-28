"""Work orders of the factory: markdown files in orders/. The first `#` line is the title, the rest is the body.

Usage:
  python3 sdlc/orders.py hw-001            # JSON {name, title, body}
  python3 sdlc/orders.py hw-001 --title    # the title only
"""

from __future__ import annotations

import argparse
import json
import sys

from lib import ROOT

ORDERS = ROOT / "orders"


def load(name: str) -> dict:
    path = ORDERS / f"{name.removesuffix('.md')}.md"
    if not path.is_file():
        raise FileNotFoundError(f"no work order {path.relative_to(ROOT)}; available: {', '.join(names())}")
    lines = path.read_text(encoding="utf-8").splitlines()
    title = next((l.lstrip("# ").strip() for l in lines if l.startswith("#")), path.stem)
    body = "\n".join(l for l in lines if not l.startswith("# ")).strip()
    return {"name": path.stem, "title": title, "body": body}


def names() -> list[str]:
    return sorted(p.stem for p in ORDERS.glob("*.md"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("name")
    parser.add_argument("--title", action="store_true")
    parser.add_argument("--body", action="store_true")
    args = parser.parse_args()
    try:
        order = load(args.name)
    except FileNotFoundError as err:
        sys.exit(str(err))
    if args.title:
        print(order["title"])
    elif args.body:
        print(order["body"])
    else:
        print(json.dumps(order, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
