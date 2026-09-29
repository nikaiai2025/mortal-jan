"""Derive the call thresholds and the riichi weight from evaluated decisions.

Call thresholds are the quantiles of call decisions that reproduce the easy/hard
shares of discard decisions. The riichi weight is chosen so that riichi problems
are about 5% of the extracted set.

    python -m generator.calibrate
"""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

from . import runtime
from .extract import game_number, select
from .scoring import DISCARD_THRESHOLDS, mortal_evaluation

RIICHI_WEIGHTS = (1.0, 1.25, 1.5, 1.75, 2.0)


def best_evaluations(files: list[Path]) -> tuple[list[float], list[float]]:
    discard, call = [], []
    for path in files:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for decision in json.load(f)["decisions"]:
                p_max = max(mortal_evaluation(decision["q"]).values())
                (call if decision["kind"] == "call" else discard).append(p_max)
    return discard, call


def quantile(sorted_values: list[float], share: float) -> float:
    return sorted_values[min(len(sorted_values) - 1, int(share * len(sorted_values)))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--decisions", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    args = parser.parse_args()

    files = sorted(args.decisions.glob("*.json.gz"), key=lambda p: game_number(p.name))
    discard, call = best_evaluations(files)
    easy_min, hard_max = DISCARD_THRESHOLDS
    easy_share = sum(p >= easy_min for p in discard) / len(discard)
    hard_share = sum(p < hard_max for p in discard) / len(discard)
    call.sort()
    print(f"{len(files)} games, {len(discard)} discard / {len(call)} call decisions")
    print(f"discard shares: easy {easy_share:.1%}, hard {hard_share:.1%}")
    print(f"call thresholds for the same shares: ({quantile(call, 1 - easy_share):.4f}, {quantile(call, hard_share):.4f})")

    for weight in RIICHI_WEIGHTS:
        selected, _ = select(files, 10**9, weight)
        riichi = sum(decision["kind"] == "riichi" for _, decision in selected)
        print(f"riichi weight {weight}: {riichi}/{len(selected)} = {riichi / len(selected):.1%}")


if __name__ == "__main__":
    main()
