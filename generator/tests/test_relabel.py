import math

import pytest

from generator.relabel import relabel, update_statement


def problem(id_, kind, gap):
    """Two candidates whose best has p_max = 1 / (1 + e^-gap)."""
    candidates = [{"action": "a", "q": 0.0}, {"action": "b", "q": -gap}]
    return {"id": id_, "kind": kind, "difficulty": "easy", "evaluation": {"best": "a", "candidates": candidates}}


def test_relabel_uses_the_current_thresholds_and_keeps_the_rest():
    calibration = {"callThresholds": [0.9, 0.7]}
    problems = [
        problem(1, "discard", math.log(0.6 / 0.4)),  # p_max 0.6: normal for discard
        problem(2, "call", math.log(0.6 / 0.4)),  # p_max 0.6: hard for calls
        problem(3, "riichi", math.log(0.95 / 0.05)),  # p_max 0.95: easy
    ]
    relabelled = relabel(problems, calibration)
    assert [p["difficulty"] for p in relabelled] == ["normal", "hard", "easy"]
    assert relabelled[0]["evaluation"] == problems[0]["evaluation"]
    assert problems[0]["difficulty"] == "easy"  # the input is left as it was


def test_relabel_refuses_a_problem_that_became_too_obvious():
    with pytest.raises(SystemExit):
        relabel([problem(1, "discard", math.log(0.99 / 0.01))], {"callThresholds": [0.9, 0.7]})


def test_update_writes_only_the_same_problem_when_it_changes():
    sql = update_statement({"id": 7, "difficulty": "hard", "source": {"game": "3_1", "seat": 2}}, 12)
    assert sql == (
        "UPDATE problems SET difficulty = 'hard', difficulty_pos = 12 "
        """WHERE id = 7 AND source = '{"game":"3_1","seat":2}' """
        "AND (difficulty <> 'hard' OR difficulty_pos <> 12);"
    )
