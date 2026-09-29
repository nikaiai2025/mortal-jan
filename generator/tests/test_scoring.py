import math

import pytest

from generator.scoring import best_action, classify_difficulty, mortal_evaluation, p_max, scores


def test_best_action_gets_100_and_others_follow_regret():
    q = {"d:1m": 0.5, "d:2m": 0.5 - 1.47, "d:3m": 0.5 - 0.23}
    assert scores(q) == {"d:1m": 100, "d:2m": 23, "d:3m": 79}


def test_near_tie_is_capped_below_100():
    assert scores({"d:1m": 1.0, "d:2m": 0.999})["d:2m"] == 99


def test_mortal_evaluation_is_a_distribution():
    p = mortal_evaluation({"a": 0.2, "b": -0.4, "c": -3.0})
    assert sum(p.values()) == pytest.approx(1.0)
    assert p["a"] / p["b"] == pytest.approx(math.exp(0.6))


def test_best_action_tie_is_deterministic():
    assert best_action({"d:2m": 1.0, "d:1m": 1.0}) == "d:1m"


@pytest.mark.parametrize(
    ("q", "expected"),
    [
        # Two candidates: p_max = 1 / (1 + e^-gap); gap = log(p / (1 - p)) gives p_max = p.
        ({"a": 0.0, "b": -(math.log(49) + 1e-9)}, None),  # 0.98: too obvious to be a problem
        ({"a": 0.0, "b": -(math.log(49) - 1e-9)}, "easy"),
        ({"a": 0.0, "b": -(math.log(9) + 1e-9)}, "easy"),
        ({"a": 0.0, "b": -(math.log(9) - 1e-9)}, "normal"),
        ({"a": 0.0, "b": 0.0}, "normal"),  # p_max = 0.5
        ({"a": 0.0, "b": 0.0, "c": 0.0}, "hard"),  # p_max = 1/3
    ],
)
def test_difficulty_by_best_evaluation(q, expected):
    assert classify_difficulty(p_max(q), (0.9, 0.5)) == expected
