"""Mortal action indices and the action ids used in problem data.

Action ids: "d:<pai>" dama discard, "r:<pai>" riichi with that discard,
"chi_low" / "chi_mid" / "chi_high", "pon", "pass". Tiles use mjai notation.
"""

from __future__ import annotations

# Mortal's tile order: 0-33 are tile kinds, 34-36 are the red fives.
TILE_NAMES = (
    [f"{n}m" for n in range(1, 10)]
    + [f"{n}p" for n in range(1, 10)]
    + [f"{n}s" for n in range(1, 10)]
    + ["E", "S", "W", "N", "P", "F", "C"]
    + ["5mr", "5pr", "5sr"]
)

RIICHI = 37
CHI_LOW, CHI_MID, CHI_HIGH, PON, KAN, AGARI, RYUKYOKU, PASS = range(38, 46)
ACTION_SPACE = 46

CALL_ACTIONS = {CHI_LOW: "chi_low", CHI_MID: "chi_mid", CHI_HIGH: "chi_high", PON: "pon", PASS: "pass"}
# Actions whose decisions are not published as problems.
EXCLUDED_ACTIONS = {KAN, AGARI, RYUKYOKU}


def discard_id(index: int) -> str:
    return f"d:{TILE_NAMES[index]}"


def riichi_id(index: int) -> str:
    return f"r:{TILE_NAMES[index]}"


def call_id(index: int) -> str:
    return CALL_ACTIONS[index]


def deaka(pai: str) -> str:
    return pai[:2] if pai.endswith("r") else pai


def tile_sort_key(pai: str) -> tuple[int, int]:
    """Hand order: man, pin, sou, honors; a red five sorts just after the plain five."""
    base = TILE_NAMES.index(deaka(pai))
    return base, 1 if pai.endswith("r") else 0
