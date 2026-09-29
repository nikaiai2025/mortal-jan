"""Derive the riichi weight and save it for generator.extract.

The weight is the one whose simulated extraction gives riichi problems closest to 5%.

    python -m generator.calibrate
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import runtime
from .extract import CALIBRATION_PATH, by_kyoku, decision_files, kyoku_rng, pick, read_decisions
from .scoring import difficulty

TARGET_RIICHI_SHARE = 0.05
RIICHI_WEIGHTS = [round(1 + 0.05 * i, 2) for i in range(41)]  # 1.00 .. 3.00


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--decisions", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    args = parser.parse_args()

    # Keep only what the extraction needs: (game, kyoku, decisions with kind and difficulty).
    kyokus = []
    for path in decision_files(args.decisions):
        data = read_decisions(path)
        for kyoku_index, decisions in by_kyoku(data["decisions"]):
            compact = [{"kind": d["kind"], "difficulty": difficulty(d["q"])} for d in decisions]
            kyokus.append((data["game"], kyoku_index, compact))
    games = len({game for game, _, _ in kyokus})

    def riichi_share(weight: float) -> float:
        picks = [pick(ds, kyoku_rng(game, index), weight) for game, index, ds in kyokus]
        picked = [p for p in picks if p is not None]
        return sum(p["kind"] == "riichi" for p in picked) / len(picked)

    weight = min(RIICHI_WEIGHTS, key=lambda w: abs(riichi_share(w) - TARGET_RIICHI_SHARE))
    calibration = {"riichiWeight": weight, "games": games}
    CALIBRATION_PATH.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
    print(f"{games} games: riichi weight {weight} ({riichi_share(weight):.1%} riichi); saved {CALIBRATION_PATH.name}")


if __name__ == "__main__":
    main()
