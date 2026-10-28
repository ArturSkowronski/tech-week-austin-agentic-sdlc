#!/usr/bin/env python3
"""Hobby Wizard scenes for the deck, drawn from the game's own art.

    python3 lessons/images/art/gen.py --list
    python3 lessons/images/art/gen.py cover --dry-run
    python3 lessons/images/art/gen.py --all
    python3 lessons/images/art/gen.py l06-gates --variants 3

The key comes from OPENAI_API_KEY and is never written anywhere. Every PNG lands in
out/ with a .txt next to it holding the model, the settings and the full prompt, so a
good result can be repeated. The deck reads the JPEGs next to this file; make them
with --publish after you pick a variant.
"""
import argparse, base64, datetime as dt, os, re, sys
from pathlib import Path

A = Path(__file__).resolve().parent
ROOT = A.parents[2]
PROMPTS = A / "prompts.md"
OUT = A / "out"
REFS = [ROOT / "system/assets/splash-textless.png", ROOT / "system/assets/wizard-charge.png"]
MODELS = {"sunburst": "gpt-image-2.5-sunburst", "flare": "gpt-image-2.5-flare"}
META = {"Style lock", "Negative"}


def sections(md: str) -> dict:
    out, cur, buf = {}, None, []
    for line in md.splitlines():
        m = re.match(r"^## (.+?)\s*$", line)
        if m:
            if cur:
                out[cur] = "\n".join(buf).strip()
            cur, buf = m.group(1), []
        elif cur:
            buf.append(line)
    if cur:
        out[cur] = "\n".join(buf).strip()
    return out


def publish(name: str, variant: int) -> None:
    """out/<name>-v<N>.png -> <name>.jpg next to this file, 1536 px wide, for the deck."""
    from PIL import Image
    src = OUT / f"{name}-v{variant}.png"
    Image.open(src).convert("RGB").save(A / f"{name}.jpg", quality=86, optimize=True)
    print(f"{src.name} -> {name}.jpg")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenes", nargs="?", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--variants", type=int, default=1)
    ap.add_argument("--quality", default="high", choices=("low", "medium", "high", "auto"))
    ap.add_argument("--model", default="sunburst", choices=tuple(MODELS))
    ap.add_argument("--size", default="1536x1024")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--publish", type=int, metavar="N", help="turn variant N of the scenes into the deck's JPEGs")
    a = ap.parse_args()

    secs = sections(PROMPTS.read_text(encoding="utf-8"))
    names = [k for k in secs if k not in META]
    if a.list:
        for n in names:
            print(f"{n:12} {secs[n][:72]}…")
        return 0
    todo = names if a.all else [s.strip() for s in a.scenes.split(",") if s.strip()]
    if not todo:
        ap.error("name scenes, --all or --list")
    for n in todo:
        if n not in secs:
            sys.exit(f"no section '## {n}'. There are: {', '.join(names)}")
    if a.publish:
        for n in todo:
            publish(n, a.publish)
        return 0

    def prompt_for(n):
        parts = [secs["Style lock"], secs[n]]
        if secs.get("Negative"):
            parts.append("Avoid: " + " ".join(secs["Negative"].split()))
        return "\n\n".join(parts)

    if a.dry_run:
        for n in todo:
            print(f"===== {n}\n{prompt_for(n)}\n")
        return 0
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        sys.exit("OPENAI_API_KEY is empty")
    for r in REFS:
        if not r.exists():
            sys.exit(f"missing reference: {r}")

    from openai import OpenAI
    client = OpenAI(api_key=key)
    OUT.mkdir(parents=True, exist_ok=True)
    model = MODELS[a.model]
    for n in todo:
        start = len(sorted(OUT.glob(f"{n}-v*.png"))) + 1
        print(f"{n}: {a.variants} × {model} {a.size} {a.quality} …", flush=True)
        try:
            fhs = [open(r, "rb") for r in REFS]
            try:
                r = client.images.edit(model=model, image=fhs, prompt=prompt_for(n),
                                       n=a.variants, size=a.size, quality=a.quality)
            finally:
                for fh in fhs:
                    fh.close()
        except Exception as e:  # one scene must not kill the whole run
            print(f"  !! {type(e).__name__}: {str(e)[:200]}", flush=True)
            continue
        for i, item in enumerate(r.data):
            png = OUT / f"{n}-v{start + i}.png"
            png.write_bytes(base64.b64decode(item.b64_json))
            png.with_suffix(".txt").write_text(
                f"model: {model}\nsize: {a.size}\nquality: {a.quality}\n"
                f"refs: {', '.join(r.name for r in REFS)}\n"
                f"when: {dt.datetime.now().isoformat(timespec='seconds')}\n\n{prompt_for(n)}\n",
                encoding="utf-8")
            print(f"  -> {png.name}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
