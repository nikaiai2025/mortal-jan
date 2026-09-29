from generator.scene import SceneTracker

HANDS = [
    ["1m", "2m", "3m", "4p", "5pr", "6p", "7s", "8s", "9s", "E", "E", "S", "W"],
    ["3m", "4m", "5m", "5m", "1p", "1p", "9p", "2s", "3s", "N", "N", "P", "F"],
    ["6m", "7m", "8m", "2p", "3p", "4p", "5s", "6s", "7s", "C", "C", "C", "W"],
    ["1s", "1s", "2s", "3s", "9m", "9m", "8p", "8p", "S", "S", "E", "P", "F"],
]


def start(tracker):
    tracker.update(
        {
            "type": "start_kyoku",
            "bakaze": "E",
            "dora_marker": "1s",
            "kyoku": 2,
            "honba": 1,
            "kyotaku": 0,
            "oya": 1,
            "scores": [25000, 25000, 25000, 25000],
            "tehais": [list(h) for h in HANDS],
        }
    )


def test_discard_snapshot_separates_drawn_tile_and_hides_opponents():
    tracker = SceneTracker()
    start(tracker)
    tracker.update({"type": "tsumo", "actor": 1, "pai": "6m"})
    scene = tracker.snapshot(1, call_decision=False)
    assert scene["drawn"] == "6m"
    assert "6m" not in scene["hand"] and len(scene["hand"]) == 13
    assert scene["hand"][:4] == ["3m", "4m", "5m", "5m"]
    assert scene["tilesLeft"] == 69
    assert scene["concealedCounts"] == [13, 14, 13, 13]
    assert scene["target"] is None
    assert "tehais" not in scene


def test_riichi_declaration_tile_deposit_and_call_marks():
    tracker = SceneTracker()
    start(tracker)
    tracker.update({"type": "tsumo", "actor": 1, "pai": "4m"})
    tracker.update({"type": "reach", "actor": 1})
    tracker.update({"type": "dahai", "actor": 1, "pai": "F", "tsumogiri": False})
    tracker.update({"type": "reach_accepted", "actor": 1})
    tracker.update({"type": "tsumo", "actor": 2, "pai": "9p"})
    tracker.update({"type": "dahai", "actor": 2, "pai": "W", "tsumogiri": False})
    scene = tracker.snapshot(0, call_decision=True)
    assert scene["target"] == {"actor": 2, "pai": "W"}
    assert scene["drawn"] is None
    assert scene["rivers"][1] == [{"pai": "F", "tsumogiri": False, "riichi": True, "called": False}]
    assert scene["riichi"] == [False, True, False, False]
    assert scene["scores"][1] == 24000 and scene["kyotaku"] == 1


def test_pon_then_kakan_and_dora():
    tracker = SceneTracker()
    start(tracker)
    tracker.update({"type": "tsumo", "actor": 0, "pai": "N"})
    tracker.update({"type": "dahai", "actor": 0, "pai": "N", "tsumogiri": True})
    tracker.update({"type": "pon", "actor": 1, "target": 0, "pai": "N", "consumed": ["N", "N"]})
    scene = tracker.snapshot(1, call_decision=False)
    assert scene["drawn"] is None
    assert scene["melds"][1] == [{"type": "pon", "pai": "N", "consumed": ["N", "N"], "target": 0}]
    assert scene["rivers"][0][0]["called"] is True
    assert scene["rivers"][0][0]["tsumogiri"] is True

    tracker.update({"type": "dahai", "actor": 1, "pai": "P", "tsumogiri": False})
    tracker.update({"type": "tsumo", "actor": 2, "pai": "1m"})
    tracker.update({"type": "dahai", "actor": 2, "pai": "1m", "tsumogiri": True})
    tracker.update({"type": "tsumo", "actor": 3, "pai": "2m"})
    tracker.update({"type": "dahai", "actor": 3, "pai": "2m", "tsumogiri": True})
    tracker.update({"type": "tsumo", "actor": 0, "pai": "3m"})
    tracker.update({"type": "dahai", "actor": 0, "pai": "3m", "tsumogiri": True})
    tracker.update({"type": "tsumo", "actor": 1, "pai": "N"})
    tracker.update({"type": "kakan", "actor": 1, "pai": "N", "consumed": ["N", "N", "N"]})
    tracker.update({"type": "tsumo", "actor": 1, "pai": "7p"})
    tracker.update({"type": "dora", "dora_marker": "6s"})
    scene = tracker.snapshot(1, call_decision=False)
    assert scene["melds"][1][0]["type"] == "kakan" and scene["melds"][1][0]["added"] == "N"
    assert scene["doraMarkers"] == ["1s", "6s"]
    assert scene["drawn"] == "7p"
    assert scene["tilesLeft"] == 64
