"""The most common river misreads (truth -> output) of each run, counted where a stretch of tiles was replaced one for one.

    python misreads.py <run>...
"""
import json
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from evaluate import SEATS, load_output, ocr_view, truth_view

for run in sys.argv[1:]:
    pairs = Counter()
    for f in sorted(Path("runs", run).glob("rm-*.json")):
        t = truth_view(json.loads(Path("robomajang", f"{f.stem}.truth.json").read_text(encoding="utf-8")))
        g = ocr_view(load_output(f))
        for s in SEATS:
            a, b = t["players"][s]["river"], g["players"][s]["river"]
            for op, i1, i2, j1, j2 in SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
                if op == "replace" and i2 - i1 == j2 - j1:
                    pairs.update(zip(a[i1:i2], b[j1:j2]))
    print(run, sum(pairs.values()), pairs.most_common(8))
