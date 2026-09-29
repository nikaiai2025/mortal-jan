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
