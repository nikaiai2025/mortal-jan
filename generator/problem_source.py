"""Verify a problem's source log and reconstruct its round and visible scene."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from typing import Any

from . import runtime
from .scene import SceneTracker


def load_events(game: str, logs: Path, decisions: Path) -> list[dict[str, Any]]:
    path = logs / f"{game}.json.gz"
    with gzip.open(decisions / path.name, "rt", encoding="utf-8") as f:
        evaluated = json.load(f)
    if evaluated["identity"] != runtime.IDENTITY:
        raise ValueError(f"{game}: evaluated with a different model")
    if hashlib.sha256(path.read_bytes()).hexdigest() != evaluated["logSha256"]:
        raise ValueError(f"{game}: source log changed after evaluation")
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def problem_round(events: list[dict[str, Any]], problem: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    source = problem["source"]
    starts = [i for i, e in enumerate(events) if e["type"] == "start_kyoku"]
    start = starts[source["kyokuIndex"]]
    end = next(i + 1 for i in range(start, len(events)) if events[i]["type"] == "end_kyoku")
    target = source["eventIndex"] - start
    if not 0 <= target < end - start:
        raise ValueError(f"problem {problem['id']}: decision lies outside its round")
    return [{k: v for k, v in e.items() if k != "meta"} for e in events[start:end]], target


def verified_scene(round_events: list[dict[str, Any]], target: int, problem: dict[str, Any]) -> dict[str, Any]:
    tracker = SceneTracker()
    for event in round_events[:target + 1]:
        tracker.update(event)
    scene = tracker.snapshot(problem["source"]["seat"], call_decision=problem["kind"] == "call")
    comparable = dict(scene)
    if "riichiDiscardCounts" not in problem["scene"]:
        comparable.pop("riichiDiscardCounts")
    if comparable != problem["scene"]:
        raise ValueError(f"problem {problem['id']}: original log no longer matches the scene")
    return scene
