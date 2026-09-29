"""Pick at most one problem per kyoku, build the problem data and number it.

    python -m generator.extract --count 10000
"""

from __future__ import annotations

import argparse
import gzip
import json
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from . import runtime
from .evaluate import file_sha256
from .actions import deaka, tile_sort_key
from .scene import SceneTracker
from .scoring import (
    DIFFICULTIES,
    EASY_MIN,
    HARD_MAX,
    TEMPERATURE,
    TRIVIAL,
    best_action,
    difficulty,
    mortal_evaluation,
    scores,
)

EXTRACT_SEED = 20260930
CALIBRATION_PATH = Path(__file__).with_name("calibration.json")
CALL_ORDER = ("chi_low", "chi_mid", "chi_high", "pon", "pass")
CALL_OFFSETS = {"chi_low": (1, 2), "chi_mid": (-1, 1), "chi_high": (-2, -1), "pon": (0, 0)}


def game_number(game: str) -> int:
    return int(game.split("_")[0])


def load_calibration() -> dict[str, Any]:
    """Riichi weight written by generator.calibrate."""
    return json.loads(CALIBRATION_PATH.read_text(encoding="utf-8"))


def read_decisions(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        data = json.load(f)
    if data["identity"] != runtime.IDENTITY:
        raise RuntimeError(f"{path.name} was evaluated by another model: {data['identity']}")
    return data


def decision_files(directory: Path) -> list[Path]:
    return sorted(directory.glob("*.json.gz"), key=lambda p: game_number(p.name))


def by_kyoku(decisions: list[dict[str, Any]]) -> list[tuple[int, list[dict[str, Any]]]]:
    groups: dict[int, list[dict]] = defaultdict(list)
    for decision in decisions:
        groups[decision["kyokuIndex"]].append(decision)
    return sorted(groups.items())


def kyoku_rng(game: str, kyoku_index: int) -> random.Random:
    return random.Random(f"{EXTRACT_SEED}:{game}:{kyoku_index}")


def pick(decisions: list[dict[str, Any]], rng: random.Random, riichi_weight: float) -> dict[str, Any] | None:
    """Choose a difficulty uniformly, then one decision of it (riichi weighted).

    Each decision carries "kind" and "difficulty" (None: too obvious, never picked).
    """
    wanted = rng.choice(DIFFICULTIES)
    pool = [d for d in decisions if d["difficulty"] == wanted]
    if not pool:
        return None
    weights = [riichi_weight if d["kind"] == "riichi" else 1.0 for d in pool]
    return rng.choices(pool, weights)[0]


def select(
    files: list[Path], count: int, calibration: dict[str, Any]
) -> tuple[list[tuple[str, dict]], dict[str, str]]:
    """Return (game, decision) pairs in game order and the evaluated log hash of each game used."""
    selected: list[tuple[str, dict]] = []
    log_hashes: dict[str, str] = {}
    for path in files:
        if len(selected) >= count:
            break
        data = read_decisions(path)
        log_hashes[data["game"]] = data["logSha256"]
        for decision in data["decisions"]:
            decision["difficulty"] = difficulty(decision["q"])
        for kyoku_index, decisions in by_kyoku(data["decisions"]):
            decision = pick(decisions, kyoku_rng(data["game"], kyoku_index), calibration["riichiWeight"])
            if decision is not None:
                selected.append((data["game"], decision))
    return selected[:count], log_hashes


def call_consumed(action: str, pai: str, hand: list[str]) -> list[str]:
    """Tiles taken from the hand; a red five is used when held (as Mortal does)."""
    base = deaka(pai)
    if action == "pon" and not base[0].isdigit():
        return [base, base]
    number, suit = int(base[0]), base[1]
    tiles = [f"{number + offset}{suit}" for offset in CALL_OFFSETS[action]]
    red = f"5{suit}r"
    if red in hand and f"5{suit}" in tiles:
        tiles[tiles.index(f"5{suit}")] = red
    return tiles


def choices(kind: str, actions: list[str], scene: dict[str, Any]) -> list[dict[str, Any]]:
    """Legal answers in display order, without evaluations."""
    if kind == "call":
        ordered = [a for a in CALL_ORDER if a in actions]
        pai = scene["target"]["pai"]
        return [
            {"action": a} if a == "pass" else {"action": a, "consumed": call_consumed(a, pai, scene["hand"])}
            for a in ordered
        ]
    ordered = sorted(actions, key=lambda a: (a.startswith("r:"), tile_sort_key(a[2:])))
    return [{"action": a} for a in ordered]


def build_problem(game: str, decision: dict[str, Any], scene: dict[str, Any]) -> dict[str, Any]:
    q = decision["q"]
    evaluation = mortal_evaluation(q)
    score = scores(q)
    candidates = sorted(q, key=lambda a: -q[a])
    return {
        "kind": decision["kind"],
        "difficulty": decision["difficulty"],
        "scene": scene,
        "choices": choices(decision["kind"], list(q), scene),
        "evaluation": {
            "best": best_action(q),
            "candidates": [
                {"action": a, "q": q[a], "p": round(evaluation[a], 6), "score": score[a]} for a in candidates
            ],
        },
        "source": {
            "game": game,
            "kyokuIndex": decision["kyokuIndex"],
            "eventIndex": decision["eventIndex"],
            "seat": decision["seat"],
        },
    }


def build_problems(selected: list[tuple[str, dict]], log_hashes: dict[str, str], logs: Path) -> list[dict[str, Any]]:
    by_game: dict[str, list[dict]] = defaultdict(list)
    for game, decision in selected:
        by_game[game].append(decision)
    problems = []
    for game, decisions in by_game.items():
        log = logs / f"{game}.json.gz"
        if file_sha256(log) != log_hashes[game]:
            raise RuntimeError(f"{log.name} changed after evaluation; rerun generator.evaluate")
        with gzip.open(log, "rt", encoding="utf-8") as f:
            events = [json.loads(line) for line in f]
        tracker = SceneTracker()
        pending = sorted(decisions, key=lambda d: d["eventIndex"])
        position = 0
        for index, event in enumerate(events):
            tracker.update(event)
            while position < len(pending) and pending[position]["eventIndex"] == index:
                decision = pending[position]
                scene = tracker.snapshot(decision["seat"], call_decision=decision["kind"] == "call")
                problems.append(build_problem(game, decision, scene))
                position += 1
        if position != len(pending):
            raise RuntimeError(f"{game}: {len(pending) - position} decisions point past the log")
    return problems


def number(problems: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shuffle so that a 10-problem set does not come from one hanchan, then number from 1."""
    order = list(range(len(problems)))
    random.Random(f"{EXTRACT_SEED}:numbering").shuffle(order)
    return [{"id": i + 1, **problems[source]} for i, source in enumerate(order)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--decisions", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    parser.add_argument("--logs", type=Path, default=runtime.GENERATED_ROOT / "logs")
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "problems.jsonl")
    parser.add_argument("--count", type=int, default=10000)
    args = parser.parse_args()

    calibration = load_calibration()
    selected, log_hashes = select(decision_files(args.decisions), args.count, calibration)
    used_games = len(log_hashes)
    if len(selected) < args.count:
        raise SystemExit(f"only {len(selected)} problems from {used_games} games (wanted {args.count}); play more hanchan")
    problems = number(build_problems(selected, log_hashes, args.logs))

    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        for problem in problems:
            f.write(json.dumps(problem, ensure_ascii=False, separators=(",", ":")) + "\n")
    meta = {
        **runtime.IDENTITY,
        "temperature": TEMPERATURE,
        "trivial": TRIVIAL,
        "easyMin": EASY_MIN,
        "hardMax": HARD_MAX,
        "riichiWeight": calibration["riichiWeight"],
        "extractSeed": EXTRACT_SEED,
        "games": used_games,
        "problems": len(problems),
    }
    args.out.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    mix = Counter((p["kind"], p["difficulty"]) for p in problems)
    print(f"{len(problems)} problems from {used_games} games")
    for kind in ("discard", "riichi", "call"):
        total = sum(v for (k, _), v in mix.items() if k == kind)
        detail = ", ".join(f"{d} {mix[(kind, d)]}" for d in DIFFICULTIES)
        print(f"  {kind}: {total} ({total / max(len(problems), 1):.1%}): {detail}")


if __name__ == "__main__":
    main()
