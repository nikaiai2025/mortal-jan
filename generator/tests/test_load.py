import json
import subprocess
import sys

from generator.load import insert_statement, with_positions


def test_positions_count_within_difficulty_and_kind_in_number_order():
    problems = [
        {"id": 3, "kind": "call", "difficulty": "easy"},
        {"id": 1, "kind": "discard", "difficulty": "easy"},
        {"id": 2, "kind": "discard", "difficulty": "hard"},
    ]
    positions = {p["id"]: pos for p, pos in with_positions(problems)}
    assert positions == {
        1: {"difficulty": 1, "kind": 1},
        2: {"difficulty": 1, "kind": 2},
        3: {"difficulty": 2, "kind": 1},
    }


def test_insert_escapes_quotes_and_appends_positions():
    problem = {"id": 7, "kind": "discard", "difficulty": "easy", "scene": {"a": "it's"}, "choices": [], "evaluation": {}, "source": {}}
    sql = insert_statement(problem, {"difficulty": 4, "kind": 5})
    assert "it''s" in sql
    assert sql.endswith("4, 5);")


def test_after_writes_only_the_added_problems_with_continued_positions(tmp_path):
    problems = [
        {"id": i, "kind": "discard", "difficulty": "easy", "scene": {}, "choices": [], "evaluation": {}, "source": {}} for i in (1, 2, 3)
    ]
    source = tmp_path / "problems.jsonl"
    source.write_text("".join(json.dumps(p) + "\n" for p in problems), encoding="utf-8")
    out = tmp_path / "problems.sql"
    subprocess.run([sys.executable, "-m", "generator.load", "--problems", str(source), "--out", str(out), "--after", "2"], check=True)
    lines = out.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert lines[0].startswith("INSERT INTO problems") and "VALUES (3, " in lines[0] and lines[0].endswith("3, 3);")
