"""Derive the call thresholds and the call and riichi probabilities for generator.extract.

- Call thresholds: quantiles of call decisions that reproduce the easy/normal/hard mix of
  discard decisions (obvious decisions excluded on both sides).
- Call and riichi probabilities: the values whose simulated extraction gives call and riichi
  problems closest to their target shares. They exceed the shares, since not every kyoku has
  a call or riichi problem.

    python -m generator.calibrate
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import runtime
from .extract import CALIBRATION_PATH, by_kyoku, decision_files, kyoku_rng, pick, read_decisions
from .scoring import DISCARD_THRESHOLDS, TRIVIAL, classify_difficulty, p_max

TARGET_CALL_SHARE = 0.15
TARGET_RIICHI_SHARE = 0.15
PROBABILITIES = [round(0.01 * i, 2) for i in range(101)]


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

    def extract(call_probability: float, riichi_probability: float) -> tuple[float, float, int]:
        picked = [
            p for game, index, ds in kyokus if (p := pick(ds, kyoku_rng(game, index), call_probability, riichi_probability)) is not None
        ]
        return (
            sum(p["kind"] == "call" for p in picked) / len(picked),
            sum(p["kind"] == "riichi" for p in picked) / len(picked),
            len(picked),
        )

    call_probability = riichi_probability = 0.0
    for _ in range(3):
        call_probability = min(
            (p for p in PROBABILITIES if p + riichi_probability <= 1),
            key=lambda p: abs(extract(p, riichi_probability)[0] - TARGET_CALL_SHARE),
        )
        riichi_probability = min(
            (p for p in PROBABILITIES if call_probability + p <= 1),
            key=lambda p: abs(extract(call_probability, p)[1] - TARGET_RIICHI_SHARE),
        )
    call_share, riichi_share, picked = extract(call_probability, riichi_probability)
    calibration = {
        "callThresholds": call_thresholds,
        "callProbability": call_probability,
        "riichiProbability": riichi_probability,
        "games": games,
    }
    CALIBRATION_PATH.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
    print(f"{games} games: call thresholds {call_thresholds} (discard easy {easy_share:.1%} / hard {hard_share:.1%})")
    print(f"call probability {call_probability} -> {call_share:.1%} calls; riichi probability {riichi_probability} -> {riichi_share:.1%} riichi")
    print(f"{picked} problems ({picked / games:.2f} per hanchan)")
    print(f"saved {CALIBRATION_PATH.name}")


if __name__ == "__main__":
    main()
