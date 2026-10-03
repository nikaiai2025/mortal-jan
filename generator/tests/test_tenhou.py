import sqlite3
from pathlib import Path

import pytest

from generator.export_logs import insert_statement
from generator.tenhou import round_to_tenhou, tile


def start():
    return {"type": "start_kyoku", "bakaze": "S", "kyoku": 2, "honba": 1, "kyotaku": 2,
            "oya": 1, "scores": [25000] * 4, "dora_marker": "5sr", "tehais": [["1m"] * 13 for _ in range(4)]}


def finish():
    return [{"type": "ryukyoku", "deltas": [0] * 4}, {"type": "end_kyoku"}]


def test_red_fives_honors_and_invalid_tiles():
    assert [tile(p) for p in ("1m", "9p", "5mr", "5pr", "5sr", "E", "C")] == [11, 29, 51, 52, 53, 41, 47]
    for bad in ("", "5mz", "0m", "1mr", "?"):
        with pytest.raises(ValueError):
            tile(bad)


def test_riichi_tsumogiri_keeps_starting_deposits_and_scores():
    events = [start(), {"type": "tsumo", "actor": 1, "pai": "5pr"}, {"type": "reach", "actor": 1},
              {"type": "dahai", "actor": 1, "pai": "5pr", "tsumogiri": True},
              {"type": "reach_accepted", "actor": 1}, *finish()]
    log = round_to_tenhou(events)["log"][0]
    assert log[:4] == [[5, 1, 2], [25000] * 4, [53], []]
    assert log[8:10] == [[52], ["r60"]]


@pytest.mark.parametrize("target,pon,added,kan", [
    (3, "p155115", "k15155115", "m15511515"),
    (2, "51p1515", "51k151515", "51m151515"),
    (1, "5115p15", "5115k1515", "511515m15"),
])
def test_call_direction_red_consumed_tiles_and_added_kan(target, pon, added, kan):
    events = [start(), {"type": "pon", "actor": 0, "target": target, "pai": "5m", "consumed": ["5mr", "5m"]},
              {"type": "kakan", "actor": 0, "pai": "5m", "consumed": ["5m", "5mr", "5m"]}, *finish()]
    log = round_to_tenhou(events)["log"][0]
    assert log[5] == [pon]
    assert log[6] == [added]
    events = [start(), {"type": "daiminkan", "actor": 0, "target": target, "pai": "5m", "consumed": ["5mr", "5m", "5m"]}, *finish()]
    log = round_to_tenhou(events)["log"][0]
    assert log[5] == [kan]
    assert log[6] == [0]


def test_chi_ankan_dora_and_double_ron_keep_winners_and_transfers():
    events = [start(), {"type": "chi", "actor": 0, "target": 3, "pai": "3s", "consumed": ["2s", "4s"]},
              {"type": "ankan", "actor": 1, "consumed": ["5p", "5p", "5p", "5pr"]},
              {"type": "dora", "dora_marker": "N"},
              {"type": "hora", "actor": 1, "target": 3, "deltas": [0, 8000, 0, -8000], "ura_markers": []},
              {"type": "hora", "actor": 2, "target": 3, "deltas": [0, 0, 12000, -12000], "ura_markers": ["E"]},
              {"type": "end_kyoku"}]
    log = round_to_tenhou(events)["log"][0]
    assert log[2:4] == [[53, 44], [41]]
    assert log[5] == ["c333234"]
    assert log[9] == ["252525a52"]
    assert log[-1] == ["和了", [0, 8000, 0, -8000], [1, 3, 1], [0, 0, 12000, -12000], [2, 3, 2]]


def test_reject_truncated_round_or_missing_result():
    with pytest.raises(ValueError):
        round_to_tenhou([start()])
    with pytest.raises(ValueError):
        round_to_tenhou([start(), {"type": "end_kyoku"}])


def test_sql_load_is_repeatable_guards_source_and_preserves_answers():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript("CREATE TABLE problems (id INTEGER PRIMARY KEY, source TEXT); CREATE TABLE answers (problem_id INTEGER, score INTEGER);")
    db.executescript(Path("web/migrations/0004_problem_logs.sql").read_text(encoding="utf-8"))
    db.execute("INSERT INTO problems VALUES (7, ?)", ('{"seat":1}',))
    db.execute("INSERT INTO answers VALUES (7, 63)")
    sql = insert_statement({"id": 7, "source": {"seat": 1}}, {"log": []})
    db.executescript(sql)
    db.executescript(sql)
    assert db.execute("SELECT COUNT(*) FROM problem_logs").fetchone() == (1,)
    assert db.execute("SELECT score FROM answers").fetchone() == (63,)
    db.executescript(insert_statement({"id": 7, "source": {"seat": 2}}, {"log": ["wrong"]}))
    assert db.execute("SELECT tenhou_json FROM problem_logs").fetchone() == ('{"log":[]}',)
    db.execute("DELETE FROM problems WHERE id = 7")
    assert db.execute("SELECT COUNT(*) FROM problem_logs").fetchone() == (0,)
