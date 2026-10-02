"""Isolate tile recognition: sheets of loose tiles (no board) in a shuffled order, by size and rotation.

    python sheets.py make                      -> sheets.json (then: node render_sheets.cjs, python sheets.py pad)
    python sheets.py pad                       -> each PNG enlarged by its zoom and put on the board's scale
    python sheets.py read <model> <run> [condition prefix]...  -> runs/<run>/<sheet>.json
    python sheets.py score <run>
"""

from __future__ import annotations

import json
import random
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
import ocr  # noqa: E402

KINDS = [f"{n}{s}" for s in "mps" for n in range(1, 10)] + list("ESWNPFC") + ["5mr", "5pr", "5sr"]
RIVER_WIDTH = 47  # a river tile's width in the 1000px RoboMajang renders
# (drawn width, rotation, zoom). Rotation as the board shows each seat's river: 下家 tops point left, 対面 upside
# down, 上家 tops point right. Zoom enlarges the drawn image afterwards, so it adds size but no detail.
CONDITIONS = {
    "A-large-upright": (RIVER_WIDTH * 2, 0, 1),
    "B-river-upright": (RIVER_WIDTH, 0, 1),
    "C-river-shimocha": (RIVER_WIDTH, -90, 1),
    "D-river-toimen": (RIVER_WIDTH, 180, 1),
    "E-river-kamicha": (RIVER_WIDTH, 90, 1),
    "Bx2-river-upright-zoom2": (RIVER_WIDTH, 0, 2),
    "Bx3-river-upright-zoom3": (RIVER_WIDTH, 0, 3),
}
SEEDS = [1, 2, 3, 4]
PROMPT = """画像には麻雀牌が横の段に並んでいる。上の段から下の段へ、各段は画面の左から右へ、全ての牌を1枚ずつ読み、段ごとの配列で返す。牌は回転していることがあるが、種類は模様で判断する。並びに規則はない。

- 牌は次の記号で書く。萬子 1m〜9m、筒子 1p〜9p、索子 1s〜9s、字牌 E(東) S(南) W(西) N(北) P(白) F(發) C(中)。赤ドラ（赤い5）は 5mr・5pr・5sr。
- 萬子は漢数字（一〜九、5は「伍」と書かれることがある）と赤い「萬」。萬子の「萬」が赤いのは普通の牌。
- 筒子は円の数、索子は竹の棒の数を数えて決める。
- 索子の1は鳥の絵。白は何も描かれていない白い牌。發は緑の漢字、中は赤い漢字。
- 普通の牌にも赤い部分がある（5筒の中央の円、7筒の4つの円、9筒の中段など）。赤ドラは、5の模様や数字全体が赤い、または金色などで特に目立つ場合だけにする。
"""
SCHEMA = {"type": "OBJECT", "properties": {"rows": {"type": "ARRAY", "items": {"type": "ARRAY", "items": ocr.TILE}}}, "required": ["rows"]}


def make() -> None:
    sheets = []
    for name, (width, rotate, zoom) in CONDITIONS.items():
        for seed in SEEDS:
            tiles = KINDS[:]
            random.Random(seed).shuffle(tiles)
            sheets.append({"id": f"{name}-{seed}", "width": width, "rotate": rotate, "zoom": zoom, "rows": [tiles[i:i + 10] for i in range(0, len(tiles), 10)]})
    (HERE / "sheets.json").write_text(json.dumps(sheets, ensure_ascii=False, indent=1), encoding="utf-8")


def pad() -> None:
    """Enlarge each rendered sheet by its zoom, then centre it on a square canvas at least 1000px wide, so that an
    unzoomed river tile is 47px of 1000 as on the board."""
    for sheet in json.loads((HERE / "sheets.json").read_text(encoding="utf-8")):
        path = HERE / f"{sheet['id']}.png"
        image = Image.open(path).convert("RGB")
        image = image.resize((image.width * sheet["zoom"], image.height * sheet["zoom"]), Image.LANCZOS)
        side = max(1000, *image.size)
        canvas = Image.new("RGB", (side, side), (0x1D, 0x6B, 0x3C))
        canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        canvas.save(path)


def read(model: str, run: str, *conditions: str) -> None:
    folder = HERE / "runs" / run
    folder.mkdir(parents=True, exist_ok=True)
    for sheet in json.loads((HERE / "sheets.json").read_text(encoding="utf-8")):
        out = folder / f"{sheet['id']}.json"
        if out.exists() or (conditions and not sheet["id"].startswith(conditions)):
            continue
        body = {
            "contents": [{"role": "user", "parts": [{"text": PROMPT}, ocr.image_bytes_part((HERE / f"{sheet['id']}.png").read_bytes())]}],
            "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA},
        }
        out.write_text(json.dumps(ocr.generate(model, body), ensure_ascii=False), encoding="utf-8")
        print(sheet["id"], file=sys.stderr)


def score(run: str) -> None:
    by_condition: dict[str, Counter] = {}
    misreads = Counter()
    for sheet in json.loads((HERE / "sheets.json").read_text(encoding="utf-8")):
        out = HERE / "runs" / run / f"{sheet['id']}.json"
        if not out.exists():
            continue
        truth = [t for row in sheet["rows"] for t in row]
        got = [t for row in json.loads(out.read_text(encoding="utf-8"))["rows"] for t in row]
        tally = by_condition.setdefault(sheet["id"].rsplit("-", 1)[0], Counter())
        for op, i1, i2, j1, j2 in SequenceMatcher(a=truth, b=got, autojunk=False).get_opcodes():
            if op == "equal":
                tally["right"] += i2 - i1
            elif op == "replace" and i2 - i1 == j2 - j1:
                misreads.update(zip(truth[i1:i2], got[j1:j2]))
        tally["tiles"] += len(truth)
        tally["length off"] += abs(len(truth) - len(got))
    for name, t in by_condition.items():
        print(f"{name:18} {t['right']:3}/{t['tiles']} ({t['right'] / t['tiles']:.0%})  length off {t['length off']}")
    print("misreads (truth -> got):", misreads.most_common(12))


if __name__ == "__main__":
    command, *args = sys.argv[1:]
    {"make": make, "pad": pad, "read": read, "score": score}[command](*args)
