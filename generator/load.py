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


def sql_text(value: object) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return "'" + text.replace("'", "''") + "'"


def insert_statement(problem: dict) -> str:
    values = [str(int(problem["id"]))] + [sql_text(problem[column]) for column in COLUMNS[1:]]
    return f"INSERT INTO problems ({', '.join(COLUMNS)}) VALUES ({', '.join(values)});"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--problems", type=Path, default=runtime.GENERATED_ROOT / "problems.jsonl")
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "problems.sql")
    args = parser.parse_args()

    count = 0
    with args.problems.open(encoding="utf-8") as source, args.out.open("w", encoding="utf-8", newline="\n") as out:
        for line in source:
            out.write(insert_statement(json.loads(line)) + "\n")
            count += 1
    print(f"{count} problems -> {args.out}")


if __name__ == "__main__":
    main()
