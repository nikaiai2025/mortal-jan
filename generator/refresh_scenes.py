"""Add exact riichi declaration boundaries to existing problems without replacing them.

    python -m generator.refresh_scenes

Verifies the model, source log hash and every existing scene field before updating.
Writes refreshed problems.jsonl and scene-only D1 updates guarded by problem source.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from . import runtime
from .load import sql_text
from .problem_source import load_events, problem_round, verified_scene


def refresh_scene(events: list[dict[str, Any]], problem: dict[str, Any]) -> dict[str, Any]:
    round_events, target = problem_round(events, problem)
    return {**problem, "scene": verified_scene(round_events, target, problem)}


def update_statement(problem: dict[str, Any]) -> str:
    scene = sql_text(problem["scene"])
    return (
        f"UPDATE problems SET scene = {scene} WHERE id = {int(problem['id'])} "
        f"AND source = {sql_text(problem['source'])} AND scene <> {scene};"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--problems", type=Path, default=runtime.GENERATED_ROOT / "problems.jsonl")
    parser.add_argument("--logs", type=Path, default=runtime.GENERATED_ROOT / "logs")
    parser.add_argument("--decisions", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "refresh-scenes.sql")
    args = parser.parse_args()
    with args.problems.open(encoding="utf-8") as source:
        problems = [json.loads(line) for line in source]
    by_game: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for problem in problems:
        by_game[problem["source"]["game"]].append(problem)
    refreshed = {}
    for game, group in sorted(by_game.items()):
        events = load_events(game, args.logs, args.decisions)
        for problem in group:
            refreshed[problem["id"]] = refresh_scene(events, problem)
    # Finish all verification before replacing either output.
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sql_tmp = args.out.with_suffix(".sql.tmp")
    json_tmp = args.problems.with_suffix(".jsonl.tmp")
    with sql_tmp.open("w", encoding="utf-8", newline="\n") as sql, json_tmp.open("w", encoding="utf-8", newline="\n") as data:
        for original in problems:
            problem = refreshed[original["id"]]
            sql.write(update_statement(problem) + "\n")
            data.write(json.dumps(problem, ensure_ascii=False, separators=(",", ":")) + "\n")
    sql_tmp.replace(args.out)
    json_tmp.replace(args.problems)
    print(f"verified and refreshed {len(problems)} scenes -> {args.out}")


if __name__ == "__main__":
    main()
