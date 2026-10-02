"""Upper bound for a two-stage OCR: each river cut out from our own render (known geometry), turned
upright, and read on its own; then compared with the whole-image result.

    python crops.py <model> <scene id>...
"""

from __future__ import annotations

import base64
import io
import json
import math
import sys
from difflib import SequenceMatcher
from pathlib import Path

from PIL import Image

import ocr

HERE = Path(__file__).parent
# Scene geometry (web/client/scene.ts).
RIVER_W, RIVER_H, PANEL_HALF_X, PANEL_HALF_Y, RIVER_GAP, RIVER_X, RIVER_ROW = 44, 59, 175, 95, 26, -132, 6
SCENE_WIDTH = 2 * (PANEL_HALF_X + RIVER_GAP + 3 * RIVER_H + 10 + RIVER_H + 8)
CENTRE = (SCENE_WIDTH / 2, PANEL_HALF_Y + RIVER_GAP + 3 * RIVER_H + 10 + RIVER_H + 8)
ROTATIONS = [0, -math.pi / 2, math.pi, math.pi / 2]
SEATS = ["self", "shimocha", "toimen", "kamicha"]

PROMPT = """画像は麻雀の1人分の河（捨て牌）を、そのプレイヤーから見た向きにしたものです。
牌を、上の段から下の段へ、各段は左から右の順に、全て読んでください。横向きの牌は sideways: true。
牌の記号: 萬子 1m〜9m、筒子 1p〜9p、索子 1s〜9s、字牌 E(東) S(南) W(西) N(北) P(白) F(發) C(中)、赤い5は 5mr・5pr・5sr。
鳥の絵は1s。丸い円の模様は筒子、竹の棒は索子、漢数字＋萬は萬子。少し暗い牌も種類はそのまま読む。
読めない牌は "不明" とし、推測で埋めないこと。牌に重なった赤丸・線などの描き込みは無視する。"""
SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "tiles": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"tile": ocr.TILE, "sideways": {"type": "BOOLEAN"}},
                "required": ["tile", "sideways"],
                "propertyOrdering": ["tile", "sideways"],
            },
        }
    },
    "required": ["tiles"],
}


def river_crop(image: Image.Image, scene: dict, relative: int) -> Image.Image:
    """The river of the player at this relative seat, cut out and turned so that the player sits below it."""
    seat = (scene["seat"] + relative) % 4
    river = scene["rivers"][seat]
    top = (PANEL_HALF_Y if relative % 2 == 0 else PANEL_HALF_X) + RIVER_GAP
    widths = [RIVER_H if t["riichi"] else RIVER_W for t in river]
    rows = [widths[i * RIVER_ROW:(i + 1) * RIVER_ROW] for i in range(2)] + [widths[2 * RIVER_ROW:]]
    right = RIVER_X + max([sum(r) for r in rows] + [RIVER_W])
    corners = [(RIVER_X - 12, top - 12), (right + 12, top - 12), (RIVER_X - 12, top + 3 * RIVER_H + 12), (right + 12, top + 3 * RIVER_H + 12)]
    turn = ROTATIONS[relative]
    scale = image.width / SCENE_WIDTH
    points = [
        ((CENTRE[0] + x * math.cos(turn) - y * math.sin(turn)) * scale, (CENTRE[1] + x * math.sin(turn) + y * math.cos(turn)) * scale)
        for x, y in corners
    ]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    crop = image.crop((int(min(xs)), int(min(ys)), int(math.ceil(max(xs))), int(math.ceil(max(ys)))))
    return crop.rotate(math.degrees(turn), expand=True)


def read_crop(model: str, crop: Image.Image) -> list[str]:
    buffer = io.BytesIO()
    crop.save(buffer, format="PNG")
    body = {
        "contents": [{"role": "user", "parts": [{"text": PROMPT}, {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(buffer.getvalue()).decode()}}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA},
    }
    return [t["tile"] for t in ocr.generate(model, body)["tiles"]]


if __name__ == "__main__":
    model, *ids = sys.argv[1:]
    total_hit = total = whole_hit = 0
    for scene_id in ids:
        scene = json.loads((HERE / f"scene-{scene_id}.truth.json").read_text(encoding="utf-8"))
        image = Image.open(HERE / f"scene-{scene_id}.png").convert("RGB")
        whole = json.loads((HERE / f"scene-{scene_id}.{model}.json").read_text(encoding="utf-8"))["output"]["players"]
        for relative, name in enumerate(SEATS):
            truth = [t["pai"] for t in scene["rivers"][(scene["seat"] + relative) % 4]]
            crop = river_crop(image, scene, relative)
            crop.save(HERE / f"crop-{scene_id}-{name}.png")
            got = read_crop(model, crop)
            hit = sum(b.size for b in SequenceMatcher(a=truth, b=got, autojunk=False).get_matching_blocks())
            before = sum(b.size for b in SequenceMatcher(a=truth, b=[t["tile"] for t in whole[name]["river"]], autojunk=False).get_matching_blocks())
            total_hit, total, whole_hit = total_hit + hit, total + len(truth), whole_hit + before
            print(f"{scene_id} {name}: crop {hit}/{len(truth)} (whole image {before}/{len(truth)})")
    print(f"rivers: crop {total_hit}/{total} vs whole image {whole_hit}/{total}")
