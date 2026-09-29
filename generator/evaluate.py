"""Evaluate every decision point of the self-play logs with Mortal.

The arena log keeps Q values only for executed actions (a declined call is
missing), so each game is replayed per seat and every point where the seat can
act is inferred again. Logged Q values are used to verify the replay.

    python -m generator.evaluate
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from . import runtime
from .actions import ACTION_SPACE, EXCLUDED_ACTIONS, RIICHI, call_id, discard_id, riichi_id

BATCH_SIZE = 256
VERIFY_TOLERANCE = 1e-3


@dataclass
class DecisionPoint:
    event_index: int
    seat: int
    kyoku_index: int
    kind: str  # "discard" | "riichi" | "call"
    obs: np.ndarray
    mask: np.ndarray
    riichi_obs: np.ndarray | None = None
    riichi_mask: np.ndarray | None = None
    logged_q: dict[int, float] | None = None
    riichi_logged_q: dict[int, float] | None = None


def read_events(path: Path) -> list[dict[str, Any]]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def classify(legal: list[int]) -> str | None:
    if len(legal) < 2 or any(action in EXCLUDED_ACTIONS for action in legal):
        return None
    if RIICHI in legal:
        return "riichi"
    if any(action < RIICHI for action in legal):
        return "discard"
    return "call"


def logged_q(events: list[dict[str, Any]], index: int, seat: int) -> dict[int, float] | None:
    """Q values the arena logged for the seat's reaction right after `index`."""
    if index + 1 >= len(events):
        return None
    reaction = events[index + 1]
    meta = reaction.get("meta")
    if reaction.get("actor") != seat or not meta or "q_values" not in meta:
        return None
    legal = [action for action in range(ACTION_SPACE) if meta["mask_bits"] >> action & 1]
    return dict(zip(legal, meta["q_values"]))


def decision_points(events: list[dict[str, Any]]) -> list[DecisionPoint]:
    from libriichi.state import PlayerState

    lines = [json.dumps({k: v for k, v in event.items() if k != "meta"}) for event in events]
    kyoku_indices = []
    kyoku_index = -1
    for event in events:
        kyoku_index += event["type"] == "start_kyoku"
        kyoku_indices.append(kyoku_index)

    points = []
    for seat in range(4):
        state = PlayerState(seat)
        for index, line in enumerate(lines):
            cans = state.update(line)
            if not cans.can_act:
                continue
            event = events[index]
            if event["type"] == "reach" and event.get("actor") == seat:
                continue  # riichi discard selection: part of the riichi decision
            obs, mask = state.encode_obs(runtime.OBS_VERSION, False)
            kind = classify(np.flatnonzero(mask).tolist())
            if kind is None:
                continue
            point = DecisionPoint(index, seat, kyoku_indices[index], kind, obs, mask)
            if kind == "riichi":
                point.riichi_obs, point.riichi_mask = declared_riichi(lines[: index + 1], seat)
                if events[index + 1]["type"] == "reach":  # Mortal declared: the log has the second stage
                    point.riichi_logged_q = logged_q(events, index + 1, seat)
            point.logged_q = logged_q(events, index, seat)
            points.append(point)
    return points


def declared_riichi(lines: list[str], seat: int) -> tuple[np.ndarray, np.ndarray]:
    """Observation after the seat declares riichi at the end of `lines`."""
    from libriichi.state import PlayerState

    state = PlayerState(seat)
    for line in lines:
        state.update(line)
    state.update(json.dumps({"type": "reach", "actor": seat}))
    return state.encode_obs(runtime.OBS_VERSION, False)


def infer(brain, dqn, items: list[tuple[np.ndarray, np.ndarray]]) -> list[np.ndarray]:
    import torch

    outputs = []
    with torch.inference_mode():
        for start in range(0, len(items), BATCH_SIZE):
            chunk = items[start : start + BATCH_SIZE]
            obs = torch.as_tensor(np.stack([o for o, _ in chunk]))
            mask = torch.as_tensor(np.stack([m for _, m in chunk]))
            outputs.extend(dqn(brain(obs), mask).numpy())
    return outputs


def candidates(point: DecisionPoint, q: np.ndarray, riichi_q: np.ndarray | None) -> dict[str, float]:
    legal = np.flatnonzero(point.mask).tolist()
    if point.kind == "call":
        return {call_id(a): float(q[a]) for a in legal}
    result = {discard_id(a): float(q[a]) for a in legal if a < RIICHI}
    if point.kind == "riichi":
        # Riichi + discard = riichi's Q + that discard's regret after the declaration.
        riichi_legal = np.flatnonzero(point.riichi_mask).tolist()
        best_after = max(float(riichi_q[a]) for a in riichi_legal)
        for a in riichi_legal:
            result[riichi_id(a)] = float(q[RIICHI]) + float(riichi_q[a]) - best_after
    return result


def verify(logged: dict[int, float] | None, q: np.ndarray | None, where: str) -> None:
    if logged is None:
        return
    diff = max(abs(float(q[a]) - value) for a, value in logged.items())
    if diff > VERIFY_TOLERANCE:
        raise RuntimeError(f"{where}: replay Q differs from the log by {diff}")


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evaluate_game(brain, dqn, path: Path) -> dict[str, Any]:
    game = path.name.removesuffix(".json.gz")
    points = decision_points(read_events(path))
    qs = infer(brain, dqn, [(p.obs, p.mask) for p in points])
    riichi_qs = iter(infer(brain, dqn, [(p.riichi_obs, p.riichi_mask) for p in points if p.kind == "riichi"]))
    decisions = []
    for point, q in zip(points, qs):
        riichi_q = next(riichi_qs) if point.kind == "riichi" else None
        where = f"{game} event {point.event_index} seat {point.seat}"
        verify(point.logged_q, q, where)
        verify(point.riichi_logged_q, riichi_q, f"{where} (after riichi)")
        values = candidates(point, q, riichi_q)
        decisions.append(
            {
                "eventIndex": point.event_index,
                "seat": point.seat,
                "kyokuIndex": point.kyoku_index,
                "kind": point.kind,
                "q": {action: round(value, 6) for action, value in values.items()},
            }
        )
    return {"game": game, "logSha256": file_sha256(path), "identity": runtime.IDENTITY, "decisions": decisions}


def evaluated_log_sha256(out: Path) -> str | None:
    if not out.exists():
        return None
    with gzip.open(out, "rt", encoding="utf-8") as f:
        return json.load(f).get("logSha256")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs", type=Path, default=runtime.GENERATED_ROOT / "logs")
    parser.add_argument("--out", type=Path, default=runtime.GENERATED_ROOT / "decisions")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    brain, dqn = runtime.load_model()
    paths = sorted(args.logs.glob("*.json.gz"))
    started = time.time()
    for number, path in enumerate(paths, 1):
        out = args.out / path.name
        if evaluated_log_sha256(out) == file_sha256(path):
            continue
        result = evaluate_game(brain, dqn, path)
        tmp = out.with_suffix(".tmp")
        with gzip.open(tmp, "wt", encoding="utf-8") as f:
            json.dump(result, f, separators=(",", ":"))
        tmp.replace(out)
        print(f"{path.name}: {len(result['decisions'])} decisions ({number}/{len(paths)}, {time.time() - started:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
