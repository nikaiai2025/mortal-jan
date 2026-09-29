"""Scoring and difficulty rules (docs/spec/プロダクト仕様.md 採点・難易度)."""

from __future__ import annotations

import math

TEMPERATURE = 1.0
# (easy lower bound, hard upper bound) on the best action's Mortal evaluation.
DISCARD_THRESHOLDS = (0.9, 0.5)
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


def scores(q: dict[str, float]) -> dict[str, int]:
    """100 × p / p_max. Only the best action gets 100."""
    best = best_action(q)
    top = q[best]
    return {
        action: 100 if action == best else min(99, round(100 * math.exp((value - top) / TEMPERATURE)))
        for action, value in q.items()
    }


def difficulty(q: dict[str, float], thresholds: tuple[float, float]) -> str:
    return classify_difficulty(max(mortal_evaluation(q).values()), thresholds)


def classify_difficulty(p_max: float, thresholds: tuple[float, float]) -> str:
    easy_min, hard_max = thresholds
    if p_max >= easy_min:
        return "easy"
    if p_max < hard_max:
        return "hard"
    return "normal"
