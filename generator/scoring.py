"""Scoring and difficulty rules (docs/spec/プロダクト仕様.md 採点・難易度)."""

from __future__ import annotations

import math

TEMPERATURE = 1.0
# On the best action's Mortal evaluation (p_max), for every kind of decision:
# at or above TRIVIAL it is not a problem; then easy / normal / hard.
TRIVIAL = 0.98
EASY_MIN = 0.9
HARD_MAX = 0.5
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


def difficulty(q: dict[str, float]) -> str | None:
    """None when the decision is too obvious to be a problem."""
    return classify_difficulty(max(mortal_evaluation(q).values()))


def classify_difficulty(p_max: float) -> str | None:
    if p_max >= TRIVIAL:
        return None
    if p_max >= EASY_MIN:
        return "easy"
    if p_max < HARD_MAX:
        return "hard"
    return "normal"
