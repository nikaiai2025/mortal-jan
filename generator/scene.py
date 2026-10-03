"""Reconstruct the table from mjai events and cut out what one seat can see."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .actions import deaka, tile_sort_key

INITIAL_TILES_LEFT = 70


class SceneTracker:
    """Full-information table state. Feed every event of a game in order."""

    def __init__(self) -> None:
        self.kyoku_index = -1
        self._declaring = [False] * 4

    def update(self, event: dict[str, Any]) -> None:
        kind = event["type"]
        if kind == "start_kyoku":
            self._start_kyoku(event)
        elif kind == "tsumo":
            actor = event["actor"]
            self.hands[actor].append(event["pai"])
            self.drawn[actor] = event["pai"]
            self.tiles_left -= 1
        elif kind == "dahai":
            actor = event["actor"]
            self.hands[actor].remove(event["pai"])
            self.rivers[actor].append(
                {
                    "pai": event["pai"],
                    "tsumogiri": event["tsumogiri"],
                    "riichi": self._declaring[actor],
                    "called": False,
                }
            )
            self._declaring[actor] = False
            self.drawn[actor] = None
            self.last_discard = {"actor": actor, "pai": event["pai"]}
        elif kind == "reach":
            actor = event["actor"]
            self._declaring[actor] = True
            self.riichi_discard_counts[actor] = [len(river) for river in self.rivers]
        elif kind == "reach_accepted":
            actor = event["actor"]
            self.riichi[actor] = True
            self.scores[actor] -= 1000
            self.kyotaku += 1
        elif kind in ("chi", "pon", "daiminkan"):
            actor = event["actor"]
            for pai in event["consumed"]:
                self.hands[actor].remove(pai)
            self.rivers[event["target"]][-1]["called"] = True
            self.melds[actor].append(
                {"type": kind, "pai": event["pai"], "consumed": event["consumed"], "target": event["target"]}
            )
            self.drawn[actor] = None
        elif kind == "ankan":
            actor = event["actor"]
            for pai in event["consumed"]:
                self.hands[actor].remove(pai)
            self.melds[actor].append({"type": "ankan", "consumed": event["consumed"]})
        elif kind == "kakan":
            actor = event["actor"]
            self.hands[actor].remove(event["pai"])
            meld = next(
                m for m in self.melds[actor] if m["type"] == "pon" and deaka(m["pai"]) == deaka(event["pai"])
            )
            meld["type"] = "kakan"
            meld["added"] = event["pai"]
            self.drawn[actor] = None
        elif kind == "dora":
            self.dora_markers.append(event["dora_marker"])

    def _start_kyoku(self, event: dict[str, Any]) -> None:
        self.kyoku_index += 1
        self.bakaze = event["bakaze"]
        self.kyoku = event["kyoku"]
        self.honba = event["honba"]
        self.kyotaku = event["kyotaku"]
        self.oya = event["oya"]
        self.scores = list(event["scores"])
        self.dora_markers = [event["dora_marker"]]
        self.hands = [list(tehai) for tehai in event["tehais"]]
        self.rivers: list[list[dict[str, Any]]] = [[] for _ in range(4)]
        self.melds: list[list[dict[str, Any]]] = [[] for _ in range(4)]
        self.riichi = [False] * 4
        self.riichi_discard_counts: list[list[int] | None] = [None] * 4
        self.drawn: list[str | None] = [None] * 4
        self.last_discard: dict[str, Any] | None = None
        self.tiles_left = INITIAL_TILES_LEFT
        self._declaring = [False] * 4

    def snapshot(self, seat: int, *, call_decision: bool) -> dict[str, Any]:
        """Everything `seat` can see. Opponents' concealed tiles are only counted."""
        hand = list(self.hands[seat])
        drawn = None if call_decision else self.drawn[seat]
        if drawn is not None:
            hand.remove(drawn)
        return {
            "seat": seat,
            "bakaze": self.bakaze,
            "kyoku": self.kyoku,
            "honba": self.honba,
            "kyotaku": self.kyotaku,
            "oya": self.oya,
            "scores": list(self.scores),
            "doraMarkers": list(self.dora_markers),
            "tilesLeft": self.tiles_left,
            "rivers": deepcopy(self.rivers),
            "melds": deepcopy(self.melds),
            "riichi": list(self.riichi),
            "riichiDiscardCounts": deepcopy(self.riichi_discard_counts),
            "concealedCounts": [len(h) for h in self.hands],
            "hand": sorted(hand, key=tile_sort_key),
            "drawn": drawn,
            "target": dict(self.last_discard) if call_decision else None,
        }
