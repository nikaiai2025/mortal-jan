"""Derive the call thresholds and the riichi weight, and save them for generator.extract.

Call thresholds are the quantiles of call decisions that reproduce the easy/hard
shares of discard decisions. The riichi weight is the one whose simulated
extraction gives riichi problems closest to 5%.

    python -m generator.calibrate
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import runtime
from .extract import CALIBRATION_PATH, by_kyoku, decision_files, kyoku_rng, pick, read_decisions
from .scoring import DISCARD_THRESHOLDS, classify_difficulty, mortal_evaluation

TARGET_RIICHI_SHARE = 0.05
RIICHI_WEIGHTS = [round(1 + 0.05 * i, 2) for i in range(41)]  # 1.00 .. 3.00


def quantile(sorted_values: list[float], share: float) -> float:
    return sorted_values[min(len(sorted_values) - 1, int(share * len(sorted_values)))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--decisions", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    args = parser.parse_args()

    # Keep only what the extraction needs: (game, kyoku, decisions with kind and p_max).
    kyokus = []
    for path in decision_files(args.decisions):
        data = read_decisions(path)
        for kyoku_index, decisions in by_kyoku(data["decisions"]):
            compact = [{"kind": d["kind"], "pMax": max(mortal_evaluation(d["q"]).values())} for d in decisions]
            kyokus.append((data["game"], kyoku_index, compact))
    games = len({game for game, _, _ in kyokus})

    discard = sorted(d["pMax"] for _, _, ds in kyokus for d in ds if d["kind"] != "call")
    call = sorted(d["pMax"] for _, _, ds in kyokus for d in ds if d["kind"] == "call")
    easy_min, hard_max = DISCARD_THRESHOLDS
    easy_share = sum(p >= easy_min for p in discard) / len(discard)
    hard_share = sum(p < hard_max for p in discard) / len(discard)
    call_thresholds = [round(quantile(call, 1 - easy_share), 4), round(quantile(call, hard_share), 4)]

    for _, _, decisions in kyokus:
        for d in decisions:
            thresholds = call_thresholds if d["kind"] == "call" else DISCARD_THRESHOLDS
            d["difficulty"] = classify_difficulty(d["pMax"], thresholds)

    def riichi_share(weight: float) -> float:
        picks = [pick(ds, kyoku_rng(game, index), weight) for game, index, ds in kyokus]
        picked = [p for p in picks if p is not None]
        return sum(p["kind"] == "riichi" for p in picked) / len(picked)

    weight = min(RIICHI_WEIGHTS, key=lambda w: abs(riichi_share(w) - TARGET_RIICHI_SHARE))
    calibration = {"callThresholds": call_thresholds, "riichiWeight": weight, "games": games}
    CALIBRATION_PATH.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
    print(f"{games} games: discard easy {easy_share:.1%} / hard {hard_share:.1%}")
    print(f"call thresholds {call_thresholds}, riichi weight {weight} ({riichi_share(weight):.1%} riichi)")
    print(f"saved {CALIBRATION_PATH.name}")


if __name__ == "__main__":
    main()
