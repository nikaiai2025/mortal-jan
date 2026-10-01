"""Scoring and difficulty rules (docs/spec/プロダクト仕様.md 採点・難易度)."""

from __future__ import annotations

import math

TEMPERATURE = 1.0
# On the best action's AI evaluation (p_max): at or above TRIVIAL it is not a problem.
TRIVIAL = 0.96
# (easy lower bound, hard upper bound) for discard and riichi decisions: they split the decisions
# below TRIVIAL into thirds. Call decisions use thresholds derived by generator.calibrate so that
# their mix matches this one.
DISCARD_THRESHOLDS = (0.78, 0.57)
DIFFICULTIES = ("easy", "normal", "hard")


def best_action(q: dict[str, float]) -> str:
    # Ties are practically impossible with float Q values; the id order keeps it deterministic.
    return max(sorted(q), key=lambda action: q[action])


def mortal_evaluation(q: dict[str, float]) -> dict[str, float]:
    """Softmax of Q / T. Sums to 1 over the candidates."""
    top = max(q.values())
    weights = {action: math.exp((value - top) / TEMPERATURE) for action, value in q.items()}
    total = sum(weights.values())
    return {action: weight / total for action, weight in weights.items()}


def p_max(q: dict[str, float]) -> float:
    return max(mortal_evaluation(q).values())


def scores(q: dict[str, float]) -> dict[str, int]:
    """100 × p / p_max. Only the best action gets 100."""
    best = best_action(q)
    top = q[best]
    return {
        action: 100 if action == best else min(99, round(100 * math.exp((value - top) / TEMPERATURE)))
        for action, value in q.items()
    }


def classify_difficulty(best: float, thresholds: tuple[float, float]) -> str | None:
    """None when the decision is too obvious to be a problem."""
    easy_min, hard_max = thresholds
    if best >= TRIVIAL:
        return None
    if best >= easy_min:
        return "easy"
    if best < hard_max:
        return "hard"
    return "normal"
