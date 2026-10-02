"""River and hand recall of every scored run on the same images, so runs that skipped an image compare fairly.

    python compare.py [image id to leave out]...
"""
import json
import sys
from pathlib import Path

leave_out = set(sys.argv[1:])
for summary in sorted(Path("runs").glob("haiku-*/summary.json"), key=lambda p: p.stat().st_mtime):
    results = [r for r in json.loads(summary.read_text(encoding="utf-8"))["results"] if r["file"].split(".")[0] not in leave_out]
    def total(key):
        hit = sum(int(r[key].split("/")[0]) for r in results)
        all_ = sum(int(r[key].split("/")[1]) for r in results)
        return f"{hit}/{all_} ({hit / all_:.0%})" if all_ else "-"
    print(f"{summary.parent.name:14} images {len(results):2}  river {total('river tiles in order'):14} hand {total('hand tiles')}")
