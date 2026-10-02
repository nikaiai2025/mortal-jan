"""Show per-image river counts/lengths and scores of a run, to see how a version fails."""
import json, sys
from pathlib import Path
for f in sorted(Path("runs", sys.argv[1]).glob("rm-*.json")):
    try:
        o = json.loads(f.read_text(encoding="utf-8"))["output"]
        p = o["players"]
        print(f.stem, "count", [p[s].get("riverCount") for s in p], "len", [len(p[s]["river"]) for s in p], "score", [p[s]["score"] for s in p], "dealer", o["dealer"])
    except Exception as error:
        print(f.stem, "broken", type(error).__name__)
