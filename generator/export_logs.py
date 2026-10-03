"""Export a complete tenhou.net/6 round for every problem and additive D1 SQL.

    python -m generator.export_logs
    python -m generator.export_logs --after 10000

Only problem_logs is written. Existing problems, answers and scores are untouched.
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
from .tenhou import kyoku_label, round_to_tenhou


def compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def export_problem(events: list[dict[str, Any]], problem: dict[str, Any]) -> dict[str, Any]:
    round_events, target = problem_round(events, problem)
    verified_scene(round_events, target, problem)
    log = round_to_tenhou(round_events)
    scene = problem["scene"]
    seat = scene["seat"]
    log["mortalJan"] = {
        "problemId": problem["id"],
        "targetPlayer": seat,
        "kyokuFilter": kyoku_label(round_events[0]),
        "turn": len(scene["rivers"][seat]) + 1,
        "drawn": scene["drawn"],
        "target": scene["target"],
        "temperature": 1.0,
        "sourceEventIndexInRound": target,
    }
    return log


def insert_statement(problem: dict[str, Any], tenhou: dict[str, Any]) -> str:
    # A different problem set with reused IDs must never receive these logs.
    return (
        "INSERT INTO problem_logs (problem_id, tenhou_json) "
        f"SELECT id, {sql_text(tenhou)} FROM problems WHERE id = {int(problem['id'])} "
        f"AND source = {sql_text(problem['source'])} "
        "ON CONFLICT(problem_id) DO UPDATE SET tenhou_json = excluded.tenhou_json;"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--problems", type=Path, default=runtime.GENERATED_ROOT / "problems.jsonl")
    parser.add_argument("--logs", type=Path, default=runtime.GENERATED_ROOT / "logs")
    parser.add_argument("--decisions", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "problem-logs")
    parser.add_argument("--sql", type=Path, default=runtime.GENERATED_ROOT / "problem-logs.sql")
    parser.add_argument("--after", type=int, default=0)
    args = parser.parse_args()
    problems = [json.loads(line) for line in args.problems.open(encoding="utf-8")]
    wanted = [p for p in problems if p["id"] > args.after]
    if not wanted:
        raise SystemExit("no problems to export")
    by_game: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for problem in wanted:
        by_game[problem["source"]["game"]].append(problem)
    args.out.mkdir(parents=True, exist_ok=True)
    args.sql.parent.mkdir(parents=True, exist_ok=True)
    sql_tmp = args.sql.with_suffix(".sql.tmp")
    written = size = 0
    with sql_tmp.open("w", encoding="utf-8", newline="\n") as sql:
        for game, group in sorted(by_game.items()):
            events = load_events(game, args.logs, args.decisions)
            for problem in group:
                tenhou = export_problem(events, problem)
                text = compact(tenhou)
                output = args.out / f"{problem['id']}.json"
                temporary = output.with_suffix(".json.tmp")
                temporary.write_text(text, encoding="utf-8")
                temporary.replace(output)
                sql.write(insert_statement(problem, tenhou) + "\n")
                written += 1
                size += len(text.encode("utf-8"))
            if written % 500 < len(group):
                print(f"exported {written}/{len(wanted)}", flush=True)
    sql_tmp.replace(args.sql)
    meta = {"problems": written, "jsonBytes": size, "after": args.after, **runtime.IDENTITY}
    args.sql.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"{written} logs ({size:,} bytes) -> {args.out}; SQL -> {args.sql}", flush=True)


if __name__ == "__main__":
    main()
