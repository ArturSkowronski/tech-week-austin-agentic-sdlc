"""The factory's event ledger (lesson 10).

Every event (prompt, tool call, file edit, commit, gate decision) is a JSONL line carrying
the hash of the previous line. Changing one byte in the middle breaks the chain from that
point to the end. At the end of an attempt the line signs the file with the factory key
(Sigstore cosign), so the whole ledger cannot be swapped either.

Usage:
  python3 sdlc/ledger.py append --type gate.passed --data '{"gate": "build"}'
  python3 sdlc/ledger.py ingest --source workshop --events tools.jsonl
  python3 sdlc/ledger.py merge .sdlc/ledger-*.jsonl
  python3 sdlc/ledger.py verify
  python3 sdlc/ledger.py summary
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from lib import STATE, summary_md

DEFAULT = STATE / "ledger.jsonl"
GENESIS = "0" * 64


def canonical(record: dict) -> bytes:
    return json.dumps({k: v for k, v in record.items() if k != "hash"}, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode()


def read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append(path: Path, event_type: str, data: dict) -> dict:
    records = read(path)
    record = {
        "seq": len(records),
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run": os.environ.get("FACTORY_RUN", "local"),
        "job": os.environ.get("FACTORY_STEP", "local"),
        "type": event_type,
        "data": data,
        "prev": records[-1]["hash"] if records else GENESIS,
    }
    record["hash"] = hashlib.sha256(canonical(record)).hexdigest()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def verify(path: Path) -> tuple[bool, str]:
    prev = GENESIS
    records = read(path)
    for i, record in enumerate(records):
        if record.get("seq") != i:
            return False, f"line {i}: wrong sequence number ({record.get('seq')})"
        if record.get("prev") != prev:
            return False, f"line {i}: broken chain, prev does not match the hash of line {i - 1}"
        if hashlib.sha256(canonical(record)).hexdigest() != record.get("hash"):
            return False, f"line {i}: content changed after it was written ({record['type']})"
        prev = record["hash"]
    return True, f"OK: {len(records)} events, chain head {prev[:12]}"


def ingest(path: Path, source: str, events_file: Path) -> int:
    """Pulls in the agent's event stream (JSONL)."""
    count = 0
    if not events_file.exists():
        return 0
    for line in events_file.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        kind = event.get("type") or event.get("event") or "event"
        append(path, f"agent.{source}.{kind}", _shrink(event))
        count += 1
    return count


def _shrink(value, limit: int = 2000):
    """Long tool outputs are cut, but the hash stays computed from the full content."""
    text = json.dumps(value, ensure_ascii=False)
    if len(text) <= limit:
        return value
    return {"truncated": text[:limit], "sha256": hashlib.sha256(text.encode()).hexdigest(), "bytes": len(text)}


def merge(path: Path, fragments: list[Path]) -> int:
    """Parallel jobs (gates, review) write their own fragments. We chain them in the order of their
    first event, keeping the original timestamp and job."""
    loaded = [(read(f), f) for f in fragments if f.exists()]
    loaded = [(records, f) for records, f in loaded if records]
    loaded.sort(key=lambda item: item[0][0]["ts"])
    count = 0
    for records, fragment in loaded:
        ok, message = verify(fragment)
        if not ok:
            append(path, "ledger.fragment_rejected", {"fragment": fragment.name, "reason": message})
            continue
        for record in records:
            append(path, record["type"], {**record["data"], "_ts": record["ts"], "_job": record["job"]})
            count += 1
    return count


def summary(path: Path) -> str:
    records = read(path)
    ok, message = verify(path)
    kinds = Counter(r["type"].split(".")[0] if not r["type"].startswith("agent.") else "agent" for r in records)
    lines = [
        "### 🔗 Event ledger",
        "",
        f"{'✅' if ok else '❌'} {message}",
        "",
        "| kind | events |",
        "|---|---|",
        *[f"| {k} | {n} |" for k, n in kinds.most_common()],
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", default=str(DEFAULT))
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("append")
    a.add_argument("--type", required=True)
    a.add_argument("--data", default="{}")
    i = sub.add_parser("ingest")
    i.add_argument("--source", required=True)
    i.add_argument("--events", required=True)
    m = sub.add_parser("merge")
    m.add_argument("fragments", nargs="+")
    sub.add_parser("verify")
    sub.add_parser("summary")
    args = parser.parse_args()
    path = Path(args.file)

    if args.cmd == "append":
        record = append(path, args.type, json.loads(args.data))
        print(f"#{record['seq']} {record['type']} {record['hash'][:12]}")
    elif args.cmd == "ingest":
        print(f"Pulled in {ingest(path, args.source, Path(args.events))} agent events")
    elif args.cmd == "merge":
        print(f"Chained {merge(path, [Path(f) for f in args.fragments])} events from fragments")
    elif args.cmd == "verify":
        ok, message = verify(path)
        print(message)
        sys.exit(0 if ok else 1)
    elif args.cmd == "summary":
        text = summary(path)
        print(text)
        summary_md(text)


if __name__ == "__main__":
    main()
