"""Where a run's river reading fails, per seat: tiles in order, the same tiles reversed (wrong direction),
the tiles as a multiset (order ignored), and how far the river lengths are off.

    python rivers.py <run>...
"""
import json
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from evaluate import SEATS, load_output, ocr_view, truth_view

hits = lambda t, g: sum(b.size for b in SequenceMatcher(a=t, b=g, autojunk=False).get_matching_blocks())
for run in sys.argv[1:]:
    rows = {s: Counter() for s in SEATS}
    for f in sorted(Path("runs", run).glob("rm-*.json")):
        truth = truth_view(json.loads(Path("robomajang", f"{f.stem}.truth.json").read_text(encoding="utf-8")))
        got = ocr_view(load_output(f))
        for s in SEATS:
            t, g = truth["players"][s]["river"], got["players"][s]["river"]
            rows[s].update(total=len(t), order=hits(t, g), reversed=hits(t, g[::-1]), bag=sum((Counter(t) & Counter(g)).values()), length_off=abs(len(t) - len(g)))
    print(run)
    for s, r in rows.items():
        print(f"  {s:9} in order {r['order']:3}/{r['total']}  reversed {r['reversed']:3}  ignoring order {r['bag']:3}  length off {r['length_off']}")
