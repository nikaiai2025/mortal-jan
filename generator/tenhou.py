"""Convert one complete self-play round to the official reviewer's tenhou.net/6 input.

The arena records score transfers, but not fu, han, yaku names or the reason for
an abortive draw. Keep those details absent instead of inventing them. The
reviewer's convlog needs the winners, targets and score transfers only.
"""

from __future__ import annotations

from typing import Any


def tile(pai: str) -> int:
    if pai in ("E", "S", "W", "N", "P", "F", "C"):
        return 41 + "ESWNPFC".index(pai)
    if len(pai) in (2, 3) and pai[0] in "123456789" and pai[1] in "mps":
        if len(pai) == 2:
            return 10 * (1 + "mps".index(pai[1])) + int(pai[0])
        if pai[0] == "5" and pai[2] == "r":
            return 51 + "mps".index(pai[1])
    raise ValueError(f"invalid mjai tile: {pai!r}")


def called_meld(event: dict[str, Any], marker: str) -> str:
    """The called tile's position encodes which seat it came from."""
    distance = (event["target"] - event["actor"]) % 4
    positions = {3: 0, 2: 1, 1: 3 if marker == "m" else 2}
    if distance not in positions:
        raise ValueError("a player cannot call their own discard")
    parts = [str(tile(p)) for p in event["consumed"]]
    parts.insert(positions[distance], marker + str(tile(event["pai"])))
    return "".join(parts)


def kyoku_label(start: dict[str, Any]) -> str:
    return f"{start['bakaze']}{start['kyoku']}.{start['honba']}"


def round_to_tenhou(events: list[dict[str, Any]]) -> dict[str, Any]:
    if not events or events[0]["type"] != "start_kyoku" or events[-1]["type"] != "end_kyoku":
        raise ValueError("a complete round from start_kyoku to end_kyoku is required")
    first = events[0]
    takes: list[list[int | str]] = [[] for _ in range(4)]
    discards: list[list[int | str]] = [[] for _ in range(4)]
    declaring = [False] * 4
    pons: dict[tuple[int, int], str] = {}
    dora = [tile(first["dora_marker"])]
    ura: list[int] = []
    result: list[Any] = []
    for event in events[1:]:
        kind = event["type"]
        actor = event.get("actor")
        if kind == "tsumo":
            takes[actor].append(tile(event["pai"]))
        elif kind == "dahai":
            value = 60 if event["tsumogiri"] else tile(event["pai"])
            discards[actor].append(f"r{value}" if declaring[actor] else value)
            declaring[actor] = False
        elif kind == "reach":
            declaring[actor] = True
        elif kind == "chi":
            if event["target"] != (actor + 3) % 4:
                raise ValueError("chi must be from kamicha")
            takes[actor].append("c" + "".join(str(tile(p)) for p in [event["pai"], *event["consumed"]]))
        elif kind in ("pon", "daiminkan"):
            meld = called_meld(event, "p" if kind == "pon" else "m")
            takes[actor].append(meld)
            if kind == "pon":
                pons[actor, tile(event["pai"].removesuffix("r"))] = meld
            else:
                # Daiminkan consumes a take slot but no discard; zero is its placeholder.
                discards[actor].append(0)
        elif kind == "ankan":
            parts = [str(tile(p)) for p in event["consumed"]]
            discards[actor].append("".join(parts[:3]) + "a" + parts[3])
        elif kind == "kakan":
            key = actor, tile(event["pai"].removesuffix("r"))
            pon = pons.pop(key)
            position = pon.index("p")
            # The added tile follows k; the original called tile follows it.
            discards[actor].append(pon[:position] + "k" + str(tile(event["pai"])) + pon[position + 1:])
        elif kind == "dora":
            dora.append(tile(event["dora_marker"]))
        elif kind == "hora":
            if not result:
                result.append("和了")
            if result[0] != "和了":
                raise ValueError("hora and ryukyoku in the same round")
            markers = [tile(p) for p in event.get("ura_markers", [])]
            if markers:
                if ura and markers != ura:
                    raise ValueError("conflicting ura indicators")
                ura = markers
            # Fu/han/yaku are not recorded by the arena and are not needed for review.
            result.extend([event["deltas"], [actor, event["target"], actor]])
        elif kind == "ryukyoku":
            if result:
                raise ValueError("multiple round results")
            result = ["流局", event["deltas"]]
        elif kind not in ("reach_accepted", "end_kyoku"):
            raise ValueError(f"unsupported mjai event: {kind}")
    if not result:
        raise ValueError("round has no result")
    number = 4 * "ESWN".index(first["bakaze"]) + first["kyoku"] - 1
    if first["oya"] != number % 4:
        raise ValueError("dealer does not match the round number")
    kyoku = [[number, first["honba"], first["kyotaku"]], first["scores"], dora, ura]
    for seat in range(4):
        kyoku.extend([[tile(p) for p in first["tehais"][seat]], takes[seat], discards[seat]])
    kyoku.append(result)
    return {
        "name": [f"Mortal-298k seat {i}" for i in range(4)],
        "rule": {"disp": "四人南喰赤", "aka51": 1, "aka52": 1, "aka53": 1},
        "log": [kyoku],
    }
