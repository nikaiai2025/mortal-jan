import random

import numpy as np
import pytest

from generator.actions import CHI_LOW, PASS, PON, RIICHI, TILE_NAMES
from generator.evaluate import DecisionPoint, candidates, classify
from generator.extract import call_consumed, choices, number, pick


EASY = {"d:1m": 0.0, "d:2m": -10.0}  # p_max ≈ 1
NORMAL = {"d:1m": 0.0, "d:2m": -1.0}  # p_max ≈ 0.73
HARD = {"d:1m": 0.0, "d:2m": 0.0, "d:3m": 0.0}  # p_max = 1/3


def decision(kind, q):
    return {"kind": kind, "q": q, "kyokuIndex": 0, "eventIndex": 0, "seat": 0}


def test_pick_is_reproducible_and_covers_each_difficulty():
    decisions = [decision("discard", EASY), decision("discard", NORMAL), decision("discard", HARD)]
    first = [pick(decisions, random.Random(f"s:{i}"), 2.0) for i in range(30)]
    second = [pick(decisions, random.Random(f"s:{i}"), 2.0) for i in range(30)]
    assert first == second
    assert {id(d) for d in first} == {id(d) for d in decisions}


def test_pick_skips_when_the_difficulty_is_absent():
    only_easy = [decision("discard", EASY)]
    results = [pick(only_easy, random.Random(i), 1.0) for i in range(50)]
    assert None in results and only_easy[0] in results


def test_riichi_weight_raises_the_riichi_share():
    decisions = [decision("discard", HARD)] * 9 + [decision("riichi", HARD)]

    def riichi_picks(weight):
        picks = [pick(decisions, random.Random(i), weight) for i in range(3000)]
        return sum(p is not None and p["kind"] == "riichi" for p in picks)

    assert riichi_picks(3.0) > 2 * riichi_picks(1.0)


@pytest.mark.parametrize(
    ("action", "pai", "hand", "expected"),
    [
        ("chi_low", "3m", ["4m", "5mr", "5m"], ["4m", "5mr"]),
        ("chi_mid", "4p", ["3p", "5p"], ["3p", "5p"]),
        ("chi_high", "7s", ["5s", "6s", "5sr"], ["5sr", "6s"]),
        ("pon", "5mr", ["5m", "5m"], ["5m", "5m"]),
        ("pon", "5p", ["5pr", "5p"], ["5pr", "5p"]),
        ("pon", "E", ["E", "E"], ["E", "E"]),
    ],
)
def test_call_consumed_prefers_red_five(action, pai, hand, expected):
    assert call_consumed(action, pai, hand) == expected


def test_choices_order():
    scene = {"hand": ["3p", "4p", "5p"], "target": {"actor": 3, "pai": "2p"}}
    call = choices("call", ["pass", "chi_low"], scene)
    assert call == [{"action": "chi_low", "consumed": ["3p", "4p"]}, {"action": "pass"}]
    riichi = choices("riichi", ["r:5p", "d:5p", "d:1m", "r:1m"], scene)
    assert [c["action"] for c in riichi] == ["d:1m", "d:5p", "r:1m", "r:5p"]


def test_numbering_is_a_reproducible_permutation():
    problems = [{"n": i} for i in range(100)]
    numbered = number(problems)
    assert [p["id"] for p in numbered] == list(range(1, 101))
    assert sorted(p["n"] for p in numbered) == list(range(100))
    assert numbered == number(problems)
    assert [p["n"] for p in numbered] != list(range(100))


def legal(*actions):
    mask = np.zeros(46, dtype=bool)
    mask[list(actions)] = True
    return mask


def test_classify():
    assert classify([0]) is None
    assert classify([0, 1, 42]) is None  # kan
    assert classify([41, 43, 45]) is None  # ron
    assert classify([0, 1, RIICHI]) == "riichi"
    assert classify([0, 1]) == "discard"
    assert classify([CHI_LOW, PON, PASS]) == "call"


def test_riichi_candidates_combine_both_stages():
    one_m, two_m = TILE_NAMES.index("1m"), TILE_NAMES.index("2m")
    point = DecisionPoint(0, 0, 0, "riichi", None, legal(one_m, two_m, RIICHI), None, legal(one_m, two_m))
    q = np.zeros(46)
    q[[one_m, two_m, RIICHI]] = [0.1, 0.3, 0.5]
    after = np.zeros(46)
    after[[one_m, two_m]] = [2.0, 1.2]
    assert candidates(point, q, after) == pytest.approx({"d:1m": 0.1, "d:2m": 0.3, "r:1m": 0.5, "r:2m": -0.3})
