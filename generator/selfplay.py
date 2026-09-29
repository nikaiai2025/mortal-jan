"""Mortal self-play: one hanchan per seed, all four seats greedy.

    python -m generator.selfplay --count 1100
"""

from __future__ import annotations

import argparse
import shutil
import time
from pathlib import Path

from . import runtime

SEED_KEY = runtime.seeds()["seedKey"]


def log_path(out: Path, seed: int) -> Path:
    return out / f"{seed}_{SEED_KEY}.json.gz"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "logs")
    parser.add_argument("--start", type=int, default=1, help="first seed")
    parser.add_argument("--count", type=int, required=True, help="number of hanchan")
    parser.add_argument("--batch", type=int, default=64, help="hanchan played in parallel")
    args = parser.parse_args()

    import torch
    from engine import MortalEngine  # Mortal source
    from libriichi.arena import SelfPlay

    brain, dqn = runtime.load_model()
    engine = MortalEngine(
        brain,
        dqn,
        is_oracle=False,
        version=runtime.OBS_VERSION,
        device=torch.device("cpu"),
        enable_amp=False,
        enable_quick_eval=True,  # skips inference only when a single discard is legal
        enable_rule_based_agari_guard=True,
        name="mortal",
    )
    # Logs are written to a scratch directory and only missing ones are moved in, so a
    # rerun never replaces a log that may already have been evaluated.
    partial = args.out / "_partial"
    arena = SelfPlay(disable_progress_bar=True, log_dir=str(partial))
    end = args.start + args.count
    started = time.time()
    for first in range(args.start, end, args.batch):
        count = min(args.batch, end - first)
        if all(log_path(args.out, seed).exists() for seed in range(first, first + count)):
            continue
        shutil.rmtree(partial, ignore_errors=True)
        arena.py_self_play(engine, (first, SEED_KEY), count)
        for seed in range(first, first + count):
            if not log_path(args.out, seed).exists():
                log_path(partial, seed).replace(log_path(args.out, seed))
        shutil.rmtree(partial)
        done = first + count - args.start
        elapsed = time.time() - started
        print(f"seeds {first}..{first + count - 1} done ({done}/{args.count}, {elapsed:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
