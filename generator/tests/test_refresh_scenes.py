import gzip
import hashlib
import json
import sqlite3

import pytest

from generator import runtime
from generator.problem_source import load_events
from generator.refresh_scenes import refresh_scene, update_statement
from generator.scene import SceneTracker
from generator.tests.test_tenhou import finish, start


def fixture():
    events = [start(),
              {"type": "tsumo", "actor": 0, "pai": "2m"},
              {"type": "dahai", "actor": 0, "pai": "2m", "tsumogiri": True},
              {"type": "tsumo", "actor": 2, "pai": "3m"},
              {"type": "reach", "actor": 2},
              {"type": "dahai", "actor": 2, "pai": "3m", "tsumogiri": True},
              {"type": "reach_accepted", "actor": 2},
              {"type": "tsumo", "actor": 0, "pai": "4p"},
              {"type": "dahai", "actor": 0, "pai": "4p", "tsumogiri": True},
              {"type": "tsumo", "actor": 0, "pai": "5p"}, *finish()]
    tracker = SceneTracker()
    for event in events[:10]:
        tracker.update(event)
    scene = tracker.snapshot(0, call_decision=False)
    scene.pop("riichiDiscardCounts")
    return events, {"id": 7, "kind": "discard", "scene": scene,
                    "source": {"game": "test", "kyokuIndex": 0, "eventIndex": 9, "seat": 0}}


def test_refresh_adds_only_public_boundaries_and_is_repeatable():
    events, original = fixture()
    refreshed = refresh_scene(events, original)
    counts = refreshed["scene"]["riichiDiscardCounts"]
    assert counts == [None, None, [1, 0, 0, 0], None]
    assert {k: v for k, v in refreshed["scene"].items() if k != "riichiDiscardCounts"} == original["scene"]
    assert refresh_scene(events, refreshed) == refreshed
    assert "riichiDiscardCounts" not in original["scene"]


def test_refresh_rejects_scene_or_existing_boundary_mismatch():
    events, problem = fixture()
    problem["scene"]["tilesLeft"] -= 1
    with pytest.raises(ValueError, match="no longer matches"):
        refresh_scene(events, problem)
    events, problem = fixture()
    problem["scene"]["riichiDiscardCounts"] = [None] * 4
    with pytest.raises(ValueError, match="no longer matches"):
        refresh_scene(events, problem)


def test_scene_sql_preserves_answers_and_checks_source():
    events, problem = fixture()
    db = sqlite3.connect(":memory:")
    db.executescript("CREATE TABLE problems (id INTEGER PRIMARY KEY, source TEXT, scene TEXT, evaluation TEXT);"
                     "CREATE TABLE answers (problem_id INTEGER, score INTEGER);")
    db.execute("INSERT INTO problems VALUES (7, ?, 'old', 'unchanged')", (json.dumps(problem["source"], separators=(",", ":")),))
    db.execute("INSERT INTO answers VALUES (7, 63)")
    sql = update_statement(refresh_scene(events, problem))
    db.executescript(sql)
    writes = db.total_changes
    db.executescript(sql)
    assert db.total_changes == writes
    assert json.loads(db.execute("SELECT scene FROM problems").fetchone()[0])["riichiDiscardCounts"][2] == [1, 0, 0, 0]
    assert db.execute("SELECT evaluation FROM problems").fetchone() == ("unchanged",)
    assert db.execute("SELECT score FROM answers").fetchone() == (63,)
    db.execute("UPDATE problems SET source = '{}', scene = 'other'")
    db.executescript(sql)
    assert db.execute("SELECT scene FROM problems").fetchone() == ("other",)


def test_source_verification_rejects_changed_log_and_model(tmp_path):
    logs, decisions = tmp_path / "logs", tmp_path / "decisions"
    logs.mkdir()
    decisions.mkdir()
    path = logs / "test.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as out:
        out.write('{"type":"start_game"}\n')
    meta = {"identity": runtime.IDENTITY, "logSha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    def write_meta():
        with gzip.open(decisions / path.name, "wt", encoding="utf-8") as out:
            json.dump(meta, out)
    write_meta()
    assert load_events("test", logs, decisions) == [{"type": "start_game"}]
    meta["logSha256"] = "wrong"
    write_meta()
    with pytest.raises(ValueError, match="source log changed"):
        load_events("test", logs, decisions)
    meta["identity"] = {"model": "other"}
    write_meta()
    with pytest.raises(ValueError, match="different model"):
        load_events("test", logs, decisions)
