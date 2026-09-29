"""Write the SQL that loads the problems into D1 (web/migrations defines the table).

    python -m generator.load
    cd web; npx wrangler d1 execute DB --remote --file ../generated/problems.sql

Plain INSERTs: loading into a database that already has problems fails instead of
replacing problems that players may have answered.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import runtime

COLUMNS = ("id", "kind", "difficulty", "scene", "choices", "evaluation", "source")
POSITION_COLUMNS = ("difficulty", "kind")  # problem sets by theme: "<column>_pos"


def sql_text(value: object) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return "'" + text.replace("'", "''") + "'"


def with_positions(problems: list[dict]) -> list[tuple[dict, dict[str, int]]]:
    """Number each problem within its difficulty and within its kind, in problem-number order."""
    counters: dict[tuple[str, str], int] = {}
    result = []
    for problem in sorted(problems, key=lambda p: p["id"]):
        positions = {}
        for column in POSITION_COLUMNS:
            key = (column, problem[column])
            counters[key] = counters.get(key, 0) + 1
            positions[column] = counters[key]
        result.append((problem, positions))
    return result


def insert_statement(problem: dict, positions: dict[str, int]) -> str:
    columns = [*COLUMNS, *(f"{column}_pos" for column in POSITION_COLUMNS)]
    values = [str(int(problem["id"]))] + [sql_text(problem[column]) for column in COLUMNS[1:]]
    values += [str(positions[column]) for column in POSITION_COLUMNS]
    return f"INSERT INTO problems ({', '.join(columns)}) VALUES ({', '.join(values)});"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--problems", type=Path, default=runtime.GENERATED_ROOT / "problems.jsonl")
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "problems.sql")
    args = parser.parse_args()

    with args.problems.open(encoding="utf-8") as source:
        problems = [json.loads(line) for line in source]
    with args.out.open("w", encoding="utf-8", newline="\n") as out:
        for problem, positions in with_positions(problems):
            out.write(insert_statement(problem, positions) + "\n")
    print(f"{len(problems)} problems -> {args.out}")


if __name__ == "__main__":
    main()
