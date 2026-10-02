"""Score OCR output against the scene it was drawn from.

    python evaluate.py <scene-N.MODEL.json>...
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

SEATS = ["self", "shimocha", "toimen", "kamicha"]
WINDS = {"E": "E", "S": "S", "W": "W", "N": "N"}


def meld_tiles(meld: dict) -> list[str]:
    tiles = list(meld["consumed"])
    if meld.get("pai"):
        tiles.append(meld["pai"])
    if meld.get("added"):
        tiles.append(meld["added"])
    return sorted(tiles)


def truth_view(scene: dict) -> dict:
    """The scene in the OCR output's terms (seats relative to the answering player)."""
    seat_of = {name: (scene["seat"] + i) % 4 for i, name in enumerate(SEATS)}
    return {
        "round": [scene["bakaze"], scene["kyoku"], scene["honba"], scene["kyotaku"]],
        "dealer": next(name for name, seat in seat_of.items() if seat == scene["oya"]),
        "dora": scene["doraMarkers"],
        "hand": sorted(scene["hand"]),
        "drawn": scene["drawn"],
        "players": {
            name: {
                "score": scene["scores"][seat],
                "riichi": scene["riichi"][seat],
                "river": [t["pai"] for t in scene["rivers"][seat]],
                "sideways": [i for i, t in enumerate(scene["rivers"][seat]) if t["riichi"]],
                "melds": sorted(" ".join(meld_tiles(m)) + f" {m['type']}" for m in scene["melds"][seat]),
            }
            for name, seat in seat_of.items()
        },
    }


def load_output(path: Path) -> dict:
    """The output of a run file; hand-written JSON that only lacks closing braces is completed."""
    text = path.read_text(encoding="utf-8").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = json.loads(text + "}" * (text.count("{") - text.count("}")) if text.count("{") > text.count("}") else text)
    return data["output"]


def tile_entry(item) -> dict:
    """A river entry written either as {"tile", "sideways"} or as a bare tile string."""
    return item if isinstance(item, dict) else {"tile": item, "sideways": False}


# Rows written as seen on screen (rows left to right, columns top to bottom, nearest the panel first) run
# against the discard order for these seats: 下家 discards bottom to top, 対面 right to left.
REVERSED_ON_SCREEN = {"shimocha", "toimen"}


def discard_order(name: str, rows: list[list]) -> list:
    return [item for row in rows for item in (row[::-1] if name in REVERSED_ON_SCREEN else row)]


def ocr_view(out: dict) -> dict:
    # A version that asks for only part of the board (e.g. rivers only) leaves the rest out.
    for name, player in out["players"].items():
        if "riverRows" in player:
            player["river"] = discard_order(name, player["riverRows"] or [])
        player["river"] = [tile_entry(item) for item in player.get("river") or []]
        player.setdefault("melds", [])
        player.setdefault("score", None)
        player.setdefault("riichi", "不明")
    out.setdefault("dealer", "不明")
    out.setdefault("doraIndicators", [])
    out.setdefault("hand", {"concealed": [], "drawn": None})
    r = out.get("round") or {"wind": "不明", "number": None, "honba": None, "riichiSticks": None}
    return {
        "round": [r["wind"], r["number"], r["honba"], r["riichiSticks"]],
        "dealer": out["dealer"],
        "dora": out["doraIndicators"],
        "hand": sorted(out["hand"]["concealed"]),
        "drawn": out["hand"]["drawn"],
        "players": {
            name: {
                "score": p["score"],
                "riichi": {"true": True, "false": False}.get(p["riichi"], p["riichi"]),
                "river": [t["tile"] for t in p["river"]],
                "sideways": [i for i, t in enumerate(p["river"]) if t["sideways"]],
                "melds": sorted(" ".join(sorted(m["tiles"])) + f" {m['type']}" for m in p["melds"]),
            }
            for name, p in out["players"].items()
        },
    }


def multiset_recall(truth: list, got: list) -> tuple[int, int]:
    """Tiles of the truth found in the output (as a multiset), and the truth's size."""
    return sum((Counter(truth) & Counter(got)).values()), len(truth)


def score(path: Path, truth_dir: Path | None = None) -> dict:
    scene_id = path.name.split(".")[0]
    raw = json.loads(((truth_dir or path.parent) / f"{scene_id}.truth.json").read_text(encoding="utf-8"))
    # RoboMajang's overhead render does not draw the dora indicators, honba or deposits.
    hidden = scene_id.startswith("rm-")
    # A scene drawn by the site, or a hand-made truth already in the output's terms (screenshots).
    truth = raw["view"] if "view" in raw else truth_view(raw)
    got = ocr_view(load_output(path))
    if hidden:
        # The render lays a kakan out like a daiminkan (four in a row).
        for view in (truth, got):
            for player in view["players"].values():
                player["melds"] = sorted(m.replace("kakan", "daiminkan") for m in player["melds"])
    river_hit = river_all = 0
    river_exact = 0
    for name in SEATS:
        t, g = truth["players"][name]["river"], got["players"][name]["river"]
        matcher = SequenceMatcher(a=t, b=g, autojunk=False)
        river_hit += sum(block.size for block in matcher.get_matching_blocks())
        river_all += len(t)
        river_exact += t == g
    hand_hit, hand_all = multiset_recall(truth["hand"] + [truth["drawn"]] if truth["drawn"] else truth["hand"], got["hand"] + ([got["drawn"]] if got["drawn"] else []))
    checks = {
        "round(場・局・本場・供託)": truth["round"][:2] == got["round"][:2] if hidden else truth["round"] == got["round"],
        "dealer": truth["dealer"] == got["dealer"],
        "dora": None if hidden else truth["dora"] == got["dora"],
        "scores": all(truth["players"][n]["score"] == got["players"][n]["score"] for n in SEATS),
        "riichi": all(truth["players"][n]["riichi"] == got["players"][n]["riichi"] for n in SEATS),
        "sideways": all(truth["players"][n]["sideways"] == got["players"][n]["sideways"] for n in SEATS),
        "melds": all(truth["players"][n]["melds"] == got["players"][n]["melds"] for n in SEATS),
        "hand exact": truth["hand"] == got["hand"] and truth["drawn"] == got["drawn"],
    }
    return {
        "file": path.name,
        "checks": checks,
        "river tiles in order": f"{river_hit}/{river_all}",
        "rivers exact": f"{river_exact}/4",
        "hand tiles": f"{hand_hit}/{hand_all}",
        "diff": {
            key: {"truth": truth[key] if key in truth else None, "got": got[key]}
            for key, ok in [("round", checks["round(場・局・本場・供託)"]), ("dealer", checks["dealer"]), ("dora", checks["dora"])]
            if ok is False
        }
        | {
            f"{n}.{field}": {"truth": truth["players"][n][field], "got": got["players"][n][field]}
            for n in SEATS
            for field in ("score", "riichi", "sideways", "melds", "river")
            if truth["players"][n][field] != got["players"][n][field]
        }
        | ({"hand": {"truth": [truth["hand"], truth["drawn"]], "got": [got["hand"], got["drawn"]]}} if not checks["hand exact"] else {}),
    }


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        print(json.dumps(score(Path(arg)), ensure_ascii=False, indent=1))
