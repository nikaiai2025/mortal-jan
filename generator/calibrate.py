"""Derive the call thresholds, the call probability and the riichi weight for generator.extract.

- Call thresholds: quantiles of call decisions that reproduce the easy/normal/hard mix of
  discard decisions (obvious decisions excluded on both sides).
- Call probability and riichi weight: the values whose simulated extraction gives call and
  riichi problems closest to their target shares.

    python -m generator.calibrate
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import runtime
from .extract import CALIBRATION_PATH, by_kyoku, decision_files, kyoku_rng, pick, read_decisions
from .scoring import DISCARD_THRESHOLDS, TRIVIAL, classify_difficulty, p_max

TARGET_CALL_SHARE = 0.20
TARGET_RIICHI_SHARE = 0.05
CALL_PROBABILITIES = [round(0.02 * i, 2) for i in range(1, 36)]  # 0.02 .. 0.70
RIICHI_WEIGHTS = [round(1 + 0.05 * i, 2) for i in range(41)]  # 1.00 .. 3.00


def quantile(sorted_values: list[float], share: float) -> float:
    return sorted_values[min(len(sorted_values) - 1, int(share * len(sorted_values)))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--decisions", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    args = parser.parse_args()

    # Keep only what the extraction needs: (game, kyoku, decisions with kind and best evaluation).
    kyokus = []
    for path in decision_files(args.decisions):
        data = read_decisions(path)
        for kyoku_index, decisions in by_kyoku(data["decisions"]):
            kyokus.append((data["game"], kyoku_index, [{"kind": d["kind"], "best": p_max(d["q"])} for d in decisions]))
    games = len({game for game, _, _ in kyokus})
    all_decisions = [d for _, _, ds in kyokus for d in ds if d["best"] < TRIVIAL]
    discard = [d["best"] for d in all_decisions if d["kind"] != "call"]
    call = sorted(d["best"] for d in all_decisions if d["kind"] == "call")
    easy_min, hard_max = DISCARD_THRESHOLDS
    easy_share = sum(b >= easy_min for b in discard) / len(discard)
    hard_share = sum(b < hard_max for b in discard) / len(discard)
    call_thresholds = [round(quantile(call, 1 - easy_share), 4), round(quantile(call, hard_share), 4)]

    for _, _, decisions in kyokus:
        for d in decisions:
            d["difficulty"] = classify_difficulty(d["best"], call_thresholds if d["kind"] == "call" else DISCARD_THRESHOLDS)

    def shares(call_probability: float, riichi_weight: float) -> tuple[float, float]:
        picked = [
            p for game, index, ds in kyokus if (p := pick(ds, kyoku_rng(game, index), riichi_weight, call_probability)) is not None
        ]
        return (
            sum(p["kind"] == "call" for p in picked) / len(picked),
            sum(p["kind"] == "riichi" for p in picked) / len(picked),
        )

    weight = 1.4
    for _ in range(2):
        probability = min(CALL_PROBABILITIES, key=lambda c: abs(shares(c, weight)[0] - TARGET_CALL_SHARE))
        weight = min(RIICHI_WEIGHTS, key=lambda w: abs(shares(probability, w)[1] - TARGET_RIICHI_SHARE))
    call_share, riichi_share = shares(probability, weight)
    calibration = {
        "callThresholds": call_thresholds,
        "callProbability": probability,
        "riichiWeight": weight,
        "games": games,
    }
    CALIBRATION_PATH.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
    print(f"{games} games: call thresholds {call_thresholds} (discard easy {easy_share:.1%} / hard {hard_share:.1%})")
    print(f"call probability {probability} -> {call_share:.1%} calls; riichi weight {weight} -> {riichi_share:.1%} riichi")
    print(f"saved {CALIBRATION_PATH.name}")


if __name__ == "__main__":
    main()
