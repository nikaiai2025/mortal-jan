"""Give the loaded problems their difficulty under the current thresholds (after changing them).

    python -m generator.relabel
    cd web; npx wrangler d1 execute DB --remote --file ../generated/relabel.sql

Only the difficulty and the position within it change: answers and records stay, and
difficulty problem sets change their contents. The problems cannot be extracted again
instead, since the extraction drew the difficulties under the old thresholds.
A row is updated only if it holds the same problem (same source), so the SQL leaves a
database with another problem set (e.g. the trial set) alone. problems.jsonl and its
meta are rewritten to match, so a later load gives the same result.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from . import runtime
from .extract import load_calibration, thresholds_for
from .load import sql_text, with_positions
from .scoring import DISCARD_THRESHOLDS, classify_difficulty, p_max


def relabel(problems: list[dict[str, Any]], calibration: dict[str, Any]) -> list[dict[str, Any]]:
    """The problems with the difficulty their AI evaluation gets under the current thresholds."""
    result = []
    for problem in problems:
        q = {c["action"]: c["q"] for c in problem["evaluation"]["candidates"]}
        difficulty = classify_difficulty(p_max(q), thresholds_for(problem["kind"], calibration))
        if difficulty is None:
            raise SystemExit(f"problem {problem['id']} is too obvious under the current TRIVIAL; a TRIVIAL change needs new problems")
        result.append({**problem, "difficulty": difficulty})
    return result


def update_statement(problem: dict[str, Any], position: int) -> str:
    """Writes the row only if it holds this problem and changes (D1 counts written rows)."""
    difficulty = sql_text(problem["difficulty"])
    return (
        f"UPDATE problems SET difficulty = {difficulty}, difficulty_pos = {position} "
        f"WHERE id = {int(problem['id'])} AND source = {sql_text(problem['source'])} "
        f"AND (difficulty <> {difficulty} OR difficulty_pos <> {position});"
    )


def replace_file(path: Path, text: str) -> None:
    """Write beside the file, then swap: an interruption never leaves a truncated file."""
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(temporary, path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--problems", type=Path, default=runtime.GENERATED_ROOT / "problems.jsonl")
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "relabel.sql")
    args = parser.parse_args()

    with args.problems.open(encoding="utf-8") as source:
        problems = [json.loads(line) for line in source]
    calibration = load_calibration()
    relabelled = relabel(problems, calibration)
    with args.out.open("w", encoding="utf-8", newline="\n") as out:
        for problem, positions in with_positions(relabelled):
            out.write(update_statement(problem, positions["difficulty"]) + "\n")
    replace_file(args.problems, "".join(json.dumps(p, ensure_ascii=False, separators=(",", ":")) + "\n" for p in relabelled))
    meta_path = args.problems.with_suffix(".meta.json")
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta.update(discardThresholds=DISCARD_THRESHOLDS, callThresholds=calibration["callThresholds"])
        replace_file(meta_path, json.dumps(meta, indent=2))

    changed = sum(old["difficulty"] != new["difficulty"] for old, new in zip(problems, relabelled))
    mix = {d: sum(p["difficulty"] == d for p in relabelled) for d in ("easy", "normal", "hard")}
    print(f"{changed} of {len(problems)} problems change difficulty; now {mix} -> {args.out}")


if __name__ == "__main__":
    main()
